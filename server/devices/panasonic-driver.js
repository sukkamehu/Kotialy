/**
 * Panasonic Aquarea Driver for APC
 * Controls Panasonic Heat Pump via Heishamon MQTT topics
 */

function log(...args) {
  console.log('[APC:PANASONIC]', ...args);
}

function warn(...args) {
  console.warn('[APC:PANASONIC]', ...args);
}

class PanasonicDriver {
  constructor() {
    this.name = 'Panasonic Aquarea (WH-MXC12J9E8)';
    this.type = 'hydronic_heat_pump';
    this.mqttClient = null;
    this.lastAppliedDirective = null;
    this.lastAppliedAt = 0;
    this.currentOffset = null;
    this.currentDhwTarget = null;
    this.currentForceDhw = null;
    this.currentQuietLevel = null;
  }

  setMqttClient(client) {
    this.mqttClient = client;
  }

  /**
   * Helper to send command via MQTT client
   */
  async sendCommand(setTopic, value) {
    if (!this.mqttClient) {
      warn('Cannot send command — MQTT client not set');
      return false;
    }
    try {
      if (typeof this.mqttClient.sendCommand === 'function') {
        await this.mqttClient.sendCommand(setTopic, value);
        return true;
      } else if (typeof this.mqttClient.publish === 'function') {
        await this.mqttClient.publish(setTopic, value);
        return true;
      }
    } catch (err) {
      warn(`Command failed for ${setTopic} = ${value}:`, err.message);
      return false;
    }
    return false;
  }

  /**
   * Apply an APC directive to the heat pump
   * @param {string} directive - BOOST | NORMAL | SETBACK | DHW_CYCLE | ECO
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot }
   */
  async applyDirective(directive, context) {
    const { settings, price, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot } = context;
    const now = Date.now();

    const baseShift = settings.base_z1_shift ?? 0;
    const dhwBoostTarget = settings.dhw_boost_target_c || settings.dhw_target_c || 55;
    const dhwNormalTarget = settings.dhw_normal_target_c || 50;
    const dhwMinTarget = settings.dhw_min_c || 45;
    const boostDhwOnCheap = settings.dhw_boost_on_cheap !== false;

    let targetShift = baseShift;
    let targetDhw = dhwNormalTarget;
    let forceDhw = 0;

    switch (directive) {
      case 'BOOST':
        targetShift = Math.max(-5, Math.min(15, baseShift + (settings.buffer_boost_c || 3)));
        if (boostDhwOnCheap || isDhwSlot) {
          targetDhw = dhwBoostTarget;
        }
        // Keep Force DHW OFF (0) to ensure heating is done via heat pump compressor, NOT electric immersion heater
        forceDhw = 0;
        break;

      case 'SETBACK':
        targetShift = Math.max(-10, Math.min(5, baseShift + (settings.buffer_setback_c || -2)));
        targetDhw = dhwMinTarget;
        forceDhw = 0;
        break;

      case 'ECO':
        targetShift = baseShift - 1;
        targetDhw = dhwMinTarget;
        forceDhw = 0;
        break;

      case 'DHW_CYCLE':
        targetShift = baseShift;
        targetDhw = dhwBoostTarget;
        // Keep Force DHW OFF (0) to ensure heating is done via heat pump compressor, NOT electric immersion heater
        forceDhw = 0;
        break;

      case 'NORMAL':
      default:
        targetShift = baseShift;
        targetDhw = dhwNormalTarget;
        forceDhw = 0;
        break;
    }

    // Safeguard: Inhibit positive curve shift (boost) if outdoor temperature exceeds heating cutoff
    const heatingCutoff = settings.heating_cutoff_c != null ? settings.heating_cutoff_c : 13;
    const isAboveCutoff = outdoorTemp != null && outdoorTemp >= heatingCutoff;
    if (isAboveCutoff && settings.prevent_curve_shift_above_cutoff !== false) {
      if (targetShift > baseShift) {
        log(`Outdoor temp (${outdoorTemp}°C) >= heating cutoff (${heatingCutoff}°C): Inhibiting buffer boost shift ${targetShift}°C -> ${Math.min(0, baseShift)}°C`);
        targetShift = Math.min(0, baseShift);
      }
    }

    // Safeguard: If DHW temp is low (< dhw_min_c), ensure target temp is at least normal target
    if (dhwTemp != null && dhwTemp < dhwMinTarget) {
      targetDhw = Math.max(targetDhw, dhwNormalTarget);
      forceDhw = 0;
    }

    // Automatic Quiet Mode level based on outdoor temperature (lampopumput.info T-CAP cycling prevention)
    let targetQuietLevel = null;
    if (outdoorTemp != null && settings.quiet_mode_auto_enabled !== false) {
      const q3Temp = settings.quiet_mode_level_3_temp != null ? settings.quiet_mode_level_3_temp : 3.0;
      const q2Temp = settings.quiet_mode_level_2_temp != null ? settings.quiet_mode_level_2_temp : 0.0;
      const q1Temp = settings.quiet_mode_level_1_temp != null ? settings.quiet_mode_level_1_temp : -5.0;

      if (outdoorTemp >= q3Temp) {
        targetQuietLevel = 3; // Leuto sää (> +3°C): Quiet 3 (minimoi pätkäkäynnin, matala taajuus)
      } else if (outdoorTemp >= q2Temp) {
        targetQuietLevel = 2; // Viileä (0...+3°C): Quiet 2
      } else if (outdoorTemp >= q1Temp) {
        targetQuietLevel = 1; // Pikkupakkanen (-5...0°C): Quiet 1
      } else {
        targetQuietLevel = 0; // Pakkanen (<-5°C): Quiet 0 (Pois / täysi teho)
      }
    }

    const results = [];

    // 1. Apply Heating / Buffer Tank curve shift (Z1 Heat Request Temp) only if changed
    if (this.currentOffset !== targetShift) {
      log(`Setting Z1 Heat Request offset: ${targetShift > 0 ? '+' : ''}${targetShift}°C`);
      const ok = await this.sendCommand('commands/SetZ1HeatRequestTemperature', targetShift);
      if (ok) {
        this.currentOffset = targetShift;
        results.push({ target: 'Z1_Shift', value: targetShift });
      }
    }

    // 2. Apply DHW Target only if changed
    if (this.currentDhwTarget !== targetDhw) {
      log(`Setting DHW Target Temperature: ${targetDhw}°C`);
      const dhwOk = await this.sendCommand('commands/SetDHWTemp', targetDhw);
      if (dhwOk) {
        this.currentDhwTarget = targetDhw;
        results.push({ target: 'DHW_Target', value: targetDhw });
      }
    }

    // 3. Apply Force DHW state only if explicitly configured in settings
    if (settings.manage_force_dhw && this.currentForceDhw !== forceDhw) {
      log(`Setting Force DHW: ${forceDhw}`);
      const fOk = await this.sendCommand('commands/SetForceDHW', forceDhw);
      if (fOk) {
        this.currentForceDhw = forceDhw;
        results.push({ target: 'Force_DHW', value: forceDhw });
      }
    }

    // 4. Apply Quiet Mode level if auto quiet mode is enabled and changed
    if (targetQuietLevel !== null && this.currentQuietLevel !== targetQuietLevel) {
      log(`Setting Quiet Mode level: ${targetQuietLevel} (Outdoor temp: ${outdoorTemp}°C)`);
      const qOk = await this.sendCommand('commands/SetQuietMode', targetQuietLevel);
      if (qOk) {
        this.currentQuietLevel = targetQuietLevel;
        results.push({ target: 'Quiet_Mode', value: targetQuietLevel });
      }
    }

    this.lastAppliedDirective = directive;
    this.lastAppliedAt = now;

    return {
      driver: 'panasonic',
      directive,
      appliedShift: targetShift,
      appliedDhwTarget: targetDhw,
      appliedForceDhw: forceDhw,
      appliedQuietLevel: targetQuietLevel,
      results,
    };
  }

  getStatus() {
    return {
      driver: 'panasonic',
      name: this.name,
      type: this.type,
      connected: !!this.mqttClient,
      lastDirective: this.lastAppliedDirective,
      lastAppliedAt: this.lastAppliedAt,
      currentOffset: this.currentOffset,
      currentQuietLevel: this.currentQuietLevel,
    };
  }
}

module.exports = new PanasonicDriver();
