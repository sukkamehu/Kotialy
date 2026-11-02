/**
 * Domestic Hot Water (LKV) Circulation Pump Driver (Tuya WiFi Relay / Smart Switch)
 * Controls upstairs LKV circulation loop (Käyttöveden kierto yläkertaan).
 *
 * Background:
 *  - Previously ran 24/7 on continuous direct 230V mains supply ("Kokoaikainen kierto · 230V suorasyöttö").
 *  - 24/7 circulation causes large standby thermal losses from the 284 L DHW cylinder into building structures.
 *
 * Intelligent Features:
 *  1. VILP DHW Heating Interlock (Latausinterlock):
 *     - When Panasonic heat pump is heating DHW (3-way valve = 1), pauses circulation to prevent
 *       stirring up the stratified water layers and to allow the cylinder to reach target fast,
 *       returning heat pump quickly to heating the house floor buffer tank.
 *  2. Post-DHW Prime Flush (Jälkilataushuuhtelu):
 *     - Immediately when VILP DHW charging completes, runs a 3-minute flush to prime the upstairs
 *       piping with freshly produced hot water.
 *  3. Sauna Comfort Synchronization (Saunasynkronointi):
 *     - When the sauna breaker / switch is ON, residents are bathing; keeps circulation active for instant hot water.
 *  4. Heating Buffer Low Protection (Puskurivaraajan suojaus):
 *     - Pauses circulation if floor heating buffer drops below threshold (< 28 °C).
 *  5. Night Standby / Sleep (Yölepo klo 23:00–06:00):
 *     - Circulation is turned OFF when residents are asleep.
 *  6. Duty-Cycle Pulse Circulation during active hours (Syklinen kierto, 4 min ON / 20 min OFF):
 *     - Insulated hot water pipes retain heat for 20+ minutes.
 *     - Intermittent pulsing cuts standby thermal loss & power consumption by ~70%
 *       while upstairs taps deliver warm water immediately without running cold water to drain.
 *  7. DHW Cylinder Temperature Protection (Varaajan suojaus):
 *     - If DHW temperature drops below safety threshold (< 40 °C), pauses circulation.
 *  8. Nord Pool Spot Price Optimization (SETBACK-tunnit):
 *     - During peak electricity price hours, pauses circulation to conserve stored hot water.
 *  9. Legionella Disinfection & Anti-Seize Exercise:
 *     - Ensures hot water flushes through upstairs circulation during periodic sterilization cycles,
 *       plus runs a daily anti-seize exercise pulse (13:00–13:05).
 *  10. Quick Shower Boost (Pikaboost):
 *     - Instant 15 min, 30 min, 1h, 2h manual override from dashboard.
 */

const db = require('../db');
const tuyaService = require('./tuya-service');

function log(...args) {
  console.log('[APC:LKV_PUMP]', ...args);
}

function warn(...args) {
  console.warn('[APC:LKV_PUMP]', ...args);
}

function getHelsinkiTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hours = parseInt(get('hour'), 10);
  const minutes = parseInt(get('minute'), 10);
  const weekday = get('weekday'); // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';

  return { hours, minutes, weekday, isWeekend };
}

class UpstairsPumpDriver {
  constructor() {
    this.id = 'upstairs_pump';
    this.name = 'Käyttöveden kiertovesipumppu (LKV Yläkerta)';
    this.type = 'dhw_circulation_pump';
    this.deviceId = 'bfb6ed442015162bc97kca';
    this.lastState = null;
    this.lastAppliedDirective = null;
    this.lastAppliedAt = 0;
    this.currentReason = 'Alustetaan LKV-kiertovesipumpun ohjainta...';
    this.isAntiSeizeRunning = false;
    this.lastThreeWayValve = null;
    this.postDhwPrimeUntil = 0;
  }

  /**
   * Helper to send command to Tuya relay
   */
  async sendCommand(state) {
    const val = state === 'ON' || state === 1 || state === true;
    const targetStr = val ? 'ON' : 'OFF';
    try {
      const settings = db.getApcSettings();
      const devId = settings.dhw_pump_device_id || settings.upstairs_pump_device_id || this.deviceId;
      await tuyaService.setSwitchPower(devId, val);

      // Sync state immediately in SQLite DB
      db.updateState('tuya/kiertovesipumppu/state', val ? 'true' : 'false');
      db.updateState('tuya/kiertovesipumppu/switch', val ? '1' : '0');
      db.updateState('tuya/ylakerran_kiertovesipumppu/state', val ? 'true' : 'false');
      db.updateState('tuya/ylakerran_kiertovesipumppu/switch', val ? '1' : '0');
      db.updateState('tuya/lkv_kiertovesipumppu/state', val ? 'true' : 'false');
      db.updateState('tuya/lkv_kiertovesipumppu/switch', val ? '1' : '0');
      db.updateState('apc/upstairs_pump/state', targetStr);
      db.updateState('apc/lkv_pump/state', targetStr);
      this.lastState = targetStr;
      return true;
    } catch (err) {
      warn(`Command failed for LKV circulation pump = ${targetStr}:`, err.message);
      return false;
    }
  }

  /**
   * Evaluate and apply LKV circulation pump strategy during APC evaluation loop
   * @param {string} directive - BOOST | NORMAL | SETBACK | ECO | DHW_CYCLE
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot, threeWayValve }
   */
  async applyDirective(directive, context) {
    const { settings, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot } = context;
    const now = Date.now();

    // Read current hardware state from DB
    const fullState = db.getFullState();
    const currentStatRaw = fullState['tuya/kiertovesipumppu/state']?.value ??
                           fullState['tuya/lkv_kiertovesipumppu/state']?.value ??
                           fullState['tuya/ylakerran_kiertovesipumppu/state']?.value;
    const currentStat = (currentStatRaw === 'true' || currentStatRaw === '1' || currentStatRaw === 'ON' || this.lastState === 'ON') ? 'ON' : 'OFF';

    const mode = settings.dhw_pump_mode || settings.upstairs_pump_mode || 'auto'; // 'auto' | 'constant_on' | 'constant_off'
    const overrideUntil = settings.dhw_pump_override_until || settings.upstairs_pump_override_until || 0;
    const overrideState = settings.dhw_pump_override_state || settings.upstairs_pump_override_state || null;
    const isOverrideActive = overrideUntil > now && overrideState != null;

    const nightStart = settings.dhw_pump_night_start != null ? Number(settings.dhw_pump_night_start) : 23;
    const nightEnd = settings.dhw_pump_night_end != null ? Number(settings.dhw_pump_night_end) : 6;
    const cycleOnMin = settings.dhw_pump_cycle_on_minutes != null ? Math.max(1, Number(settings.dhw_pump_cycle_on_minutes)) : 4;
    const cycleOffMin = settings.dhw_pump_cycle_off_minutes != null ? Math.max(1, Number(settings.dhw_pump_cycle_off_minutes)) : 20;
    const minTankTemp = settings.dhw_pump_min_tank_temp != null ? Number(settings.dhw_pump_min_tank_temp) : 40.0;
    const antiSeizeEnabled = settings.dhw_pump_anti_seize_enabled !== false;
    const priceSetbackEnabled = settings.dhw_pump_price_setback_enabled !== false;
    const weekendContinuous = settings.dhw_pump_weekend_continuous !== false && settings.upstairs_pump_weekend_continuous !== false;

    // Advanced features configuration
    const dhwPauseEnabled = settings.dhw_pump_dhw_pause_enabled !== false && settings.upstairs_pump_dhw_pause_enabled !== false;
    const postDhwPrimeEnabled = settings.dhw_pump_post_dhw_prime_enabled !== false && settings.upstairs_pump_post_dhw_prime_enabled !== false;
    const saunaSyncEnabled = settings.dhw_pump_sauna_sync_enabled !== false && settings.upstairs_pump_sauna_sync_enabled !== false;
    const bufferProtectEnabled = settings.dhw_pump_buffer_protect_enabled !== false && settings.upstairs_pump_buffer_protect_enabled !== false;
    const bufferProtectTemp = settings.dhw_pump_buffer_protect_temp != null
      ? Number(settings.dhw_pump_buffer_protect_temp)
      : (settings.upstairs_pump_buffer_protect_temp != null ? Number(settings.upstairs_pump_buffer_protect_temp) : 28.0);

    // Read current DHW temperature
    const currentDhwTemp = dhwTemp != null
      ? dhwTemp
      : (fullState['main/DHW_Temp']?.value ? parseFloat(fullState['main/DHW_Temp'].value) : null);

    // Read current buffer tank temperature
    const currentBufferTemp = bufferTemp != null
      ? bufferTemp
      : (fullState['main/Buffer_Temp']?.value ? parseFloat(fullState['main/Buffer_Temp'].value) : null);

    // Read 3-way valve state (0 = Room / Floor heating, 1 = DHW domestic hot water)
    const rawValve = context.threeWayValve !== undefined
      ? context.threeWayValve
      : fullState['main/ThreeWay_Valve_State']?.value;
    const currentValve = rawValve !== undefined && rawValve !== null ? parseInt(rawValve, 10) : 0;
    const isDhwCharging = currentValve === 1;

    // Track 3-way valve transition for Post-DHW Prime flush
    if (this.lastThreeWayValve === 1 && currentValve === 0) {
      if (postDhwPrimeEnabled) {
        this.postDhwPrimeUntil = now + 3 * 60 * 1000; // 3 min flush
        log('VILP DHW charging completed: 3-minute post-DHW prime flush activated');
      }
    }
    this.lastThreeWayValve = currentValve;

    // Read Sauna breaker state
    const saunaSwitch = fullState['tuya/sauna/switch']?.value;
    const saunaState = fullState['tuya/sauna/state']?.value;
    const isSaunaActive = saunaSwitch === '1' || saunaSwitch === 'true' || saunaState === 'true' || saunaState === '1';

    // Read sterilization state
    const sterState = fullState['dhw/sterilization/state']?.value;
    const isSterilizationActive = sterState === 'BOOSTING' || sterState === 'HOLDING' || fullState['main/Sterilization_State']?.value === '1';

    let targetState = 'OFF';
    let reason = 'Alustetaan strategiaa...';
    let antiSeizeActive = false;

    // ── 1. Manual Override takes precedence (e.g. Shower Boost) ───────────────
    if (isOverrideActive) {
      targetState = overrideState;
      const minLeft = Math.ceil((overrideUntil - now) / 60000);
      reason = `Manuaalinen ohitus aktiivinen (${targetState === 'ON' ? 'Suihkuboost / Pakotettu PÄÄLLE' : 'Pakotettu POIS'} · jäljellä ~${minLeft} min)`;
    }
    // ── 2. Fixed Constant Modes ─────────────────────────────────────────────
    else if (mode === 'constant_on') {
      targetState = 'ON';
      reason = 'Kokoaikainen kierto · 230V suorasyöttö (Aina päällä)';
    } else if (mode === 'constant_off') {
      targetState = 'OFF';
      reason = 'Kierto pysäytetty (Aina pois päältä)';
    }
    // ── 3. Intelligent APC Automatic Mode ───────────────────────────────────
    else {
      const { hours, minutes, isWeekend } = getHelsinkiTime(new Date(now));

      // A. Anti-Seize Protection Check (Daily exercise pulse 13:00–13:05)
      const isDailyPulse = hours === 13 && minutes >= 0 && minutes < 5;

      // Check night hours (e.g. 23:00 to 06:00)
      const isNight = nightStart > nightEnd
        ? (hours >= nightStart || hours < nightEnd)
        : (hours >= nightStart && hours < nightEnd);

      if (antiSeizeEnabled && isDailyPulse) {
        targetState = 'ON';
        antiSeizeActive = true;
        reason = 'Jumiutumissuoja: Päivittäinen huuhteluajo klo 13:00–13:05 (5 min)';
      }
      // B. Legionella / Sterilization cycle active: run circulation to sanitize upstairs loop
      else if (isSterilizationActive) {
        targetState = 'ON';
        reason = 'Legionellatorjunta: LKV-kierto päällä yläkerran putkiston desinfioimiseksi (65 °C)';
      }
      // C. VILP DHW Heating Interlock
      // Pause circulation while VILP heats DHW cylinder so water layers stay calm and floor heating resumes faster
      else if (dhwPauseEnabled && isDhwCharging) {
        targetState = 'OFF';
        reason = 'VILP LKV-latausinterlock: Kierto tauolla varaajan kerrostuman säilyttämiseksi ja talon lämmityksen nopeuttamiseksi (3-tieventtiili = LKV)';
      }
      // D. Post-DHW Prime Flush
      // Once VILP finishes DHW heating, flush freshly produced hot water through upstairs piping for 3 minutes
      else if (postDhwPrimeEnabled && this.postDhwPrimeUntil > now) {
        targetState = 'ON';
        const primeSecLeft = Math.max(1, Math.ceil((this.postDhwPrimeUntil - now) / 1000));
        reason = `Jälkilataushuuhtelu: VILP LKV-lataus päättynyt, huuhdellaan uusi kuuma vesi yläkertaan (${primeSecLeft}s jäljellä)`;
      }
      // E. DHW Cylinder Temperature Safety Protection
      // If DHW tank is below min temperature (e.g. < 40 °C), pause circulation so tank can recover
      else if (currentDhwTemp != null && currentDhwTemp < minTankTemp) {
        targetState = 'OFF';
        reason = `Varaajan suojaus: Käyttövesi liian viileää (${currentDhwTemp.toFixed(1)} °C < ${minTankTemp.toFixed(1)} °C) · Kierto tauolla varaajan lataamiseksi`;
      }
      // F. Heating Buffer Tank Low Protection
      // If house floor heating buffer is depleted (< 28 °C), pause circulation to prioritize house comfort
      else if (bufferProtectEnabled && currentBufferTemp != null && currentBufferTemp < bufferProtectTemp) {
        targetState = 'OFF';
        reason = `Puskurin suojaus: Lämmitysvesi liian viileää (${currentBufferTemp.toFixed(1)} °C < ${bufferProtectTemp.toFixed(1)} °C) · Kierto tauolla lattialämmityksen elpymiseksi`;
      }
      // G. Sauna Comfort Synchronization
      // When sauna is powered on, residents are bathing; keep circulation active for hot water comfort
      else if (saunaSyncEnabled && isSaunaActive) {
        targetState = 'ON';
        reason = 'Saunasynkronointi: Kiukaan kytkin päällä · Jatkuva LKV-kierto saunojien mukavuuden varmistamiseksi';
      }
      // H. Night Sleep / Standby Mode (Yölepo)
      else if (isNight) {
        targetState = 'OFF';
        const startStr = String(nightStart).padStart(2, '0') + ':00';
        const endStr = String(nightEnd).padStart(2, '0') + ':00';
        reason = `Yölepo (${startStr}–${endStr}) · LKV-kierto pysäytetty lämpöhäviöiden estämiseksi`;
      }
      // I. Viikonloppupäivisin aina päällä (Weekend daytime continuous circulation)
      else if (isWeekend && weekendContinuous) {
        targetState = 'ON';
        reason = 'Viikonloppu: Jatkuva LKV-kierto päällä viikonloppupäivisin (Aina lämmintä vettä)';
      }
      // J. Peak Electricity Price Setback (Hintahuippu / SETBACK arkipäivisin)
      else if (directive === 'SETBACK' && priceSetbackEnabled) {
        targetState = 'OFF';
        reason = 'Hintapiikkisäästö (SETBACK): LKV-kierto tauolla kalliin pörssisähkön aikana';
      }
      // K. Weekday Daytime Active Comfort Windows with Intelligent Duty-Cycle Pulsing
      else {
        // Calculate deterministic duty-cycle phase based on current time
        const periodMs = (cycleOnMin + cycleOffMin) * 60 * 1000;
        const cycleOnMs = cycleOnMin * 60 * 1000;
        const phaseMs = now % periodMs;
        const isPhaseOn = phaseMs < cycleOnMs;
        const minLeft = isPhaseOn
          ? Math.max(1, Math.ceil((cycleOnMs - phaseMs) / 60000))
          : Math.max(1, Math.ceil((periodMs - phaseMs) / 60000));

        if (isPhaseOn) {
          targetState = 'ON';
          reason = `Mukavuusjakso (Arkipäivä): Syklinen kierto käynnissä (${minLeft} min jäljellä · jakso ${cycleOnMin} min ON / ${cycleOffMin} min OFF)`;
        } else {
          targetState = 'OFF';
          reason = `Mukavuusjakso (Arkipäivä): Syklitauko (${minLeft} min jäljellä · vesi lämmintä putkissa, säästetään varaajaa)`;
        }
      }
    }

    this.currentReason = reason;
    this.isAntiSeizeRunning = antiSeizeActive;
    this.lastAppliedDirective = directive;
    this.lastAppliedAt = now;

    db.updateState('apc/upstairs_pump/reason', reason);
    db.updateState('apc/lkv_pump/reason', reason);

    // Send command if state changed or hardware sync needed
    const needsCommand = currentStat !== targetState || this.lastState !== targetState;
    if (needsCommand) {
      log(`State transition: ${currentStat} -> ${targetState} (${reason})`);
      const ok = await this.sendCommand(targetState);
      if (ok) {
        db.insertApcLog({
          action: `LKV-kiertovesipumppu: ${targetState === 'ON' ? 'Käynnistetty (ON)' : 'Pysäytetty (OFF)'}`,
          reason,
          outdoor_temp: outdoorTemp,
          buffer_temp: bufferTemp,
          dhw_temp: currentDhwTemp,
          directive,
          details: {
            mode,
            targetState,
            currentDhwTemp,
            currentBufferTemp,
            isDhwCharging,
            isSaunaActive,
            override: isOverrideActive,
            antiSeize: antiSeizeActive,
          },
        });
      }
    }

    return {
      driver: 'upstairs_pump',
      name: this.name,
      type: this.type,
      state: targetState,
      currentState: currentStat,
      mode,
      reason,
      dhwTemp: currentDhwTemp,
      bufferTemp: currentBufferTemp,
      isDhwCharging,
      isSaunaActive,
      isOverrideActive,
      antiSeizeActive,
    };
  }

  /**
   * Set manual override (e.g. Shower Boost) with duration in hours (e.g. 0.25 = 15min, 0.5 = 30min, 1h, 2h)
   */
  async setManualOverride(state, durationHours = 0.5) {
    const val = state === 'ON' || state === 1 || state === true ? 'ON' : 'OFF';
    const hours = parseFloat(durationHours) || 0.5;
    const until = hours > 0 ? Date.now() + Math.round(hours * 3600 * 1000) : Date.now() + 86400000 * 365;

    db.updateApcSetting('dhw_pump_override_state', val);
    db.updateApcSetting('dhw_pump_override_until', until);
    db.updateApcSetting('upstairs_pump_override_state', val);
    db.updateApcSetting('upstairs_pump_override_until', until);

    log(`Manual override set: ${val} until ${new Date(until).toISOString()} (${hours > 0 ? `${Math.round(hours * 60)} min` : 'pysyvä'})`);
    await this.sendCommand(val);
    return this.getStatus();
  }

  /**
   * Cancel manual override and return to auto
   */
  async cancelManualOverride() {
    log('Manual override cancelled — returning to auto strategy');
    db.updateApcSetting('dhw_pump_override_state', null);
    db.updateApcSetting('dhw_pump_override_until', 0);
    db.updateApcSetting('upstairs_pump_override_state', null);
    db.updateApcSetting('upstairs_pump_override_until', 0);
    this.lastState = null;
    return this.getStatus();
  }

  /**
   * Set operating mode
   */
  async setMode(mode) {
    const validModes = ['auto', 'constant_on', 'constant_off'];
    const targetMode = validModes.includes(mode) ? mode : 'auto';
    log(`Mode updated: ${targetMode}`);
    db.updateApcSetting('dhw_pump_mode', targetMode);
    db.updateApcSetting('upstairs_pump_mode', targetMode);
    return this.getStatus();
  }

  /**
   * Get full telemetry and status object
   */
  getStatus() {
    const settings = db.getApcSettings();
    const fullState = db.getFullState();
    const now = Date.now();

    const currentStatRaw = fullState['tuya/kiertovesipumppu/state']?.value ??
                           fullState['tuya/lkv_kiertovesipumppu/state']?.value ??
                           fullState['tuya/ylakerran_kiertovesipumppu/state']?.value;
    const currentStat = (currentStatRaw === 'true' || currentStatRaw === '1' || currentStatRaw === 'ON' || this.lastState === 'ON') ? 'ON' : 'OFF';

    const overrideUntil = settings.dhw_pump_override_until || settings.upstairs_pump_override_until || 0;
    const overrideState = settings.dhw_pump_override_state || settings.upstairs_pump_override_state || null;
    const isOverrideActive = overrideUntil > now && overrideState != null;

    const currentDhwTemp = fullState['main/DHW_Temp']?.value ? parseFloat(fullState['main/DHW_Temp'].value) : null;
    const currentBufferTemp = fullState['main/Buffer_Temp']?.value ? parseFloat(fullState['main/Buffer_Temp'].value) : null;
    const rawValve = fullState['main/ThreeWay_Valve_State']?.value;
    const currentValve = rawValve !== undefined && rawValve !== null ? parseInt(rawValve, 10) : 0;
    const isDhwCharging = currentValve === 1;

    const saunaSwitch = fullState['tuya/sauna/switch']?.value;
    const saunaState = fullState['tuya/sauna/state']?.value;
    const isSaunaActive = saunaSwitch === '1' || saunaSwitch === 'true' || saunaState === 'true' || saunaState === '1';

    const dev = tuyaService.devicesById?.get(this.deviceId) || tuyaService.devices?.find(d => d.id === this.deviceId || (d.name && d.name.toLowerCase().includes('kiertovesipumppu')));

    const cycleOnMin = settings.dhw_pump_cycle_on_minutes != null ? Number(settings.dhw_pump_cycle_on_minutes) : 4;
    const cycleOffMin = settings.dhw_pump_cycle_off_minutes != null ? Number(settings.dhw_pump_cycle_off_minutes) : 20;
    const nightStart = settings.dhw_pump_night_start != null ? Number(settings.dhw_pump_night_start) : 23;
    const nightEnd = settings.dhw_pump_night_end != null ? Number(settings.dhw_pump_night_end) : 6;
    const minTankTemp = settings.dhw_pump_min_tank_temp != null ? Number(settings.dhw_pump_min_tank_temp) : 40.0;
    const bufferProtectTemp = settings.dhw_pump_buffer_protect_temp != null
      ? Number(settings.dhw_pump_buffer_protect_temp)
      : (settings.upstairs_pump_buffer_protect_temp != null ? Number(settings.upstairs_pump_buffer_protect_temp) : 28.0);

    const dhwPauseEnabled = settings.dhw_pump_dhw_pause_enabled !== false && settings.upstairs_pump_dhw_pause_enabled !== false;
    const postDhwPrimeEnabled = settings.dhw_pump_post_dhw_prime_enabled !== false && settings.upstairs_pump_post_dhw_prime_enabled !== false;
    const saunaSyncEnabled = settings.dhw_pump_sauna_sync_enabled !== false && settings.upstairs_pump_sauna_sync_enabled !== false;
    const bufferProtectEnabled = settings.dhw_pump_buffer_protect_enabled !== false && settings.upstairs_pump_buffer_protect_enabled !== false;

    const { hours, isWeekend } = getHelsinkiTime(new Date(now));
    const isNight = nightStart > nightEnd
      ? (hours >= nightStart || hours < nightEnd)
      : (hours >= nightStart && hours < nightEnd);
    const weekendContinuous = settings.dhw_pump_weekend_continuous !== false && settings.upstairs_pump_weekend_continuous !== false;

    // Remaining minutes in current duty cycle or override
    let cycleMinutesRemaining = 0;
    if (isOverrideActive) {
      cycleMinutesRemaining = Math.max(0, Math.ceil((overrideUntil - now) / 60000));
    } else if (isWeekend && weekendContinuous && !isNight) {
      cycleMinutesRemaining = 0; // Continuous ON during weekend daytime
    } else {
      const periodMs = (cycleOnMin + cycleOffMin) * 60 * 1000;
      const cycleOnMs = cycleOnMin * 60 * 1000;
      const phaseMs = now % periodMs;
      const isPhaseOn = phaseMs < cycleOnMs;
      cycleMinutesRemaining = isPhaseOn
        ? Math.max(1, Math.ceil((cycleOnMs - phaseMs) / 60000))
        : Math.max(1, Math.ceil((periodMs - phaseMs) / 60000));
    }

    return {
      driver: 'upstairs_pump',
      name: 'Käyttöveden kiertovesipumppu (LKV Yläkerta)',
      type: 'dhw_circulation_pump',
      connected: dev?.online ?? true,
      currentState: currentStat,
      isOn: currentStat === 'ON',
      mode: settings.dhw_pump_mode || settings.upstairs_pump_mode || 'auto',
      overrideActive: isOverrideActive,
      overrideUntil,
      overrideState,
      overrideMinutesRemaining: isOverrideActive ? Math.max(0, Math.ceil((overrideUntil - now) / 60000)) : 0,
      cycleMinutesRemaining,
      reason: this.currentReason,
      antiSeizeActive: this.isAntiSeizeRunning,
      lastAppliedAt: this.lastAppliedAt,
      dhwTemp: currentDhwTemp,
      bufferTemp: currentBufferTemp,
      minTankTemp,
      nightStart,
      nightEnd,
      cycleOnMinutes: cycleOnMin,
      cycleOffMinutes: cycleOffMin,
      antiSeizeEnabled: settings.dhw_pump_anti_seize_enabled !== false,
      priceSetbackEnabled: settings.dhw_pump_price_setback_enabled !== false,
      weekendContinuous,
      isWeekend,
      isDhwCharging,
      isSaunaActive,
      dhwPauseEnabled,
      postDhwPrimeEnabled,
      saunaSyncEnabled,
      bufferProtectEnabled,
      bufferProtectTemp,
      postDhwPrimeActive: this.postDhwPrimeUntil > now,
      postDhwPrimeSecondsRemaining: this.postDhwPrimeUntil > now ? Math.max(0, Math.ceil((this.postDhwPrimeUntil - now) / 1000)) : 0,
      deviceId: settings.dhw_pump_device_id || settings.upstairs_pump_device_id || this.deviceId,
    };
  }
}

module.exports = new UpstairsPumpDriver();
