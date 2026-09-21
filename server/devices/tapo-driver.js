/**
 * Tapo P115 Smart Plugs Driver for APC
 * Manages 4 smart plugs: Pikkuvarasto, Isovarasto, Pesukone, Kuivausrumpu
 * Enforces price thresholds, anti-freeze limits, cheap electricity storage heating, and manual overrides.
 */

const db = require('../db');
const tapoService = require('./tapo-service');

function log(...args) {
  console.log('[APC:TAPO_DRIVER]', ...args);
}

function warn(...args) {
  console.warn('[APC:TAPO_DRIVER]', ...args);
}

class TapoDriver {
  constructor() {
    this.id = 'tapo_plugs';
    this.name = 'Tapo P115 Älypistorasiat';
    this.type = 'smart_plugs';
    this.lastAppliedAt = 0;
  }

  setMqttClient(client) {
    tapoService.setMqttClient(client);
  }

  /**
   * Apply APC directive & price/temperature rules to all Tapo devices
   */
  async applyDirective(directive, context) {
    const { settings, price, outdoorTemp } = context;
    const now = Date.now();
    const currentPriceCents = price?.price != null ? price.price : null;
    const devices = db.getTapoDevices();
    const results = [];

    for (const dev of devices) {
      try {
        const mode = dev.auto_mode || 'auto'; // 'auto' | 'constant_on' | 'constant_off'
        const overrideUntil = dev.override_until || 0;
        const overrideState = dev.override_state || null;
        const isOverrideActive = overrideUntil > now && overrideState != null;

        let targetState = 'OFF';
        let reason = 'Automaatio lepotilassa';

        // 1. Manual Override takes highest precedence
        if (isOverrideActive) {
          targetState = overrideState;
          const minLeft = Math.ceil((overrideUntil - now) / 60000);
          reason = `Manuaalinen ohitus aktiivinen (${targetState === 'ON' ? 'Pakotettu PÄÄLLE' : 'Pakotettu POIS'} · jäljellä ~${minLeft} min)`;
        }
        // 2. Fixed Constant Modes
        else if (mode === 'constant_on') {
          targetState = 'ON';
          reason = 'Jatkuva virransyöttö (Aina päällä -tila)';
        } else if (mode === 'constant_off') {
          targetState = 'OFF';
          reason = 'Virta katkaistu (Aina pois päältä -tila)';
        }
        // 3. Smart Auto Mode per Device Type
        else {
          if (dev.type === 'storage_heating' || dev.id === 'pikkuvarasto' || dev.id === 'isovarasto') {
            // Varastojen lämmityksen ohjauslogiikka
            // Minimilämpötila: ei saa päästää alle 10°C (turvaraja)
            // Halvan sähkön / BOOST aikana varataan lämpöä jopa +22°C asti
            const minTemp = dev.min_temp_c != null ? dev.min_temp_c : 10.0;
            const maxTemp = dev.max_temp_c != null ? dev.max_temp_c : 22.0;

            // Check if sensor temperature is available
            let roomTemp = null;
            if (dev.temp_sensor_topic) {
              const fullState = db.getFullState();
              const sensorVal = fullState[dev.temp_sensor_topic]?.value;
              if (sensorVal != null) roomTemp = parseFloat(sensorVal);
            }

            // Priority A: Anti-Freeze Safeguard (< 10°C) -> Always ON
            if (roomTemp != null && roomTemp < minTemp) {
              targetState = 'ON';
              reason = `Pakkassuojaus aktivoitu (${roomTemp.toFixed(1)}°C < ${minTemp.toFixed(1)}°C minimiraja)`;
            }
            // Priority B: Temperature Overheating Safeguard (>= 22°C) -> OFF
            else if (roomTemp != null && roomTemp >= maxTemp) {
              targetState = 'OFF';
              reason = `Tavoitelämpötila saavutettu (${roomTemp.toFixed(1)}°C ≥ ${maxTemp.toFixed(1)}°C)`;
            }
            // Priority C: Cheap Electricity Window / BOOST Directive
            else {
              const cheapThreshold = settings.cheap_threshold_cents != null ? settings.cheap_threshold_cents : 4.0;
              const isCheap = directive === 'BOOST' || (currentPriceCents != null && currentPriceCents <= cheapThreshold);
              const isPeak = directive === 'SETBACK' || (currentPriceCents != null && currentPriceCents >= (settings.peak_threshold_cents || 18.0));

              if (isCheap) {
                targetState = 'ON';
                reason = `Halpa sähkö (${currentPriceCents != null ? currentPriceCents.toFixed(1) : '?'} snt/kWh) · Lämmitys/varaustila`;
              } else if (isPeak) {
                targetState = 'OFF';
                reason = `Hintahuippu (${currentPriceCents != null ? currentPriceCents.toFixed(1) : '?'} snt/kWh) · Lämmitys katkaistu`;
              } else if (directive === 'ECO') {
                targetState = 'OFF';
                reason = `Säästöjakso · Lämmitys katkaistu`;
              } else {
                // NORMAL mode: keep off unless cheap or needed
                targetState = 'OFF';
                reason = `Normaali hintataso (${currentPriceCents != null ? currentPriceCents.toFixed(1) : '?'} snt/kWh) · Odotetaan halpaa sähköä`;
              }
            }
          } else if (dev.id === 'pesukone' || dev.type === 'appliance_washing_machine') {
            // Pesukone: pidetään päällä vain kun sähkö <= 15.0 c/kWh
            const maxPriceLimit = dev.max_price_cents != null ? dev.max_price_cents : 15.0;

            if (currentPriceCents != null && currentPriceCents > maxPriceLimit) {
              targetState = 'OFF';
              reason = `Sähkö kallista (${currentPriceCents.toFixed(1)} snt/kWh > ${maxPriceLimit.toFixed(1)} snt/kWh) · Pesukone estetty`;
            } else {
              targetState = 'ON';
              reason = `Sähkö edullista (${currentPriceCents != null ? currentPriceCents.toFixed(1) : '?'} snt/kWh ≤ ${maxPriceLimit.toFixed(1)} snt/kWh) · Pesukone käytettävissä`;
            }
          } else if (dev.id === 'kuivausrumpu' || dev.type === 'appliance_dryer') {
            // Kuivausrumpu: pidetään päällä vain kun sähkö <= 12.0 c/kWh
            const maxPriceLimit = dev.max_price_cents != null ? dev.max_price_cents : 12.0;

            if (currentPriceCents != null && currentPriceCents > maxPriceLimit) {
              targetState = 'OFF';
              reason = `Sähkö kallista (${currentPriceCents.toFixed(1)} snt/kWh > ${maxPriceLimit.toFixed(1)} snt/kWh) · Kuivausrumpu estetty`;
            } else {
              targetState = 'ON';
              reason = `Sähkö edullista (${currentPriceCents != null ? currentPriceCents.toFixed(1) : '?'} snt/kWh ≤ ${maxPriceLimit.toFixed(1)} snt/kWh) · Kuivausrumpu käytettävissä`;
            }
          } else {
            // General plug
            if (dev.max_price_cents != null && currentPriceCents != null && currentPriceCents > dev.max_price_cents) {
              targetState = 'OFF';
              reason = `Hintaraja ylittynyt (${currentPriceCents.toFixed(1)} snt > ${dev.max_price_cents.toFixed(1)} snt)`;
            } else {
              targetState = 'ON';
              reason = 'Automaatio sallittu';
            }
          }
        }

        // Apply state if changed or if reason updated
        if (dev.state !== targetState || dev.last_action_reason !== reason) {
          await tapoService.setDeviceState(dev.id, targetState, reason);
        }

        results.push({
          id: dev.id,
          name: dev.name,
          state: targetState,
          reason,
          mode,
        });
      } catch (err) {
        warn(`Error applying directive for Tapo device ${dev.id}:`, err.message);
        results.push({ id: dev.id, error: err.message });
      }
    }

    this.lastAppliedAt = now;
    return { driver: this.id, devices: results };
  }

  async setManualOverride(id, state, durationHours = 0) {
    const now = Date.now();
    let overrideUntil = 0;
    let overrideState = null;

    if (state && (state === 'ON' || state === 'OFF')) {
      overrideState = state;
      overrideUntil = durationHours > 0 ? now + durationHours * 3600 * 1000 : now + 24 * 3600 * 1000;
    }

    db.updateTapoDevice(id, {
      override_state: overrideState,
      override_until: overrideUntil,
    });

    if (overrideState) {
      await tapoService.setDeviceState(id, overrideState, `Manuaalinen ohitus (${overrideState})`);
    }

    return db.getTapoDevice(id);
  }

  async updateSettings(id, newSettings) {
    db.updateTapoDevice(id, newSettings);
    return db.getTapoDevice(id);
  }

  getStatus() {
    return {
      driver: this.id,
      name: this.name,
      type: this.type,
      devices: tapoService.getAllStatuses(),
      lastAppliedAt: this.lastAppliedAt,
    };
  }
}

module.exports = new TapoDriver();
