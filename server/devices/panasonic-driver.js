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
    const { settings, price, bufferTemp, dhwTemp, isDhwSlot } = context;
    const now = Date.now();

    const baseShift = settings.base_z1_shift ?? 0;
    let targetShift = baseShift;
    let targetDhw = settings.dhw_min_c || 45;
    let forceDhw = 0;

    switch (directive) {
      case 'BOOST':
        targetShift = Math.max(-5, Math.min(15, baseShift + (settings.buffer_boost_c || 3)));
        if (isDhwSlot) {
          targetDhw = settings.dhw_target_c || 55;
          forceDhw = 1;
        }
        break;

      case 'SETBACK':
        targetShift = Math.max(-10, Math.min(5, baseShift + (settings.buffer_setback_c || -2)));
        targetDhw = settings.dhw_min_c || 45;
        forceDhw = 0;
        break;

      case 'ECO':
        targetShift = baseShift - 1;
        targetDhw = settings.dhw_min_c || 45;
        forceDhw = 0;
        break;

      case 'DHW_CYCLE':
        targetShift = baseShift;
        targetDhw = settings.dhw_target_c || 55;
        forceDhw = 1;
        break;

      case 'NORMAL':
      default:
        targetShift = baseShift;
        targetDhw = 50;
        forceDhw = 0;
        break;
    }

    // Safeguard: If DHW temp is dangerously low (< dhw_min_c), always ensure DHW heat
    if (dhwTemp != null && dhwTemp < (settings.dhw_min_c || 45)) {
      targetDhw = Math.max(targetDhw, settings.dhw_target_c || 55);
      forceDhw = 1;
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

    // 3. Apply Force DHW state only if changed
    if (this.currentForceDhw !== forceDhw) {
      log(`Setting Force DHW: ${forceDhw}`);
      const fOk = await this.sendCommand('commands/SetForceDHW', forceDhw);
      if (fOk) {
        this.currentForceDhw = forceDhw;
        results.push({ target: 'Force_DHW', value: forceDhw });
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
    };
  }
}

module.exports = new PanasonicDriver();
