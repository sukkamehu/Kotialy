/**
 * Tapo P115 Smart Plugs Driver for APC
 * Manages 4 smart plugs: Pikkuvarasto, Isovarasto, Pesukone, Kuivausrumpu
 * Enforces:
 *  - Appliance Active Cycle Protection (Never cut power while washing machine or dryer is running!)
 *  - Smart Look-Ahead Price Anticipation for next 1-2 hours
 *  - Anti-freeze limits & cheap electricity storage heating for Pikku- and Isovarasto
 *  - Spot price thresholds & manual overrides
 */

const db = require('../db');
const tapoService = require('./tapo-service');
const nordpoolClient = require('../nordpool-client');

function log(...args) {
  console.log('[APC:TAPO_DRIVER]', ...args);
}

function warn(...args) {
  console.warn('[APC:TAPO_DRIVER]', ...args);
}

// Appliance Running Cycle Guard Constants
const ACTIVE_POWER_THRESHOLD_W = 6.0; // Standby is ~0.5-2W. Active wash/dry/drum is 20-2200W
const CYCLE_GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 min grace period for soak/pause/cooldown phases

class TapoDriver {
  constructor() {
    this.id = 'tapo_plugs';
    this.name = 'Tapo P115 Älypistorasiat';
    this.type = 'smart_plugs';
    this.lastAppliedAt = 0;
    // Map of deviceId -> { lastActiveAt: number, cycleStartedAt: number }
    this.deviceCycles = new Map();
  }

  setMqttClient(client) {
    tapoService.setMqttClient(client);
  }

  /**
   * Called whenever live power telemetry is received from a device
   */
  recordPower(deviceId, powerW) {
    const now = Date.now();
    const cycle = this.deviceCycles.get(deviceId) || { lastActiveAt: 0, cycleStartedAt: 0 };

    if (powerW >= ACTIVE_POWER_THRESHOLD_W) {
      if (!cycle.cycleStartedAt || now - cycle.lastActiveAt > CYCLE_GRACE_PERIOD_MS) {
        cycle.cycleStartedAt = now;
      }
      cycle.lastActiveAt = now;
      this.deviceCycles.set(deviceId, cycle);
    }
  }

  /**
   * Check if an appliance is currently running an active cycle or in grace period
   */
  isApplianceRunning(deviceId, currentPowerW) {
    const now = Date.now();
    const cycle = this.deviceCycles.get(deviceId);

    // If currently pulling active wattage
    if (currentPowerW >= ACTIVE_POWER_THRESHOLD_W) {
      this.recordPower(deviceId, currentPowerW);
      const c = this.deviceCycles.get(deviceId);
      const durationMins = Math.max(1, Math.round((now - c.cycleStartedAt) / 60000));
      return { isRunning: true, reason: `Pesu/kuivausohjelma käynnissä (${currentPowerW.toFixed(0)} W, kesto ~${durationMins} min)` };
    }

    // If recently active within grace period
    if (cycle && cycle.lastActiveAt > 0 && now - cycle.lastActiveAt < CYCLE_GRACE_PERIOD_MS) {
      const pausedMins = Math.round((now - cycle.lastActiveAt) / 60000);
      const totalMins = Math.max(1, Math.round((now - cycle.cycleStartedAt) / 60000));
      return {
        isRunning: true,
        reason: `Ohjelmavaihe käynnissä / tauko (~${pausedMins} min sitten aktiivinen, ohjelman kesto ~${totalMins} min)`,
      };
    }

    return { isRunning: false, reason: null };
  }

  /**
   * Smart look-ahead evaluation for appliances (washing machine & tumble dryer)
   */
  evaluateApplianceSchedule(dev, currentPriceCents, maxPriceLimit, now) {
    const powerW = dev.power_w || 0;
    const runningStatus = this.isApplianceRunning(dev.id, powerW);

    // ── 1. ACTIVE CYCLE PROTECTION ──────────────────────────────────────────
    // NEVER cut power while an appliance is actively washing or drying!
    if (runningStatus.isRunning) {
      return {
        targetState: 'ON',
        reason: `🧺 ${runningStatus.reason} · Suojattu: Ei katkaista kesken ohjelman`,
      };
    }

    // ── 2. IDLE APPLIANCE: PRICE & NEXT-HOUR LOOK-AHEAD EVALUATION ──────────
    if (currentPriceCents == null) {
      return {
        targetState: 'ON',
        reason: 'Pörssisähkön hintatietoa ei saatavilla · Pistorasia käytettävissä',
      };
    }

    // If current spot price exceeds limit -> Keep OFF
    if (currentPriceCents > maxPriceLimit) {
      return {
        targetState: 'OFF',
        reason: `Sähkö kallista (${currentPriceCents.toFixed(1)} snt/kWh > ${maxPriceLimit.toFixed(1)} snt/kWh) · Käynnistys estetty`,
      };
    }

    // Current price is <= maxPriceLimit. Let's look ahead to the next 1-2 hours!
    const upcomingPrices = nordpoolClient.getPrices(now, now + 3 * 3600 * 1000);
    const nextHourEntry = upcomingPrices.find((p) => p.start_time > now);
    const nextHourPriceCents = nextHourEntry ? nextHourEntry.price / 10 : null;

    const currentMinute = new Date(now).getMinutes();
    const minsLeftInCurrentHour = 60 - currentMinute;
    const nextHourFormatted = `${String((new Date(now).getHours() + 1) % 24).padStart(2, '0')}:00`;

    if (nextHourPriceCents != null && nextHourPriceCents > maxPriceLimit) {
      // If we are late in the current hour (e.g. less than 40 mins remaining),
      // a typical 1.5 - 2 hour wash program would run mostly in the expensive period.
      if (minsLeftInCurrentHour <= 40) {
        return {
          targetState: 'OFF',
          reason: `Ennakointi: Seuraava tunti ylittää hintarajan (${nextHourPriceCents.toFixed(1)} snt/kWh > ${maxPriceLimit.toFixed(1)} snt/kWh klo ${nextHourFormatted} alkaen) · Käynnistys estetty`,
        };
      }

      // If next hour has a severe price spike (> 30% above limit), don't start
      if (nextHourPriceCents > maxPriceLimit * 1.3) {
        return {
          targetState: 'OFF',
          reason: `Ennakointi: Tulossa merkittävä hintapiikki (${nextHourPriceCents.toFixed(1)} snt/kWh klo ${nextHourFormatted}) · Odotetaan edullisempaa aikaa`,
        };
      }

      // If early in the current hour and price jump is moderate, allow with advisory reason
      return {
        targetState: 'ON',
        reason: `Sähkö edullista (${currentPriceCents.toFixed(1)} snt/kWh) · Huom: Hinta nousee klo ${nextHourFormatted} (${nextHourPriceCents.toFixed(1)} snt/kWh)`,
      };
    }

    // Both current and upcoming hours are cheap/acceptable
    const nextHourText = nextHourPriceCents != null ? `, seuraava tunti ${nextHourPriceCents.toFixed(1)} snt/kWh` : '';
    return {
      targetState: 'ON',
      reason: `Sähkö edullista (${currentPriceCents.toFixed(1)} snt/kWh${nextHourText}) · Käynnistys sallittu`,
    };
  }

  /**
   * Apply APC directive & price/temperature rules to all Tapo devices
   */
  async applyDirective(directive, context) {
    const { settings, price } = context;
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
          // Isovarasto & Pikkuvarasto Storage Heating
          if (dev.type === 'storage_heating' || dev.id === 'pikkuvarasto' || dev.id === 'isovarasto') {
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
                targetState = 'OFF';
                reason = `Normaali hintataso (${currentPriceCents != null ? currentPriceCents.toFixed(1) : '?'} snt/kWh) · Odotetaan halpaa sähköä`;
              }
            }
          }
          // Pyykinpesukone
          else if (dev.id === 'pesukone' || dev.type === 'appliance_washing_machine') {
            const maxPriceLimit = dev.max_price_cents != null ? dev.max_price_cents : 15.0;
            const evalResult = this.evaluateApplianceSchedule(dev, currentPriceCents, maxPriceLimit, now);
            targetState = evalResult.targetState;
            reason = evalResult.reason;
          }
          // Kuivausrumpu
          else if (dev.id === 'kuivausrumpu' || dev.type === 'appliance_dryer') {
            const maxPriceLimit = dev.max_price_cents != null ? dev.max_price_cents : 12.0;
            const evalResult = this.evaluateApplianceSchedule(dev, currentPriceCents, maxPriceLimit, now);
            targetState = evalResult.targetState;
            reason = evalResult.reason;
          }
          // General Plug
          else {
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
