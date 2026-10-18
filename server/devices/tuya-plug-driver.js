/**
 * Energy+ Smart Plug Driver (Tuya / Smart Life WiFi Plug with Energy Monitoring)
 *
 * Automatically monitors Nord Pool spot prices and enforces price cutoff rules:
 *  - When spot price > max_price_cents (e.g. 15.0 c/kWh), cuts off power ('OFF')
 *  - When spot price <= max_price_cents, restores power ('ON')
 *  - Supports manual overrides (1h, 2h, 4h, until tomorrow, or permanent)
 *  - Live telemetry: power (W), voltage (V), current (A), energy (kWh)
 *  - Full SQLite state synchronization and APC directive integration
 */

const db = require('../db');
const tuyaService = require('./tuya-service');

function log(...args) {
  console.log('[TUYA_PLUG_DRIVER]', ...args);
}

function warn(...args) {
  console.warn('[TUYA_PLUG_DRIVER]', ...args);
}

class TuyaPlugDriver {
  constructor() {
    this.id = 'tuya_plug';
    this.name = 'Energy+ Älypistorasia (Tuya)';
    this.type = 'smart_plug';
    this.deviceId = 'bf48a78786f87488b4otcg';
    this.lastState = null;
    this.lastAppliedDirective = null;
    this.lastAppliedAt = 0;
    this.currentReason = 'Alustetaan älypistorasian ohjainta...';
  }

  /**
   * Helper to send command to Tuya relay
   */
  async sendCommand(state) {
    const val = state === 'ON' || state === 1 || state === true;
    const targetStr = val ? 'ON' : 'OFF';
    try {
      const settings = db.getApcSettings();
      const devId = settings.tuya_plug_device_id || this.deviceId;
      await tuyaService.setSwitchPower(devId, val);

      // Sync state immediately in SQLite DB
      db.updateState('tuya/energy_alypistorasia/state', val ? 'true' : 'false');
      db.updateState('tuya/energy_alypistorasia/switch', val ? '1' : '0');
      db.updateState('tuya/energy_alypistorasia_home_connect_ip20/state', val ? 'true' : 'false');
      db.updateState('tuya/energy_alypistorasia_home_connect_ip20/switch_1', val ? 'true' : 'false');
      db.updateState('apc/tuya_plug/state', targetStr);
      this.lastState = targetStr;
      return true;
    } catch (err) {
      warn(`Command failed for Energy+ plug = ${targetStr}:`, err.message);
      return false;
    }
  }

  /**
   * Evaluate and apply spot price strategy during APC evaluation loop
   * @param {string} directive - BOOST | NORMAL | SETBACK | ECO
   * @param {object} context - { settings, price, outdoorTemp, bufferTemp, dhwTemp }
   */
  async applyDirective(directive, context) {
    const settings = db.getApcSettings();
    const now = Date.now();

    // Read current hardware state from DB
    const fullState = db.getFullState();
    const currentStatRaw = fullState['tuya/energy_alypistorasia/state']?.value ??
                           fullState['tuya/energy_alypistorasia_home_connect_ip20/state']?.value;
    const currentStat = (currentStatRaw === 'true' || currentStatRaw === '1' || currentStatRaw === 'ON' || this.lastState === 'ON') ? 'ON' : 'OFF';

    const mode = settings.tuya_plug_mode || 'auto'; // 'auto' | 'constant_on' | 'constant_off'
    const overrideUntil = Number(settings.tuya_plug_override_until || 0);
    const overrideState = settings.tuya_plug_override_state || null;
    const isOverrideActive = overrideUntil > now && overrideState != null;

    const maxPriceLimit = settings.tuya_plug_max_price_cents != null
      ? Number(settings.tuya_plug_max_price_cents)
      : 15.0;

    // Current spot price in c/kWh (already normalized in APC context)
    const currentPriceCents = context?.price?.price != null ? Number(context.price.price) : null;

    let targetState = 'OFF';
    let reason = 'Alustetaan hintastrategiaa...';

    // ── 1. Manual Override takes precedence ────────────────────────────────────
    if (isOverrideActive) {
      targetState = overrideState;
      const minLeft = Math.ceil((overrideUntil - now) / 60000);
      reason = `Manuaalinen ohitus aktiivinen (${targetState === 'ON' ? 'Pakotettu PÄÄLLE' : 'Pakotettu POIS'} · jäljellä ~${minLeft} min)`;
    }
    // ── 2. Fixed Constant Modes ─────────────────────────────────────────────
    else if (mode === 'constant_on') {
      targetState = 'ON';
      reason = 'Jatkuvasti päällä (Manuaalinen asetus)';
    } else if (mode === 'constant_off') {
      targetState = 'OFF';
      reason = 'Jatkuvasti pois päältä (Manuaalinen asetus)';
    }
    // ── 3. Spot Price Automation ('auto') ─────────────────────────────────────
    else {
      if (currentPriceCents != null && currentPriceCents > maxPriceLimit) {
        targetState = 'OFF';
        reason = `Pörssisähkö kallista (${currentPriceCents.toFixed(1)} snt > ${maxPriceLimit.toFixed(1)} snt/kWh) · Sähköt katkaistu`;
      } else {
        targetState = 'ON';
        const priceLabel = currentPriceCents != null ? `${currentPriceCents.toFixed(1)} snt/kWh` : 'normaali';
        reason = `Pörssisähkö edullista (${priceLabel} ≤ ${maxPriceLimit.toFixed(1)} snt/kWh) · Sähköt päällä`;
      }
    }

    this.currentReason = reason;

    // Apply command if target state differs from last state
    if (this.lastState === null || this.lastState !== targetState || currentStat !== targetState) {
      log(`⚡ Energy+ Älypistorasia tilamuutos: ${this.lastState || currentStat} -> ${targetState} (Syy: ${reason})`);
      await this.sendCommand(targetState);
    }

    db.updateState('apc/tuya_plug/reason', reason);
    db.updateState('apc/tuya_plug/max_price_cents', String(maxPriceLimit));
    db.updateState('apc/tuya_plug/mode', mode);

    this.lastAppliedDirective = directive;
    this.lastAppliedAt = now;

    return {
      driver: this.id,
      name: this.name,
      type: this.type,
      state: targetState,
      isOn: targetState === 'ON',
      mode,
      maxPriceLimit,
      currentPriceCents,
      reason,
      overrideActive: isOverrideActive,
    };
  }

  /**
   * Set manual override
   */
  async setManualOverride(state, durationHours = 0) {
    const now = Date.now();
    let overrideUntil = 0;
    let overrideState = null;

    if (state && (state === 'ON' || state === 'OFF')) {
      overrideState = state;
      const hours = Number(durationHours) || 0;
      overrideUntil = hours > 0 ? now + hours * 3600 * 1000 : now + 24 * 3600 * 1000;
    }

    db.updateApcSetting('tuya_plug_override_state', overrideState || '');
    db.updateApcSetting('tuya_plug_override_until', String(overrideUntil));

    if (overrideState) {
      await this.sendCommand(overrideState === 'ON');
      const minLeft = Math.ceil((overrideUntil - now) / 60000);
      this.currentReason = `Manuaalinen ohitus aktivoitu (${overrideState} · jäljellä ~${minLeft} min)`;
    } else {
      this.currentReason = 'Manuaalinen ohitus peruttu · Palattu pörssiohjaukseen';
    }

    return this.getStatus();
  }

  /**
   * Update configuration settings
   */
  async setSettings({ mode, max_price_cents, device_id }) {
    if (mode && ['auto', 'constant_on', 'constant_off'].includes(mode)) {
      db.updateApcSetting('tuya_plug_mode', mode);
    }
    if (max_price_cents !== undefined && max_price_cents !== null) {
      const p = parseFloat(max_price_cents);
      if (!isNaN(p)) {
        db.updateApcSetting('tuya_plug_max_price_cents', String(p));
      }
    }
    if (device_id) {
      db.updateApcSetting('tuya_plug_device_id', device_id);
      this.deviceId = device_id;
    }
    return this.getStatus();
  }

  /**
   * Read live status and telemetry
   */
  getStatus() {
    const settings = db.getApcSettings();
    const now = Date.now();
    const devId = settings.tuya_plug_device_id || this.deviceId;

    const dev = tuyaService.devicesById?.get(devId) ||
                tuyaService.devices?.find(d => d.id === devId || (d.name && d.name.toLowerCase().includes('energy+')));

    const fullState = db.getFullState();
    const currentStatRaw = fullState['tuya/energy_alypistorasia/state']?.value ??
                           fullState['tuya/energy_alypistorasia_home_connect_ip20/state']?.value;
    const currentState = (currentStatRaw === 'true' || currentStatRaw === '1' || currentStatRaw === 'ON' || this.lastState === 'ON') ? 'ON' : 'OFF';

    const overrideUntil = Number(settings.tuya_plug_override_until || 0);
    const overrideState = settings.tuya_plug_override_state || null;
    const isOverrideActive = overrideUntil > now && overrideState != null;
    const overrideMinRemaining = isOverrideActive ? Math.ceil((overrideUntil - now) / 60000) : 0;

    const maxPriceLimit = settings.tuya_plug_max_price_cents != null
      ? Number(settings.tuya_plug_max_price_cents)
      : 15.0;

    const power = dev?.properties?.power != null ? Number(dev.properties.power) : (parseFloat(fullState['tuya/energy_alypistorasia_home_connect_ip20/power']?.value) || 0);
    const voltage = dev?.properties?.voltage != null ? Number(dev.properties.voltage) : (parseFloat(fullState['tuya/energy_alypistorasia_home_connect_ip20/voltage']?.value) || 0);
    const current = dev?.properties?.current != null ? Number(dev.properties.current) : (parseFloat(fullState['tuya/energy_alypistorasia_home_connect_ip20/current']?.value) || 0);
    const energy = dev?.properties?.energy != null ? Number(dev.properties.energy) : (parseFloat(fullState['tuya/energy_alypistorasia_home_connect_ip20/energy']?.value) || 0);

    return {
      driver: this.id,
      name: this.name,
      type: this.type,
      deviceId: devId,
      connected: Boolean(dev?.online !== false),
      currentState,
      isOn: currentState === 'ON',
      mode: settings.tuya_plug_mode || 'auto',
      maxPriceLimit,
      overrideActive: isOverrideActive,
      overrideUntil,
      overrideState,
      overrideMinutesRemaining: overrideMinRemaining,
      reason: this.currentReason,
      lastAppliedAt: this.lastAppliedAt,
      telemetry: {
        power_w: power,
        voltage_v: voltage,
        current_a: current,
        today_energy_kwh: energy,
      },
    };
  }
}

const tuyaPlugDriver = new TuyaPlugDriver();
module.exports = tuyaPlugDriver;
