/**
 * Mitsubishi Air-to-Air Heat Pump (ILP) Driver
 * Direct ESPHome REST API integration with intelligent hybrid heating logic
 */

const http = require('http');
const db = require('../db');

function log(...args) {
  console.log('[APC:MITSUBISHI]', ...args);
}

function warn(...args) {
  console.warn('[APC:MITSUBISHI]', ...args);
}

class MitsubishiUnit {
  constructor({ id, name, host, climateName, defaultTarget = 21.0, manager }) {
    this.id = id;
    this.name = name;
    this.type = 'air_to_air_heat_pump';
    this.host = host;
    this.climateName = climateName;
    this.defaultTarget = defaultTarget;
    this.manager = manager;

    this.connected = false;
    this.lastSeen = 0;
    this.currentTemp = null;
    this.targetTemp = defaultTarget;
    this.mode = 'OFF';
    this.action = 'IDLE';
    this.fanMode = 'AUTO';
    this.swingMode = 'OFF';

    this.lastDirective = null;
    this.lastAppliedAt = 0;
    this.currentReason = 'Odottaa alustusta...';
  }

  async poll() {
    return new Promise((resolve) => {
      const path = `/climate/${encodeURIComponent(this.climateName)}`;
      const req = http.request(
        {
          hostname: this.host,
          port: 80,
          path,
          method: 'GET',
          timeout: 4000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(data);
                this.connected = true;
                this.lastSeen = Date.now();
                if (parsed.current_temperature != null) {
                  this.currentTemp = parseFloat(parsed.current_temperature);
                  db.updateState(`mitsubishi/${this.id}/current_temperature`, String(this.currentTemp));
                }
                if (parsed.target_temperature != null) {
                  this.targetTemp = parseFloat(parsed.target_temperature);
                  db.updateState(`mitsubishi/${this.id}/target_temperature`, String(this.targetTemp));
                }
                if (parsed.mode) {
                  this.mode = parsed.mode;
                  db.updateState(`mitsubishi/${this.id}/mode`, this.mode);
                }
                if (parsed.action) {
                  this.action = parsed.action;
                  db.updateState(`mitsubishi/${this.id}/action`, this.action);
                }
                if (parsed.fan_mode) {
                  this.fanMode = parsed.fan_mode;
                  db.updateState(`mitsubishi/${this.id}/fan_mode`, this.fanMode);
                }
                if (parsed.swing_mode) {
                  this.swingMode = parsed.swing_mode;
                  db.updateState(`mitsubishi/${this.id}/swing_mode`, this.swingMode);
                }
                db.updateState(`mitsubishi/${this.id}/connected`, '1');
                resolve({ success: true, data: parsed });
                return;
              } catch (e) {
                // Ignore parse error
              }
            }
            this.connected = false;
            db.updateState(`mitsubishi/${this.id}/connected`, '0');
            resolve({ success: false });
          });
        }
      );

      req.on('error', () => {
        this.connected = false;
        db.updateState(`mitsubishi/${this.id}/connected`, '0');
        resolve({ success: false });
      });

      req.on('timeout', () => {
        req.destroy();
        this.connected = false;
        db.updateState(`mitsubishi/${this.id}/connected`, '0');
        resolve({ success: false });
      });

      req.end();
    });
  }

  async setClimate({ mode, target_temperature, fan_mode, swing_mode }) {
    const params = new URLSearchParams();
    if (mode) params.append('mode', mode.toUpperCase());
    if (target_temperature != null) params.append('target_temperature', String(target_temperature));
    if (fan_mode) params.append('fan_mode', fan_mode.toUpperCase());
    if (swing_mode) params.append('swing_mode', swing_mode.toUpperCase());

    const queryString = params.toString();
    const path = `/climate/${encodeURIComponent(this.climateName)}/set?${queryString}`;

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.host,
          port: 80,
          path,
          method: 'POST',
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            log(`Sent command to ${this.name} (${this.host}): ${queryString} (Status: ${res.statusCode})`);
            if (mode) {
              this.mode = mode.toUpperCase();
              db.updateState(`mitsubishi/${this.id}/mode`, this.mode);
            }
            if (target_temperature != null) {
              this.targetTemp = Number(target_temperature);
              db.updateState(`mitsubishi/${this.id}/target_temperature`, String(this.targetTemp));
            }
            if (fan_mode) {
              this.fanMode = fan_mode.toUpperCase();
              db.updateState(`mitsubishi/${this.id}/fan_mode`, this.fanMode);
            }
            if (swing_mode) {
              this.swingMode = swing_mode.toUpperCase();
              db.updateState(`mitsubishi/${this.id}/swing_mode`, this.swingMode);
            }
            resolve({ ok: true, status: res.statusCode });
          });
        }
      );

      req.on('error', (err) => {
        warn(`Failed command to ${this.name} (${this.host}): ${err.message}`);
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout connecting to ${this.host}`));
      });

      req.end();
    });
  }

  async applyDirective(directive, context) {
    return this.manager.applyDirectiveForUnit(this, directive, context);
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      host: this.host,
      connected: this.connected,
      lastSeen: this.lastSeen,
      currentTemperature: this.currentTemp,
      targetTemperature: this.targetTemp,
      mode: this.mode,
      action: this.action,
      fanMode: this.fanMode,
      swingMode: this.swingMode,
      lastDirective: this.lastDirective,
      lastAppliedAt: this.lastAppliedAt,
      reason: this.currentReason,
    };
  }
}

class MitsubishiManager {
  constructor() {
    this.id = 'mitsubishi_manager';
    this.name = 'Mitsubishi ILP Manager';
    this.units = [
      new MitsubishiUnit({
        id: 'mitsubishi_alakerta',
        name: 'Mitsubishi ILP Alakerta',
        host: process.env.MITSU_ALAKERTA_HOST || 'mitsubishi-alakerta.local',
        climateName: 'Mitsubishi Alakerta',
        defaultTarget: 21.0,
        manager: this,
      }),
      new MitsubishiUnit({
        id: 'mitsubishi_ylakerta',
        name: 'Mitsubishi ILP Yläkerta',
        host: process.env.MITSU_YLAKERTA_HOST || '192.168.68.64',
        climateName: 'Mitsubishi Yläkerta',
        defaultTarget: 21.0,
        manager: this,
      }),
    ];

    this.pollIntervalMs = 15000;
    this.pollTimer = null;
    this.wsBroadcast = null;
    this.currentReason = 'Alustetaan hybridi-ohjausta...';
    this.lastAppliedAt = 0;

    this.startPolling();
  }

  setWsBroadcast(fn) {
    this.wsBroadcast = fn;
  }

  startPolling() {
    this.pollAll();
    this.pollTimer = setInterval(() => {
      this.pollAll();
    }, this.pollIntervalMs);
  }

  async pollAll() {
    for (const unit of this.units) {
      try {
        await unit.poll();
      } catch (err) {
        // Handled inside unit.poll()
      }
    }
  }

  async applyDirectiveForUnit(unit, directive, context) {
    const settings = db.getApcSettings();
    const now = Date.now();

    const mode = settings.mitsu_mode || 'smart_assist'; // 'smart_assist' | 'fan_only' | 'cool' | 'heat' | 'off'
    const frostAssistTemp = settings.mitsu_frost_assist_temp != null ? Number(settings.mitsu_frost_assist_temp) : -12.0;
    const maxPriceLimit = settings.mitsu_max_price_cents != null ? Number(settings.mitsu_max_price_cents) : 20.0;
    const heatTarget = settings.mitsu_heat_target_c != null ? Number(settings.mitsu_heat_target_c) : 21.0;
    const coolTarget = settings.mitsu_cool_target_c != null ? Number(settings.mitsu_cool_target_c) : 23.0;

    const overrideUntil = Number(settings.mitsu_override_until || 0);
    const rawOverrideState = settings.mitsu_override_state || null;
    const isOverrideActive = overrideUntil > now && Boolean(rawOverrideState);

    let targetMode = 'OFF';
    let targetTemp = heatTarget;
    let targetFan = 'AUTO';
    let reason = '';

    // ── 1. Manual Override takes highest precedence ─────────────────────────────
    if (isOverrideActive) {
      const minLeft = Math.ceil((overrideUntil - now) / 60000);
      let parsed = null;
      if (typeof rawOverrideState === 'object') {
        parsed = rawOverrideState;
      } else {
        try {
          parsed = JSON.parse(rawOverrideState);
        } catch {
          parsed = { mode: String(rawOverrideState).toUpperCase() };
        }
      }

      targetMode = (parsed?.mode || 'HEAT').toUpperCase();
      targetTemp = parsed?.target_temp != null ? Number(parsed.target_temp) : (targetMode === 'COOL' ? coolTarget : heatTarget);
      targetFan = parsed?.fan_mode || 'AUTO';
      reason = `Manuaalinen ohitus aktiivinen (${targetMode} ${targetTemp}°C · jäljellä ~${minLeft} min)`;
    }
    // ── 2. Fixed Constant Modes ────────────────────────────────────────────────
    else if (mode === 'off') {
      targetMode = 'OFF';
      reason = 'Sammutettu (Käyttäjän asetus)';
    } else if (mode === 'fan_only') {
      targetMode = 'FAN_ONLY';
      targetFan = 'MEDIUM';
      reason = 'Takkatoiminto / Ilmankierto aktiivinen · Kompressori sammutettu, kierrättää lämpöä';
    } else if (mode === 'cool') {
      targetMode = 'COOL';
      targetTemp = coolTarget;
      reason = `Kesäviilennys aktiivinen (pyynti ${coolTarget.toFixed(1)}°C)`;
    } else if (mode === 'heat') {
      targetMode = 'HEAT';
      targetTemp = heatTarget;
      reason = `Jatkuva lämmitys pakotettu päälle (pyynti ${heatTarget.toFixed(1)}°C)`;
    }
    // ── 3. Intelligent Hybrid Strategy ('smart_assist') ────────────────────────
    else {
      const fullState = db.getFullState();
      const outdoorTemp = context?.outdoorTemp != null
        ? Number(context.outdoorTemp)
        : (parseFloat(fullState['main/Outside_Temp']?.value) || null);
      const currentPriceCents = context?.price?.price != null ? Number(context.price.price) : null;

      if (outdoorTemp != null && outdoorTemp <= frostAssistTemp) {
        if (currentPriceCents != null && currentPriceCents > maxPriceLimit) {
          targetMode = 'OFF';
          reason = `Pakkasavustus valmiudessa (${outdoorTemp.toFixed(1)}°C ≤ ${frostAssistTemp.toFixed(1)}°C), mutta pörssisähkö liian kallista (${currentPriceCents.toFixed(1)} > ${maxPriceLimit.toFixed(1)} snt/kWh) · Ei herätetä`;
        } else {
          targetMode = 'HEAT';
          targetTemp = heatTarget;
          targetFan = 'MEDIUM';
          const priceStr = currentPriceCents != null ? `${currentPriceCents.toFixed(1)} snt/kWh` : '';
          reason = `🛡️ Pakkasavustus aktiivinen (${outdoorTemp.toFixed(1)}°C ≤ ${frostAssistTemp.toFixed(1)}°C ${priceStr}) · Korvaa kalliit sähkövastukset ja tukee VILP-pumppua`;
        }
      } else {
        targetMode = 'OFF';
        const tempStr = outdoorTemp != null ? `${outdoorTemp.toFixed(1)}°C > ${frostAssistTemp.toFixed(1)}°C` : 'lauha sää';
        reason = `⏸️ Valmiustila · Vesikiertoinen lattialämmitys (VILP) ensisijainen (${tempStr}). Estetään lattiatermostaattien sulkeutuminen ja VILP-katkokäynti`;
      }
    }

    unit.currentReason = reason;
    this.currentReason = reason;

    // Apply command to unit if connected and differs
    if (unit.connected) {
      const modeDiffers = unit.mode !== targetMode;
      const tempDiffers = targetMode !== 'OFF' && Math.abs((unit.targetTemp || 0) - targetTemp) >= 0.5;
      const fanDiffers = targetMode !== 'OFF' && targetFan !== 'AUTO' && unit.fanMode !== targetFan;

      if (modeDiffers || tempDiffers || fanDiffers) {
        log(`⚡ ${unit.name} ohjaus: ${unit.mode} (${unit.targetTemp}°C) -> ${targetMode} (${targetTemp}°C) [Syy: ${reason}]`);
        try {
          await unit.setClimate({
            mode: targetMode,
            target_temperature: targetMode !== 'OFF' && targetMode !== 'FAN_ONLY' ? targetTemp : undefined,
            fan_mode: targetMode !== 'OFF' ? targetFan : undefined,
          });
        } catch (err) {
          warn(`Virhe ohjattaessa laitetta ${unit.name}: ${err.message}`);
        }
      }
    }

    db.updateState('apc/mitsu/reason', reason);
    db.updateState('apc/mitsu/mode', mode);
    db.updateState('apc/mitsu/frost_assist_temp', String(frostAssistTemp));
    db.updateState('apc/mitsu/max_price_cents', String(maxPriceLimit));

    unit.lastDirective = directive;
    unit.lastAppliedAt = now;
    this.lastAppliedAt = now;

    return {
      driver: unit.id,
      name: unit.name,
      connected: unit.connected,
      state: targetMode,
      targetTemp,
      mode,
      reason,
      overrideActive: isOverrideActive,
    };
  }

  async setManualOverride(mode, durationHours = 0, targetTemp = null) {
    const now = Date.now();
    let overrideUntil = 0;
    let overrideState = null;

    if (mode && ['HEAT', 'COOL', 'FAN_ONLY', 'OFF'].includes(mode.toUpperCase())) {
      const hours = Number(durationHours) || 0;
      overrideUntil = hours > 0 ? now + hours * 3600 * 1000 : now + 24 * 3600 * 1000;
      overrideState = {
        mode: mode.toUpperCase(),
        target_temp: targetTemp ? Number(targetTemp) : (mode.toUpperCase() === 'COOL' ? 23.0 : 21.0),
        fan_mode: 'AUTO',
      };
    }

    db.updateApcSetting('mitsu_override_state', overrideState ? JSON.stringify(overrideState) : '');
    db.updateApcSetting('mitsu_override_until', String(overrideUntil));

    for (const unit of this.units) {
      if (unit.connected) {
        if (overrideState) {
          await unit.setClimate({
            mode: overrideState.mode,
            target_temperature: overrideState.mode !== 'FAN_ONLY' ? overrideState.target_temp : undefined,
            fan_mode: overrideState.fan_mode,
          }).catch(() => {});
        } else {
          await this.applyDirectiveForUnit(unit, 'NORMAL', {});
        }
      }
    }

    return this.getStatus();
  }

  async setSettings({ mitsu_mode, mitsu_frost_assist_temp, mitsu_max_price_cents, mitsu_heat_target_c, mitsu_cool_target_c }) {
    if (mitsu_mode && ['smart_assist', 'fan_only', 'cool', 'heat', 'off'].includes(mitsu_mode)) {
      db.updateApcSetting('mitsu_mode', mitsu_mode);
      // When explicitly choosing a global mode, clear any manual override
      db.updateApcSetting('mitsu_override_state', '');
      db.updateApcSetting('mitsu_override_until', '0');
    }
    if (mitsu_frost_assist_temp != null) {
      const t = parseFloat(mitsu_frost_assist_temp);
      if (!isNaN(t)) db.updateApcSetting('mitsu_frost_assist_temp', String(t));
    }
    if (mitsu_max_price_cents != null) {
      const p = parseFloat(mitsu_max_price_cents);
      if (!isNaN(p)) db.updateApcSetting('mitsu_max_price_cents', String(p));
    }
    if (mitsu_heat_target_c != null) {
      const t = parseFloat(mitsu_heat_target_c);
      if (!isNaN(t)) db.updateApcSetting('mitsu_heat_target_c', String(t));
    }
    if (mitsu_cool_target_c != null) {
      const t = parseFloat(mitsu_cool_target_c);
      if (!isNaN(t)) db.updateApcSetting('mitsu_cool_target_c', String(t));
    }

    for (const unit of this.units) {
      if (unit.connected) {
        await this.applyDirectiveForUnit(unit, 'NORMAL', {});
      }
    }

    return this.getStatus();
  }

  getStatus() {
    const settings = db.getApcSettings();
    const now = Date.now();
    const overrideUntil = Number(settings.mitsu_override_until || 0);
    const isOverrideActive = overrideUntil > now && Boolean(settings.mitsu_override_state);
    const overrideMinRemaining = isOverrideActive ? Math.ceil((overrideUntil - now) / 60000) : 0;

    let parsedOverrideState = null;
    if (settings.mitsu_override_state) {
      try {
        parsedOverrideState = typeof settings.mitsu_override_state === 'object'
          ? settings.mitsu_override_state
          : JSON.parse(settings.mitsu_override_state);
      } catch (e) {
        parsedOverrideState = { mode: settings.mitsu_override_state };
      }
    }

    const fullState = db.getFullState();
    const outdoorTemp = parseFloat(fullState['main/Outside_Temp']?.value) || null;

    return {
      driver: this.id,
      name: this.name,
      units: this.units.map((u) => u.getStatus()),
      settings: {
        mode: settings.mitsu_mode || 'smart_assist',
        frostAssistTemp: settings.mitsu_frost_assist_temp != null ? Number(settings.mitsu_frost_assist_temp) : -12.0,
        maxPriceLimit: settings.mitsu_max_price_cents != null ? Number(settings.mitsu_max_price_cents) : 20.0,
        heatTarget: settings.mitsu_heat_target_c != null ? Number(settings.mitsu_heat_target_c) : 21.0,
        coolTarget: settings.mitsu_cool_target_c != null ? Number(settings.mitsu_cool_target_c) : 23.0,
      },
      overrideActive: isOverrideActive,
      overrideUntil,
      overrideState: parsedOverrideState,
      overrideMinutesRemaining: overrideMinRemaining,
      reason: this.currentReason,
      lastAppliedAt: this.lastAppliedAt,
      outdoorTemp,
    };
  }
}

const manager = new MitsubishiManager();

module.exports = {
  MitsubishiDriver: MitsubishiManager,
  driver: manager,
  unit1: manager.units[0],
  unit2: manager.units[1],
};
