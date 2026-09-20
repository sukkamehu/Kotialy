/**
 * VILP Pipe Defrost / Trace Heating Cable Driver (Sonoff / Tasmota)
 * Controls defrost trace heating cable on condensate drain pipe & pan
 */

const db = require('../db');

function log(...args) {
  console.log('[APC:DEFROST_CABLE]', ...args);
}

function warn(...args) {
  console.warn('[APC:DEFROST_CABLE]', ...args);
}

class DefrostCableDriver {
  constructor() {
    this.id = 'defrost_cable';
    this.name = 'VILP Sulanapitokaapeli (Sonoff)';
    this.type = 'pipe_heater';
    this.mqttClient = null;
    this.lastState = null;
    this.lastAppliedDirective = null;
    this.lastAppliedAt = 0;
    this.currentReason = 'Alustetaan ohjainta...';
    this.lastDefrostSeenAt = 0;
    this.cycleStartTime = 0;
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
        // Publish to primary Tasmota command topics
        await this.mqttClient.publish('cmnd/sulanapito/POWER', val);
        await this.mqttClient.publish('sulanapito/cmnd/POWER', val);
        await this.mqttClient.publish('panasonic_heat_pump/sulanapito/cmnd/POWER', val);

        this.lastState = val;
        return true;
      }
    } catch (err) {
      warn(`Command failed for defrost cable = ${val}:`, err.message);
      return false;
    }
    return false;
  }

  /**
   * Evaluate and apply defrost cable strategy during APC evaluation loop
   * @param {string} directive - BOOST | NORMAL | SETBACK | ECO | DHW_CYCLE
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp }
   */
  async applyDirective(directive, context) {
    const { settings, price, outdoorTemp } = context;
    const now = Date.now();

    // Read current state from DB
    const fullState = db.getFullState();
    const currentStat = fullState['sulanapito/stat/POWER']?.value || fullState['stat/sulanapito/POWER']?.value || this.lastState || 'OFF';
    const isDefrosting = fullState['main/Defrosting_State']?.value === '1';
    const compressorFreq = parseFloat(fullState['main/Compressor_Freq']?.value || '0');
    const isCompressorRunning = compressorFreq > 0;

    if (isDefrosting) {
      this.lastDefrostSeenAt = now;
    }

    const mode = settings.defrost_cable_mode || 'auto'; // 'auto' | 'constant_on' | 'constant_off'
    const overrideUntil = settings.defrost_cable_override_until || 0;
    const overrideState = settings.defrost_cable_override_state || null;
    const isOverrideActive = overrideUntil > now && overrideState != null;

    const tempThreshold = settings.defrost_cable_temp_threshold != null
      ? settings.defrost_cable_temp_threshold
      : 2.0; // Active below +2.0°C
    const hardFreezeTemp = settings.defrost_cable_hard_freeze_temp != null
      ? settings.defrost_cable_hard_freeze_temp
      : -5.0; // Hard freeze below -5.0°C
    const defrostRunoverMin = settings.defrost_cable_defrost_runover_min != null
      ? settings.defrost_cable_defrost_runover_min
      : 20; // Run 20 min post defrost
    const dutyCycleMinutes = 30; // 30 min window for duty cycle

    let targetState = 'OFF';
    let reason = 'Lepotilassa';

    // 1. Manual Override takes precedence
    if (isOverrideActive) {
      targetState = overrideState;
      const minLeft = Math.ceil((overrideUntil - now) / 60000);
      reason = `Manuaalinen ohitus aktiivinen (${targetState === 'ON' ? 'Pakotettu PÄÄLLE' : 'Pakotettu POIS'} · jäljellä ~${minLeft} min)`;
    }
    // 2. Fixed Constant Modes
    else if (mode === 'constant_on') {
      targetState = 'ON';
      reason = 'Jatkuva lämmitys (Aina päällä -tila)';
    } else if (mode === 'constant_off') {
      targetState = 'OFF';
      reason = 'Pysäytetty (Aina pois päältä -tila)';
    }
    // 3. Smart Auto Mode
    else {
      const msSinceDefrost = now - this.lastDefrostSeenAt;
      const runoverMs = defrostRunoverMin * 60 * 1000;

      // Condition A: Active Defrosting
      if (isDefrosting) {
        targetState = 'ON';
        reason = 'Sulatus käynnissä (Vesi poistuu putkesta ja altaasta)';
      }
      // Condition B: Post-Defrost Runover
      else if (this.lastDefrostSeenAt > 0 && msSinceDefrost < runoverMs) {
        targetState = 'ON';
        const minLeft = Math.ceil((runoverMs - msSinceDefrost) / 60000);
        reason = `Sulatuksen jälkilämpö (~${minLeft} min jäljellä, estetään sulamisveden jäätyminen)`;
      }
      // Condition C: Outdoor Temperature Above Cutoff Threshold (> +2°C)
      else if (outdoorTemp != null && outdoorTemp > tempThreshold) {
        targetState = 'OFF';
        reason = `Ulkolämpötila plussalla (${outdoorTemp.toFixed(1)}°C > +${tempThreshold}°C, kaapeli lepotilassa)`;
      }
      // Condition C2: Unknown Outdoor Temperature -> Safe OFF default
      else if (outdoorTemp == null) {
        targetState = 'OFF';
        reason = 'Ulkolämpötila ei saatavilla (kaapeli lepotilassa)';
      }
      // Condition D: Deep Freeze (<= -10.0°C, e.g. -20°C) -> Always 100% Continuous ON
      else if (outdoorTemp != null && outdoorTemp <= -10.0) {
        targetState = 'ON';
        reason = `Kova pakkanen (${outdoorTemp.toFixed(1)}°C ≤ -10.0°C) · Jatkuva sulanapitolämmitys (Aina päällä)`;
      }
      // Condition E: Moderate Freeze (-10.0°C ... -5.0°C)
      else if (outdoorTemp != null && outdoorTemp <= hardFreezeTemp) {
        if (isCompressorRunning) {
          targetState = 'ON';
          reason = `Pakkassuojaus (${outdoorTemp.toFixed(1)}°C ≤ ${hardFreezeTemp}°C) & kompressori käynnissä (${compressorFreq.toFixed(0)} Hz)`;
        } else {
          // Sub-zero but compressor off: 50% duty cycle to maintain pipe warmth without wasting energy
          const cycleMin = (Math.floor(now / 60000) % dutyCycleMinutes);
          if (cycleMin < dutyCycleMinutes / 2) {
            targetState = 'ON';
            reason = `Pakkassuojaus (${outdoorTemp.toFixed(1)}°C), kompressori lepotilassa (50% jaksotus)`;
          } else {
            targetState = 'OFF';
            reason = `Pakkassuojaus (${outdoorTemp.toFixed(1)}°C), lepojakso jaksotuksessa`;
          }
        }
      }
      // Condition E: Mild Freezing (-5.0°C ... +2.0°C)
      else {
        // In mild subzero, if compressor is running, cycle 15m ON / 15m OFF (saves 50% power)
        if (isCompressorRunning) {
          const isCheap = directive === 'BOOST' || directive === 'ECO' || (price && price < (settings.cheap_threshold_cents || 3.0));
          if (isCheap) {
            targetState = 'ON';
            reason = `Pikkupakkanen (${outdoorTemp != null ? outdoorTemp.toFixed(1) : '0'}°C) & halpa sähkö (ennakoiva lämmitys)`;
          } else {
            const cycleMin = (Math.floor(now / 60000) % dutyCycleMinutes);
            if (cycleMin < dutyCycleMinutes / 2) {
              targetState = 'ON';
              reason = `Pikkupakkanen (${outdoorTemp != null ? outdoorTemp.toFixed(1) : '0'}°C), älykäs lämmitysjakso (15/15 min)`;
            } else {
              targetState = 'OFF';
              reason = `Pikkupakkanen (${outdoorTemp != null ? outdoorTemp.toFixed(1) : '0'}°C), säästöjakso (15/15 min)`;
            }
          }
        } else {
          targetState = 'OFF';
          reason = `Pikkupakkanen (${outdoorTemp != null ? outdoorTemp.toFixed(1) : '0'}°C), kompressori lepotilassa`;
        }
      }
    }

    this.currentReason = reason;

    // Apply state if changed or forced
    if (targetState !== currentStat) {
      log(`State change: ${currentStat} -> ${targetState} | Reason: ${reason}`);
      await this.sendCommand(targetState);
    }

    this.lastAppliedDirective = directive;
    this.lastAppliedAt = now;

    return {
      driver: this.id,
      status: 'active',
      currentState: targetState,
      mode,
      reason,
      isOverrideActive,
    };
  }

  async setManualOverride(state, durationHours = 0) {
    const now = Date.now();
    let overrideUntil = 0;
    let overrideState = null;

    if (state && (state === 'ON' || state === 'OFF')) {
      overrideState = state;
      overrideUntil = durationHours > 0 ? now + durationHours * 3600 * 1000 : now + 24 * 3600 * 1000;
    }

    db.updateApcSetting('defrost_cable_override_state', overrideState || '');
    db.updateApcSetting('defrost_cable_override_until', overrideUntil);

    if (overrideState) {
      await this.sendCommand(overrideState);
    }

    log(`Manual override set: state=${overrideState}, until=${overrideUntil ? new Date(overrideUntil).toISOString() : 'none'}`);
    return this.getStatus();
  }

  async updateSettings(newSettings) {
    if (newSettings.mode) {
      db.updateApcSetting('defrost_cable_mode', newSettings.mode);
    }
    if (newSettings.temp_threshold != null) {
      db.updateApcSetting('defrost_cable_temp_threshold', newSettings.temp_threshold);
    }
    if (newSettings.hard_freeze_temp != null) {
      db.updateApcSetting('defrost_cable_hard_freeze_temp', newSettings.hard_freeze_temp);
    }
    if (newSettings.defrost_runover_min != null) {
      db.updateApcSetting('defrost_cable_defrost_runover_min', newSettings.defrost_runover_min);
    }
    return this.getStatus();
  }

  getStatus() {
    const settings = db.getApcSettings();
    const fullState = db.getFullState();
    const now = Date.now();

    const currentState = fullState['sulanapito/stat/POWER']?.value || fullState['stat/sulanapito/POWER']?.value || this.lastState || 'OFF';
    const overrideUntil = settings.defrost_cable_override_until || 0;
    const overrideState = settings.defrost_cable_override_state || null;
    const overrideActive = overrideUntil > now && overrideState != null;

    return {
      driver: this.id,
      name: this.name,
      type: this.type,
      connected: !!this.mqttClient,
      currentState,
      mode: settings.defrost_cable_mode || 'auto',
      overrideActive,
      overrideUntil,
      overrideState,
      reason: this.currentReason,
      lastAppliedAt: this.lastAppliedAt,
      tempThreshold: settings.defrost_cable_temp_threshold != null ? settings.defrost_cable_temp_threshold : 2.0,
      hardFreezeTemp: settings.defrost_cable_hard_freeze_temp != null ? settings.defrost_cable_hard_freeze_temp : -5.0,
      defrostRunoverMin: settings.defrost_cable_defrost_runover_min != null ? settings.defrost_cable_defrost_runover_min : 20,
    };
  }
}

module.exports = new DefrostCableDriver();
