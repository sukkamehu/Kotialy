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
    this.baselineZ1 = null;
    this.currentOffset = 0;
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
    return this.mqttClient.sendCommand(setTopic, value);
  }

  /**
   * Apply an APC directive to the heat pump
   * @param {string} directive - BOOST | NORMAL | SETBACK | DHW_CYCLE | ECO
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp, isDhwSlot }
   */
  async applyDirective(directive, context) {
    const { settings, price, bufferTemp, dhwTemp, isDhwSlot } = context;
    const now = Date.now();

    log(`Applying directive [${directive}] (Price: ${price?.price?.toFixed(2)} c/kWh, Buffer: ${bufferTemp}°C, DHW: ${dhwTemp}°C, DHW Slot: ${isDhwSlot})`);

    let targetShift = 0;
    let targetDhw = settings.dhw_min_c || 45;
    let forceDhw = 0;

    switch (directive) {
      case 'BOOST':
        targetShift = Math.min(Math.max(settings.buffer_boost_c || 3, 1), 5);
        if (isDhwSlot) {
          targetDhw = settings.dhw_target_c || 55;
          forceDhw = 1;
        }
        break;

      case 'SETBACK':
        targetShift = Math.max(Math.min(settings.buffer_setback_c || -2, 0), -4);
        targetDhw = settings.dhw_min_c || 45;
        forceDhw = 0;
        break;

      case 'ECO':
        targetShift = -1;
        targetDhw = settings.dhw_min_c || 45;
        forceDhw = 0;
        break;

      case 'DHW_CYCLE':
        targetShift = 0;
        targetDhw = settings.dhw_target_c || 55;
        forceDhw = 1;
        break;

      case 'NORMAL':
      default:
        targetShift = 0;
        targetDhw = 50;
        forceDhw = 0;
        break;
    }

    // Safeguard: If DHW temp is dangerously low (< dhw_min_c), always ensure DHW heat
    if (dhwTemp != null && dhwTemp < (settings.dhw_min_c || 45)) {
      log(`DHW temp (${dhwTemp}°C) below minimum safety (${settings.dhw_min_c}°C) -> Forcing DHW heating`);
      targetDhw = Math.max(targetDhw, settings.dhw_target_c || 55);
      forceDhw = 1;
    }

    const results = [];

    // 1. Apply Heating / Buffer Tank curve shift (Z1 Heat Request Temp)
    if (this.currentOffset !== targetShift) {
      log(`Setting Z1 Heat Request curve shift: ${targetShift > 0 ? '+' : ''}${targetShift}`);
      const ok = await this.sendCommand('commands/SetZ1HeatRequestTemperature', targetShift);
      if (ok) {
        this.currentOffset = targetShift;
        results.push({ target: 'Z1_Shift', value: targetShift });
      }
    }

    // 2. Apply DHW Target
    log(`Setting DHW Target Temperature: ${targetDhw}°C`);
    const dhwOk = await this.sendCommand('commands/SetDHWTemp', targetDhw);
    if (dhwOk) {
      results.push({ target: 'DHW_Target', value: targetDhw });
    }

    // 3. Apply Force DHW state if scheduled
    if (forceDhw === 1) {
      log('Enabling Force DHW for scheduled charging');
      await this.sendCommand('commands/SetForceDHW', 1);
      results.push({ target: 'Force_DHW', value: 1 });
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
