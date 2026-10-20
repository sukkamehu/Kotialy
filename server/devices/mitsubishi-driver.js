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

    this.overrideUntil = 0;
    this.overrideState = null;
    this.lastCommandSentAt = 0;

    // Restore persisted state from DB
    try {
      const fullState = db.getFullState();
      const savedTemp = parseFloat(fullState[`mitsubishi/${this.id}/target_temperature`]?.value);
      if (!isNaN(savedTemp) && savedTemp >= 16 && savedTemp <= 31) {
        this.targetTemp = savedTemp;
      }
      const savedUntil = parseInt(fullState[`mitsubishi/${this.id}/override_until`]?.value, 10);
      const savedState = fullState[`mitsubishi/${this.id}/override_state`]?.value;
      if (!isNaN(savedUntil) && savedUntil > Date.now() && savedState) {
        this.overrideUntil = savedUntil;
        try {
          this.overrideState = JSON.parse(savedState);
        } catch {
          this.overrideState = null;
        }
      }
    } catch {
      // Ignore during initial boot
    }
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
                const wasConnected = this.connected;
                const hadSeenBefore = this.lastSeen > 0;
                this.connected = true;
                const now = Date.now();
                this.lastSeen = now;

                if (parsed.current_temperature != null) {
                  this.currentTemp = parseFloat(parsed.current_temperature);
                  db.updateState(`mitsubishi/${this.id}/current_temperature`, String(this.currentTemp));
                  db.updateState(`mitsubishi/${this.id}/temperature`, String(this.currentTemp));
                  db.maybeAppendHistory(`mitsubishi/${this.id}/current_temperature`, this.currentTemp, 60000);
                  db.maybeAppendHistory(`mitsubishi/${this.id}/temperature`, this.currentTemp, 60000);
                }

                const prevMode = this.mode;
                const prevTarget = this.targetTemp;
                const prevFan = this.fanMode;

                const newMode = parsed.mode ? parsed.mode.toUpperCase() : this.mode;
                const newTarget = parsed.target_temperature != null ? parseFloat(parsed.target_temperature) : this.targetTemp;
                const newFan = parsed.fan_mode ? parsed.fan_mode.toUpperCase() : this.fanMode;

                // ── External IR Remote Controller & Web UI Change Detection ──────
                const isRecentKotiälyCommand = (now - this.lastCommandSentAt) < 25000;
                if (hadSeenBefore && wasConnected && !isRecentKotiälyCommand && prevMode) {
                  const modeChanged = prevMode !== newMode;
                  const tempChanged = prevTarget != null && newTarget != null && Math.abs(prevTarget - newTarget) >= 0.5 && newMode !== 'FAN_ONLY' && newMode !== 'OFF';
                  const fanChanged = prevFan && newFan && prevFan !== newFan && newMode !== 'OFF';

                  if (prevMode === 'OFF' && newMode !== 'OFF') {
                    // Pumppu käynnistetty kaukosäätimellä tai ESPHome-sivulta!
                    // Lukitaan 3 tunnin manuaaliohitus, jotta Kotiälyn APC ei sammuta sitä heti minuutin kuluttua.
                    this.overrideUntil = now + 3 * 3600 * 1000;
                    this.overrideState = {
                      mode: newMode,
                      target_temp: newTarget,
                      fan_mode: newFan,
                      source: 'remote',
                    };
                    db.updateState(`mitsubishi/${this.id}/override_until`, String(this.overrideUntil));
                    db.updateState(`mitsubishi/${this.id}/override_state`, JSON.stringify(this.overrideState));
                    log(`📱 Kaukosäädin havaittu (${this.name}): käynnistetty tilaan ${newMode} (${newTarget}°C, ${newFan}) -> Lukitaan ohitus 3h`);
                  } else if (prevMode !== 'OFF' && newMode === 'OFF') {
                    // Pumppu sammutettu kaukosäätimellä
                    if (this.overrideUntil > now) {
                      this.overrideUntil = 0;
                      this.overrideState = null;
                      db.updateState(`mitsubishi/${this.id}/override_until`, '0');
                      db.updateState(`mitsubishi/${this.id}/override_state`, '');
                      log(`📱 Kaukosäädin havaittu (${this.name}): sammutettu kaukosäätimellä -> Ohitus vapautettu`);
                    }
                  } else if (newMode !== 'OFF' && (modeChanged || tempChanged || fanChanged)) {
                    // Käynnissä olevan pumpun asetuksia muutettu kaukosäätimellä
                    this.overrideUntil = now + 3 * 3600 * 1000;
                    this.overrideState = {
                      mode: newMode,
                      target_temp: newTarget,
                      fan_mode: newFan,
                      source: 'remote',
                    };
                    db.updateState(`mitsubishi/${this.id}/override_until`, String(this.overrideUntil));
                    db.updateState(`mitsubishi/${this.id}/override_state`, JSON.stringify(this.overrideState));
                    log(`📱 Kaukosäädin havaittu (${this.name}): tila/asetus muutettu -> ${newMode} (${newTarget}°C, ${newFan}) -> Lukitaan ohitus 3h`);
                  }
                }

                if (parsed.target_temperature != null) {
                  this.targetTemp = parseFloat(parsed.target_temperature);
                  db.updateState(`mitsubishi/${this.id}/target_temperature`, String(this.targetTemp));
                  db.maybeAppendHistory(`mitsubishi/${this.id}/target_temperature`, this.targetTemp, 60000);
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
    this.lastCommandSentAt = Date.now();
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
              db.maybeAppendHistory(`mitsubishi/${this.id}/target_temperature`, this.targetTemp, 60000);
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
    const now = Date.now();
    const isOverrideActive = this.overrideUntil > now && Boolean(this.overrideState);
    const overrideMinRemaining = isOverrideActive ? Math.ceil((this.overrideUntil - now) / 60000) : 0;

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
      overrideActive: isOverrideActive,
      overrideUntil: this.overrideUntil,
      overrideState: this.overrideState,
      overrideMinutesRemaining: overrideMinRemaining,
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
        host: process.env.MITSU_ALAKERTA_HOST || '192.168.68.65',
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

    const globalMode = settings.mitsu_mode || 'smart_assist'; // 'smart_assist' | 'fan_only' | 'cool' | 'heat' | 'off'
    const frostAssistTemp = settings.mitsu_frost_assist_temp != null ? Number(settings.mitsu_frost_assist_temp) : -12.0;
    const maxPriceLimit = settings.mitsu_max_price_cents != null ? Number(settings.mitsu_max_price_cents) : 20.0;
    const heatTarget = settings.mitsu_heat_target_c != null ? Number(settings.mitsu_heat_target_c) : 21.0;
    const coolTarget = settings.mitsu_cool_target_c != null ? Number(settings.mitsu_cool_target_c) : 23.0;

    const globalOverrideUntil = Number(settings.mitsu_override_until || 0);
    const rawGlobalOverrideState = settings.mitsu_override_state || null;
    const isGlobalOverrideActive = globalOverrideUntil > now && Boolean(rawGlobalOverrideState);

    const isUnitOverrideActive = unit.overrideUntil > now && Boolean(unit.overrideState);

    let targetMode = 'OFF';
    let targetTemp = unit.targetTemp || heatTarget;
    let targetFan = unit.fanMode || 'AUTO';
    let reason = '';

    // ── 1. Unit-specific Manual Override (Highest priority for this pump) ───────
    if (isUnitOverrideActive) {
      const minLeft = Math.ceil((unit.overrideUntil - now) / 60000);
      const parsed = unit.overrideState;
      targetMode = (parsed.mode || 'HEAT').toUpperCase();
      targetTemp = parsed.target_temp != null ? Number(parsed.target_temp) : (targetMode === 'COOL' ? coolTarget : (unit.targetTemp || heatTarget));
      targetFan = parsed.fan_mode || unit.fanMode || 'AUTO';
      const sourceLabel = parsed.source === 'remote' ? 'Kaukosäädin' : 'Manuaalinen ohitus';
      if (targetMode === 'FAN_ONLY') {
        reason = `${sourceLabel} aktiivinen (Puhallus / Takkakierto · jäljellä ~${minLeft} min)`;
      } else if (targetMode === 'OFF') {
        reason = `${sourceLabel} aktiivinen (Pois päältä · jäljellä ~${minLeft} min)`;
      } else {
        reason = `${sourceLabel} aktiivinen (${targetMode} ${targetTemp}°C · jäljellä ~${minLeft} min)`;
      }
    }
    // ── 2. Global House-wide Override ───────────────────────────────────────────
    else if (isGlobalOverrideActive) {
      const minLeft = Math.ceil((globalOverrideUntil - now) / 60000);
      let parsed = null;
      try {
        parsed = typeof rawGlobalOverrideState === 'object' ? rawGlobalOverrideState : JSON.parse(rawGlobalOverrideState);
      } catch {
        parsed = { mode: String(rawGlobalOverrideState).toUpperCase() };
      }
      targetMode = (parsed?.mode || 'HEAT').toUpperCase();
      targetTemp = parsed?.target_temp != null ? Number(parsed.target_temp) : (targetMode === 'COOL' ? coolTarget : (unit.targetTemp || heatTarget));
      targetFan = parsed?.fan_mode || 'AUTO';
      reason = `Yleinen pika-ohitus aktiivinen (${targetMode} ${targetTemp}°C · jäljellä ~${minLeft} min)`;
    }
    // ── 3. Global Fixed Modes ──────────────────────────────────────────────────
    else if (globalMode === 'off') {
      targetMode = 'OFF';
      reason = 'Sammutettu (Käyttäjän asetus)';
    } else if (globalMode === 'fan_only') {
      targetMode = 'FAN_ONLY';
      targetFan = unit.fanMode && unit.fanMode !== 'AUTO' ? unit.fanMode : 'MEDIUM';
      reason = 'Takkatoiminto / Ilmankierto aktiivinen · Kompressori sammutettu, kierrättää lämpöä';
    } else if (globalMode === 'cool') {
      targetMode = 'COOL';
      targetTemp = unit.targetTemp || coolTarget;
      reason = `Kesäviilennys aktiivinen (pyynti ${targetTemp.toFixed(1)}°C)`;
    } else if (globalMode === 'heat') {
      targetMode = 'HEAT';
      targetTemp = unit.targetTemp || heatTarget;
      reason = `Jatkuva lämmitys pakotettu päälle (pyynti ${targetTemp.toFixed(1)}°C)`;
    }
    // ── 4. Intelligent Hybrid Strategy ('smart_assist') ────────────────────────
    else {
      const fullState = db.getFullState();
      const outdoorTemp = context?.outdoorTemp != null
        ? Number(context.outdoorTemp)
        : (parseFloat(fullState['main/Outside_Temp']?.value) || null);
      const currentPriceCents = context?.price?.price != null ? Number(context.price.price) : null;

      if (outdoorTemp != null && outdoorTemp <= frostAssistTemp) {
        if (currentPriceCents != null && currentPriceCents > maxPriceLimit) {
          if (unit.mode === 'FAN_ONLY') {
            targetMode = 'FAN_ONLY';
            targetFan = unit.fanMode || 'AUTO';
            reason = '🌀 Takkatoiminto / Ilmankierto käynnissä · Kierrättää takan lämpöä ilman kompressoria';
          } else {
            targetMode = 'OFF';
            reason = `Pakkasavustus valmiudessa (${outdoorTemp.toFixed(1)}°C ≤ ${frostAssistTemp.toFixed(1)}°C), mutta pörssisähkö liian kallista (${currentPriceCents.toFixed(1)} > ${maxPriceLimit.toFixed(1)} snt/kWh) · Ei herätetä`;
          }
        } else {
          targetMode = 'HEAT';
          targetTemp = unit.targetTemp || heatTarget;
          targetFan = unit.fanMode && unit.fanMode !== 'AUTO' ? unit.fanMode : 'MEDIUM';
          const priceStr = currentPriceCents != null ? `${currentPriceCents.toFixed(1)} snt/kWh` : '';
          reason = `🛡️ Pakkasavustus aktiivinen (${outdoorTemp.toFixed(1)}°C ≤ ${frostAssistTemp.toFixed(1)}°C ${priceStr}) · Korvaa kalliit sähkövastukset ja tukee VILP-pumppua`;
        }
      } else {
        // Leuto sää (> -12°C): VILP hoitaa lämmityksen.
        // Takkatoiminnossa (FAN_ONLY) kompressori on pois päältä, joten annetaan puhalluksen kierrättää ilmaa!
        if (unit.mode === 'FAN_ONLY') {
          targetMode = 'FAN_ONLY';
          targetFan = unit.fanMode || 'AUTO';
          reason = '🌀 Takkatoiminto / Ilmankierto käynnissä · Kierrättää takan lämpöä ilman kompressoria (VILP ensisijainen)';
        } else {
          targetMode = 'OFF';
          const tempStr = outdoorTemp != null ? `${outdoorTemp.toFixed(1)}°C > ${frostAssistTemp.toFixed(1)}°C` : 'lauha sää';
          reason = `⏸️ Valmiustila · Vesikiertoinen lattialämmitys (VILP) ensisijainen (${tempStr}). Estetään lattiatermostaattien sulkeutuminen ja VILP-katkokäynti`;
        }
      }
    }

    unit.currentReason = reason;

    // Apply command to unit if connected and differs
    if (unit.connected) {
      const modeDiffers = unit.mode !== targetMode;
      const tempDiffers = targetMode !== 'OFF' && targetMode !== 'FAN_ONLY' && Math.abs((unit.targetTemp || 0) - targetTemp) >= 0.5;
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

    this.currentReason = this.units.map((u) => `${u.name.replace('Mitsubishi ILP ', '')}: ${u.currentReason}`).join(' · ');
    db.updateState('apc/mitsu/reason', this.currentReason);
    db.updateState('apc/mitsu/mode', globalMode);
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
      mode: globalMode,
      reason,
      overrideActive: isUnitOverrideActive || isGlobalOverrideActive,
    };
  }

  async setUnitControl(unitId, { mode, target_temperature, fan_mode, swing_mode, durationHours = 2, clearOverride = false }) {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit) {
      throw new Error(`Laitetta ei löydy: ${unitId}`);
    }

    const now = Date.now();

    if (clearOverride || durationHours === 0 || mode === 'AUTO') {
      unit.overrideUntil = 0;
      unit.overrideState = null;
      db.updateState(`mitsubishi/${unit.id}/override_until`, '0');
      db.updateState(`mitsubishi/${unit.id}/override_state`, '');
      await this.applyDirectiveForUnit(unit, 'NORMAL', {});
      return unit.getStatus();
    }

    const nextMode = mode ? mode.toUpperCase() : (unit.mode || 'OFF');
    const nextTarget = target_temperature != null ? Number(target_temperature) : (unit.targetTemp || 21.0);
    const nextFan = fan_mode ? fan_mode.toUpperCase() : (unit.fanMode || 'AUTO');

    const hours = Number(durationHours) || 2;
    unit.overrideUntil = now + hours * 3600 * 1000;
    unit.overrideState = {
      mode: nextMode,
      target_temp: nextTarget,
      fan_mode: nextFan,
      source: 'web',
    };

    db.updateState(`mitsubishi/${unit.id}/override_until`, String(unit.overrideUntil));
    db.updateState(`mitsubishi/${unit.id}/override_state`, JSON.stringify(unit.overrideState));

    if (target_temperature != null) {
      unit.targetTemp = nextTarget;
      db.updateState(`mitsubishi/${unit.id}/target_temperature`, String(nextTarget));
    }

    await unit.setClimate({
      mode: mode ? nextMode : undefined,
      target_temperature: target_temperature != null ? nextTarget : undefined,
      fan_mode: fan_mode ? nextFan : undefined,
      swing_mode,
    });

    unit.currentReason = `Yksilöllinen ohitus aktiivinen (${nextMode} ${nextTarget}°C · jäljellä ~${Math.ceil((unit.overrideUntil - now) / 60000)} min)`;
    this.currentReason = this.units.map((u) => `${u.name.replace('Mitsubishi ILP ', '')}: ${u.currentReason}`).join(' · ');
    db.updateState('apc/mitsu/reason', this.currentReason);

    return unit.getStatus();
  }

  async setManualOverride(mode, durationHours = 0, targetTemp = null) {
    const now = Date.now();
    let overrideUntil = 0;
    let overrideState = null;

    if (mode && ['HEAT', 'COOL', 'FAN_ONLY', 'OFF'].includes(mode.toUpperCase())) {
      const hours = Number(durationHours) || 2;
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
      // Clear unit-level overrides so global override / automation reset applies cleanly
      unit.overrideUntil = 0;
      unit.overrideState = null;
      db.updateState(`mitsubishi/${unit.id}/override_until`, '0');
      db.updateState(`mitsubishi/${unit.id}/override_state`, '');

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

      for (const unit of this.units) {
        unit.overrideUntil = 0;
        unit.overrideState = null;
        db.updateState(`mitsubishi/${unit.id}/override_until`, '0');
        db.updateState(`mitsubishi/${unit.id}/override_state`, '');
      }
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
    const isGlobalOverrideActive = overrideUntil > now && Boolean(settings.mitsu_override_state);
    const isAnyUnitOverrideActive = this.units.some((u) => u.overrideUntil > now && Boolean(u.overrideState));
    const isOverrideActive = isGlobalOverrideActive || isAnyUnitOverrideActive;

    let maxOverrideUntil = overrideUntil;
    for (const u of this.units) {
      if (u.overrideUntil > maxOverrideUntil) maxOverrideUntil = u.overrideUntil;
    }
    const overrideMinRemaining = maxOverrideUntil > now ? Math.ceil((maxOverrideUntil - now) / 60000) : 0;

    let parsedOverrideState = null;
    if (settings.mitsu_override_state) {
      try {
        parsedOverrideState = typeof settings.mitsu_override_state === 'object'
          ? settings.mitsu_override_state
          : JSON.parse(settings.mitsu_override_state);
      } catch (e) {
        parsedOverrideState = { mode: settings.mitsu_override_state };
      }
    } else if (isAnyUnitOverrideActive) {
      const activeUnit = this.units.find((u) => u.overrideUntil > now && Boolean(u.overrideState));
      parsedOverrideState = activeUnit ? activeUnit.overrideState : null;
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
      overrideUntil: maxOverrideUntil,
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
