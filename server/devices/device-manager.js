/**
 * APC Device Manager
 * Coordinates drivers and executes directives across registered heating devices
 */

const panasonicDriver = require('./panasonic-driver');
const { unit1, unit2 } = require('./mitsubishi-driver');

class DeviceManager {
  constructor() {
    this.drivers = [
      panasonicDriver,
      unit1,
      unit2,
    ];
  }

  setMqttClient(client) {
    panasonicDriver.setMqttClient(client);
  }

  async dispatchDirective(directive, context) {
    const results = [];
    for (const driver of this.drivers) {
      try {
        const res = await driver.applyDirective(directive, context);
        results.push(res);
      } catch (err) {
        console.error(`[APC:DEVICE_MGR] Driver ${driver.name || driver.id} failed:`, err);
        results.push({ driver: driver.name || driver.id, error: err.message });
      }
    }
    return results;
  }

  getAllStatuses() {
    return this.drivers.map((d) => d.getStatus());
  }
}

module.exports = new DeviceManager();
