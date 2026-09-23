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

    // Sauna safety state
    this.saunaState = {
      id: this.saunaDeviceId,
      name: 'Sauna',
      isOn: false,
      startedAt: null,
      autoOffAt: null,
      durationMinutes: this.maxHours * 60,
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
   * Tuya OpenAPI signature and request helper
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
    const stringToSign = [method.toUpperCase(), contentHash, '', path].join('\n');
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
    if (!data.success && data.code === 1010) {
      // Token expired, clear and retry once
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
   * Fetch all devices from Tuya account and categorize them
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
      let saunaRelayStatus = false;

      for (const d of rawList) {
        const parsed = this.parseDevice(d);
        parsedDevices.push(parsed);
        this.devicesById.set(parsed.id, parsed);

        // Update DB topic states
        this.syncDeviceToDb(parsed);

        // Track sauna-specific readings
        if (parsed.id === this.saunaDeviceId || parsed.category === 'kg' || parsed.name.toLowerCase().includes('saun')) {
          if (parsed.properties.switch_1 !== undefined) {
            saunaRelayStatus = Boolean(parsed.properties.switch_1);
          }
        }

        // Sauna temperature sensor
        if (parsed.name.toLowerCase() === 'sauna' && parsed.type === 'climate') {
          if (parsed.properties.temperature != null) foundSaunaTemp = parsed.properties.temperature;
          if (parsed.properties.humidity != null) foundSaunaHumidity = parsed.properties.humidity;
        }
      }

      this.devices = parsedDevices;

      // Update sauna state
      const wasOn = this.saunaState.isOn;
      this.saunaState.isOn = saunaRelayStatus;
      if (foundSaunaTemp != null) this.saunaState.temperature = foundSaunaTemp;
      if (foundSaunaHumidity != null) this.saunaState.humidity = foundSaunaHumidity;
      this.saunaState.lastSeen = Date.now();

      // Handle safety timer if sauna turned ON outside Kotiäly (e.g. from physical switch or SmartLife app)
      if (saunaRelayStatus) {
        if (!wasOn || !this.saunaState.autoOffAt || this.saunaState.autoOffAt < Date.now()) {
          this.saunaState.startedAt = Date.now();
          this.saunaState.autoOffAt = Date.now() + (this.maxHours * 60 * 60 * 1000);
          console.log(`[TUYA] 🧖‍♂️ Sauna havaittu PÄÄLLÄ. 3h turva-ajastin aktivoitu (sammutus: ${new Date(this.saunaState.autoOffAt).toLocaleTimeString('fi-FI')}).`);
        }
      } else {
        if (wasOn) {
          this.saunaState.startedAt = null;
          this.saunaState.autoOffAt = null;
          console.log('[TUYA] 🧖‍♂️ Sauna sammutettu.');
        }
      }

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
   * Sync parsed device properties to SQLite DB
   */
  syncDeviceToDb(device) {
    const cleanName = device.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const prefix = `tuya/${cleanName}/`;

    for (const [prop, val] of Object.entries(device.properties)) {
      if (val === null || val === undefined) continue;
      const topic = `${prefix}${prop}`;
      db.updateState(topic, String(val));

      // Append history for numeric properties (temperature, humidity, battery)
      if (typeof val === 'number') {
        db.maybeAppendHistory(topic, val, 60000);
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
   * Get current sauna status including remaining time
   */
  getSaunaStatus() {
    const now = Date.now();
    let remainingMinutes = 0;
    let remainingSeconds = 0;

    if (this.saunaState.isOn && this.saunaState.autoOffAt) {
      const remainingMs = Math.max(0, this.saunaState.autoOffAt - now);
      remainingMinutes = Math.ceil(remainingMs / 60000);
      remainingSeconds = Math.ceil(remainingMs / 1000);
    }

    return {
      ...this.saunaState,
      remainingMinutes,
      remainingSeconds,
      maxHours: this.maxHours,
      maxMinutes: this.maxHours * 60,
    };
  }

  /**
   * Safety ticker: runs every 5 seconds to enforce 3-hour safety timeout
   */
  checkSafetyTimeout() {
    if (!this.saunaState.isOn) return;

    const now = Date.now();
    // 1. Check if auto-off time has passed
    if (this.saunaState.autoOffAt && now >= this.saunaState.autoOffAt) {
      console.warn(`[TUYA] 🛡️ SAUNAN TURVAKATKAISU: Asetettu aikaraja (${this.saunaState.durationMinutes} min) saavutettu. Sammutetaan kiuas välittömästi!`);
      this.setSaunaPower(false).catch(err => {
        console.error('[TUYA] Turvasammutus epäonnistui, yritetään uudelleen:', err.message);
        setTimeout(() => this.setSaunaPower(false).catch(() => {}), 2000);
      });
      return;
    }

    // 2. Absolute hard ceiling: if started more than 3 hours ago regardless of state
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
   * Initialize service, start polling and safety watcher
   */
  init(wsBroadcast) {
    this.wsBroadcast = wsBroadcast;

    if (!this.isConfigured()) {
      console.log('[TUYA] Tuya Cloud credentials not configured. Skipping initialization.');
      return;
    }

    console.log('[TUYA] Initializing SmartLife / Tuya IoT service...');

    // Initial fetch
    this.fetchDevices().then(() => {
      console.log(`[TUYA] Initialized with ${this.devices.length} SmartLife devices.`);
    }).catch(err => {
      console.error('[TUYA] Initial device fetch failed:', err.message);
    });

    // Poll every 30 seconds for sensor updates
    this.pollTimer = setInterval(() => {
      this.fetchDevices().catch(() => {});
    }, 30000);

    // Safety timeout check every 5 seconds
    this.safetyTimer = setInterval(() => {
      this.checkSafetyTimeout();
    }, 5000);
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.safetyTimer) clearInterval(this.safetyTimer);
  }
}

const tuyaService = new TuyaService();
module.exports = tuyaService;
