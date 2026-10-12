/**
 * Upstairs Circulation Pump Driver (Tuya WiFi Relay / Smart Switch)
 * Controls secondary hydronic heating circulation loop for the upper floor
 *
 * Intelligent Features:
 *  - Temperature-guided control based on upstairs room sensor (tuya/ylakerran_tyohuone/temperature)
 *  - Overheat prevention: naturally rising heat from downstairs is allowed to settle without unnecessary circulation
 *  - Outdoor summer cutoff (default >= 18.0 °C)
 *  - Buffer tank minimum temperature protection (>= 22.0 °C)
 *  - Nord Pool spot price optimization (pauses during expensive SETBACK peaks)
 *  - Daily anti-seize exercise pulse (12:10–12:15) to protect pump bearings
 *  - Manual timed overrides (1h, 2h, 4h, 8h or until cancelled)
 */

const db = require('../db');
const tuyaService = require('./tuya-service');

function log(...args) {
  console.log('[APC:UPSTAIRS_PUMP]', ...args);
}

function warn(...args) {
  console.warn('[APC:UPSTAIRS_PUMP]', ...args);
}

class UpstairsPumpDriver {
  constructor() {
    this.id = 'upstairs_pump';
    this.name = 'Yläkerran kiertovesipumppu (Tuya)';
    this.type = 'circulation_pump';
    this.deviceId = 'bfb6ed442015162bc97kca';
    this.lastState = null;
    this.lastAppliedDirective = null;
    this.lastAppliedAt = 0;
    this.currentReason = 'Alustetaan yläkerran pumpun ohjainta...';
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
      const devId = settings.upstairs_pump_device_id || this.deviceId;
      await tuyaService.setSwitchPower(devId, val);

      // Sync state immediately in SQLite DB
      db.updateState('tuya/kiertovesipumppu/state', val ? 'true' : 'false');
      db.updateState('tuya/kiertovesipumppu/switch', val ? '1' : '0');
      db.updateState('tuya/ylakerran_kiertovesipumppu/state', val ? 'true' : 'false');
      db.updateState('tuya/ylakerran_kiertovesipumppu/switch', val ? '1' : '0');
      db.updateState('apc/upstairs_pump/state', targetStr);
      this.lastState = targetStr;
      return true;
    } catch (err) {
      warn(`Command failed for upstairs pump = ${targetStr}:`, err.message);
      return false;
    }
  }

  /**
   * Evaluate and apply upstairs pump strategy during APC evaluation loop
   * @param {string} directive - BOOST | NORMAL | SETBACK | ECO | DHW_CYCLE
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot }
   */
  async applyDirective(directive, context) {
    const { settings, outdoorTemp, bufferTemp, isDhwSlot } = context;
    const now = Date.now();

    // Read current state from DB
    const fullState = db.getFullState();
    const currentStatRaw = fullState['tuya/kiertovesipumppu/state']?.value ??
                           fullState['tuya/ylakerran_kiertovesipumppu/state']?.value;
    const currentStat = (currentStatRaw === 'true' || currentStatRaw === '1' || currentStatRaw === 'ON' || this.lastState === 'ON') ? 'ON' : 'OFF';

    const mode = settings.upstairs_pump_mode || 'auto'; // 'auto' | 'constant_on' | 'constant_off'
    const overrideUntil = settings.upstairs_pump_override_until || 0;
    const overrideState = settings.upstairs_pump_override_state || null;
    const isOverrideActive = overrideUntil > now && overrideState != null;

    const targetTemp = settings.upstairs_pump_target_temp != null ? Number(settings.upstairs_pump_target_temp) : 21.3;
    const hysteresis = settings.upstairs_pump_temp_hysteresis != null ? Number(settings.upstairs_pump_temp_hysteresis) : 0.3;
    const summerCutoff = settings.upstairs_pump_summer_cutoff_temp != null ? Number(settings.upstairs_pump_summer_cutoff_temp) : 18.0;
    const antiSeizeEnabled = settings.upstairs_pump_anti_seize_enabled !== false;
    const priceSetbackEnabled = settings.upstairs_pump_price_setback_enabled !== false;

    // Read current upstairs temperature (tuya/ylakerran_tyohuone/temperature or legacy)
    const upstairsTempRaw = fullState['tuya/ylakerran_tyohuone/temperature']?.value ??
                            fullState['tuya/yl_kerran_ty_huone/temperature']?.value;
    const upstairsTemp = upstairsTempRaw != null ? parseFloat(upstairsTempRaw) : null;

    let targetState = 'ON';
    let reason = 'Normaali yläkerran lämmityskierto';
    let antiSeizeActive = false;

    // ── 1. Manual Override takes precedence ─────────────────────────────────
    if (isOverrideActive) {
      targetState = overrideState;
      const minLeft = Math.ceil((overrideUntil - now) / 60000);
      reason = `Manuaalinen ohitus aktiivinen (${targetState === 'ON' ? 'Pakotettu PÄÄLLE' : 'Pakotettu POIS'} · jäljellä ~${minLeft} min)`;
    }
    // ── 2. Fixed Constant Modes ─────────────────────────────────────────────
    else if (mode === 'constant_on') {
      targetState = 'ON';
      reason = 'Jatkuva kierto (Aina päällä -tila)';
    } else if (mode === 'constant_off') {
      targetState = 'OFF';
      reason = 'Pysäytetty (Aina pois päältä -tila)';
    }
    // ── 3. Intelligent APC Automatic Mode ───────────────────────────────────
    else {
      const nowDate = new Date(now);
      const hours = nowDate.getHours();
      const minutes = nowDate.getMinutes();

      // A. Anti-Seize Protection Check (Daily exercise pulse 12:10–12:15)
      const isNoonPulse = hours === 12 && minutes >= 10 && minutes < 15;
      if (antiSeizeEnabled && isNoonPulse) {
        targetState = 'ON';
        antiSeizeActive = true;
        reason = 'Jumiutumissuoja: Päivittäinen liikutteluajo klo 12:10–12:15 (5 min)';
      }
      // B. Summer Cutoff (Outdoor temp >= cutoff, e.g. >= 18°C)
      else if (outdoorTemp != null && outdoorTemp >= summerCutoff) {
        targetState = 'OFF';
        reason = `Kesäkatkaisu: Ulkolämpötila ${outdoorTemp.toFixed(1)} °C ≥ ${summerCutoff.toFixed(1)} °C · Yläkerran lämmitys lepotilassa`;
      }
      // C. Upstairs Room Temperature Overheat Protection (Yläkerran ylilämpökatkaisu)
      // Heat naturally rises to upper floor in 250m2 wooden frame house.
      // If upstairs is already at or above target + hysteresis, shut off pump to avoid overheating.
      else if (upstairsTemp != null && upstairsTemp >= (targetTemp + hysteresis)) {
        targetState = 'OFF';
        reason = `Ylilämpösuoja: Yläkerran lämpötila ${upstairsTemp.toFixed(1)} °C ≥ tavoite ${targetTemp.toFixed(1)} °C (+${hysteresis} °C) · Kierto tauolla ylilämmön estämiseksi`;
      }
      // D. Peak Electricity Price Setback (Hintahuippu / SETBACK)
      else if (directive === 'SETBACK' && priceSetbackEnabled && upstairsTemp != null && upstairsTemp >= (targetTemp - 0.5)) {
        targetState = 'OFF';
        reason = `Hintapiikkisäästö (SETBACK): Yläkerta riittävän lämmin (${upstairsTemp.toFixed(1)} °C) · Kierto tauolla kalliin pörssisähkön ajan`;
      }
      // E. Buffer Tank Minimum Temperature Protection
      // Avoid pumping cold water into living spaces if buffer tank is below 22°C (e.g. cold start / defrost)
      else if (bufferTemp != null && bufferTemp < 22.0) {
        targetState = 'OFF';
        reason = `Puskurivaraaja liian viileä (${bufferTemp.toFixed(1)} °C < 22 °C) · Odotetaan lämpenemistä`;
      }
      // F. Active Heating Season Demand
      else {
        targetState = 'ON';
        if (directive === 'BOOST') {
          reason = `Halvan sähkön esilämmitys (BOOST): Yläkerran kierto aktiivinen (${upstairsTemp != null ? `${upstairsTemp.toFixed(1)} °C / tavoite ${targetTemp.toFixed(1)} °C` : 'Päällä'})`;
        } else if (upstairsTemp != null && upstairsTemp < targetTemp) {
          reason = `Lämmitystarve: Yläkerran lämpötila ${upstairsTemp.toFixed(1)} °C < tavoite ${targetTemp.toFixed(1)} °C · Kierto käynnissä`;
        } else {
          reason = `Automaattinen lämmityskierto (Päällä · Yläkerta ${upstairsTemp != null ? `${upstairsTemp.toFixed(1)} °C` : 'OK'})`;
        }
      }
    }

    this.currentReason = reason;
    this.isAntiSeizeRunning = antiSeizeActive;
    this.lastAppliedDirective = directive;
    this.lastAppliedAt = now;

    db.updateState('apc/upstairs_pump/reason', reason);

    // Send command if state changed or hardware sync needed
    const needsCommand = currentStat !== targetState || this.lastState !== targetState;
    if (needsCommand) {
      log(`State transition: ${currentStat} -> ${targetState} (${reason})`);
      const ok = await this.sendCommand(targetState);
      if (ok) {
        db.insertApcLog({
          action: `Yläkerran kiertovesipumppu: ${targetState === 'ON' ? 'Käynnistetty (ON)' : 'Sammutettu (OFF)'}`,
          reason,
          outdoor_temp: outdoorTemp,
          buffer_temp: bufferTemp,
          directive,
          details: {
            mode,
            targetState,
            upstairsTemp,
            targetTemp,
            override: isOverrideActive,
            antiSeize: antiSeizeActive,
          },
        });
      }
    }

    return {
      driver: 'upstairs_pump',
      state: targetState,
      currentState: currentStat,
      mode,
      reason,
      upstairsTemp,
      targetTemp,
      isOverrideActive,
      antiSeizeActive,
    };
  }

  /**
   * Set manual override (Forced ON / OFF) with duration in hours (0 = indefinite until cancelled)
   */
  async setManualOverride(state, durationHours = 0) {
    const val = state === 'ON' || state === 1 || state === true ? 'ON' : 'OFF';
    const hours = parseFloat(durationHours) || 0;
    const until = hours > 0 ? Date.now() + Math.round(hours * 3600 * 1000) : Date.now() + 86400000 * 365;

    db.updateApcSetting('upstairs_pump_override_state', val);
    db.updateApcSetting('upstairs_pump_override_until', until);

    log(`Manual override set: ${val} until ${new Date(until).toISOString()} (${hours > 0 ? `${hours}h` : 'pysyvä'})`);
    await this.sendCommand(val);
    return this.getStatus();
  }

  /**
   * Cancel manual override and return to auto
   */
  async cancelManualOverride() {
    log('Manual override cancelled — returning to auto strategy');
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
                           fullState['tuya/ylakerran_kiertovesipumppu/state']?.value;
    const currentStat = (currentStatRaw === 'true' || currentStatRaw === '1' || currentStatRaw === 'ON' || this.lastState === 'ON') ? 'ON' : 'OFF';

    const overrideUntil = settings.upstairs_pump_override_until || 0;
    const isOverrideActive = overrideUntil > now && settings.upstairs_pump_override_state != null;

    const upstairsTempRaw = fullState['tuya/ylakerran_tyohuone/temperature']?.value ??
                            fullState['tuya/yl_kerran_ty_huone/temperature']?.value;
    const upstairsTemp = upstairsTempRaw != null ? parseFloat(upstairsTempRaw) : null;

    const dev = tuyaService.devicesById?.get(this.deviceId) || tuyaService.devices?.find(d => d.id === this.deviceId || (d.name && d.name.toLowerCase().includes('kiertovesipumppu')));

    return {
      driver: 'upstairs_pump',
      name: 'Yläkerran kiertovesipumppu',
      type: 'circulation_pump',
      connected: dev?.online ?? true,
      currentState: currentStat,
      mode: settings.upstairs_pump_mode || 'auto',
      overrideActive: isOverrideActive,
      overrideUntil,
      overrideState: settings.upstairs_pump_override_state || null,
      reason: this.currentReason,
      antiSeizeActive: this.isAntiSeizeRunning,
      lastAppliedAt: this.lastAppliedAt,
      upstairsTemp,
      targetTemp: settings.upstairs_pump_target_temp != null ? Number(settings.upstairs_pump_target_temp) : 21.3,
      tempHysteresis: settings.upstairs_pump_temp_hysteresis != null ? Number(settings.upstairs_pump_temp_hysteresis) : 0.3,
      summerCutoffTemp: settings.upstairs_pump_summer_cutoff_temp != null ? Number(settings.upstairs_pump_summer_cutoff_temp) : 18.0,
      antiSeizeEnabled: settings.upstairs_pump_anti_seize_enabled !== false,
      priceSetbackEnabled: settings.upstairs_pump_price_setback_enabled !== false,
      deviceId: settings.upstairs_pump_device_id || this.deviceId,
    };
  }
}

module.exports = new UpstairsPumpDriver();
