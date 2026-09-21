/**
 * Tapo P115 Smart Plugs Service
 * Manages local communication (KLAP/IP) and MQTT bridging for TP-Link Tapo smart plugs with power monitoring
 */

const { loginDeviceByIp } = require('tp-link-tapo-connect');
const db = require('../db');

function log(...args) {
  console.log('[TAPO:SERVICE]', ...args);
}

function warn(...args) {
  console.warn('[TAPO:SERVICE]', ...args);
}

class TapoService {
  constructor() {
    this.pollIntervalMs = 15000;
    this.pollTimer = null;
    this.wsBroadcast = null;
    this.mqttClient = null;
    this.deviceSessions = new Map(); // id -> { client, lastSuccessAt }
    this.isPolling = false;
  }

  setWsBroadcast(fn) {
    this.wsBroadcast = fn;
  }

  setMqttClient(client) {
    this.mqttClient = client;
  }

  start() {
    log('Starting Tapo Smart Plugs Service...');
    // Initial poll
    this.pollAll();

    // Schedule regular polling
    this.pollTimer = setInterval(() => {
      this.pollAll();
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getCredentials() {
    const email = process.env.TAPO_USERNAME || process.env.TAPO_EMAIL || 'juusos93@gmail.com';
    const password = process.env.TAPO_PASSWORD || process.env.TAPO_PASS || '';
    return { email, password };
  }

  /**
   * Connect or get cached connection to a Tapo device
   */
  async getDeviceClient(id, ip) {
    const { email, password } = this.getCredentials();
    if (!password) {
      return null;
    }

    const cached = this.deviceSessions.get(id);
    if (cached && cached.client && Date.now() - cached.lastSuccessAt < 10 * 60 * 1000) {
      return cached.client;
    }

    const candidates = [email, 'admin', 'juuso'].filter(Boolean);
    let lastErr = null;

    for (const user of candidates) {
      try {
        const client = await loginDeviceByIp(user, password, ip);
        this.deviceSessions.set(id, { client, username: user, lastSuccessAt: Date.now() });
        return client;
      } catch (err) {
        lastErr = err;
      }
    }

    this.deviceSessions.delete(id);
    throw lastErr || new Error('Connection failed');
  }

  /**
   * Poll all configured Tapo devices
   */
  async pollAll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const devices = db.getTapoDevices();
      let totalPowerW = 0;
      let totalTodayKwh = 0;

      for (const dev of devices) {
        if (!dev.ip) continue;
        const polled = await this.pollDevice(dev);
        if (polled) {
          totalPowerW += polled.powerW || 0;
          totalTodayKwh += polled.todayKwh || 0;
        } else {
          totalPowerW += dev.power_w || 0;
          totalTodayKwh += dev.today_energy_kwh || 0;
        }
      }

      // Record aggregated telemetry into sensor_state and sensor_history
      db.updateState('tapo/total_power', Math.round(totalPowerW * 10) / 10);
      db.updateState('tapo/total_today_energy', Math.round(totalTodayKwh * 100) / 100);
      db.maybeAppendHistory('tapo/total_power', Math.round(totalPowerW * 10) / 10, 60000);
      db.maybeAppendHistory('tapo/total_today_energy', Math.round(totalTodayKwh * 100) / 100, 60000);

      // Also broadcast total if wsBroadcast available
      if (this.wsBroadcast) {
        this.wsBroadcast({
          type: 'tapo_totals',
          totalPowerW: Math.round(totalPowerW * 10) / 10,
          totalTodayKwh: Math.round(totalTodayKwh * 100) / 100,
          ts: Date.now(),
        });
      }
    } catch (err) {
      warn('Error in pollAll:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Poll single device for state & energy
   */
  async pollDevice(device) {
    const { email, password } = this.getCredentials();
    const now = Date.now();

    if (!password) {
      return null;
    }

    try {
      const client = await this.getDeviceClient(device.id, device.ip);
      if (!client) return null;

      let info = null;
      let energy = null;

      try {
        info = await client.getDeviceInfo();
      } catch (e) {
        // Retry without cache
        this.deviceSessions.delete(device.id);
        const retryClient = await this.getDeviceClient(device.id, device.ip);
        if (retryClient) {
          info = await retryClient.getDeviceInfo();
        }
      }

      try {
        if (client) {
          energy = await client.getEnergyUsage();
        }
      } catch (e) {
        // Some models or firmware might fail or return null
      }

      const state = info?.device_on ? 'ON' : (info ? 'OFF' : device.state);
      // current_power is in milliwatts (mW) -> W
      const powerW = energy?.current_power != null ? Math.round((energy.current_power / 1000) * 10) / 10 : (device.power_w || 0);
      // today_energy is in watt-hours (Wh) -> kWh
      const todayKwh = energy?.today_energy != null ? Math.round((energy.today_energy / 1000) * 100) / 100 : (device.today_energy_kwh || 0);
      const monthKwh = energy?.month_energy != null ? Math.round((energy.month_energy / 1000) * 100) / 100 : 0;

      // Update in DB table tapo_devices
      db.updateTapoDeviceTelemetry(device.id, {
        state,
        power_w: powerW,
        today_energy_kwh: todayKwh,
        total_energy_kwh: monthKwh || device.total_energy_kwh || 0,
        voltage_v: energy?.voltage ? energy.voltage / 1000 : null,
        current_a: energy?.current ? energy.current / 1000 : null,
        last_seen: now,
      });

      // Notify driver for active running cycle protection
      try {
        const tapoDriver = require('./tapo-driver');
        if (tapoDriver && typeof tapoDriver.recordPower === 'function') {
          tapoDriver.recordPower(device.id, powerW);
        }
      } catch {
        // ignore circular require if any
      }

      // Update in sensor_state & sensor_history for system-wide trend plotting
      db.updateState(`tapo/${device.id}/state`, state);
      db.updateState(`tapo/${device.id}/power`, powerW);
      db.updateState(`tapo/${device.id}/energy`, todayKwh);
      db.maybeAppendHistory(`tapo/${device.id}/power`, powerW, 60000);
      db.maybeAppendHistory(`tapo/${device.id}/energy`, todayKwh, 60000);

      // Broadcast update
      if (this.wsBroadcast) {
        this.wsBroadcast({
          type: 'tapo_update',
          deviceId: device.id,
          state,
          powerW,
          todayKwh,
          ts: now,
        });
      }

      return { state, powerW, todayKwh };
    } catch (err) {
      // Log connection failure quietly
      return null;
    }
  }

  /**
   * Set device power state (ON / OFF)
   */
  async setDeviceState(id, targetState, reason = 'Käyttäjän ohjaus') {
    const val = targetState === 'ON' || targetState === 1 || targetState === true ? 'ON' : 'OFF';
    const dev = db.getTapoDevice(id);
    if (!dev) {
      throw new Error(`Tapo device not found: ${id}`);
    }

    log(`Setting device ${id} (${dev.name}) -> ${val} (Reason: ${reason})`);

    // 1. Try local KLAP connection
    let success = false;
    try {
      const client = await this.getDeviceClient(id, dev.ip);
      if (client) {
        if (val === 'ON') {
          await client.turnOn();
        } else {
          await client.turnOff();
        }
        success = true;
      }
    } catch (err) {
      warn(`Direct KLAP control failed for ${id} (${dev.ip}): ${err.message}`);
    }

    // 2. Also publish to MQTT if MQTT broker is available
    if (this.mqttClient && typeof this.mqttClient.publish === 'function') {
      try {
        await this.mqttClient.publish(`cmnd/tapo/${id}/POWER`, val);
        await this.mqttClient.publish(`tapo/${id}/cmnd/POWER`, val);
        await this.mqttClient.publish(`tapo/${id}/set`, JSON.stringify({ state: val }));
        success = true;
      } catch (err) {
        warn(`MQTT publish failed for Tapo ${id}: ${err.message}`);
      }
    }

    // 3. Update DB state
    db.updateTapoDeviceTelemetry(id, {
      state: val,
      last_action_reason: reason,
      last_seen: Date.now(),
    });

    // 4. Broadcast update
    if (this.wsBroadcast) {
      this.wsBroadcast({
        type: 'tapo_update',
        deviceId: id,
        state: val,
        reason,
        ts: Date.now(),
      });
    }

    return { success, state: val, reason };
  }

  /**
   * Handle incoming MQTT message for Tapo plugs
   */
  handleMqttMessage(topic, rawValue) {
    try {
      const parts = topic.split('/');
      if (parts[0] !== 'tapo' && !topic.includes('tapo')) return;

      const deviceId = parts[1] || parts[0];
      const sub = parts[2] || parts[1];

      const dev = db.getTapoDevice(deviceId);
      if (!dev) return;

      if (rawValue.startsWith('{')) {
        const parsed = JSON.parse(rawValue);
        if (parsed.state || parsed.POWER) {
          const st = (parsed.state || parsed.POWER).toUpperCase();
          db.updateTapoDeviceTelemetry(deviceId, { state: st, last_seen: Date.now() });
        }
        if (parsed.power != null) {
          db.updateTapoDeviceTelemetry(deviceId, { power_w: parseFloat(parsed.power), last_seen: Date.now() });
        }
        if (parsed.energy != null) {
          db.updateTapoDeviceTelemetry(deviceId, { today_energy_kwh: parseFloat(parsed.energy), last_seen: Date.now() });
        }
      } else if (sub === 'POWER' || sub === 'state' || topic.endsWith('/POWER')) {
        const st = rawValue.toUpperCase() === 'ON' || rawValue === '1' ? 'ON' : 'OFF';
        db.updateTapoDeviceTelemetry(deviceId, { state: st, last_seen: Date.now() });
      } else if (sub === 'power') {
        const p = parseFloat(rawValue);
        if (!isNaN(p)) {
          db.updateTapoDeviceTelemetry(deviceId, { power_w: p, last_seen: Date.now() });
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Get all Tapo devices with enriched status
   */
  getAllStatuses() {
    const devices = db.getTapoDevices();
    const now = Date.now();
    return devices.map((d) => ({
      ...d,
      isOverrideActive: (d.override_until || 0) > now && d.override_state != null,
    }));
  }
}

module.exports = new TapoService();
