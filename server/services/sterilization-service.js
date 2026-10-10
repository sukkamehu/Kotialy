const db = require('../db');
const mqttClient = require('../mqtt-client');
const nordpoolClient = require('../nordpool-client');
const notificationService = require('../notification-service');

class SterilizationService {
  constructor() {
    this.wsBroadcast = null;
    this.phase = 'IDLE'; // 'IDLE' | 'PREHEATING' | 'BOOSTING' | 'HOLDING' | 'COMPLETED' | 'CANCELLED' | 'TIMEOUT'
    this.startedAt = null;
    this.holdStartedAt = null;
    this.phaseStartedAt = null;
    this.reason = 'Ei aktiivista sterilointia';
    this.originalDhwTarget = 55;
    this.checkTimer = null;
    this.isManual = false;
  }

  init(wsBroadcast) {
    this.wsBroadcast = wsBroadcast;

    // Restore last completed run from DB state
    const lastRunRow = db.getState('dhw/sterilization/last_completed_at');
    if (!lastRunRow || !lastRunRow.value) {
      // Default initial last run timestamp to 7 days ago if not set
      const initialTs = Date.now() - 7 * 24 * 3600 * 1000;
      db.updateState('dhw/sterilization/last_completed_at', String(initialTs));
    }

    // Start background watcher (checks every 30 seconds)
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = setInterval(() => this.tick().catch(err => console.error('[STERILIZATION] Tick error:', err.message)), 30_000);
    setTimeout(() => this.tick().catch(() => {}), 5_000);

    console.log('[STERILIZATION] Smart Sterilization Service initialized');
  }

  getSettings() {
    const apc = db.getApcSettings();
    const lastRunRow = db.getState('dhw/sterilization/last_completed_at');
    const lastRun = lastRunRow && parseInt(lastRunRow.value) ? parseInt(lastRunRow.value) : (Date.now() - 7 * 24 * 3600 * 1000);

    return {
      enabled: apc.smart_sterilization_enabled !== false,
      min_interval_days: parseFloat(apc.sterilization_min_days || '7'),
      max_interval_days: parseFloat(apc.sterilization_max_days || '14'),
      target_temp_c: parseFloat(apc.sterilization_target_c || '65'),
      hold_duration_minutes: parseInt(apc.sterilization_hold_min || '10'),
      last_completed_at: lastRun,
      days_since_last: parseFloat(((Date.now() - lastRun) / (24 * 3600 * 1000)).toFixed(1)),
    };
  }

  getStatus() {
    const settings = this.getSettings();
    const now = Date.now();
    let holdRemainingSeconds = 0;
    let totalElapsedMinutes = 0;

    if (this.startedAt) {
      totalElapsedMinutes = Math.floor((now - this.startedAt) / 60000);
    }

    if (this.phase === 'HOLDING' && this.holdStartedAt) {
      const holdTargetMs = (settings.hold_duration_minutes || 10) * 60 * 1000;
      const elapsedHold = now - this.holdStartedAt;
      holdRemainingSeconds = Math.max(0, Math.ceil((holdTargetMs - elapsedHold) / 1000));
    }

    const currentDhwTempRow = db.getState('main/DHW_Temp');
    const currentDhwTemp = currentDhwTempRow && !isNaN(parseFloat(currentDhwTempRow.value)) ? parseFloat(currentDhwTempRow.value) : null;

    return {
      phase: this.phase,
      isActive: this.phase === 'PREHEATING' || this.phase === 'BOOSTING' || this.phase === 'HOLDING',
      reason: this.reason,
      startedAt: this.startedAt,
      holdStartedAt: this.holdStartedAt,
      holdRemainingSeconds,
      totalElapsedMinutes,
      currentDhwTemp,
      targetTemp: settings.target_temp_c,
      isManual: this.isManual,
      settings,
    };
  }

  broadcastStatus() {
    if (this.wsBroadcast) {
      this.wsBroadcast({
        type: 'sterilization_status',
        sterilization: this.getStatus(),
        ts: Date.now(),
      });
    }
  }

  /**
   * Start Sterilization Sequence (manual or automated)
   */
  async startSterilization(reason = 'Käyttäjän manuaalinen käynnistys', isManual = true) {
    if (this.phase === 'PREHEATING' || this.phase === 'BOOSTING' || this.phase === 'HOLDING') {
      return this.getStatus();
    }

    const settings = this.getSettings();
    const now = Date.now();
    this.startedAt = now;
    this.holdStartedAt = null;
    this.phaseStartedAt = now;
    this.isManual = isManual;
    this.reason = reason;

    // Read current DHW target to restore after completion
    const apc = db.getApcSettings();
    this.originalDhwTarget = apc.dhw_target_c || 55;

    const currentDhwRow = db.getState('main/DHW_Temp');
    const currentTemp = currentDhwRow && !isNaN(parseFloat(currentDhwRow.value)) ? parseFloat(currentDhwRow.value) : 45;

    console.log(`[STERILIZATION] 🚀 Käynnistetään sterilointiohjelma: "${reason}" (Vesi: ${currentTemp}°C, Tavoite: ${settings.target_temp_c}°C)`);

    if (currentTemp < 50) {
      // Phase 1: Heat pump compressor pre-heating
      this.phase = 'PREHEATING';
      this.reason = `Kompressorin esilämmitys (50–52 °C asti · nykyinen ${currentTemp}°C)`;
      await this.sendHeishaCommands({ forceDhw: 1, dhwTemp: 55 });
    } else {
      // Phase 2: Electric booster final heating to 65 °C
      this.phase = 'BOOSTING';
      this.reason = `Sähkövastus-loppunousu (65 °C tavoite · nykyinen ${currentTemp}°C)`;
      await this.sendHeishaCommands({ forceDhw: 1, dhwTemp: settings.target_temp_c });
    }

    db.updateState('dhw/sterilization/state', this.phase);
    db.updateState('dhw/sterilization/started_at', String(now));
    this.broadcastStatus();

    notificationService.sendNotification({
      title: 'Legionellasterilointi käynnistetty',
      body: `${reason}. Tavoite ${settings.target_temp_c}°C.`,
      category: 'energy',
      importance: 'low',
    }).catch(() => {});

    return this.getStatus();
  }

  /**
   * Cancel / Abort sterilization
   */
  async cancelSterilization(reason = 'Käyttäjä keskeytti steriloinnin') {
    console.log(`[STERILIZATION] ⏹️ Sterilointi keskeytetty: ${reason}`);
    this.phase = 'CANCELLED';
    this.reason = reason;
    this.holdStartedAt = null;

    // Restore normal DHW operation
    await this.sendHeishaCommands({ forceDhw: 0, dhwTemp: this.originalDhwTarget || 55 });

    db.updateState('dhw/sterilization/state', 'IDLE');
    this.broadcastStatus();

    setTimeout(() => {
      if (this.phase === 'CANCELLED') {
        this.phase = 'IDLE';
        this.startedAt = null;
        this.reason = 'Ei aktiivista sterilointia';
        this.broadcastStatus();
      }
    }, 5000);

    return this.getStatus();
  }

  async sendHeishaCommands({ forceDhw = null, dhwTemp = null }) {
    try {
      if (forceDhw !== null) {
        await mqttClient.publish('commands/SetForceDHW', String(forceDhw));
      }
      if (dhwTemp !== null) {
        await mqttClient.publish('commands/SetDHWTemp', String(dhwTemp));
      }
    } catch (err) {
      console.error('[STERILIZATION] MQTT command error:', err.message);
    }
  }

  /**
   * Main periodic evaluation loop
   */
  async tick() {
    const settings = this.getSettings();
    const now = Date.now();

    const currentDhwRow = db.getState('main/DHW_Temp');
    const currentTemp = currentDhwRow && !isNaN(parseFloat(currentDhwRow.value)) ? parseFloat(currentDhwRow.value) : null;

    // ─── 1. If actively running sterilization sequence ───
    if (this.phase === 'PREHEATING' || this.phase === 'BOOSTING' || this.phase === 'HOLDING') {
      // Safety timeout: 90 minutes max duration
      if (this.startedAt && (now - this.startedAt > 90 * 60 * 1000)) {
        console.warn('[STERILIZATION] ⚠️ Aikaraja (90 min) ylittyi: Keskeytetään sterilointi turvallisuussyistä.');
        await this.cancelSterilization('Aikaraja (90 min) ylittyi');
        return;
      }

      if (currentTemp === null) return;

      // Transition from PREHEATING to BOOSTING (once water reaches >= 50 °C)
      if (this.phase === 'PREHEATING') {
        if (currentTemp >= 50) {
          this.phase = 'BOOSTING';
          this.phaseStartedAt = now;
          this.reason = `Sähkövastus-loppunousu (65 °C tavoite · nykyinen ${currentTemp}°C)`;
          console.log(`[STERILIZATION] 📈 Esilämmitys valmis (${currentTemp}°C) -> Siirrytään loppunousuun (${settings.target_temp_c}°C)`);
          await this.sendHeishaCommands({ forceDhw: 1, dhwTemp: settings.target_temp_c });
          this.broadcastStatus();
        }
      }

      // Transition from BOOSTING to HOLDING (once water reaches >= 64.5 °C or target)
      if (this.phase === 'BOOSTING') {
        if (currentTemp >= (settings.target_temp_c - 0.5)) {
          this.phase = 'HOLDING';
          this.holdStartedAt = now;
          this.phaseStartedAt = now;
          this.reason = `Desinfiointipitoaika (${settings.hold_duration_minutes} min pito)`;
          console.log(`[STERILIZATION] 🎯 Tavoitelämpötila saavutettu (${currentTemp}°C) -> Aloitetaan ${settings.hold_duration_minutes} min pito`);
          this.broadcastStatus();
        } else {
          // Re-ensure SetDHWTemp = 65 and SetForceDHW = 1 if pump state was interrupted
          const targetRow = db.getState('main/DHW_Target_Temp');
          const forceDhwRow = db.getState('main/Force_DHW_State');
          if ((targetRow && targetRow.value !== String(settings.target_temp_c)) || (forceDhwRow && forceDhwRow.value !== '1')) {
            console.log(`[STERILIZATION] Re-enforcing DHW Target ${settings.target_temp_c}°C & Force DHW`);
            await this.sendHeishaCommands({ forceDhw: 1, dhwTemp: settings.target_temp_c });
          }
        }
      }

      // Transition from HOLDING to COMPLETED (once 10 minutes pass)
      if (this.phase === 'HOLDING') {
        const holdTargetMs = (settings.hold_duration_minutes || 10) * 60 * 1000;
        if (now - this.holdStartedAt >= holdTargetMs) {
          console.log(`[STERILIZATION] ✨ Legionelladesinfiointi suoritettu onnistuneesti! (Lämpö ${currentTemp}°C, Pito ${settings.hold_duration_minutes} min)`);
          this.phase = 'COMPLETED';
          this.reason = `Desinfiointi suoritettu onnistuneesti (${new Date().toLocaleTimeString('fi-FI')})`;

          // Save last completion timestamp
          db.updateState('dhw/sterilization/last_completed_at', String(now));
          db.updateState('dhw/sterilization/state', 'COMPLETED');

          // Restore normal operation
          await this.sendHeishaCommands({ forceDhw: 0, dhwTemp: this.originalDhwTarget || 55 });

          notificationService.sendNotification({
            title: '✨ Legionelladesinfiointi valmis',
            body: `Käyttövesi kävi ${currentTemp}°C lämpötilassa (${settings.hold_duration_minutes} min pito). Palautettu normaalitilaan.`,
            category: 'energy',
            importance: 'normal',
          }).catch(() => {});

          this.broadcastStatus();

          setTimeout(() => {
            if (this.phase === 'COMPLETED') {
              this.phase = 'IDLE';
              this.startedAt = null;
              this.holdStartedAt = null;
              this.reason = 'Ei aktiivista sterilointia';
              db.updateState('dhw/sterilization/state', 'IDLE');
              this.broadcastStatus();
            }
          }, 15000);
          return;
        }
      }

      this.broadcastStatus();
      return;
    }

    // ─── 2. If IDLE: Check Smart Trigger Conditions ───
    if (!settings.enabled) return;

    const daysSinceLast = settings.days_since_last;
    const currentPriceObj = nordpoolClient.getCurrentPrice();
    const currentPriceCents = currentPriceObj && typeof currentPriceObj.price === 'number' ? currentPriceObj.price / 10 : null;

    // Condition A: Negative electricity price AND at least min_interval_days (e.g. 7 days) since last run
    if (currentPriceCents !== null && currentPriceCents <= 0.0 && daysSinceLast >= settings.min_interval_days) {
      console.log(`[STERILIZATION] 💡 Älykäs sterilointi aktivoitu: Negatiivinen hinta (${currentPriceCents.toFixed(2)} snt/kWh) ja edellisestä ajosta ${daysSinceLast} pv.`);
      await this.startSterilization(
        `Negatiivinen pörssisähkö (${currentPriceCents.toFixed(2)} snt/kWh) · Edellisestä desinfioinnista ${Math.floor(daysSinceLast)} pv`,
        false
      );
      return;
    }

    // Condition B: Fallback maximum interval reached (e.g. 14 days without negative prices)
    if (daysSinceLast >= settings.max_interval_days) {
      // Find cheapest 2h window in next 24h
      const cheapest = nordpoolClient.findCheapestWindow(2, now, now + 24 * 3600 * 1000);
      const isCurrentlyInCheapest = cheapest && cheapest.start <= now && cheapest.end > now;

      if (isCurrentlyInCheapest || currentPriceCents === null) {
        console.log(`[STERILIZATION] ⏱️ Älykäs sterilointi aktivoitu: Maksimiaikaraja saavutettu (${daysSinceLast} pv) · Halvin ikkuna.`);
        await this.startSterilization(
          `Säännöllinen desinfiointi (${Math.floor(daysSinceLast)} pv aikaraja) · Päivän edullisin tunti`,
          false
        );
      }
    }
  }
}

module.exports = new SterilizationService();
