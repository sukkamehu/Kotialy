/**
 * Mitsubishi Air-to-Air Heat Pump (ILP) Driver Template
 * Ready for future integration via MQTT, MelCloud, ESPHome, or IR
 */

function log(...args) {
  console.log('[APC:MITSUBISHI]', ...args);
}

class MitsubishiDriver {
  constructor(id = 'mitsubishi_1', name = 'Mitsubishi ILP 1') {
    this.id = id;
    this.name = name;
    this.type = 'air_to_air_heat_pump';
    this.enabled = false;
    this.targetOffset = 0;
    this.lastDirective = null;
    this.lastAppliedAt = 0;
  }

  /**
   * Apply an APC directive to the air-to-air unit
   */
  async applyDirective(directive, context) {
    if (!this.enabled) {
      // Driver ready but unconfigured/disabled until physical integration
      return {
        driver: this.id,
        status: 'disabled',
        directive,
      };
    }

    log(`Applying directive [${directive}] to ${this.name}`);
    let offset = 0;
    switch (directive) {
      case 'BOOST':
        offset = +1.5;
        break;
      case 'SETBACK':
        offset = -1.5;
        break;
      case 'ECO':
        offset = -0.5;
        break;
      default:
        offset = 0;
    }

    this.targetOffset = offset;
    this.lastDirective = directive;
    this.lastAppliedAt = Date.now();

    return {
      driver: this.id,
      status: 'active',
      directive,
      offset,
    };
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      targetOffset: this.targetOffset,
      lastDirective: this.lastDirective,
      lastAppliedAt: this.lastAppliedAt,
    };
  }
}

module.exports = {
  MitsubishiDriver,
  unit1: new MitsubishiDriver('mitsubishi_1', 'Mitsubishi ILP Olohuone'),
  unit2: new MitsubishiDriver('mitsubishi_2', 'Mitsubishi ILP Yläkerta'),
};
