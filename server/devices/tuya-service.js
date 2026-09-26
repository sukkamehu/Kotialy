require('dotenv').config();
const crypto = require('crypto');
const db = require('../db');

class TuyaService {
  constructor() {
    this.clientId = process.env.TUYA_CLIENT_ID || '';
    this.clientSecret = process.env.TUYA_CLIENT_SECRET || '';
    this.baseUrl = process.env.TUYA_BASE_URL || 'https://openapi.tuyaeu.com';
    this.saunaDeviceId = process.env.TUYA_SAUNA_DEVICE_ID || '';
    this.saunaLocalIp = process.env.TUYA_SAUNA_LOCAL_IP || '';
    this.saunaLocalKey = process.env.TUYA_SAUNA_LOCAL_KEY || '';
    this.maxHours = parseFloat(process.env.TUYA_SAUNA_MAX_HOURS || '3');

    this.token = null;
    this.tokenExpiresAt = 0;
    this.wsBroadcast = null;
    this.devices = [];
    this.devicesById = new Map();
    this.pollTimer = null;
    this.safetyTimer = null;
    this.isPolling = false;
    this.lastCommandAt = 0;
    this.lastCommandState = null;

    // Sauna safety state
    this.saunaState = {
      id: this.saunaDeviceId,
      name: 'Sauna',
      isOn: false,
      startedAt: null,
      autoOffAt: null,
      durationMinutes: this.maxHours * 60,
      scheduledStartAt: null,
      scheduledDurationMinutes: null,
      temperature: null,
      humidity: null,
      lastSeen: null,
      lastAction: null,
    };
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Tuya OpenAPI signature and request helper with query string sorting
   */
  async request(path, method = 'GET', body = '') {
    if (!this.isConfigured()) {
      throw new Error('Tuya credentials not configured (TUYA_CLIENT_ID, TUYA_CLIENT_SECRET)');
    }

    // Ensure valid access token unless requesting token itself
    if (path !== '/v1.0/token?grant_type=1') {
      await this.ensureToken();
    }

    const t = Date.now().toString();
    const nonce = '';
    const bodyStr = typeof body === 'object' ? JSON.stringify(body) : (body || '');
    const contentHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    // Handle query params sorting for Tuya v2 signing spec
    const [urlPath, queryString] = path.split('?');
    let urlAndQuery = urlPath;
    if (queryString) {
      const params = new URLSearchParams(queryString);
      const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
      const sortedQuery = sorted.map(([k, v]) => `${k}=${v}`).join('&');
      urlAndQuery = `${urlPath}?${sortedQuery}`;
    }

    const stringToSign = [method.toUpperCase(), contentHash, '', urlAndQuery].join('\n');
    const accessToken = (path !== '/v1.0/token?grant_type=1' && this.token) ? this.token : '';
    const signStr = this.clientId + accessToken + t + nonce + stringToSign;
    const sign = crypto.createHmac('sha256', this.clientSecret).update(signStr).digest('hex').toUpperCase();

    const headers = {
      'client_id': this.clientId,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256',
      'Content-Type': 'application/json',
    };
    if (accessToken) headers['access_token'] = accessToken;

    const res = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: method !== 'GET' ? bodyStr : undefined,
    });

    const data = await res.json();
    if (!data.success && (data.code === 1010 || data.code === 1004)) {
      // Token expired or invalid sign, clear and retry once
      this.token = null;
      this.tokenExpiresAt = 0;
      await this.ensureToken();
      return this.request(path, method, body);
    }

    return data;
  }

  /**
   * Acquire or refresh access token
   */
  async ensureToken() {
    if (this.token && Date.now() < this.tokenExpiresAt - 60000) {
      return this.token;
    }

    const res = await this.request('/v1.0/token?grant_type=1', 'GET');
    if (res.success && res.result && res.result.access_token) {
      this.token = res.result.access_token;
      this.tokenExpiresAt = Date.now() + (res.result.expire_time || 7200) * 1000;
      console.log('[TUYA] Access token acquired successfully');
      return this.token;
    }

    throw new Error(`Tuya authentication failed: ${res.msg || JSON.stringify(res)}`);
  }

  /**
   * Fetch all devices from Tuya account and update real-time states
   */
  async fetchDevices() {
    if (this.isPolling) return this.devices;
    this.isPolling = true;

    try {
      const res = await this.request('/v1.0/iot-01/associated-users/devices', 'GET');
      const rawList = res.result?.devices || res.result?.list || (Array.isArray(res.result) ? res.result : []);
      
      const parsedDevices = [];
      let foundSaunaTemp = null;
      let foundSaunaHumidity = null;
      let saunaRelayStatus = null;

      for (const d of rawList) {
        const parsed = this.parseDevice(d);
        parsedDevices.push(parsed);
        this.devicesById.set(parsed.id, parsed);

        // Update DB topic states
        this.syncDeviceToDb(parsed);

        // Track sauna breaker switch (STRICTLY matching saunaDeviceId or category kg)
        if (parsed.id === this.saunaDeviceId || (!this.saunaDeviceId && parsed.category === 'kg')) {
          if (parsed.properties.switch_1 !== undefined) {
            saunaRelayStatus = Boolean(parsed.properties.switch_1);
          }
        }

        // Sauna climate sensor
        if (parsed.name.toLowerCase() === 'sauna' && parsed.type === 'climate') {
          if (parsed.properties.temperature != null) foundSaunaTemp = parsed.properties.temperature;
          if (parsed.properties.humidity != null) foundSaunaHumidity = parsed.properties.humidity;
        }
      }

      // Use cloud-cached status from bulk devices list to avoid forcing live MQTT hardware pings
      this.devices = parsedDevices;

      // Check if within command grace period (30s)
      const isWithinGracePeriod = (Date.now() - (this.lastCommandAt || 0)) < 30000;

      if (saunaRelayStatus !== null) {
        if (isWithinGracePeriod && this.lastCommandState !== null && saunaRelayStatus !== this.lastCommandState) {
          // Keep optimistic state during grace period to prevent cloud lag from flickering switch OFF/ON
          console.log(`[TUYA] Säilytetään optimistinen tila (${this.lastCommandState ? 'PÄÄLLÄ' : 'POIS'}) komentoviiveen aikana.`);
        } else {
          const wasOn = this.saunaState.isOn;
          this.saunaState.isOn = saunaRelayStatus;

          if (saunaRelayStatus) {
            // Turned ON (or already ON)
            if (!wasOn || !this.saunaState.autoOffAt || this.saunaState.autoOffAt < Date.now()) {
              this.saunaState.startedAt = Date.now();
              this.saunaState.durationMinutes = this.saunaState.durationMinutes || (this.maxHours * 60);
              this.saunaState.autoOffAt = Date.now() + (this.saunaState.durationMinutes * 60 * 1000);
              console.log(`[TUYA] 🧖‍♂️ Sauna havaittu PÄÄLLÄ. Turva-ajastin aktivoitu (sammutus: ${new Date(this.saunaState.autoOffAt).toLocaleTimeString('fi-FI')}).`);
            }
          } else {
            // Turned OFF
            if (wasOn) {
              this.saunaState.startedAt = null;
              this.saunaState.autoOffAt = null;
              console.log('[TUYA] 🧖‍♂️ Sauna sammutettu.');
            }
          }
        }
      }

      if (foundSaunaTemp != null) this.saunaState.temperature = foundSaunaTemp;
      if (foundSaunaHumidity != null) this.saunaState.humidity = foundSaunaHumidity;
      this.saunaState.lastSeen = Date.now();

      // Sync state to DB
      db.updateState('tuya/sauna/switch', this.saunaState.isOn ? '1' : '0');
      db.updateState('tuya/sauna/auto_off_at', this.saunaState.autoOffAt ? String(this.saunaState.autoOffAt) : '0');

      // Broadcast updates to WebSocket clients
      if (this.wsBroadcast) {
        this.wsBroadcast({
          type: 'tuya_devices',
          devices: this.devices,
          sauna: this.getSaunaStatus(),
          ts: Date.now(),
        });
      }

      return this.devices;
    } catch (err) {
      console.error('[TUYA] Failed to fetch devices:', err.message);
      return this.devices;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Parse a raw Tuya device into structured entity
   */
  parseDevice(d) {
    const category = d.category || '';
    const statusArray = Array.isArray(d.status) ? d.status : [];
    const statusMap = {};
    for (const s of statusArray) {
      statusMap[s.code] = s.value;
    }

    let type = 'unknown';
    const properties = {};

    // 1. Sauna / 3-phase Circuit Breaker or Relay (category: kg or matching saunaDeviceId)
    if (d.id === this.saunaDeviceId || category === 'kg') {
      type = 'sauna_switch';
      properties.switch_1 = statusMap.switch_1 === true || statusMap.switch === true;
    } 
    // 2. Temperature & Humidity sensor (wsdcg)
    else if (category === 'wsdcg') {
      type = 'climate';
      // Temperature normalization
      if (statusMap.va_temperature != null) {
        let t = Number(statusMap.va_temperature);
        if (t > 100) t = t / 10; // e.g. 211 -> 21.1 C
        properties.temperature = Number(t.toFixed(1));
      }
      if (statusMap.va_humidity != null) {
        properties.humidity = Number(statusMap.va_humidity);
      }
      if (statusMap.va_battery != null) {
        properties.battery = Number(statusMap.va_battery);
      } else if (statusMap.battery_percentage != null) {
        properties.battery = Number(statusMap.battery_percentage);
      }
    } 
    // 3. Water leak sensor (sj)
    else if (category === 'sj') {
      type = 'water_leak';
      // '1' = leak alarm, '2' = normal
      const stateVal = String(statusMap.watersensor_state || '');
      properties.leak_detected = stateVal === '1' || statusMap.watersensor_state === 1 || statusMap.leak === true;
      properties.battery = statusMap.battery_percentage != null ? Number(statusMap.battery_percentage) : null;
    } 
    // 4. Door / Window sensor (mcs)
    else if (category === 'mcs') {
      type = 'door';
      properties.is_open = statusMap.switch === true;
      properties.battery = statusMap.battery != null ? Number(statusMap.battery) : (statusMap.battery_percentage != null ? Number(statusMap.battery_percentage) : null);
    } 
    // 5. Gateway (wg2)
    else if (category === 'wg2') {
      type = 'gateway';
      properties.mode = statusMap.master_mode || 'online';
    } 
    // 6. Generic switch
    else if (statusMap.switch !== undefined || statusMap.switch_1 !== undefined) {
      type = 'switch';
      properties.state = statusMap.switch_1 ?? statusMap.switch;
    }

    return {
      id: d.id,
      name: d.name,
      type,
      category: d.category,
      model: d.model || d.product_name || '',
      product_name: d.product_name || '',
      online: Boolean(d.online),
      ip: d.ip || '',
      local_key: d.local_key || '',
      properties,
      raw_status: statusMap,
      update_time: d.update_time ? d.update_time * 1000 : Date.now(),
    };
  }

  /**
   * Normalize device name to clean topic slug handling Scandinavian characters
   */
  cleanTopicName(name) {
    if (!name) return 'unknown';
    return name
      .toLowerCase()
      .replace(/ä|å/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Sync parsed device properties to SQLite DB
   */
  syncDeviceToDb(device) {
    const cleanName = this.cleanTopicName(device.name);
    const prefix = `tuya/${cleanName}/`;

    // Also support legacy ASCII-replaced name for backwards compatibility (e.g. yl_kerran_ty_huone)
    const legacyName = device.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const legacyPrefix = `tuya/${legacyName}/`;

    for (const [prop, val] of Object.entries(device.properties)) {
      if (val === null || val === undefined) continue;
      const topic = `${prefix}${prop}`;
      db.updateState(topic, String(val));

      if (legacyPrefix !== prefix) {
        db.updateState(`${legacyPrefix}${prop}`, String(val));
      }

      // Append history for numeric properties (temperature, humidity, battery, etc.)
      if (typeof val === 'number') {
        db.maybeAppendHistory(topic, val, 60000);
        if (legacyPrefix !== prefix) {
          db.maybeAppendHistory(`${legacyPrefix}${prop}`, val, 60000);
        }
      }
    }
  }

  /**
   * Control Sauna Relay with strict safety duration limit
   */
  async setSaunaPower(turnOn, durationMinutes = 180) {
    // Clamp duration to max 180 minutes (3 hours)
    const clampedMinutes = Math.min(Math.max(15, parseInt(durationMinutes) || 180), this.maxHours * 60);

    console.log(`[TUYA] Saunan ohjauspyyntö: ${turnOn ? 'PÄÄLLE' : 'POIS'}, kesto: ${clampedMinutes} min`);

    this.lastCommandAt = Date.now();
    this.lastCommandState = Boolean(turnOn);

    const commandBody = {
      commands: [
        {
          code: 'switch_1',
          value: Boolean(turnOn),
        },
      ],
    };

    const res = await this.request(`/v1.0/devices/${this.saunaDeviceId}/commands`, 'POST', commandBody);
    if (!res.success) {
      throw new Error(`Saunan kytkentä epäonnistui: ${res.msg || JSON.stringify(res)}`);
    }

    // Clear any pending scheduled start
    this.saunaState.scheduledStartAt = null;
    this.saunaState.scheduledDurationMinutes = null;

    // Update local state immediately
    this.saunaState.isOn = Boolean(turnOn);
    if (turnOn) {
      this.saunaState.startedAt = Date.now();
      this.saunaState.autoOffAt = Date.now() + (clampedMinutes * 60 * 1000);
      this.saunaState.durationMinutes = clampedMinutes;
      this.saunaState.lastAction = `Kytketty päälle (${clampedMinutes} min)`;
      console.log(`[TUYA] 🧖‍♂️ Sauna kytketty PÄÄLLE. Automaattinen sammutus klo ${new Date(this.saunaState.autoOffAt).toLocaleTimeString('fi-FI')} (${clampedMinutes} min kuluttua).`);
    } else {
      this.saunaState.startedAt = null;
      this.saunaState.autoOffAt = null;
      this.saunaState.lastAction = 'Kytketty pois päältä';
      console.log('[TUYA] 🧖‍♂️ Sauna kytketty POIS PÄÄLTÄ.');
    }

    // Sync state to DB
    db.updateState('tuya/sauna/switch', turnOn ? '1' : '0');
    db.updateState('tuya/sauna/auto_off_at', this.saunaState.autoOffAt ? String(this.saunaState.autoOffAt) : '0');
    db.updateState('tuya/sauna/duration', String(clampedMinutes));
    db.updateState('tuya/sauna/started_at', this.saunaState.startedAt ? String(this.saunaState.startedAt) : '0');
    db.updateState('tuya/sauna/scheduled_start_at', '0');
    db.updateState('tuya/sauna/scheduled_duration', '0');

    // Broadcast immediately
    if (this.wsBroadcast) {
      this.wsBroadcast({
        type: 'sauna_status',
        sauna: this.getSaunaStatus(),
        ts: Date.now(),
      });
    }

    return this.getSaunaStatus();
  }

  /**
   * Schedule sauna to turn on after a delay (in minutes)
   */
  async scheduleSauna(delayMinutes, durationMinutes = 90) {
    const delay = Math.max(1, parseInt(delayMinutes) || 0);
    const duration = Math.min(Math.max(15, parseInt(durationMinutes) || 90), this.maxHours * 60);
    const scheduledStartAt = Date.now() + (delay * 60 * 1000);

    this.saunaState.scheduledStartAt = scheduledStartAt;
    this.saunaState.scheduledDurationMinutes = duration;
    this.saunaState.lastAction = `Ajastettu käynnistymään ${delay} min kuluttua (kesto ${duration} min)`;

    console.log(`[TUYA] ⏱️ Sauna ajastettu käynnistymään klo ${new Date(scheduledStartAt).toLocaleTimeString('fi-FI')} (${delay} min kuluttua, kesto ${duration} min).`);

    db.updateState('tuya/sauna/scheduled_start_at', String(scheduledStartAt));
    db.updateState('tuya/sauna/scheduled_duration', String(duration));

    if (this.wsBroadcast) {
      this.wsBroadcast({
        type: 'sauna_status',
        sauna: this.getSaunaStatus(),
        ts: Date.now(),
      });
    }

    return this.getSaunaStatus();
  }

  /**
   * Cancel pending scheduled sauna start
   */
  async cancelScheduledSauna() {
    this.saunaState.scheduledStartAt = null;
    this.saunaState.scheduledDurationMinutes = null;
    this.saunaState.lastAction = 'Ajastus peruutettu';

    console.log('[TUYA] ❌ Saunan ajastettu käynnistys peruutettu.');

    db.updateState('tuya/sauna/scheduled_start_at', '0');
    db.updateState('tuya/sauna/scheduled_duration', '0');

    if (this.wsBroadcast) {
      this.wsBroadcast({
        type: 'sauna_status',
        sauna: this.getSaunaStatus(),
        ts: Date.now(),
      });
    }

    return this.getSaunaStatus();
  }

  /**
   * Get current sauna status including remaining time
   */
  getSaunaStatus() {
    const now = Date.now();
    let remainingMinutes = 0;
    let remainingSeconds = 0;
    let scheduledRemainingSeconds = 0;

    if (this.saunaState.isOn && this.saunaState.autoOffAt) {
      const remainingMs = Math.max(0, this.saunaState.autoOffAt - now);
      remainingMinutes = Math.ceil(remainingMs / 60000);
      remainingSeconds = Math.ceil(remainingMs / 1000);
    }

    if (!this.saunaState.isOn && this.saunaState.scheduledStartAt) {
      const delayMs = Math.max(0, this.saunaState.scheduledStartAt - now);
      scheduledRemainingSeconds = Math.ceil(delayMs / 1000);
    }

    return {
      ...this.saunaState,
      remainingMinutes,
      remainingSeconds,
      scheduledRemainingSeconds,
      maxHours: this.maxHours,
      maxMinutes: this.maxHours * 60,
    };
  }

  /**
   * Safety ticker: runs every 5 seconds to enforce 3-hour safety timeout and scheduled starts
   */
  async checkSafetyTimeout() {
    const now = Date.now();

    // 1. Check scheduled start
    if (!this.saunaState.isOn && this.saunaState.scheduledStartAt) {
      if (now >= this.saunaState.scheduledStartAt) {
        const duration = this.saunaState.scheduledDurationMinutes || 90;
        console.log(`[TUYA] 🚀 Ajastettu saunan käynnistys aktivoituu nyt (${duration} min kesto).`);
        this.saunaState.scheduledStartAt = null;
        this.saunaState.scheduledDurationMinutes = null;
        db.updateState('tuya/sauna/scheduled_start_at', '0');
        db.updateState('tuya/sauna/scheduled_duration', '0');
        try {
          await this.setSaunaPower(true, duration);
        } catch (err) {
          console.error('[TUYA] Ajastettu saunan käynnistys epäonnistui, yritetään uudelleen 3s kuluttua:', err.message);
          setTimeout(() => {
            this.setSaunaPower(true, duration).catch(e => {
              console.error('[TUYA] Uusintayritys epäonnistui:', e.message);
            });
          }, 3000);
        }
        return;
      }
    }

    if (!this.saunaState.isOn) return;

    // Do not run safety cutoff if we just sent a command within 15s
    if (Date.now() - (this.lastCommandAt || 0) < 15000) return;

    // 2. Check if auto-off time has passed
    if (this.saunaState.autoOffAt && now >= this.saunaState.autoOffAt) {
      console.warn(`[TUYA] 🛡️ SAUNAN TURVAKATKAISU: Asetettu aikaraja (${this.saunaState.durationMinutes} min) saavutettu. Sammutetaan kiuas välittömästi!`);
      this.setSaunaPower(false).catch(err => {
        console.error('[TUYA] Turvasammutus epäonnistui, yritetään uudelleen:', err.message);
        setTimeout(() => this.setSaunaPower(false).catch(() => {}), 2000);
      });
      return;
    }

    // 3. Absolute hard ceiling: if started more than 3 hours ago regardless of state
    if (this.saunaState.startedAt && (now - this.saunaState.startedAt >= this.maxHours * 3600 * 1000)) {
      console.warn('[TUYA] 🛡️ SAUNAN MAKSIMIAIKAKATKAISU (3H): Kiuas sammutetaan varotoimena.');
      this.setSaunaPower(false).catch(() => {});
    }
  }

  /**
   * Generic Tuya device command
   */
  async sendCommand(deviceId, commands) {
    const body = { commands: Array.isArray(commands) ? commands : [commands] };
    const res = await this.request(`/v1.0/devices/${deviceId}/commands`, 'POST', body);
    if (!res.success) {
      throw new Error(`Komennon lähetys epäonnistui: ${res.msg || JSON.stringify(res)}`);
    }
    // Refresh device state
    setTimeout(() => this.fetchDevices().catch(() => {}), 500);
    return res.result;
  }

  /**
   * Initialize service, restore persistent timers, start polling and safety watcher
   */
  init(wsBroadcast) {
    this.wsBroadcast = wsBroadcast;

    if (!this.isConfigured()) {
      console.log('[TUYA] Tuya Cloud credentials not configured. Skipping initialization.');
      return;
    }

    console.log('[TUYA] Initializing SmartLife / Tuya IoT service...');

    // Restore persistent timers and states from DB on startup
    try {
      const schedStartRow = db.getState('tuya/sauna/scheduled_start_at');
      const schedDurRow = db.getState('tuya/sauna/scheduled_duration');
      const autoOffRow = db.getState('tuya/sauna/auto_off_at');
      const startedAtRow = db.getState('tuya/sauna/started_at');
      const durationRow = db.getState('tuya/sauna/duration');

      const now = Date.now();
      const schedStart = schedStartRow ? parseInt(schedStartRow.value) : 0;
      const schedDur = schedDurRow ? parseInt(schedDurRow.value) : 90;
      const autoOff = autoOffRow ? parseInt(autoOffRow.value) : 0;
      const startedAt = startedAtRow ? parseInt(startedAtRow.value) : 0;
      const dur = durationRow ? parseInt(durationRow.value) : 90;

      if (schedStart > 0) {
        if (schedStart > now) {
          this.saunaState.scheduledStartAt = schedStart;
          this.saunaState.scheduledDurationMinutes = schedDur;
          console.log(`[TUYA] Palautettiin saunan ajastus tietokannasta: klo ${new Date(schedStart).toLocaleTimeString('fi-FI')} (${schedDur} min).`);
        } else if (now - schedStart < 5 * 60 * 1000) {
          // If scheduled start passed within the last 5 minutes during restart, trigger immediately
          console.log('[TUYA] Ajastettu aika saavutettiin palvelimen käynnistyksen aikana. Käynnistetään sauna nyt.');
          this.setSaunaPower(true, schedDur).catch(() => {});
        }
      }

      if (autoOff > now) {
        this.saunaState.autoOffAt = autoOff;
        this.saunaState.startedAt = startedAt || (now - ((dur * 60 * 1000) - (autoOff - now)));
        this.saunaState.durationMinutes = dur;
        console.log(`[TUYA] Palautettiin aktiivinen lämmitysjakso tietokannasta (päättyy: ${new Date(autoOff).toLocaleTimeString('fi-FI')}).`);
      }
    } catch (err) {
      console.warn('[TUYA] State restoration from DB warning:', err.message);
    }

    // Initial fetch
    this.fetchDevices().then(() => {
      console.log(`[TUYA] Initialized with ${this.devices.length} SmartLife devices.`);
    }).catch(err => {
      console.error('[TUYA] Initial device fetch failed:', err.message);
    });

    // Poll every 60 seconds for sensor updates (gentle background polling)
    const pollInterval = parseInt(process.env.TUYA_POLL_INTERVAL_MS) || 60000;
    this.pollTimer = setInterval(() => {
      this.fetchDevices().catch(() => {});
    }, pollInterval);

    // Safety timeout check every 5 seconds
    this.safetyTimer = setInterval(() => {
      this.checkSafetyTimeout().catch(() => {});
    }, 5000);
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.safetyTimer) clearInterval(this.safetyTimer);
  }
}

const tuyaService = new TuyaService();
module.exports = tuyaService;
