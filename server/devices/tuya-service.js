require('dotenv').config();
const crypto = require('crypto');
const db = require('../db');
const tuyaLocal = require('./tuya-local');

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
    this.lastGlowKey = null;
    this.lastGlowOn = false;
    this.cloudQuotaExhaustedUntil = 0;
    this.isPollingLocal = false;
    this.localPollTimer = null;

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
      power: 0,
      voltage: 230,
      current: 0,
      energy: 0,
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
    if (data.code === 28841004) {
      this.cloudQuotaExhaustedUntil = Date.now() + 5 * 60 * 1000;
    }

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
      // Tuya associated-users endpoint returns 20 items per page with cursor pagination (last_row_key)
      const rawList = [];
      let hasMore = true;
      let lastRowKey = '';
      let pageCount = 0;

      while (hasMore && pageCount < 10) {
        pageCount++;
        const path = lastRowKey
          ? `/v1.0/iot-01/associated-users/devices?last_row_key=${encodeURIComponent(lastRowKey)}`
          : '/v1.0/iot-01/associated-users/devices';
        const res = await this.request(path, 'GET');
        const list = res.result?.devices || res.result?.list || (Array.isArray(res.result) ? res.result : []);
        rawList.push(...list);

        hasMore = Boolean(res.result?.has_more && res.result?.last_row_key && res.result.last_row_key !== lastRowKey);
        lastRowKey = res.result?.last_row_key || '';
      }

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

        // Track sauna breaker switch (matching saunaDeviceId, or fallback to category kg if not set)
        if ((this.saunaDeviceId && parsed.id === this.saunaDeviceId) || (!this.saunaDeviceId && parsed.category === 'kg')) {
          if (!this.saunaDeviceId) {
            this.saunaDeviceId = parsed.id;
            this.saunaState.id = parsed.id;
          }
          if (parsed.properties.switch_1 !== undefined) {
            saunaRelayStatus = Boolean(parsed.properties.switch_1);
          } else if (parsed.properties.state !== undefined) {
            saunaRelayStatus = Boolean(parsed.properties.state);
          }
        }

        // Sauna climate sensor
        if (parsed.name.toLowerCase() === 'sauna' && parsed.type === 'climate') {
          if (parsed.properties.temperature != null) foundSaunaTemp = parsed.properties.temperature;
          if (parsed.properties.humidity != null) foundSaunaHumidity = parsed.properties.humidity;
        }
      }

      // Use cloud-cached status from bulk devices list only if devices were returned
      if (parsedDevices.length > 0) {
        this.devices = parsedDevices;
      } else if (this.devices.length === 0) {
        this.loadLocalDeviceRegistry();
      }

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
              this.startSaunaSession(this.saunaState.startedAt);
            }
          } else {
            // Turned OFF
            if (wasOn) {
              this.saunaState.startedAt = null;
              this.saunaState.autoOffAt = null;
              console.log('[TUYA] 🧖‍♂️ Sauna sammutettu.');
              this.finishSaunaSession();
            }
          }
        }
      }

      if (foundSaunaTemp != null) {
        this.saunaState.temperature = foundSaunaTemp;
        if (this.saunaState.isOn) {
          this.updateActiveSessionPeakTemp(foundSaunaTemp);
        }
      }
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

      // Trigger sauna glow update for bathroom lights
      this.updateSaunaGlow(this.saunaState.temperature, this.saunaState.isOn);

      // Instant MQTT state broadcast
      this.publishSaunaMqtt();

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

    // 1. Sauna / 3-phase Circuit Breaker or Relay (category: kg only)
    if (category === 'kg' && (!this.saunaDeviceId || d.id === this.saunaDeviceId)) {
      type = 'sauna_switch';
      properties.switch_1 = statusMap.switch_1 === true || statusMap.switch === true;
    }
    // 2. Temperature & Humidity sensor (wsdcg)
    else if (category === 'wsdcg') {
      type = 'climate';
      // Temperature normalization
      const rawTemp = statusMap.va_temperature ?? statusMap.temp_current;
      if (rawTemp != null) {
        let t = Number(rawTemp);
        if (t > 100 && t <= 1000) t = t / 10; // e.g. 211 -> 21.1 C
        if (t >= -40 && t <= 80) {
          properties.temperature = Number(t.toFixed(1));
        }
      }
      const rawHumid = statusMap.va_humidity ?? statusMap.humidity_value;
      if (rawHumid != null) {
        let h = Number(rawHumid);
        if (h > 100 && h <= 1000) h = h / 10; // e.g. 450 -> 45.0%
        if (h > 100 && h <= 102) h = 100;
        if (h >= 0 && h <= 100) {
          properties.humidity = Math.round(h);
        }
      }
      const rawBat = statusMap.va_battery ?? statusMap.battery_percentage;
      if (rawBat != null) {
        let b = Number(rawBat);
        if (b >= 0 && b <= 100) {
          properties.battery = Math.round(b);
        }
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
    // 5. Light / RGB Ceiling Light (dj, dd, dc or product_name contains light)
    else if (category === 'dj' || category === 'dd' || category === 'dc' || (d.product_name && d.product_name.toLowerCase().includes('light'))) {
      type = 'light';
      properties.switch_led = statusMap.switch_led === true || statusMap.switch === true;
      properties.work_mode = statusMap.work_mode || 'white';
      properties.bright_value = statusMap.bright_value_v2 != null ? Number(statusMap.bright_value_v2) : (statusMap.bright_value != null ? Number(statusMap.bright_value) : 1000);
      properties.temp_value = statusMap.temp_value_v2 != null ? Number(statusMap.temp_value_v2) : (statusMap.temp_value != null ? Number(statusMap.temp_value) : 1000);
      if (statusMap.colour_data_v2) {
        try {
          properties.colour_data = typeof statusMap.colour_data_v2 === 'string' ? JSON.parse(statusMap.colour_data_v2) : statusMap.colour_data_v2;
        } catch { }
      }
    }
    // 6. Metering switch / Circuit Breaker / Outdoor lights WiFi switch (dlq, cz, or with cur_power/cur_voltage)
    else if (category === 'dlq' || category === 'cz' || statusMap.cur_power !== undefined || statusMap.cur_voltage !== undefined) {
      const hasMetering = statusMap.cur_power !== undefined || statusMap.cur_voltage !== undefined || statusMap.add_ele !== undefined || category === 'dlq';
      type = hasMetering ? 'meter_switch' : 'switch';
      properties.has_power_metering = hasMetering;
      properties.switch_1 = statusMap.switch_1 === true || statusMap.switch === true;
      properties.state = properties.switch_1;
      // In Tuya, dlq (1P-Mtrg) and cz report cur_power in deciwatts (0.1 W), e.g. 533 -> 53.3 W
      if (statusMap.cur_power != null) {
        properties.power = Number((Number(statusMap.cur_power) / 10).toFixed(1));
      } else if (statusMap.power != null) {
        properties.power = Number(Number(statusMap.power).toFixed(1));
      } else {
        properties.power = 0;
      }
      properties.voltage = statusMap.cur_voltage != null ? Number((Number(statusMap.cur_voltage) / 10).toFixed(1)) : 0;
      properties.current = statusMap.cur_current != null ? Number((Number(statusMap.cur_current) / 1000).toFixed(3)) : 0;
      properties.energy = statusMap.add_ele != null ? Number(statusMap.add_ele) : 0;
      properties.device_temp = statusMap.temp_value != null ? Number(statusMap.temp_value) : null;
    }
    // 7. Gateway (wg2)
    else if (category === 'wg2') {
      type = 'gateway';
      properties.mode = statusMap.master_mode || 'online';
    }
    // 8. Generic switch
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
      properties,
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

      // Append history for numeric properties (temperature, humidity, battery, power, energy, etc.)
      if (typeof val === 'number') {
        db.maybeAppendHistory(topic, val, 60000);
      }
    }

    // If device is the outdoor lights metering relay, also sync to tuya/ulkovalot/* and tuya/ulkovalot_1/*
    let outdoorDeviceId = 'bf7a39a3a10e38a52engat';
    let outdoorDeviceId2 = 'bfee1ec43ebb997b0c12ru';
    try {
      const outdoorSettings = db.getOutdoorLightsSettings ? db.getOutdoorLightsSettings() : null;
      if (outdoorSettings?.device_id) outdoorDeviceId = outdoorSettings.device_id;
      if (outdoorSettings?.device_id_2) outdoorDeviceId2 = outdoorSettings.device_id_2;
    } catch { }

    if (device.id === outdoorDeviceId || (device.name && (device.name.toLowerCase().includes('ulkovalot 1') || device.name.toLowerCase().includes('wifi switch / 1p-mtrg 2')))) {
      for (const [prop, val] of Object.entries(device.properties)) {
        if (val === null || val === undefined) continue;
        db.updateState(`tuya/ulkovalot/${prop}`, String(val));
        db.updateState(`tuya/ulkovalot_1/${prop}`, String(val));
        if (typeof val === 'number') {
          db.maybeAppendHistory(`tuya/ulkovalot/${prop}`, val, 60000);
        }
      }
    }

    if (device.id === outdoorDeviceId2 || (device.name && device.name.toLowerCase().includes('ulkovalot 2'))) {
      for (const [prop, val] of Object.entries(device.properties)) {
        if (val === null || val === undefined) continue;
        db.updateState(`tuya/ulkovalot_2/${prop}`, String(val));
        if (prop === 'state') {
          db.updateState('tuya/ulkovalot_2/switch', val ? '1' : '0');
        }
      }
    }

    // If device is upstairs circulation pump, also sync to tuya/kiertovesipumppu/* and tuya/ylakerran_kiertovesipumppu/*
    if (device.id === 'bfb6ed442015162bc97kca' || (device.name && device.name.toLowerCase().includes('kiertovesipumppu'))) {
      for (const [prop, val] of Object.entries(device.properties)) {
        if (val === null || val === undefined) continue;
        db.updateState(`tuya/kiertovesipumppu/${prop}`, String(val));
        db.updateState(`tuya/ylakerran_kiertovesipumppu/${prop}`, String(val));
        if (prop === 'state') {
          db.updateState('tuya/kiertovesipumppu/switch', val ? '1' : '0');
          db.updateState('tuya/ylakerran_kiertovesipumppu/switch', val ? '1' : '0');
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

    let switched = false;

    // 1. Try local LAN control first (instant, bypasses Tuya Cloud & exhausted trial quota)
    if (this.saunaDeviceId && tuyaLocal.isDeviceSupportedLocally(this.saunaDeviceId)) {
      try {
        console.log(`[TUYA:LOCAL] Ohjataan saunaa (${this.saunaDeviceId}) suoraan lähiverkossa -> ${turnOn ? 'PÄÄLLE' : 'POIS'}`);
        await tuyaLocal.setSwitch(this.saunaDeviceId, Boolean(turnOn));
        switched = true;
        console.log(`[TUYA:LOCAL] ✅ Saunan rele kytketty paikallisesti onnistuneesti!`);
      } catch (localErr) {
        console.warn(`[TUYA:LOCAL] Saunan paikallisohjaus epäonnistui (${localErr.message}). Kokeillaan pilveä...`);
      }
    }

    // 2. Fallback to Cloud if local control was not possible or failed
    if (!switched) {
      if (Date.now() < this.cloudQuotaExhaustedUntil) {
        throw new Error(`Saunan kytkentä epäonnistui: Rele ei vastannut lähiverkossa ja Tuya Cloud -kiintiö on vanhentunut (IoT Core trial quota is exhausted).`);
      }

      const commandBody = {
        commands: [
          {
            code: 'switch',
            value: Boolean(turnOn),
          },
          {
            code: 'switch_1',
            value: Boolean(turnOn),
          },
        ],
      };

      let res = await this.request(`/v1.0/devices/${this.saunaDeviceId}/commands`, 'POST', commandBody);
      if (!res.success) {
        // Try single command with code: switch
        res = await this.request(`/v1.0/devices/${this.saunaDeviceId}/commands`, 'POST', {
          commands: [{ code: 'switch', value: Boolean(turnOn) }]
        });
        if (!res.success) {
          // Try single command with code: switch_1
          res = await this.request(`/v1.0/devices/${this.saunaDeviceId}/commands`, 'POST', {
            commands: [{ code: 'switch_1', value: Boolean(turnOn) }]
          });
        }
      }
      if (!res.success) {
        throw new Error(`Saunan kytkentä epäonnistui: ${res.msg || JSON.stringify(res)}`);
      }
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
      this.startSaunaSession(this.saunaState.startedAt);
    } else {
      this.saunaState.startedAt = null;
      this.saunaState.autoOffAt = null;
      this.saunaState.lastAction = 'Kytketty pois päältä';
      console.log('[TUYA] 🧖‍♂️ Sauna kytketty POIS PÄÄLTÄ.');
      this.finishSaunaSession();
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

    // Trigger sauna glow update immediately
    this.updateSaunaGlow(this.saunaState.temperature, Boolean(turnOn));

    // Immediate MQTT sync for ESP32 display & external clients
    this.publishSaunaMqtt();

    return this.getSaunaStatus();
  }

  /**
   * Instantly publish full sauna state to MQTT with retain flag
   */
  publishSaunaMqtt() {
    try {
      const mqttClient = require('../mqtt-client');
      if (mqttClient && mqttClient.isConnected()) {
        const isSwitchOn = this.saunaState.isOn ? '1' : '0';
        mqttClient.publish('tuya/sauna/switch', isSwitchOn, { retain: true });
        mqttClient.publish('tuya/sauna/auto_off_at', this.saunaState.autoOffAt ? String(this.saunaState.autoOffAt) : '0', { retain: true });
        if (this.saunaState.temperature != null) {
          mqttClient.publish('tuya/sauna/temperature', String(this.saunaState.temperature), { retain: true });
        }
        if (this.saunaState.humidity != null) {
          mqttClient.publish('tuya/sauna/humidity', String(this.saunaState.humidity), { retain: true });
        }
        if (this.saunaState.power != null) {
          mqttClient.publish('tuya/sauna/power', String(this.saunaState.power), { retain: true });
        }
        if (this.saunaState.voltage != null) {
          mqttClient.publish('tuya/sauna/voltage', String(this.saunaState.voltage), { retain: true });
        }
        if (this.saunaState.energy != null) {
          mqttClient.publish('tuya/sauna/energy', String(this.saunaState.energy), { retain: true });
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  /**
   * External climate update (e.g. from Zigbee2MQTT / Sauna temperature sensor)
   */
  updateSaunaClimate(temperature, humidity) {
    let changed = false;
    if (temperature != null && !isNaN(temperature)) {
      this.saunaState.temperature = Number(Number(temperature).toFixed(1));
      changed = true;
      if (this.saunaState.isOn) {
        this.updateActiveSessionPeakTemp(this.saunaState.temperature);
      }
      this.updateSaunaGlow(this.saunaState.temperature, this.saunaState.isOn);
    }
    if (humidity != null && !isNaN(humidity)) {
      this.saunaState.humidity = Number(Number(humidity).toFixed(1));
      changed = true;
    }
    if (changed) {
      this.saunaState.lastSeen = Date.now();
      this.publishSaunaMqtt();
      if (this.wsBroadcast) {
        this.wsBroadcast({
          type: 'sauna_status',
          sauna: this.getSaunaStatus(),
          ts: Date.now(),
        });
      }
    }
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

  startSaunaSession(startedAt = Date.now()) {
    try {
      const active = db.getActiveSaunaSession();
      if (!active) {
        const id = db.insertSaunaSession({
          start_time: startedAt,
          end_time: null,
          duration_minutes: 0,
          peak_temp: this.saunaState.temperature,
          energy_kwh: 0,
          cost_eur: 0,
          avg_price_cents: 0,
          status: 'heating',
        });
        this.currentSessionId = id;
        console.log(`[TUYA] 📊 Uusi saunasessio luotu tietokantaan (ID: ${id})`);
      } else {
        this.currentSessionId = active.id;
      }
    } catch (err) {
      console.warn('[TUYA] Virhe saunasession luonnissa:', err.message);
    }
  }

  finishSaunaSession() {
    try {
      const active = db.getActiveSaunaSession();
      if (active) {
        const now = Date.now();
        const start = active.start_time;
        const peakTemp = Math.max(active.peak_temp || 0, this.saunaState.temperature || 0);
        const calc = db.calculateSaunaEnergyAndCost(start, now);
        db.updateSaunaSession(active.id, {
          end_time: now,
          duration_minutes: calc.durationMinutes,
          peak_temp: peakTemp,
          energy_kwh: calc.energyKwh,
          cost_eur: calc.costEur,
          avg_price_cents: calc.avgPriceCents,
          status: 'completed',
          notified_ready: 1,
        });
        console.log(`[TUYA] 📊 Saunasessio päätetty ja tallennettu: ${calc.durationMinutes} min · ${calc.energyKwh} kWh · ${calc.costEur} € (Huippu: ${peakTemp}°C)`);
      }
      this.currentSessionId = null;
    } catch (err) {
      console.warn('[TUYA] Virhe saunasession päättämisessä:', err.message);
    }
  }

  updateActiveSessionPeakTemp(temp) {
    if (!temp) return;
    try {
      const active = db.getActiveSaunaSession();
      if (active && (temp > (active.peak_temp || 0))) {
        db.updateSaunaSession(active.id, { peak_temp: temp });
      }
    } catch { }
  }

  /**
   * Get current sauna status including remaining time and live energy/cost stats
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

    // Live session calculation if ON, or latest completed session
    let liveSession = null;
    if (this.saunaState.isOn && this.saunaState.startedAt) {
      const calc = db.calculateSaunaEnergyAndCost(this.saunaState.startedAt, now);
      liveSession = {
        startTime: this.saunaState.startedAt,
        durationMinutes: calc.durationMinutes,
        energyKwh: calc.energyKwh,
        costEur: calc.costEur,
        avgPriceCents: calc.avgPriceCents,
        peakTemp: this.saunaState.temperature,
        isLive: true,
      };
    } else {
      const latest = db.getLatestSaunaSession();
      if (latest) {
        liveSession = {
          startTime: latest.start_time,
          endTime: latest.end_time,
          durationMinutes: latest.duration_minutes,
          energyKwh: latest.energy_kwh,
          costEur: latest.cost_eur,
          avgPriceCents: latest.avg_price_cents,
          peakTemp: latest.peak_temp,
          isLive: false,
        };
      }
    }

    let yearlyStats = null;
    try {
      yearlyStats = db.getSaunaStats();
    } catch { }

    return {
      ...this.saunaState,
      remainingMinutes,
      remainingSeconds,
      scheduledRemainingSeconds,
      maxHours: this.maxHours,
      maxMinutes: this.maxHours * 60,
      session: liveSession,
      yearlyStats: yearlyStats ? {
        year: yearlyStats.year,
        count: yearlyStats.count,
        totalKwh: yearlyStats.totalKwh,
        totalEur: yearlyStats.totalEur,
        avgDurationMinutes: yearlyStats.avgDurationMinutes,
        avgKwhPerSession: yearlyStats.avgKwhPerSession,
        avgEurPerSession: yearlyStats.avgEurPerSession,
      } : null,
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

    // 0. Over-temperature emergency cutoff (95 °C) to prevent overheating / fire hazard
    if (this.saunaState.temperature && this.saunaState.temperature >= 95) {
      console.warn(`[TUYA] 🚨 SAUNAN YLILÄMPÖKATKAISU: Lämpötila saavutti ${this.saunaState.temperature} °C (raja 95 °C). Sammutetaan kiuas välittömästi!`);
      this.setSaunaPower(false).catch((err) => {
        console.error('[TUYA] Ylilämpösammutus epäonnistui:', err.message);
      });
      return;
    }

    // Do not run safety cutoff if we just sent a command within 15s
    if (Date.now() - (this.lastCommandAt || 0) < 15000) return;

    // 2. Check if auto-off time has passed
    if (this.saunaState.autoOffAt && now >= this.saunaState.autoOffAt) {
      console.warn(`[TUYA] 🛡️ SAUNAN TURVAKATKAISU: Asetettu aikaraja (${this.saunaState.durationMinutes} min) saavutettu. Sammutetaan kiuas välittömästi!`);
      this.setSaunaPower(false).catch(err => {
        console.error('[TUYA] Turvasammutus epäonnistui, yritetään uudelleen:', err.message);
        setTimeout(() => this.setSaunaPower(false).catch(() => { }), 2000);
      });
      return;
    }

    // 3. Absolute hard ceiling: if started more than 3 hours ago regardless of state
    if (this.saunaState.startedAt && (now - this.saunaState.startedAt >= this.maxHours * 3600 * 1000)) {
      console.warn('[TUYA] 🛡️ SAUNAN MAKSIMIAIKAKATKAISU (3H): Kiuas sammutetaan varotoimena.');
      this.setSaunaPower(false).catch(() => { });
    }
  }

  /**
   * Control any Tuya switch / relay (supports 'switch' and 'switch_1')
   * Prioritizes 100% direct local LAN TCP socket control if device key is known.
   */
  async setSwitchPower(deviceId, turnOn) {
    if (!deviceId) throw new Error('Device ID required');
    const val = Boolean(turnOn);
    console.log(`[TUYA] Kytkimen ohjaus (${deviceId}) -> ${val ? 'PÄÄLLE' : 'POIS'}`);

    // 1. Try local LAN control first (zero cloud dependency)
    if (tuyaLocal.isDeviceSupportedLocally(deviceId)) {
      try {
        const localRes = await tuyaLocal.setSwitch(deviceId, val);
        if (localRes && localRes.success) {
          const dev = this.devicesById?.get(deviceId);
          if (dev) {
            dev.properties.state = val;
            dev.properties.switch_1 = val;
            this.syncDeviceToDb(dev);
          }
          return { success: true, state: val, local: true };
        }
      } catch (localErr) {
        console.warn(`[TUYA:LOCAL] Paikallisohjaus varoitus (${deviceId}): ${localErr.message}. Kokeillaan pilveä...`);
      }
    }

    // 2. Fallback to Tuya OpenAPI Cloud (skip if cloud quota is exhausted to avoid lag)
    if (Date.now() < this.cloudQuotaExhaustedUntil) {
      throw new Error(`Tuya-laite ei vastaa lähiverkossa ja pilvikiintiö on täynnä (IoT Core trial quota is exhausted)`);
    }

    let res = await this.request(`/v1.0/devices/${deviceId}/commands`, 'POST', {
      commands: [
        { code: 'switch', value: val },
        { code: 'switch_1', value: val },
      ],
    });

    if (!res.success) {
      res = await this.request(`/v1.0/devices/${deviceId}/commands`, 'POST', {
        commands: [{ code: 'switch', value: val }],
      });
      if (!res.success) {
        res = await this.request(`/v1.0/devices/${deviceId}/commands`, 'POST', {
          commands: [{ code: 'switch_1', value: val }],
        });
      }
    }

    if (!res.success) {
      throw new Error(`Kytkimen ohjaus epäonnistui: ${res.msg || JSON.stringify(res)}`);
    }

    setTimeout(() => this.fetchDevices().catch(() => { }), 500);
    return { success: true, state: val };
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
    setTimeout(() => this.fetchDevices().catch(() => { }), 500);
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
          this.setSaunaPower(true, schedDur).catch(() => { });
        }
      }

      if (autoOff > now) {
        this.saunaState.autoOffAt = autoOff;
        this.saunaState.startedAt = startedAt || (now - ((dur * 60 * 1000) - (autoOff - now)));
        this.saunaState.durationMinutes = dur;
        console.log(`[TUYA] Palautettiin aktiivinen lämmitysjakso tietokannasta (päättyy: ${new Date(autoOff).toLocaleTimeString('fi-FI')}).`);
      }

      // Restore sauna temperature, humidity and telemetry from DB
      const saunaTempRow = db.getState('zigbee/Sauna/temperature') || db.getState('tuya/sauna/temperature');
      const saunaHumidRow = db.getState('zigbee/Sauna/humidity') || db.getState('tuya/sauna/humidity');
      if (saunaTempRow && !isNaN(parseFloat(saunaTempRow.value))) {
        this.saunaState.temperature = parseFloat(saunaTempRow.value);
      }
      if (saunaHumidRow && !isNaN(parseFloat(saunaHumidRow.value))) {
        this.saunaState.humidity = parseFloat(saunaHumidRow.value);
      }
      const saunaPowerRow = db.getState('tuya/sauna/power');
      const saunaVoltageRow = db.getState('tuya/sauna/voltage');
      const saunaEnergyRow = db.getState('tuya/sauna/energy');
      if (saunaPowerRow) this.saunaState.power = parseFloat(saunaPowerRow.value) || 0;
      if (saunaVoltageRow) this.saunaState.voltage = parseFloat(saunaVoltageRow.value) || 230;
      if (saunaEnergyRow) this.saunaState.energy = parseFloat(saunaEnergyRow.value) || 0;
    } catch (err) {
      console.warn('[TUYA] State restoration from DB warning:', err.message);
    }

    // 1. Immediately populate local devices from keys & SQLite so UI is never empty
    this.loadLocalDeviceRegistry();

    // 2. Start direct local WiFi polling immediately (zero cloud dependency, 170ms response)
    this.pollLocalDevices().catch(() => {});
    this.localPollTimer = setInterval(() => {
      this.pollLocalDevices().catch(() => {});
    }, 15000);

    // Initial fetch from cloud if configured
    if (this.isConfigured()) {
      this.fetchDevices().then(() => {
        console.log(`[TUYA] Initialized with ${this.devices.length} SmartLife devices.`);
      }).catch(err => {
        console.warn('[TUYA] Cloud fetch skipped or quota reached, continuing with local devices:', err.message);
      });

      // Poll cloud every 180 seconds for any non-local devices
      const pollInterval = parseInt(process.env.TUYA_POLL_INTERVAL_MS) || 180000;
      this.pollTimer = setInterval(() => {
        this.fetchDevices().catch(() => { });
      }, pollInterval);
    }

    // Safety timeout check every 5 seconds
    this.safetyTimer = setInterval(() => {
      this.checkSafetyTimeout().catch(() => { });
    }, 5000);
  }

  /**
   * Load local devices from keys and DB states so devices list is never empty
   */
  loadLocalDeviceRegistry() {
    try {
      const keys = tuyaLocal.keys || {};
      const fullState = db.getFullState();
      const loaded = [];

      for (const [id, info] of Object.entries(keys)) {
        const category = info.category || '';
        let type = 'unknown';
        if (category === 'dlq' || category === 'cz') type = 'meter_switch';
        else if (category === 'kg') type = 'sauna_switch';
        else if (category === 'wsdcg') type = 'climate';
        else if (category === 'sj') type = 'water_leak';
        else if (category === 'mcs') type = 'door';
        else if (category === 'dj' || category === 'dd') type = 'light';
        else if (category === 'tdq') type = 'switch';

        let deviceName = info.name;
        // The former outdoor temperature sensor was relocated to Pikkuvarasto
        if (this.cleanTopicName(deviceName).includes('ulko') && (category === 'wsdcg' || info.product?.includes('Temperature'))) {
          deviceName = 'Pikkuvarasto';
        }

        const cleanName = this.cleanTopicName(deviceName);
        const prefix = `tuya/${cleanName}/`;
        const properties = {};

        // Extract known states from DB (both tuya/* and zigbee/*)
        for (const [top, row] of Object.entries(fullState)) {
          if (top.startsWith(prefix)) {
            const prop = top.slice(prefix.length);
            const num = Number(row.value);
            properties[prop] = isNaN(num) || row.value === '' ? (row.value === 'true' ? true : (row.value === 'false' ? false : row.value)) : num;
          }
        }

        loaded.push({
          id,
          name: deviceName,
          type,
          category,
          model: info.product || 'SmartLife',
          product_name: info.product || deviceName,
          online: true,
          ip: tuyaLocal.knownDevices?.get(id) || undefined,
          properties,
          update_time: Date.now(),
        });
      }

      if (loaded.length > 0) {
        this.devices = loaded;
        for (const d of loaded) {
          this.devicesById.set(d.id, d);
        }
        console.log(`[TUYA:LOCAL] Alustettu ${this.devices.length} laitetta avaintiedostosta ja tietokannasta.`);
      }
    } catch (e) {
      console.warn('[TUYA:LOCAL] loadLocalDeviceRegistry varoitus:', e.message);
    }
  }

  /**
   * Sync sensor update from Zigbee client directly to memory device registry
   */
  syncSensorUpdate(slug, friendlyName, prop, val) {
    if (!slug) return;
    const numVal = typeof val === 'number' ? val : (isNaN(Number(val)) ? val : Number(val));

    const displayNames = {
      sauna: 'Sauna',
      alakerta: 'Alakerta',
      ylakerran_tyohuone: 'Yläkerran työhuone',
      autotalli: 'Autotalli',
      isovarasto: 'Isovarasto',
      pikkuvarasto: 'Pikkuvarasto',
    };

    let dev = this.devices.find((d) => {
      const norm = this.cleanTopicName(d.name);
      return norm === slug || (slug === 'ylakerran_tyohuone' && (norm.includes('ylakerta') || norm.includes('tyohuone')));
    });

    if (!dev && slug === 'pikkuvarasto') {
      const oldUlko = this.devices.find((d) => this.cleanTopicName(d.name).includes('ulko') && d.type === 'climate');
      if (oldUlko) {
        oldUlko.name = 'Pikkuvarasto';
        oldUlko.product_name = 'Zigbee Temperature and Humidity Sensor';
        dev = oldUlko;
      }
    }

    if (!dev) {
      dev = {
        id: `zigbee_${slug}`,
        name: displayNames[slug] || friendlyName,
        type: 'climate',
        category: 'wsdcg',
        model: 'TH01',
        product_name: 'Zigbee Temperature & Humidity Sensor',
        online: true,
        properties: {},
        update_time: Date.now(),
      };
      this.devices.push(dev);
      this.devicesById.set(dev.id, dev);
    }

    dev.online = true;
    dev.update_time = Date.now();
    dev.properties[prop] = numVal;

    if (slug === 'sauna') {
      if (prop === 'temperature' && typeof numVal === 'number') {
        this.updateSaunaClimate(numVal, null);
      } else if (prop === 'humidity' && typeof numVal === 'number') {
        this.updateSaunaClimate(null, numVal);
      }
    }
  }

  /**
   * Returns devices enriched with latest SQLite sensor states and guarantees
   * all Zigbee room & storage sensors are populated.
   */
  getEnrichedDevices() {
    const fullState = db.getFullState();

    const knownSensors = [
      { slug: 'sauna', name: 'Sauna', zigbeeKey: 'Sauna' },
      { slug: 'alakerta', name: 'Alakerta', zigbeeKey: 'Alakerta' },
      { slug: 'ylakerran_tyohuone', name: 'Yläkerran työhuone', zigbeeKey: 'Työhuone' },
      { slug: 'autotalli', name: 'Autotalli', zigbeeKey: 'Autotalli' },
      { slug: 'isovarasto', name: 'Isovarasto', zigbeeKey: 'Isovarasto' },
      { slug: 'pikkuvarasto', name: 'Pikkuvarasto', zigbeeKey: 'Pikkuvarasto' },
    ];

    for (const s of knownSensors) {
      let dev = this.devices.find((d) => {
        const norm = this.cleanTopicName(d.name);
        return norm === s.slug || (s.slug === 'ylakerran_tyohuone' && (norm.includes('ylakerta') || norm.includes('tyohuone')));
      });

      if (!dev && s.slug === 'pikkuvarasto') {
        const oldUlko = this.devices.find((d) => this.cleanTopicName(d.name).includes('ulko') && d.type === 'climate');
        if (oldUlko) {
          oldUlko.name = 'Pikkuvarasto';
          oldUlko.product_name = 'Zigbee Temperature & Humidity Sensor';
          dev = oldUlko;
        }
      }

      if (!dev) {
        dev = {
          id: `zigbee_${s.slug}`,
          name: s.name,
          type: 'climate',
          category: 'wsdcg',
          model: 'TH01',
          product_name: 'Zigbee Temperature & Humidity Sensor',
          online: true,
          properties: {},
          update_time: Date.now(),
        };
        this.devices.push(dev);
        this.devicesById.set(dev.id, dev);
      }

      const tempVal = fullState[`zigbee/${s.zigbeeKey}/temperature`]?.value ?? fullState[`tuya/${s.slug}/temperature`]?.value;
      const humidVal = fullState[`zigbee/${s.zigbeeKey}/humidity`]?.value ?? fullState[`tuya/${s.slug}/humidity`]?.value;
      const battVal = fullState[`zigbee/${s.zigbeeKey}/battery`]?.value ?? fullState[`tuya/${s.slug}/battery`]?.value;

      if (tempVal != null && !isNaN(Number(tempVal))) dev.properties.temperature = Number(tempVal);
      if (humidVal != null && !isNaN(Number(humidVal))) dev.properties.humidity = Number(humidVal);
      if (battVal != null && !isNaN(Number(battVal))) dev.properties.battery = Number(battVal);
    }

    // Filter out old Ulkolämpötila climate device if any, because outdoor temp comes from Panasonic VILP
    return this.devices.filter(d => !(d.type === 'climate' && this.cleanTopicName(d.name).includes('ulko')));
  }

  /**
   * Direct local WiFi status and energy telemetry query (TuyAPI TCP port 6668)
   */
  async pollLocalDevices() {
    if (this.isPollingLocal) return;
    this.isPollingLocal = true;

    try {
      let mqttClient = null;
      try { mqttClient = require('../mqtt-client'); } catch { }

      // 1. Sauna Breaker (WiFi Switch / 1P-Mtrg @ 192.168.68.73)
      const saunaId = this.saunaDeviceId || 'bfc6974c07151a07e7fa3g';
      if (tuyaLocal.isDeviceSupportedLocally(saunaId)) {
        try {
          const res = await tuyaLocal.getStatus(saunaId);
          if (res && res.dps) {
            const dps = res.dps;
            const isRelayOn = dps['1'] === true || dps['1'] === 'true' || dps['switch_1'] === true;
            const energyKwh = dps['17'] != null ? Number(dps['17']) : (dps['add_ele'] != null ? Number(dps['add_ele']) : 0);
            const currentA = dps['18'] != null ? Number((Number(dps['18']) / 1000).toFixed(3)) : 0;
            const rawPower = dps['19'] != null ? Number(dps['19']) / 10 : 0;
            const powerW = Number(Number(rawPower).toFixed(1));
            const voltageV = dps['20'] != null ? Number((Number(dps['20']) / 10).toFixed(1)) : 230;
            const devTemp = dps['47'] != null ? Number(dps['47']) : null;

            // Check if within command grace period (30s)
            const isWithinGracePeriod = (Date.now() - (this.lastCommandAt || 0)) < 30000;
            if (!isWithinGracePeriod || this.lastCommandState === null) {
              const wasOn = this.saunaState.isOn;
              this.saunaState.isOn = isRelayOn;
              if (isRelayOn && (!wasOn || !this.saunaState.autoOffAt || this.saunaState.autoOffAt < Date.now())) {
                const duration = this.saunaState.durationMinutes || 90;
                this.saunaState.startedAt = this.saunaState.startedAt || Date.now();
                this.saunaState.autoOffAt = this.saunaState.startedAt + (duration * 60 * 1000);
                this.startSaunaSession(this.saunaState.startedAt);
              } else if (!isRelayOn && wasOn) {
                this.saunaState.startedAt = null;
                this.saunaState.autoOffAt = null;
                this.finishSaunaSession();
              }
            }

            this.saunaState.power = powerW;
            this.saunaState.voltage = voltageV;
            this.saunaState.current = currentA;
            this.saunaState.energy = energyKwh;
            this.saunaState.lastSeen = Date.now();

            // Sync to SQLite
            db.updateState('tuya/sauna/switch', this.saunaState.isOn ? '1' : '0');
            db.updateState('tuya/sauna/state', this.saunaState.isOn ? 'true' : 'false');
            db.updateState('tuya/sauna/power', String(powerW));
            db.updateState('tuya/sauna/voltage', String(voltageV));
            db.updateState('tuya/sauna/current', String(currentA));
            db.updateState('tuya/sauna/energy', String(energyKwh));
            if (devTemp != null) db.updateState('tuya/sauna/device_temp', String(devTemp));
            if (powerW > 0) db.maybeAppendHistory('tuya/sauna/power', powerW, 30000);

            // Update cached device in devicesById
            const saunaDev = this.devicesById?.get(saunaId);
            if (saunaDev) {
              saunaDev.properties.state = this.saunaState.isOn;
              saunaDev.properties.switch_1 = this.saunaState.isOn;
              saunaDev.properties.power = powerW;
              saunaDev.properties.voltage = voltageV;
              saunaDev.properties.current = currentA;
              saunaDev.properties.energy = energyKwh;
              saunaDev.update_time = Date.now();
            }

            // Publish to MQTT
            if (mqttClient && mqttClient.isConnected()) {
              mqttClient.publish('tuya/sauna/switch', this.saunaState.isOn ? '1' : '0', { retain: true });
              mqttClient.publish('tuya/sauna/power', String(powerW), { retain: true });
              mqttClient.publish('tuya/sauna/voltage', String(voltageV), { retain: true });
              mqttClient.publish('tuya/sauna/current', String(currentA), { retain: true });
              mqttClient.publish('tuya/sauna/energy', String(energyKwh), { retain: true });
            }
          }
        } catch (e) { }
      }

      // 2. Ulkovalot 1 (WiFi Switch / 1P-Mtrg @ 192.168.68.74)
      const outdoorId1 = 'bf7a39a3a10e38a52engat';
      if (tuyaLocal.isDeviceSupportedLocally(outdoorId1)) {
        try {
          const res = await tuyaLocal.getStatus(outdoorId1);
          if (res && res.dps) {
            const dps = res.dps;
            const isOn = dps['1'] === true || dps['1'] === 'true';
            const energyKwh = dps['17'] != null ? Number(dps['17']) : 0;
            const currentA = dps['18'] != null ? Number((Number(dps['18']) / 1000).toFixed(3)) : 0;
            const rawPower = dps['19'] != null ? Number(dps['19']) / 10 : 0;
            const powerW = Number(Number(rawPower).toFixed(1));
            const voltageV = dps['20'] != null ? Number((Number(dps['20']) / 10).toFixed(1)) : 230;
            const devTemp = dps['47'] != null ? Number(dps['47']) : null;

            db.updateState('tuya/ulkovalot/switch', isOn ? '1' : '0');
            db.updateState('tuya/ulkovalot/state', isOn ? 'ON' : 'OFF');
            db.updateState('tuya/ulkovalot_1/switch', isOn ? '1' : '0');
            db.updateState('tuya/ulkovalot_1/state', isOn ? 'true' : 'false');
            db.updateState('tuya/ulkovalot/power', String(powerW));
            db.updateState('tuya/ulkovalot_1/power', String(powerW));
            db.updateState('tuya/ulkovalot/voltage', String(voltageV));
            db.updateState('tuya/ulkovalot_1/voltage', String(voltageV));
            db.updateState('tuya/ulkovalot/current', String(currentA));
            db.updateState('tuya/ulkovalot_1/current', String(currentA));
            db.updateState('tuya/ulkovalot/energy', String(energyKwh));
            db.updateState('tuya/ulkovalot_1/energy', String(energyKwh));
            if (devTemp != null) {
              db.updateState('tuya/ulkovalot/device_temp', String(devTemp));
              db.updateState('tuya/ulkovalot_1/device_temp', String(devTemp));
            }

            const outdoorDev = this.devicesById?.get(outdoorId1);
            if (outdoorDev) {
              outdoorDev.properties.state = isOn;
              outdoorDev.properties.power = powerW;
              outdoorDev.properties.voltage = voltageV;
              outdoorDev.properties.current = currentA;
              outdoorDev.properties.energy = energyKwh;
              outdoorDev.update_time = Date.now();
            }

            if (mqttClient && mqttClient.isConnected()) {
              mqttClient.publish('tuya/ulkovalot/switch', isOn ? '1' : '0', { retain: true });
              mqttClient.publish('tuya/ulkovalot/power', String(powerW), { retain: true });
              mqttClient.publish('tuya/ulkovalot/voltage', String(voltageV), { retain: true });
              mqttClient.publish('tuya/ulkovalot/energy', String(energyKwh), { retain: true });
            }
          }
        } catch (e) { }
      }

      // 3. Ulkovalot 2 (MINI通断器1路 @ 192.168.68.78)
      const outdoorId2 = 'bfee1ec43ebb997b0c12ru';
      if (tuyaLocal.isDeviceSupportedLocally(outdoorId2)) {
        try {
          const res = await tuyaLocal.getStatus(outdoorId2);
          if (res && res.dps) {
            const isOn = res.dps['1'] === true || res.dps['1'] === 'true';
            db.updateState('tuya/ulkovalot_2/switch', isOn ? '1' : '0');
            db.updateState('tuya/ulkovalot_2/state', isOn ? 'true' : 'false');
            const dev2 = this.devicesById?.get(outdoorId2);
            if (dev2) {
              dev2.properties.state = isOn;
              dev2.update_time = Date.now();
            }
          }
        } catch (e) { }
      }

      // 4. Kiertovesipumppu / Upstairs LKV circulation (@ 192.168.68.58)
      const pumpId = 'bfb6ed442015162bc97kca';
      if (tuyaLocal.isDeviceSupportedLocally(pumpId)) {
        try {
          const res = await tuyaLocal.getStatus(pumpId);
          if (res && res.dps) {
            const isOn = res.dps['1'] === true || res.dps['1'] === 'true';
            db.updateState('tuya/kiertovesipumppu/switch', isOn ? '1' : '0');
            db.updateState('tuya/ylakerran_kiertovesipumppu/switch', isOn ? '1' : '0');
            const pumpDev = this.devicesById?.get(pumpId);
            if (pumpDev) {
              pumpDev.properties.state = isOn;
              pumpDev.update_time = Date.now();
            }
          }
        } catch (e) { }
      }

      // 5. Energy+ Älypistorasia (@ 192.168.68.62)
      const plugId = 'bf48a78786f87488b4otcg';
      if (tuyaLocal.isDeviceSupportedLocally(plugId)) {
        try {
          const res = await tuyaLocal.getStatus(plugId);
          if (res && res.dps) {
            const isOn = res.dps['1'] === true || res.dps['1'] === 'true';
            db.updateState('tuya/energy_alypistorasia_home_connect_ip20/switch_1', isOn ? 'true' : 'false');
            db.updateState('tuya/energy_alypistorasia_home_connect_ip20/state', isOn ? 'true' : 'false');
          }
        } catch (e) { }
      }

      // Broadcast updates to WebSocket clients
      if (this.wsBroadcast) {
        this.wsBroadcast({
          type: 'sauna_status',
          sauna: this.getSaunaStatus(),
          ts: Date.now(),
        });
      }
    } finally {
      this.isPollingLocal = false;
    }
  }

  /**
   * Set light state (power, brightness, color, work_mode)
   * Supports single deviceId or array of deviceIds for synchronized group control
   */
  async setLightState(deviceIds, { power, brightness, colorTemp, colorHsv, mode }) {
    const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
    if (ids.length === 0) return { success: true };

    const commands = [];
    if (power !== undefined) {
      commands.push({ code: 'switch_led', value: Boolean(power) });
    }
    if (mode) {
      commands.push({ code: 'work_mode', value: mode });
    }
    if (brightness !== undefined) {
      const b = Math.min(1000, Math.max(10, Math.round(brightness)));
      commands.push({ code: 'bright_value_v2', value: b });
    }
    if (colorTemp !== undefined) {
      const t = Math.min(1000, Math.max(0, Math.round(colorTemp)));
      commands.push({ code: 'temp_value_v2', value: t });
    }
    if (colorHsv) {
      const hsvVal = typeof colorHsv === 'string' ? colorHsv : JSON.stringify({
        h: Math.round(colorHsv.h || 0),
        s: Math.round(colorHsv.s != null ? colorHsv.s : 1000),
        v: Math.round(colorHsv.v != null ? colorHsv.v : 1000),
      });
      commands.push({ code: 'colour_data_v2', value: hsvVal });
      if (!mode) commands.push({ code: 'work_mode', value: 'colour' });
    }

    if (commands.length === 0) return { success: true };
    const results = await Promise.allSettled(ids.map(id => this.sendCommand(id, commands)));
    return { success: true, results };
  }

  /**
   * Synchronize sauna RGB lights (Kattovalo 2 & 3) with sauna heating progression (Sauna Glow / Kiuashehku)
   */
  async updateSaunaGlow(saunaTemp, isSaunaOn) {
    try {
      const settings = db.getNotificationSettings();
      if (settings.sauna_glow_enabled === 'false') return;

      // Specifically target sauna ceiling lights: Kattovalo 2 & 3
      const isSaunaLight = (d) => {
        const name = (d.name || '').toLowerCase();
        return (
          name.includes('kattovalo 2') ||
          name.includes('kattovalo 3') ||
          name.includes('kattovalo2') ||
          name.includes('kattovalo3') ||
          name.includes('saunavalo') ||
          name.includes('sauna')
        );
      };

      let saunaLights = this.devices.filter(d =>
        (d.category === 'dj' || d.type === 'light') && isSaunaLight(d)
      );

      // Fallback if named identically: take device IDs bf13f2d77b1ba3f1cfhv4h and bf40483433d60b29d5xfe5
      if (saunaLights.length === 0) {
        saunaLights = this.devices.filter(d =>
          d.id === 'bf13f2d77b1ba3f1cfhv4h' || d.id === 'bf40483433d60b29d5xfe5'
        );
      }

      if (saunaLights.length === 0) return;

      const currentTemp = saunaTemp != null ? saunaTemp : (this.saunaState.temperature || 20);

      if (isSaunaOn) {
        // Soft, cozy fireplace amber & golden sauna ambient (shifted away from harsh red)
        let h = 32;  // Hue 0-360 (32° = warm golden amber flame)
        let s = 800; // Saturation 0-1000 (softer, natural warmth)
        let v = 450; // Brightness 0-1000

        if (currentTemp < 32) {
          // Warm amber fireplace ember (heating just started)
          h = 30;
          s = 820;
          v = 450;
        } else if (currentTemp < 45) {
          // Cozy warm golden flame
          const ratio = (currentTemp - 32) / (45 - 32);
          h = Math.round(30 + ratio * 8);   // 30 -> 38 (amber to warm gold)
          s = Math.round(820 - ratio * 100); // 820 -> 720
          v = Math.round(450 + ratio * 250); // 450 -> 700
        } else if (currentTemp < 60) {
          // Golden sauna warmth
          const ratio = (currentTemp - 45) / (60 - 45);
          h = Math.round(38 + ratio * 8);   // 38 -> 46 (warm gold to golden honey)
          s = Math.round(720 - ratio * 140); // 720 -> 580
          v = Math.round(700 + ratio * 200); // 700 -> 900
        } else {
          // Ready! Warm soft golden ambient glow
          h = 48;
          s = 520;
          v = 950;
        }

        const glowKey = `${h}_${s}_${v}`;
        if (this.lastGlowKey === glowKey && this.lastGlowOn === true) {
          return;
        }
        this.lastGlowKey = glowKey;
        this.lastGlowOn = true;

        console.log(`[TUYA:SAUNA_GLOW] 🔥 Saunan Kiuashehku (Valot 2 & 3): Lämpö ${currentTemp.toFixed(1)}°C -> Väri H:${h} S:${s} V:${v}`);

        const glowCmd = [
          { code: 'switch_led', value: true },
          { code: 'work_mode', value: 'colour' },
          { code: 'colour_data_v2', value: JSON.stringify({ h, s, v }) },
        ];

        for (const light of saunaLights) {
          this.sendCommand(light.id, glowCmd).catch(() => { });
        }
      } else {
        if (this.lastGlowOn) {
          this.lastGlowOn = false;
          this.lastGlowKey = null;
          console.log('[TUYA:SAUNA_GLOW] 🧖‍♂️ Sauna sammutettu: Palautetaan saunan valot lämpimään valkoiseen.');

          const restoreCmd = [
            { code: 'switch_led', value: true },
            { code: 'work_mode', value: 'white' },
            { code: 'bright_value_v2', value: 500 },
            { code: 'temp_value_v2', value: 1000 },
          ];

          for (const light of saunaLights) {
            this.sendCommand(light.id, restoreCmd).catch(() => { });
          }
        }
      }
    } catch (err) {
      console.warn('[TUYA:SAUNA_GLOW] Error updating sauna glow:', err.message);
    }
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.safetyTimer) clearInterval(this.safetyTimer);
    if (this.localPollTimer) clearInterval(this.localPollTimer);
  }
}

const tuyaService = new TuyaService();
module.exports = tuyaService;
