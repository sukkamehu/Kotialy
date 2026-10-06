/**
 * Outdoor Lights Driver (Astronomical Dusk / Dawn Twilight Automation)
 *
 * Manages Tuya WiFi smart switch for outdoor lighting with:
 *  - Accurate NOAA astronomical solar calculations for Sunrise, Sunset, Civil Twilight (Dusk & Dawn)
 *  - Configurable dusk & dawn offsets (e.g. turn ON 15 min before sunset)
 *  - Night blackout window for energy saving (e.g. turn OFF 23:30 - 05:30)
 *  - Manual timed overrides (1h, 2h, 4h, until morning, or permanent)
 *  - Real-time telemetry, state synchronization and WebSocket broadcasting
 */

const db = require('../db');
const tuyaService = require('./tuya-service');

// Default coordinates: Southern Finland (approx Espoo / Kirkkonummi / Helsinki)
const DEFAULT_LAT = 60.2;
const DEFAULT_LON = 24.8;

function log(...args) {
  console.log('[OUTDOOR_LIGHTS]', ...args);
}

function warn(...args) {
  console.warn('[OUTDOOR_LIGHTS]', ...args);
}

/**
 * Astronomical solar calculation (NOAA solar model)
 */
function calculateSunTimes(date = new Date(), lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  const jDate = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;

  const n = jDate - 2451545.0 + 0.0008;
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const MRad = M * rad;
  const C = 1.9148 * Math.sin(MRad) + 0.02 * Math.sin(2 * MRad) + 0.0003 * Math.sin(3 * MRad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const lambdaRad = lambda * rad;

  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(MRad) - 0.0069 * Math.sin(2 * lambdaRad);
  const sinDelta = Math.sin(lambdaRad) * Math.sin(23.44 * rad);
  const cosDelta = Math.cos(Math.asin(sinDelta));

  function getSunEvent(zenithDeg, isMorning) {
    const cosOmega = (Math.sin(-zenithDeg * rad) - Math.sin(lat * rad) * sinDelta) / (Math.cos(lat * rad) * cosDelta);
    if (cosOmega > 1) return null; // Polar night (always down)
    if (cosOmega < -1) return null; // Midnight sun (always up)

    const omega = Math.acos(cosOmega) * deg;
    const jTime = isMorning ? (jTransit - omega / 360) : (jTransit + omega / 360);
    const unixMs = (jTime - 2440587.5) * 86400000;
    return new Date(unixMs);
  }

  // 0.833° = standard solar horizon (refraction + sun disk)
  const sunrise = getSunEvent(0.833, true);
  const sunset = getSunEvent(0.833, false);
  // 6.0° = civil twilight (dusk & dawn)
  const dawn = getSunEvent(6.0, true);
  const dusk = getSunEvent(6.0, false);

  return { sunrise, sunset, dawn, dusk };
}

class OutdoorLightsDriver {
  constructor() {
    this.timer = null;
    this.lastAppliedState = null;
    this.lastAppliedReason = 'Alustetaan...';
    this.lastEvaluatedAt = 0;
    this.wsBroadcast = null;
  }

  setWsBroadcast(fn) {
    this.wsBroadcast = fn;
  }

  start() {
    log('Käynnistetään ulkovalojen astronominen hämäräohjaus...');
    // Initial evaluation after 3 seconds
    setTimeout(() => this.evaluate(), 3000);
    // Recurring evaluation every 30 seconds
    this.timer = setInterval(() => this.evaluate(), 30000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSunTimes(date = new Date()) {
    return calculateSunTimes(date);
  }

  /**
   * Main evaluation logic
   */
  async evaluate() {
    this.lastEvaluatedAt = Date.now();
    try {
      const settings = db.getOutdoorLightsSettings();
      const deviceId = settings.device_id || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID || 'bf7a39a3a10e38a52engat';
      const now = new Date();
      const nowMs = now.getTime();

      const sunTimes = calculateSunTimes(now);
      const sunrise = sunTimes.sunrise ? sunTimes.sunrise.getTime() : null;
      const sunset = sunTimes.sunset ? sunTimes.sunset.getTime() : null;

      const duskOffsetMs = parseInt(settings.dusk_offset_minutes || '-15', 10) * 60 * 1000;
      const dawnOffsetMs = parseInt(settings.dawn_offset_minutes || '15', 10) * 60 * 1000;

      // Desired ON window for today/tonight:
      // Turn ON at (sunset + duskOffsetMs)
      // Turn OFF in morning at (sunrise + dawnOffsetMs)
      const onTimeMs = sunset ? sunset + duskOffsetMs : null;
      const offTimeMs = sunrise ? sunrise + dawnOffsetMs : null;

      let targetState = 'OFF';
      let reason = '';
      let isDark = false;
      let isNightOff = false;

      // ── 1. Check Manual Override ──────────────────────────────────────────
      const overrideUntil = parseInt(settings.override_until || '0', 10);
      const overrideState = settings.override_state;
      const isOverrideActive = overrideUntil > nowMs && (overrideState === 'ON' || overrideState === 'OFF');

      if (isOverrideActive) {
        targetState = overrideState;
        const minsLeft = Math.ceil((overrideUntil - nowMs) / 60000);
        reason = `Käyttäjän manuaalinen ohitus: ${targetState} (${minsLeft} min jäljellä)`;
      }
      // ── 2. Automatic Astronomical & Night Setback Evaluation ───────────────
      else if (settings.enabled === 'false') {
        reason = 'Automaattiohjaus kytketty pois päältä';
        // When disabled, don't force state changes automatically
        targetState = this.lastAppliedState || 'OFF';
      } else {
        // Determine if it is currently dark / twilight
        if (onTimeMs && offTimeMs) {
          // If we have passed tonight's sunset OR we are before this morning's sunrise
          if (nowMs >= onTimeMs || nowMs < offTimeMs) {
            isDark = true;
          }
        }

        // Check Night Off window (e.g. 23:30 - 05:30)
        if (settings.night_off_enabled === 'true' && isDark) {
          const [startH, startM] = (settings.night_off_start || '23:30').split(':').map(Number);
          const [endH, endM] = (settings.night_off_end || '05:30').split(':').map(Number);

          const curMinutes = now.getHours() * 60 + now.getMinutes();
          const nightStartMin = startH * 60 + startM;
          const nightEndMin = endH * 60 + endM;

          if (nightStartMin > nightEndMin) {
            // Spans midnight (e.g. 23:30 -> 05:30)
            if (curMinutes >= nightStartMin || curMinutes < nightEndMin) {
              isNightOff = true;
            }
          } else {
            if (curMinutes >= nightStartMin && curMinutes < nightEndMin) {
              isNightOff = true;
            }
          }
        }

        if (isNightOff) {
          targetState = 'OFF';
          reason = `🌙 Yösammutus aktiivinen (${settings.night_off_start || '23:30'}–${settings.night_off_end || '05:30'}) · Valot sammutettu säästösyistä`;
        } else if (isDark) {
          targetState = 'ON';
          const sunsetFormatted = sunTimes.sunset ? sunTimes.sunset.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : '';
          reason = `💡 Hämäräaika (Aurinko laski klo ${sunsetFormatted}) · Astronominen ohjaus: Päällä`;
        } else {
          targetState = 'OFF';
          const sunriseFormatted = sunTimes.sunrise ? sunTimes.sunrise.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : '';
          reason = `☀️ Päiväaika (Aurinko noussut klo ${sunriseFormatted}) · Valot sammutettu`;
        }
      }

      // ── 3. Apply state changes to physical Tuya relay ─────────────────────
      const shouldApply = this.lastAppliedState !== targetState;
      if (shouldApply && deviceId) {
        log(`Tilamuutos: ${this.lastAppliedState || 'NULL'} -> ${targetState} (Syy: ${reason})`);
        try {
          await tuyaService.setSwitchPower(deviceId, targetState === 'ON');
          this.lastAppliedState = targetState;
          this.lastAppliedReason = reason;
        } catch (err) {
          warn(`Tuya-kytkimen ohjaus epäonnistui: ${err.message}`);
        }
      } else {
        this.lastAppliedReason = reason;
      }

      // Update state in SQLite DB
      db.updateState('tuya/ulkovalot/state', targetState);
      db.updateState('tuya/ulkovalot/switch', targetState === 'ON' ? '1' : '0');
      db.updateState('tuya/ulkovalot/reason', reason);

      // Broadcast to WebSocket clients
      if (this.wsBroadcast) {
        this.wsBroadcast({
          type: 'outdoor_lights_status',
          status: this.getStatus(),
          ts: nowMs,
        });
      }
    } catch (err) {
      warn('Arviointivirhe:', err.message);
    }
  }

  /**
   * Set manual timed override
   */
  async setOverride(state, durationMinutes = 120) {
    const settings = db.getOutdoorLightsSettings();
    const deviceId = settings.device_id || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID || 'bf7a39a3a10e38a52engat';

    if (state === null || state === 'AUTO' || state === '') {
      log('Palautetaan automaattinen astronominen hämäräohjaus...');
      db.updateOutdoorLightsSetting('override_state', '');
      db.updateOutdoorLightsSetting('override_until', '0');
      this.lastAppliedState = null; // force re-evaluation
      await this.evaluate();
      return this.getStatus();
    }

    const val = state === 'ON' || state === true || state === 1 ? 'ON' : 'OFF';
    const duration = Math.max(5, parseInt(durationMinutes, 10) || 120);
    const untilMs = Date.now() + duration * 60 * 1000;

    log(`Asetetaan manuaalinen ohitus: ${val} (${duration} min, asti ${new Date(untilMs).toLocaleTimeString('fi-FI')})`);

    db.updateOutdoorLightsSetting('override_state', val);
    db.updateOutdoorLightsSetting('override_until', String(untilMs));

    try {
      if (deviceId) {
        await tuyaService.setSwitchPower(deviceId, val === 'ON');
      }
    } catch (err) {
      warn(`Tuya-ohjaus epäonnistui ohituksessa: ${err.message}`);
    }

    this.lastAppliedState = val;
    this.lastAppliedReason = `Manuaalinen ohitus (${duration} min)`;

    await this.evaluate();
    return this.getStatus();
  }

  /**
   * Update configuration settings
   */
  async updateSettings(updates = {}) {
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        db.updateOutdoorLightsSetting(k, String(v));
      }
    }
    this.lastAppliedState = null; // force re-evaluate
    await this.evaluate();
    return this.getStatus();
  }

  /**
   * Get full telemetry and status object
   */
  getStatus() {
    const settings = db.getOutdoorLightsSettings();
    const deviceId = settings.device_id || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID || 'bf7a39a3a10e38a52engat';
    const now = new Date();
    const sunTimes = calculateSunTimes(now);

    const overrideUntil = parseInt(settings.override_until || '0', 10);
    const overrideState = settings.override_state;
    const isOverrideActive = overrideUntil > Date.now() && (overrideState === 'ON' || overrideState === 'OFF');
    const overrideMinutesRemaining = isOverrideActive ? Math.ceil((overrideUntil - Date.now()) / 60000) : 0;

    // Fetch live hardware telemetry from Tuya cache
    const dev = tuyaService.devicesById?.get(deviceId) || tuyaService.devices?.find(d => d.id === deviceId || (d.name && d.name.toLowerCase().includes('wifi switch / 1p-mtrg 2')));

    const rawPower = dev?.properties?.power ?? (dev?.raw_status?.cur_power != null ? Number(dev.raw_status.cur_power) / 10 : (dev?.raw_status?.power != null ? Number(dev.raw_status.power) : 0));
    const powerW = Number(Number(rawPower).toFixed(1));
    const rawVoltage = dev?.properties?.voltage ?? (dev?.raw_status?.cur_voltage != null ? Number(dev.raw_status.cur_voltage) / 10 : 230);
    const voltageV = Number(Number(rawVoltage).toFixed(1));
    const rawCurrent = dev?.properties?.current ?? (dev?.raw_status?.cur_current != null ? Number(dev.raw_status.cur_current) / 1000 : 0);
    const currentA = Number(Number(rawCurrent).toFixed(3));
    const energyKwh = dev?.properties?.energy ?? (dev?.raw_status?.add_ele != null ? Number(dev.raw_status.add_ele) : 0);
    const deviceTemp = dev?.properties?.device_temp ?? dev?.raw_status?.temp_value ?? null;

    return {
      state: this.lastAppliedState || 'OFF',
      isOn: this.lastAppliedState === 'ON',
      reason: this.lastAppliedReason,
      enabled: settings.enabled === 'true',
      deviceId,
      deviceName: dev?.name || 'WiFi Switch (Ulkovalot)',
      deviceOnline: dev?.online ?? true,
      telemetry: {
        power_w: powerW,
        voltage_v: voltageV,
        current_a: currentA,
        energy_kwh: energyKwh,
        device_temp: deviceTemp,
      },
      settings,
      sunTimes: {
        sunrise: sunTimes.sunrise ? sunTimes.sunrise.toISOString() : null,
        sunset: sunTimes.sunset ? sunTimes.sunset.toISOString() : null,
        dawn: sunTimes.dawn ? sunTimes.dawn.toISOString() : null,
        dusk: sunTimes.dusk ? sunTimes.dusk.toISOString() : null,
      },
      isOverrideActive,
      overrideState: isOverrideActive ? overrideState : null,
      overrideMinutesRemaining,
      lastEvaluatedAt: this.lastEvaluatedAt,
    };
  }
}

module.exports = new OutdoorLightsDriver();
