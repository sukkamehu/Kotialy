const db = require('../db');
const mqttClient = require('../mqtt-client');
const nordpoolClient = require('../nordpool-client');
const notificationService = require('../notification-service');

/**
 * VILP Compressor Lubrication & Oil Circulation Protection Service
 *
 * Physical rationale:
 *  - Refrigerant compressor oil (POE/PVE) circulates along with refrigerant gas.
 *  - During extended standstill periods (e.g. summer heating cutoffs, vacations, or mild weather),
 *    oil drains to low spots and compressor mechanical seals and internal valves can dry out.
 *  - Running the compressor periodically (e.g. once a month / 30 days) for at least 15 minutes
 *    ensures high refrigerant gas velocity that sweeps oil through the system and returns it
 *    to the compressor crankcase, maintaining seals and bearing lubrication.
 *  - The service is spot-price-aware: it automatically schedules the exercise run during
 *    negative spot prices or the day's cheapest hour.
 */
class CompressorExerciseService {
  constructor() {
    this.wsBroadcast = null;
    this.phase = 'IDLE'; // 'IDLE' | 'STARTING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
    this.startedAt = null;
    this.activeRunStartedAt = null;
    this.totalRunSeconds = 0;
    this.reason = 'Ei aktiivista voiteluajoa';
    this.originalDhwTarget = 48;
    this.checkTimer = null;
    this.isManual = false;
    this.lastCompressorRunAt = 0;
  }

  init(wsBroadcast) {
    this.wsBroadcast = wsBroadcast;

    // 1. Query sensor_history to find true latest compressor run (topic = 'main/Compressor_Freq' and value > 0)
    let latestTs = 0;
    try {
      const historyRow = db.db.prepare(
        "SELECT max(recorded_at) as max_ts FROM sensor_history WHERE topic = 'main/Compressor_Freq' AND value > 0"
      ).get();
      if (historyRow?.max_ts) {
        latestTs = historyRow.max_ts;
      }
    } catch {
      // ignore
    }

    const lastRunRow = db.getState('panasonic/compressor/last_run_at');
    const storedTs = lastRunRow && parseInt(lastRunRow.value, 10) ? parseInt(lastRunRow.value, 10) : 0;
    if (latestTs > storedTs) {
      this.lastCompressorRunAt = latestTs;
      db.updateState('panasonic/compressor/last_run_at', String(latestTs));
    } else if (storedTs > 0) {
      this.lastCompressorRunAt = storedTs;
    } else {
      this.lastCompressorRunAt = Date.now();
      db.updateState('panasonic/compressor/last_run_at', String(this.lastCompressorRunAt));
    }

    // Clean up any stale exercise state
    const curState = db.getState('panasonic/compressor_exercise/state');
    if (curState && (curState.value === 'STARTING' || curState.value === 'RUNNING')) {
      db.updateState('panasonic/compressor_exercise/state', 'IDLE');
    }

    // Start background watcher (checks every 30 seconds)
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = setInterval(() => this.tick().catch(err => console.error('[COMPRESSOR_EXERCISE] Tick error:', err.message)), 30_000);
    setTimeout(() => this.tick().catch(() => {}), 6_000);

    console.log(`[COMPRESSOR_EXERCISE] Compressor Lubrication & Exercise Service initialized. Last compressor run: ${new Date(this.lastCompressorRunAt).toLocaleString('fi-FI')}`);
  }

  getSettings() {
    const apc = db.getApcSettings();
    const intervalDays = parseFloat(apc.compressor_exercise_interval_days || '30');
    const minRunMin = parseInt(apc.compressor_exercise_min_run_min || '15', 10);
    const maxPrice = parseFloat(apc.compressor_exercise_max_price_cents || '10.0');
    const lastRun = this.lastCompressorRunAt || Date.now();
    const daysSinceLast = parseFloat(((Date.now() - lastRun) / (24 * 3600 * 1000)).toFixed(1));

    return {
      enabled: apc.compressor_exercise_enabled !== false,
      interval_days: intervalDays,
      min_run_minutes: minRunMin,
      max_price_cents: maxPrice,
      last_run_at: lastRun,
      days_since_last: daysSinceLast,
    };
  }

  getStatus() {
    const settings = this.getSettings();
    const now = Date.now();

    const state = db.getFullState();
    const compressorFreq = state['main/Compressor_Freq']?.value ? parseFloat(state['main/Compressor_Freq'].value) : 0;
    const currentDhwTemp = state['main/DHW_Temp']?.value ? parseFloat(state['main/DHW_Temp'].value) : null;
    const targetDhwTemp = state['main/DHW_Target_Temp']?.value ? parseFloat(state['main/DHW_Target_Temp'].value) : null;

    const currentPriceObj = nordpoolClient.getCurrentPrice();
    const currentPrice = currentPriceObj && typeof currentPriceObj.price === 'number' ? currentPriceObj.price / 10 : null;

    const isActive = this.phase === 'STARTING' || this.phase === 'RUNNING';

    let elapsedSeconds = this.totalRunSeconds;
    if (this.phase === 'RUNNING' && this.activeRunStartedAt) {
      elapsedSeconds += Math.floor((now - this.activeRunStartedAt) / 1000);
    }

    return {
      phase: this.phase,
      isActive,
      reason: this.reason,
      startedAt: this.startedAt,
      totalRunSeconds: elapsedSeconds,
      minRunMinutes: settings.min_run_minutes,
      compressorFreq,
      currentDhwTemp,
      targetDhwTemp,
      currentPrice,
      isManual: this.isManual,
      settings,
    };
  }

  broadcastStatus() {
    if (this.wsBroadcast) {
      this.wsBroadcast({
        type: 'compressor_exercise_status',
        compressorExercise: this.getStatus(),
        ts: Date.now(),
      });
    }
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
      console.error('[COMPRESSOR_EXERCISE] MQTT command error:', err.message);
    }
  }

  async startExercise(reason = 'Käyttäjän manuaalinen käynnistys', isManual = true) {
    if (this.phase === 'STARTING' || this.phase === 'RUNNING') {
      return this.getStatus();
    }

    const settings = this.getSettings();
    const now = Date.now();
    this.startedAt = now;
    this.activeRunStartedAt = null;
    this.totalRunSeconds = 0;
    this.isManual = isManual;
    this.reason = reason;
    this.phase = 'STARTING';

    const apc = db.getApcSettings();
    this.originalDhwTarget = apc.dhw_target_c || 48;

    const currentDhwRow = db.getState('main/DHW_Temp');
    const currentTemp = currentDhwRow && !isNaN(parseFloat(currentDhwRow.value)) ? parseFloat(currentDhwRow.value) : 45;
    // Target 50–52 °C so heat pump starts compressor smoothly in all seasons
    const exerciseDhwTarget = Math.min(55, Math.max(50, Math.round(currentTemp + 5)));

    console.log(`[COMPRESSOR_EXERCISE] 🚀 Käynnistetään kompressorin öljynkierto- ja voiteluajo: "${reason}" (DHW: ${currentTemp}°C -> tavoite ${exerciseDhwTarget}°C, min ${settings.min_run_minutes} min)`);

    await this.sendHeishaCommands({ forceDhw: 1, dhwTemp: exerciseDhwTarget });

    db.updateState('panasonic/compressor_exercise/state', this.phase);
    db.updateState('panasonic/compressor_exercise/started_at', String(now));
    this.broadcastStatus();

    db.insertApcLog({
      action: 'Kompressorin voiteluajo: Käynnistetty',
      reason,
      dhw_temp: currentTemp,
      directive: 'DHW_CYCLE',
      details: {
        isManual,
        targetDhw: exerciseDhwTarget,
        minRunMinutes: settings.min_run_minutes,
        daysSinceLast: settings.days_since_last,
      },
    });

    notificationService.sendNotification({
      title: 'VILP Kompressorin voiteluajo käynnistetty',
      body: `${reason}. Kompressori pyöräytetään käyntiin öljyn kierrättämiseksi ja tiivisteiden voitelemiseksi.`,
      category: 'heatpump',
      importance: 'low',
    }).catch(() => {});

    return this.getStatus();
  }

  async cancelExercise(reason = 'Käyttäjä keskeytti voiteluajon') {
    console.log(`[COMPRESSOR_EXERCISE] ⏹️ Kompressorin voiteluajo keskeytetty: ${reason}`);
    this.phase = 'CANCELLED';
    this.reason = reason;

    await this.sendHeishaCommands({ forceDhw: 0, dhwTemp: this.originalDhwTarget || 48 });

    db.updateState('panasonic/compressor_exercise/state', 'IDLE');
    this.broadcastStatus();

    db.insertApcLog({
      action: 'Kompressorin voiteluajo: Keskeytetty',
      reason,
      directive: 'NORMAL',
    });

    setTimeout(() => {
      if (this.phase === 'CANCELLED') {
        this.phase = 'IDLE';
        this.startedAt = null;
        this.activeRunStartedAt = null;
        this.totalRunSeconds = 0;
        this.reason = 'Ei aktiivista voiteluajoa';
        this.broadcastStatus();
      }
    }, 5000);

    return this.getStatus();
  }

  async tick() {
    const settings = this.getSettings();
    const now = Date.now();

    const state = db.getFullState();
    const compressorFreq = state['main/Compressor_Freq']?.value ? parseFloat(state['main/Compressor_Freq'].value) : 0;
    const currentDhwTemp = state['main/DHW_Temp']?.value ? parseFloat(state['main/DHW_Temp'].value) : null;
    const isCompressorRunning = compressorFreq > 0;

    // Always update last run timestamp whenever the compressor is actively spinning
    if (isCompressorRunning) {
      this.lastCompressorRunAt = now;
      db.updateState('panasonic/compressor/last_run_at', String(now));
    }

    // ── 1. If actively in STARTING or RUNNING ──
    if (this.phase === 'STARTING' || this.phase === 'RUNNING') {
      // Safety timeout: 45 minutes max
      if (this.startedAt && (now - this.startedAt > 45 * 60 * 1000)) {
        console.warn('[COMPRESSOR_EXERCISE] ⚠️ Aikaraja (45 min) ylittyi: Päätetään voiteluajo turvallisuussyistä.');
        await this.cancelExercise('Aikaraja (45 min) ylittyi');
        return;
      }

      if (isCompressorRunning) {
        if (this.phase === 'STARTING') {
          this.phase = 'RUNNING';
          this.activeRunStartedAt = now;
          console.log(`[COMPRESSOR_EXERCISE] ⚙️ Kompressori käynnistyi (${compressorFreq} Hz) -> Öljynkierto ja voitelu käynnissä`);
        }
        if (!this.activeRunStartedAt) {
          this.activeRunStartedAt = now;
        }
        const activeSeconds = Math.floor((now - this.activeRunStartedAt) / 1000);
        const totalSec = this.totalRunSeconds + activeSeconds;
        this.reason = `Voiteluajo käynnissä: Kompressori pyörii (${compressorFreq} Hz · ${Math.floor(totalSec / 60)} / ${settings.min_run_minutes} min)`;

        // Check if required min run duration reached (e.g. 15 minutes)
        if (totalSec >= settings.min_run_minutes * 60) {
          console.log(`[COMPRESSOR_EXERCISE] ✨ Kompressorin öljynkierto- ja voiteluajo suoritettu onnistuneesti! (${Math.floor(totalSec / 60)} min käyntiä)`);
          this.phase = 'COMPLETED';
          this.reason = `Voiteluajo suoritettu onnistuneesti (${Math.floor(totalSec / 60)} min käyntiä)`;
          this.lastCompressorRunAt = now;

          db.updateState('panasonic/compressor/last_run_at', String(now));
          db.updateState('panasonic/compressor_exercise/last_completed_at', String(now));
          db.updateState('panasonic/compressor_exercise/state', 'COMPLETED');

          // Restore normal DHW operation
          await this.sendHeishaCommands({ forceDhw: 0, dhwTemp: this.originalDhwTarget || 48 });

          db.insertApcLog({
            action: 'Kompressorin voiteluajo suoritettu',
            reason: `Öljynkierto ja tiivisteiden voitelu tehty (${Math.floor(totalSec / 60)} min, taajuus ${compressorFreq} Hz)`,
            dhw_temp: currentDhwTemp,
            directive: 'NORMAL',
          });

          notificationService.sendNotification({
            title: '✨ VILP Kompressorin voiteluajo suoritettu',
            body: `Kompressori pyöri ${Math.floor(totalSec / 60)} min. Kylmäaine ja öljy ovat kiertäneet piirissä voitelemassa laakerit ja tiivisteet.`,
            category: 'heatpump',
            importance: 'normal',
          }).catch(() => {});

          this.broadcastStatus();

          setTimeout(() => {
            if (this.phase === 'COMPLETED') {
              this.phase = 'IDLE';
              this.startedAt = null;
              this.activeRunStartedAt = null;
              this.totalRunSeconds = 0;
              this.reason = 'Ei aktiivista voiteluajoa';
              db.updateState('panasonic/compressor_exercise/state', 'IDLE');
              this.broadcastStatus();
            }
          }, 20000);
          return;
        }
      } else if (this.phase === 'RUNNING' && this.activeRunStartedAt) {
        // If compressor momentarily paused before reaching target minutes
        this.totalRunSeconds += Math.floor((now - this.activeRunStartedAt) / 1000);
        this.activeRunStartedAt = null;
      }

      this.broadcastStatus();
      return;
    }

    // ── 2. If IDLE: Check if automatic lubrication exercise is needed ──
    if (!settings.enabled) return;

    // Check if sterilization is running: don't conflict
    const sterilizationService = require('./sterilization-service');
    if (sterilizationService.getStatus()?.isActive) return;

    const daysSinceLast = parseFloat(((now - this.lastCompressorRunAt) / (24 * 3600 * 1000)).toFixed(1));

    // If compressor has run within the configured interval (e.g. 30 days), no exercise needed!
    if (daysSinceLast < settings.interval_days) {
      return;
    }

    // The compressor has been idle for >= 30 days!
    // Pick the most cost-effective hour based on Nord Pool spot electricity price:
    const currentPriceObj = nordpoolClient.getCurrentPrice();
    const currentPriceCents = currentPriceObj && typeof currentPriceObj.price === 'number' ? currentPriceObj.price / 10 : null;

    // Condition A: Negative electricity price -> run immediately!
    if (currentPriceCents !== null && currentPriceCents <= 0.0) {
      console.log(`[COMPRESSOR_EXERCISE] 💡 Voiteluajo aktivoitu: Negatiivinen hinta (${currentPriceCents.toFixed(2)} snt/kWh) ja seisonta-aika ${daysSinceLast} pv.`);
      await this.startExercise(
        `Negatiivinen pörssisähkö (${currentPriceCents.toFixed(2)} snt/kWh) · Seisonta ${Math.floor(daysSinceLast)} pv (öljynkiertosuoja)`,
        false
      );
      return;
    }

    // Condition B: Find cheapest 1h window within the next 24h
    const cheapestWindow = nordpoolClient.findCheapestWindow(1, now, now + 24 * 3600 * 1000);
    const isCurrentlyInCheapest = cheapestWindow && cheapestWindow.start <= now && cheapestWindow.end > now;

    if (isCurrentlyInCheapest && (currentPriceCents === null || currentPriceCents <= settings.max_price_cents)) {
      console.log(`[COMPRESSOR_EXERCISE] ⏱️ Voiteluajo aktivoitu: Halvin tunti (${currentPriceCents ? currentPriceCents.toFixed(2) + ' snt/kWh' : 'edullinen'}) ja seisonta-aika ${daysSinceLast} pv.`);
      await this.startExercise(
        `Päivän halvin tunti (${currentPriceCents ? currentPriceCents.toFixed(2) + ' snt/kWh' : 'edullinen'}) · Seisonta ${Math.floor(daysSinceLast)} pv (öljynkiertosuoja)`,
        false
      );
      return;
    }

    // Condition C: Hard deadline reached (e.g. 33 days without meeting price threshold)
    if (daysSinceLast >= settings.interval_days + 3) {
      if (isCurrentlyInCheapest || currentPriceCents === null) {
        console.log(`[COMPRESSOR_EXERCISE] 🛡️ Voiteluajo aktivoitu: Maksimiseisonta saavutettu (${daysSinceLast} pv) · Halvin tunti.`);
        await this.startExercise(
          `Maksimiseisonta (${Math.floor(daysSinceLast)} pv) · Päivän edullisin tunti (kompressorin voitelusuoja)`,
          false
        );
      }
    }
  }
}

module.exports = new CompressorExerciseService();

