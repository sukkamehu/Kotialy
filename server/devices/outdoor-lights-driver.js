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
 * Get current time in Finland (Europe/Helsinki) converted to minutes from midnight
 */
function getHelsinkiMinutes(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Helsinki',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
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
    this.lastAppliedState1 = null;
    this.lastAppliedState2 = null;
    this.lastAppliedReason = 'Alustetaan...';
    this.lastEvaluatedAt = 0;
    this.wsBroadcast = null;
  }

  setWsBroadcast(fn) {
    this.wsBroadcast = fn;
  }

  start() {
    log('Käynnistetään ulkovalojen astronominen hämäräohjaus (2 relettä)...');
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
      const deviceId1 = settings.device_id || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID || 'bf7a39a3a10e38a52engat';
      const deviceId2 = settings.device_id_2 || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID_2 || 'bfee1ec43ebb997b0c12ru';
      const now = new Date();
      const nowMs = now.getTime();

      const sunTimes = calculateSunTimes(now);
      const sunrise = sunTimes.sunrise ? sunTimes.sunrise.getTime() : null;
      const sunset = sunTimes.sunset ? sunTimes.sunset.getTime() : null;

      const duskOffsetMs = parseInt(settings.dusk_offset_minutes || '10', 10) * 60 * 1000;
      const dawnOffsetMs = parseInt(settings.dawn_offset_minutes || '15', 10) * 60 * 1000;

      // Desired ON window for today/tonight:
      // Turn ON at (sunset + duskOffsetMs)
      // Turn OFF in morning at (sunrise + dawnOffsetMs)
      const onTimeMs = sunset ? sunset + duskOffsetMs : null;
      const offTimeMs = sunrise ? sunrise + dawnOffsetMs : null;

      let autoTargetState = 'OFF';
      let autoReason = '';
      let isDark = false;
      let isNightOff = false;

      // ── 1. Automatic Astronomical & Night Setback Evaluation ───────────────
      if (settings.enabled === 'false') {
        autoReason = 'Automaattiohjaus kytketty pois päältä';
        autoTargetState = this.lastAppliedState || 'OFF';
      } else {
        // Determine if it is currently dark / twilight
        if (onTimeMs && offTimeMs) {
          if (nowMs >= onTimeMs || nowMs < offTimeMs) {
            isDark = true;
          }
        }

        // Check Night Off window (e.g. 23:30 - 05:30)
        if (settings.night_off_enabled === 'true' && isDark) {
          const [startH, startM] = (settings.night_off_start || '23:30').split(':').map(Number);
          const [endH, endM] = (settings.night_off_end || '05:30').split(':').map(Number);

          const curMinutes = getHelsinkiMinutes(now);
          const nightStartMin = startH * 60 + startM;
          const nightEndMin = endH * 60 + endM;

          if (nightStartMin > nightEndMin) {
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
          autoTargetState = 'OFF';
          autoReason = `🌙 Yösammutus aktiivinen (${settings.night_off_start || '23:30'}–${settings.night_off_end || '05:30'}) · Valot sammutettu säästösyistä`;
        } else if (isDark) {
          autoTargetState = 'ON';
          const sunriseFormatted = sunTimes.sunrise ? sunTimes.sunrise.toLocaleTimeString('fi-FI', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit' }) : '';
          const sunsetFormatted = sunTimes.sunset ? sunTimes.sunset.toLocaleTimeString('fi-FI', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit' }) : '';
          if (nowMs < offTimeMs) {
            autoReason = `💡 Aamun hämäräaika (Aurinko nousee klo ${sunriseFormatted}) · Astronominen ohjaus: Päällä`;
          } else {
            autoReason = `💡 Illan hämäräaika (Aurinko laski klo ${sunsetFormatted}) · Astronominen ohjaus: Päällä`;
          }
        } else {
          autoTargetState = 'OFF';
          const sunriseFormatted = sunTimes.sunrise ? sunTimes.sunrise.toLocaleTimeString('fi-FI', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit' }) : '';
          autoReason = `☀️ Päiväaika (Aurinko noussut klo ${sunriseFormatted}) · Valot sammutettu`;
        }
      }

      // ── 2. Check Global & Individual Overrides ──────────────────────────────
      const globalOverrideUntil = parseInt(settings.override_until || '0', 10);
      const globalOverrideState = settings.override_state;
      const isGlobalOverrideActive = globalOverrideUntil > nowMs && (globalOverrideState === 'ON' || globalOverrideState === 'OFF');

      const relay1OverrideUntil = parseInt(settings.override_relay1_until || '0', 10);
      const relay1OverrideState = settings.override_relay1_state;
      const isRelay1OverrideActive = relay1OverrideUntil > nowMs && (relay1OverrideState === 'ON' || relay1OverrideState === 'OFF');

      const relay2OverrideUntil = parseInt(settings.override_relay2_until || '0', 10);
      const relay2OverrideState = settings.override_relay2_state;
      const isRelay2OverrideActive = relay2OverrideUntil > nowMs && (relay2OverrideState === 'ON' || relay2OverrideState === 'OFF');

      // Determine Target for Relay 1
      let targetState1 = autoTargetState;
      let reason1 = autoReason;
      if (isRelay1OverrideActive) {
        targetState1 = relay1OverrideState;
        const minsLeft = Math.ceil((relay1OverrideUntil - nowMs) / 60000);
        reason1 = `Rele 1 manuaalinen ohitus: ${targetState1} (${minsLeft} min jäljellä)`;
      } else if (isGlobalOverrideActive) {
        targetState1 = globalOverrideState;
        const minsLeft = Math.ceil((globalOverrideUntil - nowMs) / 60000);
        reason1 = `Yleinen manuaalinen ohitus: ${targetState1} (${minsLeft} min jäljellä)`;
      }

      // Determine Target for Relay 2
      let targetState2 = autoTargetState;
      let reason2 = autoReason;
      if (isRelay2OverrideActive) {
        targetState2 = relay2OverrideState;
        const minsLeft = Math.ceil((relay2OverrideUntil - nowMs) / 60000);
        reason2 = `Rele 2 manuaalinen ohitus: ${targetState2} (${minsLeft} min jäljellä)`;
      } else if (isGlobalOverrideActive) {
        targetState2 = globalOverrideState;
        const minsLeft = Math.ceil((globalOverrideUntil - nowMs) / 60000);
        reason2 = `Yleinen manuaalinen ohitus: ${targetState2} (${minsLeft} min jäljellä)`;
      }

      // ── 3. Apply state changes to physical Tuya relays in parallel ────────
      const applyTasks = [];
      if (deviceId1 && this.lastAppliedState1 !== targetState1) {
        applyTasks.push((async () => {
          log(`Rele 1 tilamuutos (${deviceId1}): ${this.lastAppliedState1 || 'NULL'} -> ${targetState1} (${reason1})`);
          try {
            await tuyaService.setSwitchPower(deviceId1, targetState1 === 'ON');
            this.lastAppliedState1 = targetState1;
          } catch (err) {
            warn(`Tuya-kytkimen 1 ohjaus epäonnistui: ${err.message}`);
          }
        })());
      }

      if (deviceId2 && this.lastAppliedState2 !== targetState2) {
        applyTasks.push((async () => {
          log(`Rele 2 tilamuutos (${deviceId2}): ${this.lastAppliedState2 || 'NULL'} -> ${targetState2} (${reason2})`);
          try {
            await tuyaService.setSwitchPower(deviceId2, targetState2 === 'ON');
            this.lastAppliedState2 = targetState2;
          } catch (err) {
            warn(`Tuya-kytkimen 2 ohjaus epäonnistui: ${err.message}`);
          }
        })());
      }

      if (applyTasks.length > 0) {
        await Promise.allSettled(applyTasks);
      }

      this.lastAppliedState = targetState1;
      this.lastAppliedReason = reason1;

      // Update state in SQLite DB
      db.updateState('tuya/ulkovalot/state', targetState1);
      db.updateState('tuya/ulkovalot/switch', targetState1 === 'ON' ? '1' : '0');
      db.updateState('tuya/ulkovalot/reason', reason1);

      db.updateState('tuya/ulkovalot_1/state', targetState1 === 'ON' ? 'true' : 'false');
      db.updateState('tuya/ulkovalot_1/switch', targetState1 === 'ON' ? '1' : '0');
      db.updateState('tuya/ulkovalot_1/reason', reason1);

      db.updateState('tuya/ulkovalot_2/state', targetState2 === 'ON' ? 'true' : 'false');
      db.updateState('tuya/ulkovalot_2/switch', targetState2 === 'ON' ? '1' : '0');
      db.updateState('tuya/ulkovalot_2/reason', reason2);

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
   * @param {'ON'|'OFF'|'AUTO'} state
   * @param {number} durationMinutes
   * @param {'all'|'relay1'|'relay2'|string} target
   */
  async setOverride(state, durationMinutes = 120, target = 'all') {
    const settings = db.getOutdoorLightsSettings();
    const deviceId1 = settings.device_id || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID || 'bf7a39a3a10e38a52engat';
    const deviceId2 = settings.device_id_2 || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID_2 || 'bfee1ec43ebb997b0c12ru';

    const isClear = state === null || state === 'AUTO' || state === '';
    const val = state === 'ON' || state === true || state === 1 ? 'ON' : 'OFF';
    const duration = Math.max(5, parseInt(durationMinutes, 10) || 120);
    const untilMs = Date.now() + duration * 60 * 1000;

    const normTarget = String(target || 'all').toLowerCase();

    if (normTarget === 'relay1' || normTarget === '1' || normTarget === deviceId1.toLowerCase()) {
      if (isClear) {
        log('Palautetaan Rele 1 automaattiseen ohjaukseen...');
        db.updateOutdoorLightsSetting('override_relay1_state', '');
        db.updateOutdoorLightsSetting('override_relay1_until', '0');
      } else {
        log(`Asetetaan Rele 1 manuaalinen ohitus: ${val} (${duration} min)`);
        db.updateOutdoorLightsSetting('override_relay1_state', val);
        db.updateOutdoorLightsSetting('override_relay1_until', String(untilMs));
        try {
          if (deviceId1) await tuyaService.setSwitchPower(deviceId1, val === 'ON');
        } catch (e) {
          warn(`Tuya-ohjaus epäonnistui: ${e.message}`);
        }
      }
      this.lastAppliedState1 = null;
    } else if (normTarget === 'relay2' || normTarget === '2' || normTarget === deviceId2.toLowerCase()) {
      if (isClear) {
        log('Palautetaan Rele 2 automaattiseen ohjaukseen...');
        db.updateOutdoorLightsSetting('override_relay2_state', '');
        db.updateOutdoorLightsSetting('override_relay2_until', '0');
      } else {
        log(`Asetetaan Rele 2 manuaalinen ohitus: ${val} (${duration} min)`);
        db.updateOutdoorLightsSetting('override_relay2_state', val);
        db.updateOutdoorLightsSetting('override_relay2_until', String(untilMs));
        try {
          if (deviceId2) await tuyaService.setSwitchPower(deviceId2, val === 'ON');
        } catch (e) {
          warn(`Tuya-ohjaus epäonnistui: ${e.message}`);
        }
      }
      this.lastAppliedState2 = null;
    } else {
      // Global override for ALL relays
      if (isClear) {
        log('Palautetaan kaikki ulkovalot automaattiseen astronomiseen hämäräohjaukseen...');
        db.updateOutdoorLightsSetting('override_state', '');
        db.updateOutdoorLightsSetting('override_until', '0');
        db.updateOutdoorLightsSetting('override_relay1_state', '');
        db.updateOutdoorLightsSetting('override_relay1_until', '0');
        db.updateOutdoorLightsSetting('override_relay2_state', '');
        db.updateOutdoorLightsSetting('override_relay2_until', '0');
      } else {
        log(`Asetetaan kaikki ulkovalot manuaaliseen tilaan: ${val} (${duration} min)`);
        db.updateOutdoorLightsSetting('override_state', val);
        db.updateOutdoorLightsSetting('override_until', String(untilMs));
        db.updateOutdoorLightsSetting('override_relay1_state', '');
        db.updateOutdoorLightsSetting('override_relay1_until', '0');
        db.updateOutdoorLightsSetting('override_relay2_state', '');
        db.updateOutdoorLightsSetting('override_relay2_until', '0');
        const tasks = [];
        if (deviceId1) tasks.push(tuyaService.setSwitchPower(deviceId1, val === 'ON').catch(e => warn(`Tuya-ohjaus 1 epäonnistui: ${e.message}`)));
        if (deviceId2) tasks.push(tuyaService.setSwitchPower(deviceId2, val === 'ON').catch(e => warn(`Tuya-ohjaus 2 epäonnistui: ${e.message}`)));
        if (tasks.length > 0) await Promise.allSettled(tasks);
      }
      this.lastAppliedState1 = null;
      this.lastAppliedState2 = null;
    }

    // Trigger evaluate asynchronously in background so UI button responds instantly (<100ms)
    this.evaluate().catch(e => warn('Tausta-arviointivirhe:', e.message));
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
    this.lastAppliedState1 = null;
    this.lastAppliedState2 = null;
    await this.evaluate();
    return this.getStatus();
  }

  /**
   * Get full telemetry and status object
   */
  getStatus() {
    const settings = db.getOutdoorLightsSettings();
    const deviceId1 = settings.device_id || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID || 'bf7a39a3a10e38a52engat';
    const deviceId2 = settings.device_id_2 || process.env.TUYA_OUTDOOR_LIGHTS_DEVICE_ID_2 || 'bfee1ec43ebb997b0c12ru';
    const now = new Date();
    const nowMs = now.getTime();
    const sunTimes = calculateSunTimes(now);

    const globalOverrideUntil = parseInt(settings.override_until || '0', 10);
    const globalOverrideState = settings.override_state;
    const isGlobalOverrideActive = globalOverrideUntil > nowMs && (globalOverrideState === 'ON' || globalOverrideState === 'OFF');
    const globalMinutesRemaining = isGlobalOverrideActive ? Math.ceil((globalOverrideUntil - nowMs) / 60000) : 0;

    const relay1OverrideUntil = parseInt(settings.override_relay1_until || '0', 10);
    const relay1OverrideState = settings.override_relay1_state;
    const isRelay1OverrideActive = relay1OverrideUntil > nowMs && (relay1OverrideState === 'ON' || relay1OverrideState === 'OFF');
    const relay1MinutesRemaining = isRelay1OverrideActive ? Math.ceil((relay1OverrideUntil - nowMs) / 60000) : 0;

    const relay2OverrideUntil = parseInt(settings.override_relay2_until || '0', 10);
    const relay2OverrideState = settings.override_relay2_state;
    const isRelay2OverrideActive = relay2OverrideUntil > nowMs && (relay2OverrideState === 'ON' || relay2OverrideState === 'OFF');
    const relay2MinutesRemaining = isRelay2OverrideActive ? Math.ceil((relay2OverrideUntil - nowMs) / 60000) : 0;

    // Fetch live hardware telemetry from Tuya cache or DB for Relay 1
    const dev1 = tuyaService.devicesById?.get(deviceId1) || tuyaService.devices?.find(d => d.id === deviceId1 || (d.name && d.name.toLowerCase().includes('ulkovalot 1')));
    const rawPower = dev1?.properties?.power ?? (dev1?.raw_status?.cur_power != null ? Number(dev1.raw_status.cur_power) / 10 : (dev1?.raw_status?.power != null ? Number(dev1.raw_status.power) : (parseFloat(db.getState('tuya/ulkovalot/power')?.value || '0'))));
    const powerW = Number(Number(rawPower).toFixed(1));
    const rawVoltage = dev1?.properties?.voltage ?? (dev1?.raw_status?.cur_voltage != null ? Number(dev1.raw_status.cur_voltage) / 10 : (parseFloat(db.getState('tuya/ulkovalot/voltage')?.value || '230')));
    const voltageV = Number(Number(rawVoltage).toFixed(1));
    const rawCurrent = dev1?.properties?.current ?? (dev1?.raw_status?.cur_current != null ? Number(dev1.raw_status.cur_current) / 1000 : (parseFloat(db.getState('tuya/ulkovalot/current')?.value || '0')));
    const currentA = Number(Number(rawCurrent).toFixed(3));
    const energyKwh = dev1?.properties?.energy ?? (dev1?.raw_status?.add_ele != null ? Number(dev1.raw_status.add_ele) : (parseFloat(db.getState('tuya/ulkovalot/energy')?.value || '0')));
    const deviceTemp = dev1?.properties?.device_temp ?? dev1?.raw_status?.temp_value ?? (parseFloat(db.getState('tuya/ulkovalot/device_temp')?.value || '0') || null);

    // Fetch Relay 2 status
    const dev2 = tuyaService.devicesById?.get(deviceId2) || tuyaService.devices?.find(d => d.id === deviceId2 || (d.name && d.name.toLowerCase().includes('ulkovalot 2')));

    const state1 = this.lastAppliedState1 || (dev1?.properties?.state ? 'ON' : 'OFF');
    const state2 = this.lastAppliedState2 || (dev2?.properties?.state ? 'ON' : 'OFF');

    const relays = [
      {
        id: 'relay_1',
        relayNum: 1,
        name: dev1?.name || 'Ulkovalot 1',
        label: 'Pihapiiri & Autotalli',
        state: state1,
        isOn: state1 === 'ON',
        online: dev1?.online ?? true,
        telemetry: {
          power_w: powerW,
          voltage_v: voltageV,
          current_a: currentA,
          energy_kwh: energyKwh,
          device_temp: deviceTemp,
        },
        isOverrideActive: isRelay1OverrideActive || isGlobalOverrideActive,
        overrideState: isRelay1OverrideActive ? relay1OverrideState : (isGlobalOverrideActive ? globalOverrideState : null),
        overrideMinutesRemaining: isRelay1OverrideActive ? relay1MinutesRemaining : (isGlobalOverrideActive ? globalMinutesRemaining : 0),
      },
      {
        id: 'relay_2',
        relayNum: 2,
        name: dev2?.name || 'Ulkovalot 2',
        label: 'Toinen wifi-rele',
        state: state2,
        isOn: state2 === 'ON',
        online: dev2?.online ?? true,
        telemetry: null,
        isOverrideActive: isRelay2OverrideActive || isGlobalOverrideActive,
        overrideState: isRelay2OverrideActive ? relay2OverrideState : (isGlobalOverrideActive ? globalOverrideState : null),
        overrideMinutesRemaining: isRelay2OverrideActive ? relay2MinutesRemaining : (isGlobalOverrideActive ? globalMinutesRemaining : 0),
      },
    ];

    return {
      state: state1,
      isOn: state1 === 'ON',
      reason: this.lastAppliedReason,
      enabled: settings.enabled === 'true',
      deviceId: 'relay_1',
      deviceId2: 'relay_2',
      deviceName: dev1?.name || 'WiFi Switch (Ulkovalot 1)',
      deviceOnline: dev1?.online ?? true,
      relays,
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
      isOverrideActive: isGlobalOverrideActive,
      overrideState: isGlobalOverrideActive ? globalOverrideState : null,
      overrideMinutesRemaining: globalMinutesRemaining,
      lastEvaluatedAt: this.lastEvaluatedAt,
    };
  }
}

module.exports = new OutdoorLightsDriver();
