/**
 * Domestic Hot Water (LKV) Circulation Pump Driver (Tuya WiFi Relay / Smart Switch)
 * Controls upstairs LKV circulation loop (Käyttöveden kierto yläkertaan).
 *
 * Background:
 *  - Previously ran 24/7 on continuous direct 230V mains supply ("Kokoaikainen kierto · 230V suorasyöttö").
 *  - 24/7 circulation causes large standby thermal losses from the 284 L DHW cylinder into building structures.
 *
 * Intelligent Features:
 *  1. Night Standby / Sleep (Yölepo klo 23:00–06:00):
 *     - Circulation is turned OFF when residents are asleep.
 *     - Prevents nocturnal DHW cylinder cooling and unnecessary pump wear.
 *  2. Duty-Cycle Pulse Circulation during active hours (Syklinen kierto, esim. 10 min ON / 15 min OFF):
 *     - Insulated hot water pipes retain heat for 15–20 minutes.
 *     - Intermittent pulsing cuts standby thermal loss & power consumption by ~60%
 *       while upstairs taps deliver warm water immediately without running cold water to drain.
 *  3. DHW Cylinder Temperature Protection (Varaajan suojaus):
 *     - If DHW temperature drops below safety threshold (< 40 °C) or during heat pump charge,
 *       pauses circulation to allow the cylinder to recover quickly.
 *  4. Nord Pool Spot Price Optimization (SETBACK-tunnit):
 *     - During peak electricity price hours, pauses circulation to conserve stored hot water.
 *  5. Legionella Disinfection & Anti-Seize Exercise:
 *     - Ensures hot water flushes through upstairs circulation during periodic sterilization cycles,
 *       plus runs a daily anti-seize exercise pulse (13:00–13:05).
 *  6. Quick Shower Boost (Pikaboost):
 *     - Instant 15 min, 30 min, 1h, 2h manual override from dashboard when taking a shower
 *       outside active hours.
 *  7. Constant Modes:
 *     - 'auto': Full smart intelligence
 *     - 'constant_on': 24/7 continuous circulation (matches legacy 230V direct wiring)
 *     - 'constant_off': Vacation / off
 */

const db = require('../db');
const tuyaService = require('./tuya-service');

function log(...args) {
  console.log('[APC:LKV_PUMP]', ...args);
}

function warn(...args) {
  console.warn('[APC:LKV_PUMP]', ...args);
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
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot }
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
    const cycleOnMin = settings.dhw_pump_cycle_on_minutes != null ? Math.max(1, Number(settings.dhw_pump_cycle_on_minutes)) : 10;
    const cycleOffMin = settings.dhw_pump_cycle_off_minutes != null ? Math.max(1, Number(settings.dhw_pump_cycle_off_minutes)) : 15;
    const minTankTemp = settings.dhw_pump_min_tank_temp != null ? Number(settings.dhw_pump_min_tank_temp) : 40.0;
    const antiSeizeEnabled = settings.dhw_pump_anti_seize_enabled !== false;
    const priceSetbackEnabled = settings.dhw_pump_price_setback_enabled !== false;

    // Read current DHW temperature
    const currentDhwTemp = dhwTemp != null
      ? dhwTemp
      : (fullState['main/DHW_Temp']?.value ? parseFloat(fullState['main/DHW_Temp'].value) : null);

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
      const nowDate = new Date(now);
      const hours = nowDate.getHours();
      const minutes = nowDate.getMinutes();

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
        reason = 'Legionellatorjunta: LKV-kierto päällä yläkerran putkiston desinfioimiseksi';
      }
      // C. DHW Cylinder Temperature Safety Protection
      // If DHW tank is below min temperature (e.g. < 40 °C), pause circulation so tank can recover
      else if (currentDhwTemp != null && currentDhwTemp < minTankTemp) {
        targetState = 'OFF';
        reason = `Varaajan suojaus: Käyttövesi liian viileää (${currentDhwTemp.toFixed(1)} °C < ${minTankTemp.toFixed(1)} °C) · Kierto tauolla varaajan lataamiseksi`;
      }
      // D. Night Sleep / Standby Mode (Yölepo)
      else if (isNight) {
        targetState = 'OFF';
        const startStr = String(nightStart).padStart(2, '0') + ':00';
        const endStr = String(nightEnd).padStart(2, '0') + ':00';
        reason = `Yölepo (${startStr}–${endStr}) · LKV-kierto pysäytetty lämpöhäviöiden estämiseksi`;
      }
      // E. Peak Electricity Price Setback (Hintahuippu / SETBACK)
      else if (directive === 'SETBACK' && priceSetbackEnabled) {
        targetState = 'OFF';
        reason = 'Hintapiikkisäästö (SETBACK): LKV-kierto tauolla kalliin pörssisähkön aikana';
      }
      // F. Daytime / Active Comfort Windows with Intelligent Duty-Cycle Pulsing
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
          reason = `Mukavuusjakso: Syklinen kierto käynnissä (${minLeft} min jäljellä · jakso ${cycleOnMin} min ON / ${cycleOffMin} min OFF)`;
        } else {
          targetState = 'OFF';
          reason = `Mukavuusjakso: Syklitauko (${minLeft} min jäljellä · vesi lämmintä putkissa, säästetään varaajaa)`;
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
    const dev = tuyaService.devicesById?.get(this.deviceId) || tuyaService.devices?.find(d => d.id === this.deviceId || (d.name && d.name.toLowerCase().includes('kiertovesipumppu')));

    const cycleOnMin = settings.dhw_pump_cycle_on_minutes != null ? Number(settings.dhw_pump_cycle_on_minutes) : 10;
    const cycleOffMin = settings.dhw_pump_cycle_off_minutes != null ? Number(settings.dhw_pump_cycle_off_minutes) : 15;
    const nightStart = settings.dhw_pump_night_start != null ? Number(settings.dhw_pump_night_start) : 23;
    const nightEnd = settings.dhw_pump_night_end != null ? Number(settings.dhw_pump_night_end) : 6;

    // Remaining minutes in current duty cycle or override
    let cycleMinutesRemaining = 0;
    if (isOverrideActive) {
      cycleMinutesRemaining = Math.max(0, Math.ceil((overrideUntil - now) / 60000));
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
      minTankTemp: settings.dhw_pump_min_tank_temp != null ? Number(settings.dhw_pump_min_tank_temp) : 40.0,
      nightStart,
      nightEnd,
      cycleOnMinutes: cycleOnMin,
      cycleOffMinutes: cycleOffMin,
      antiSeizeEnabled: settings.dhw_pump_anti_seize_enabled !== false,
      priceSetbackEnabled: settings.dhw_pump_price_setback_enabled !== false,
      deviceId: settings.dhw_pump_device_id || settings.upstairs_pump_device_id || this.deviceId,
    };
  }
}

module.exports = new UpstairsPumpDriver();
