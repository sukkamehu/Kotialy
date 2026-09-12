/**
 * APC (Auto Power & Price Controller) Service
 * Intelligent heating optimization based on spot electricity prices and outdoor temperature
 */

const db = require('./db');
const nordpool = require('./nordpool-client');
const deviceManager = require('./devices/device-manager');

function log(...args) {
  console.log('[APC:SERVICE]', ...args);
}

function warn(...args) {
  console.warn('[APC:SERVICE]', ...args);
}

class ApcService {
  constructor() {
    this.currentDirective = 'NORMAL';
    this.activeDhwSlot = false;
    this.lastEvaluatedAt = 0;
    this.computedPlan = [];
    this.tickerInterval = null;
    this.wsBroadcast = null;
  }

  setWsBroadcast(fn) {
    this.wsBroadcast = fn;
  }

  setMqttClient(client) {
    deviceManager.setMqttClient(client);
  }

  start() {
    log('Starting APC Service...');
    // Initial evaluation
    this.evaluate();

    // Check every 60 seconds (catches 15-min quarter boundaries & price transitions)
    this.tickerInterval = setInterval(() => {
      this.evaluate();
    }, 60 * 1000);
  }

  stop() {
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
  }

  /**
   * Helper to retrieve current temperatures from DB state
   */
  getCurrentSensors() {
    const state = db.getFullState();
    const bufferTemp = state['main/Buffer_Temp']?.value ? parseFloat(state['main/Buffer_Temp'].value) : null;
    const dhwTemp = state['main/DHW_Temp']?.value ? parseFloat(state['main/DHW_Temp'].value) : null;
    const outsideTemp = state['main/Outside_Temp']?.value ? parseFloat(state['main/Outside_Temp'].value) : null;
    return { bufferTemp, dhwTemp, outsideTemp };
  }

  /**
   * Main evaluation loop: compute 24h plan, determine current directive, dispatch to devices
   */
  async evaluate() {
    try {
      const now = Date.now();
      const settings = db.getApcSettings();
      const { bufferTemp, dhwTemp, outsideTemp } = this.getCurrentSensors();

      // Get 24-36h window of prices
      const startWindow = now - 60 * 60 * 1000; // include 1h past
      const endWindow = now + 36 * 60 * 60 * 1000;
      const prices = nordpool.getPrices(startWindow, endWindow);

      const currentPriceObj = nordpool.getCurrentPrice();
      const currentPrice = currentPriceObj ? currentPriceObj.price / 10 : null;

      // Find cheapest DHW window in the next 24h
      const dhwHours = settings.dhw_duration_hours || 2;
      const cheapestDhw = nordpool.findCheapestWindow(dhwHours, now, now + 24 * 60 * 60 * 1000);

      // Compute 24h forecast plan (converts prices to c/kWh internally)
      this.computedPlan = this.generatePlan(prices, settings, cheapestDhw);

      // Check for active override
      let activeDirective = 'NORMAL';
      let reason = 'Normaali toiminta';
      let isDhwSlot = false;

      if (!settings.enabled) {
        activeDirective = 'NORMAL';
        reason = 'APC-älyohjain poissa päältä';
      } else if (settings.override_until && settings.override_until > now && settings.override_directive) {
        activeDirective = settings.override_directive;
        reason = `Käyttäjän manuaalinen ohitus voimassa (${new Date(settings.override_until).toLocaleTimeString('fi-FI')} asti)`;
      } else {
        // Evaluate based on current quarter plan
        const currentSlot = this.computedPlan.find(s => s.start_time <= now && s.end_time > now);
        if (currentSlot) {
          activeDirective = currentSlot.directive;
          reason = currentSlot.reason;
          isDhwSlot = currentSlot.is_dhw_slot;
        } else if (currentPrice != null) {
          // Fallback if slot not found in plan
          if (currentPrice <= settings.cheap_threshold_cents) {
            activeDirective = 'BOOST';
            reason = `Erittäin halpa sähkö (${currentPrice.toFixed(2)} snt/kWh)`;
          } else if (currentPrice >= settings.peak_threshold_cents) {
            activeDirective = 'SETBACK';
            reason = `Hintahuippu (${currentPrice.toFixed(2)} snt/kWh)`;
          }
        }
      }

      const prevDirective = this.currentDirective;
      this.currentDirective = activeDirective;
      this.activeDhwSlot = isDhwSlot;
      this.lastEvaluatedAt = now;

      // Dispatch to device drivers
      const context = {
        settings,
        price: currentPriceObj ? { ...currentPriceObj, price: currentPrice } : null,
        outsideTemp,
        bufferTemp,
        dhwTemp,
        isDhwSlot,
      };

      await deviceManager.dispatchDirective(activeDirective, context);

      // Log if directive changed or on periodic boundary
      if (prevDirective !== activeDirective) {
        db.insertApcLog({
          action: `Tila vaihtui: ${prevDirective} → ${activeDirective}`,
          reason,
          price_cents: currentPrice,
          outdoor_temp: outsideTemp,
          buffer_temp: bufferTemp,
          dhw_temp: dhwTemp,
          directive: activeDirective,
          details: { isDhwSlot, override: settings.override_until > now },
        });
      }

      // Broadcast update via WebSocket
      if (this.wsBroadcast) {
        this.wsBroadcast({
          type: 'apc_update',
          payload: this.getStatus(),
        });
      }
    } catch (err) {
      warn('Evaluation error:', err.message);
    }
  }

  /**
   * Generates a 24-hour visual plan of quarters with directives
   */
  /**
   * Generates a 24-hour visual plan of quarters with directives
   */
  generatePlan(rawPrices, settings, cheapestDhw) {
    if (!rawPrices || !rawPrices.length) return [];

    // Convert raw Nord Pool EUR/MWh prices to cents/kWh (snt/kWh)
    const prices = rawPrices.map(p => ({
      ...p,
      price: Math.round((p.price / 10) * 100) / 100,
    }));

    // Calculate stats for current 24h horizon in c/kWh
    const priceVals = prices.map(p => p.price);
    const minP = Math.min(...priceVals);
    const maxP = Math.max(...priceVals);
    const avgP = priceVals.reduce((a, b) => a + b, 0) / priceVals.length;
    const spread = Math.round((maxP - minP) * 100) / 100;

    // Minimum price spread needed to justify thermal shifting (COP loss tradeoff)
    // Mode-specific volatility thresholds in snt/kWh:
    // 'balanced': requires at least 2.5 snt/kWh spread
    // 'eco': requires at least 1.8 snt/kWh spread
    // 'comfort': requires at least 3.5 snt/kWh spread
    const minSpreadRequired = settings.mode === 'eco' ? 1.8 : settings.mode === 'comfort' ? 3.5 : 2.5;
    const isFlatHorizon = spread < minSpreadRequired && maxP < (settings.peak_threshold_cents || 20.0);

    return prices.map((p) => {
      const isDhwSlot = cheapestDhw && p.start_time >= cheapestDhw.start && p.end_time <= cheapestDhw.end;
      let directive = 'NORMAL';
      let reason = 'Normaali hintataso';
      let bufferShift = 0;
      let dhwTarget = 50;

      if (settings.mode === 'dhw_only') {
        if (isDhwSlot) {
          directive = 'DHW_CYCLE';
          reason = `Vuorokauden halvin käyttövesiaika (${p.price.toFixed(1)} snt/kWh)`;
          dhwTarget = settings.dhw_target_c || 55;
        }
      } else if (isFlatHorizon) {
        // Flat price horizon: thermal shifting does not save money due to Carnot COP penalty
        if (isDhwSlot) {
          directive = 'DHW_CYCLE';
          reason = `Tasainen hintataso (ero vain ${spread.toFixed(1)} snt) · Käyttöveden lataus`;
          dhwTarget = settings.dhw_target_c || 55;
        } else if (p.price < 0) {
          directive = 'BOOST';
          reason = `Negatiivinen sähkönhinta (${p.price.toFixed(1)} snt/kWh)`;
          bufferShift = settings.buffer_boost_c || 3;
        } else {
          directive = 'NORMAL';
          reason = `Tasainen hintataso (${spread.toFixed(1)} snt vaihtelu) · Optimaalinen COP & peruskäynti`;
          bufferShift = 0;
          dhwTarget = 50;
        }
      } else {
        // Volatile price horizon with actionable spread
        if (p.price < 0 || p.price <= (settings.cheap_threshold_cents || 3.0) || p.price <= avgP * 0.75) {
          directive = 'BOOST';
          reason = `Edullinen sähkö (${p.price.toFixed(1)} snt/kWh · ka. ${avgP.toFixed(1)})`;
          bufferShift = settings.buffer_boost_c || 3;
          dhwTarget = isDhwSlot ? (settings.dhw_target_c || 55) : 50;
        } else if (p.price >= (settings.peak_threshold_cents || 20.0) || (p.price >= avgP * 1.35 && p.price - minP >= minSpreadRequired)) {
          directive = 'SETBACK';
          reason = `Hintahuippu (${p.price.toFixed(1)} snt/kWh · ka. ${avgP.toFixed(1)})`;
          bufferShift = settings.buffer_setback_c || -2;
          dhwTarget = settings.dhw_min_c || 45;
        } else if (settings.mode === 'eco' && p.price > avgP && spread >= minSpreadRequired) {
          directive = 'ECO';
          reason = `Säästötila / keskiarvoa kalliimpi (${p.price.toFixed(1)} snt/kWh)`;
          bufferShift = -1;
        } else if (isDhwSlot) {
          directive = 'DHW_CYCLE';
          reason = `Ajoitettu käyttöveden lataus (${p.price.toFixed(1)} snt/kWh)`;
          dhwTarget = settings.dhw_target_c || 55;
        }
      }

      return {
        start_time: p.start_time,
        end_time: p.end_time,
        price: p.price,
        directive,
        reason,
        buffer_shift: bufferShift,
        dhw_target: dhwTarget,
        is_dhw_slot: !!isDhwSlot,
      };
    });
  }

  /**
   * Status payload for REST & WebSocket
   */
  getStatus() {
    const settings = db.getApcSettings();
    const { bufferTemp, dhwTemp, outsideTemp } = this.getCurrentSensors();
    const currentPriceObj = nordpool.getCurrentPrice();

    const prices = this.computedPlan.map(p => p.price);
    const minP = prices.length ? Math.min(...prices) : 0;
    const maxP = prices.length ? Math.max(...prices) : 0;
    const avgP = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const spread = Math.round((maxP - minP) * 100) / 100;
    const minSpreadRequired = settings.mode === 'eco' ? 1.8 : settings.mode === 'comfort' ? 3.5 : 2.5;
    const isFlatHorizon = spread < minSpreadRequired && maxP < (settings.peak_threshold_cents || 20.0);

    return {
      enabled: settings.enabled,
      mode: settings.mode,
      currentDirective: this.currentDirective,
      activeDhwSlot: this.activeDhwSlot,
      lastEvaluatedAt: this.lastEvaluatedAt,
      currentPrice: currentPriceObj ? currentPriceObj.price / 10 : null,
      sensors: { bufferTemp, dhwTemp, outsideTemp },
      settings,
      overrideActive: settings.override_until > Date.now(),
      overrideUntil: settings.override_until,
      overrideDirective: settings.override_directive,
      devices: deviceManager.getAllStatuses(),
      stats: {
        minPrice: minP,
        maxPrice: maxP,
        avgPrice: Math.round(avgP * 100) / 100,
        spread,
        isFlatHorizon,
      },
      plan: this.computedPlan.slice(0, 96), // next 24h (96 quarters)
    };
  }

  /**
   * Set manual override / snooze
   */
  async setOverride(durationHours = 2, directive = 'NORMAL') {
    const until = durationHours > 0 ? Date.now() + durationHours * 60 * 60 * 1000 : 0;
    db.updateApcSetting('override_until', until);
    db.updateApcSetting('override_directive', directive || 'NORMAL');

    db.insertApcLog({
      action: durationHours > 0 ? `Ohitus asetettu (${durationHours} h)` : 'Ohitus poistettu',
      reason: durationHours > 0 ? `Käyttäjä asetti tilan ${directive}` : 'Käyttäjä palautti automaation',
      directive: directive || 'NORMAL',
    });

    await this.evaluate();
    return this.getStatus();
  }

  /**
   * Update APC settings
   */
  async updateSettings(newSettings) {
    for (const [k, v] of Object.entries(newSettings)) {
      db.updateApcSetting(k, v);
    }
    await this.evaluate();
    return this.getStatus();
  }
}

module.exports = new ApcService();
