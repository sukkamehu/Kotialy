/**
 * Floor Heating Circulation Pump Driver (Sonoff / Tasmota)
 * Controls secondary hydronic circulation pump between buffer tank and floor manifold
 */

const db = require('../db');

function log(...args) {
  console.log('[APC:FLOOR_PUMP]', ...args);
}

function warn(...args) {
  console.warn('[APC:FLOOR_PUMP]', ...args);
}

class FloorPumpDriver {
  constructor() {
    this.id = 'floor_pump';
    this.name = 'Lattialämmityksen kiertopumppu (Sonoff)';
    this.type = 'circulation_pump';
    this.mqttClient = null;
    this.lastState = null;
    this.lastAppliedDirective = null;
    this.lastAppliedAt = 0;
    this.currentReason = 'Alustetaan ohjainta...';
    this.isAntiSeizeRunning = false;
  }

  setMqttClient(client) {
    this.mqttClient = client;
  }

  /**
   * Helper to send command via MQTT client
   */
  async sendCommand(state) {
    const val = state === 'ON' || state === 1 || state === true ? 'ON' : 'OFF';
    if (!this.mqttClient) {
      warn('Cannot send command — MQTT client not set');
      return false;
    }
    try {
      if (typeof this.mqttClient.publish === 'function') {
        // Publish to primary topic
        await this.mqttClient.publish('lattialampopumppu/cmnd/POWER', val);
        // Also update local DB state immediately for reactive UI
        db.updateState('lattialampopumppu/stat/POWER', val);
        this.lastState = val;
        return true;
      }
    } catch (err) {
      warn(`Command failed for lattialampopumppu/cmnd/POWER = ${val}:`, err.message);
      return false;
    }
    return false;
  }

  /**
   * Evaluate and apply floor pump strategy during APC evaluation loop
   * @param {string} directive - BOOST | NORMAL | SETBACK | ECO | DHW_CYCLE
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot }
   */
  async applyDirective(directive, context) {
    const { settings, outdoorTemp, bufferTemp, isDhwSlot } = context;
    const now = Date.now();

    // Read current state from DB
    const fullState = db.getFullState();
    const currentStat = fullState['lattialampopumppu/stat/POWER']?.value || this.lastState || 'OFF';

    const mode = settings.floor_pump_mode || 'auto'; // 'auto' | 'constant_on' | 'constant_off'
    const overrideUntil = settings.floor_pump_override_until || 0;
    const overrideState = settings.floor_pump_override_state || null;
    const isOverrideActive = overrideUntil > now && overrideState != null;

    const summerCutoff = settings.floor_pump_summer_cutoff_temp != null
      ? settings.floor_pump_summer_cutoff_temp
      : 20.0;

    const antiSeizeEnabled = settings.floor_pump_anti_seize_enabled !== false;
    const summerPulseEnabled = settings.floor_pump_summer_pulse_enabled !== false;

    let targetState = 'ON';
    let reason = 'Normaali lämmityskierto';
    let antiSeizeActive = false;

    // 1. Manual Override takes precedence
    if (isOverrideActive) {
      targetState = overrideState;
      const minLeft = Math.ceil((overrideUntil - now) / 60000);
      reason = `Manuaalinen ohitus aktiivinen (${targetState === 'ON' ? 'Pakotettu PÄÄLLE' : 'Pakotettu POIS'} · jäljellä ~${minLeft} min)`;
    }
    // 2. Fixed Constant Modes
    else if (mode === 'constant_on') {
      targetState = 'ON';
      reason = 'Jatkuva kierto (Aina päällä -tila)';
    } else if (mode === 'constant_off') {
      targetState = 'OFF';
      reason = 'Pysäytetty (Aina pois päältä -tila)';
    }
    // 3. Intelligent APC Automatic Mode
    else {
      const nowDate = new Date(now);
      const hours = nowDate.getHours();
      const minutes = nowDate.getMinutes();

      // Anti-Seize Protection Check (Daily exercise pulse 12:00–12:05)
      const isNoonPulse = hours === 12 && minutes < 5;
      if (antiSeizeEnabled && isNoonPulse) {
        targetState = 'ON';
        antiSeizeActive = true;
        reason = 'Jumiutumissuoja: Päivittäinen liikutteluajo klo 12:00–12:05 (5 min)';
      }
      // Summer / Warm Weather Operation (Outdoor temp >= cutoff, e.g. >= 20°C)
      else if (outdoorTemp != null && outdoorTemp >= summerCutoff) {
        if (summerPulseEnabled) {
          // A. DHW generation flush: capture return heat from domestic hot water coil to bathroom floors
          if (isDhwSlot || (bufferTemp != null && bufferTemp >= 23.0)) {
            targetState = 'ON';
            reason = `Kesän mukavuuslämpö: LKV-latauksen paluulämpö ohjataan kylpyhuoneen lattiaan (${bufferTemp != null ? `${bufferTemp.toFixed(1)} °C` : 'aktiivinen'})`;
          }
          // B. Periodic comfort pulse: 15 min every 2 hours on even hours (e.g. 08:00, 10:00, 12:00, ...)
          else if (minutes < 15 && hours % 2 === 0) {
            targetState = 'ON';
            reason = `Kesän mukavuusjaksoajo: 15 min jaksotus (klo ${String(hours).padStart(2, '0')}:00–${String(hours).padStart(2, '0')}:15) kylppärin kuivatukseen`;
          }
          // C. Standby during off-interval
          else {
            targetState = 'OFF';
            const nextHour = hours + (hours % 2 === 0 ? 2 : 1);
            reason = `Kesäjakso lepotilassa (Mukavuuskierto aktivoituu klo ${String(nextHour % 24).padStart(2, '0')}:00 tai LKV-latauksessa)`;
          }
        } else {
          targetState = 'OFF';
          reason = `Kesäkatkaisu: Ulkolämpötila ${outdoorTemp.toFixed(1)} °C ≥ ${summerCutoff.toFixed(1)} °C (Lepotilassa)`;
        }
      }
      // Winter / Heating Season Operation (Outdoor temp < cutoff)
      else {
        targetState = 'ON';
        if (isDhwSlot) {
          if (bufferTemp != null && bufferTemp >= 22.0) {
            reason = `Lämmityskierto aktiivinen · LKV-kierukan paluulämpö ohjataan lattiaan (${bufferTemp.toFixed(1)} °C)`;
          } else {
            reason = 'Lämmityskierto aktiivinen käyttövesijakson aikana';
          }
        } else if (directive === 'BOOST') {
          reason = 'Halvan sähkön esilämmitys: Lämpöä jaetaan tehokkaasti lattiamassaan';
        } else if (directive === 'SETBACK') {
          reason = 'Hintahuippu: Puretaan puskurin ja laatan varauslämpöä tasaisesti';
        } else {
          reason = 'Automaattinen peruslämmityskierto (Päällä)';
        }
      }
    }

    this.currentReason = reason;
    this.isAntiSeizeRunning = antiSeizeActive;
    this.lastAppliedDirective = directive;
    this.lastAppliedAt = now;

    // Send command if state changed or sync needed
    const needsCommand = currentStat !== targetState || this.lastState !== targetState;
    if (needsCommand) {
      log(`State transition: ${currentStat} -> ${targetState} (${reason})`);
      const ok = await this.sendCommand(targetState);
      if (ok) {
        db.insertApcLog({
          action: `Lattialämpöpumppu: ${targetState === 'ON' ? 'Käynnistetty (ON)' : 'Sammutettu (OFF)'}`,
          reason,
          outdoor_temp: outdoorTemp,
          buffer_temp: bufferTemp,
          directive,
          details: {
            mode,
            targetState,
            override: isOverrideActive,
            antiSeize: antiSeizeActive,
          },
        });
      }
    }

    return {
      driver: 'floor_pump',
      state: targetState,
      currentState: currentStat,
      mode,
      reason,
      isOverrideActive,
      antiSeizeActive,
    };
  }

  /**
   * Set manual override (Forced ON / OFF) with optional duration in hours (0 = indefinite until cancelled)
   */
  async setManualOverride(state, durationHours = 0) {
    const val = state === 'ON' || state === 1 || state === true ? 'ON' : 'OFF';
    const until = durationHours > 0 ? Date.now() + durationHours * 3600 * 1000 : Date.now() + 365 * 24 * 3600 * 1000; // 1 year if indefinite

    db.updateApcSetting('floor_pump_override_state', val);
    db.updateApcSetting('floor_pump_override_until', until);

    log(`Manual override set to ${val} for ${durationHours > 0 ? `${durationHours} h` : 'toistaiseksi'}`);
    await this.sendCommand(val);

    db.insertApcLog({
      action: `Lattialämpöpumppu: Pakotettu ${val === 'ON' ? 'PÄÄLLE' : 'POIS'}`,
      reason: durationHours > 0 ? `Käyttäjän asettama aikarajattu ohitus (${durationHours} h)` : 'Käyttäjän asettama manuaalinen pakkokytkentä',
      directive: this.lastAppliedDirective || 'NORMAL',
      details: { overrideState: val, durationHours },
    });

    return this.getStatus();
  }

  /**
   * Clear manual override and return to automatic / configured mode
   */
  async clearManualOverride() {
    db.updateApcSetting('floor_pump_override_state', null);
    db.updateApcSetting('floor_pump_override_until', 0);

    log('Manual override cleared, returning to automatic strategy');
    db.insertApcLog({
      action: 'Lattialämpöpumppu: Ohitus poistettu',
      reason: 'Palautettu automaattiseen strategiaan',
      directive: this.lastAppliedDirective || 'NORMAL',
    });

    return this.getStatus();
  }

  /**
   * Set operating mode: 'auto' | 'constant_on' | 'constant_off'
   */
  async setMode(mode) {
    const validModes = ['auto', 'constant_on', 'constant_off'];
    const targetMode = validModes.includes(mode) ? mode : 'auto';
    db.updateApcSetting('floor_pump_mode', targetMode);
    log(`Operating mode changed to ${targetMode}`);
    return this.getStatus();
  }

  /**
   * Quick status snapshot
   */
  getStatus() {
    const fullState = db.getFullState();
    const settings = db.getApcSettings();
    const currentStat = fullState['lattialampopumppu/stat/POWER']?.value || this.lastState || 'OFF';
    const now = Date.now();
    const overrideUntil = settings.floor_pump_override_until || 0;
    const isOverrideActive = overrideUntil > now && settings.floor_pump_override_state != null;

    return {
      driver: 'floor_pump',
      name: this.name,
      type: this.type,
      connected: !!this.mqttClient,
      currentState: currentStat,
      mode: settings.floor_pump_mode || 'auto',
      overrideActive: isOverrideActive,
      overrideUntil,
      overrideState: settings.floor_pump_override_state || null,
      reason: this.currentReason,
      antiSeizeActive: this.isAntiSeizeRunning,
      lastAppliedAt: this.lastAppliedAt,
      summerCutoffTemp: settings.floor_pump_summer_cutoff_temp != null ? settings.floor_pump_summer_cutoff_temp : 20.0,
      summerPulseEnabled: settings.floor_pump_summer_pulse_enabled !== false,
      antiSeizeEnabled: settings.floor_pump_anti_seize_enabled !== false,
    };
  }
}

module.exports = new FloorPumpDriver();
