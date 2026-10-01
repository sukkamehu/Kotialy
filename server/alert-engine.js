const db = require('./db');
const notificationService = require('./notification-service');
const { getPrices } = require('./nordpool-client');

class AlertEngine {
  constructor() {
    this.cooldowns = new Map(); // key -> lastSentTimestamp
    this.dhwHeaterStartTime = null;
    this.saunaNotified = false;
    this.lastDailyReportDate = null;
    this.doorStates = new Map(); // topic -> boolean
    this.doorOpenTimes = new Map(); // topic -> timestamp
    this.applianceStates = new Map(); // deviceId -> { status, startedAt, lastActiveAt, lowPowerStartedAt, peakPowerW, startEnergyKwh }
    this.checkInterval = null;
  }

  start() {
    console.log('[AlertEngine] Starting background monitoring & alert engine...');
    // Run evaluation every 30 seconds
    this.checkInterval = setInterval(() => this.evaluate(), 30_000);
    // Initial evaluation after 5 seconds
    setTimeout(() => this.evaluate(), 5_000);
  }

  stop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }

  isCooldown(key, cooldownMs) {
    const last = this.cooldowns.get(key) || 0;
    const now = Date.now();
    if (now - last < cooldownMs) {
      return true;
    }
    return false;
  }

  setCooldown(key) {
    this.cooldowns.set(key, Date.now());
  }

  /**
   * Main evaluation loop
   */
  async evaluate() {
    try {
      const state = db.getFullState();
      const settings = db.getNotificationSettings();

      if (settings.notifications_enabled === 'false') {
        return;
      }

      await this.checkWaterLeaks(state, settings);
      await this.checkHeatpumpErrors(state, settings);
      await this.checkDhwHeaterAnomaly(state, settings);
      await this.checkSaunaReady(state, settings);
      await this.checkApplianceFinished(state, settings);
      await this.checkDoorAlerts(state, settings);
      await this.checkFreezeAlerts(state, settings);
      await this.checkDailyMorningReport(settings);
    } catch (err) {
      console.error('[AlertEngine] Evaluation error:', err.message);
    }
  }

  /**
   * 1. Water Leak Sensors (Tuya)
   */
  async checkWaterLeaks(state, settings) {
    if (settings.leak_alerts_enabled === 'false') return;

    for (const [topic, item] of Object.entries(state)) {
      if (topic.includes('leak_detected') && (item.value === 'true' || item.value === '1' || item.value === true)) {
        const parts = topic.split('/');
        const roomName = parts[1] || 'Tuntematon tila';
        const formattedRoom = roomName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const key = `leak_${topic}`;

        // Alert every 5 minutes if still leaking
        if (!this.isCooldown(key, 5 * 60 * 1000)) {
          this.setCooldown(key);
          await notificationService.sendNotification({
            title: `🚨 VESIVUOTO HAVAITTU!`,
            body: `Vuotovahti laukesi kohteessa: ${formattedRoom}. Tarkista tila välittömästi!`,
            severity: 'critical',
            type: 'leak',
            url: '/',
          });
        }
      }
    }
  }

  /**
   * 2. Panasonic Heat Pump Error Codes
   */
  async checkHeatpumpErrors(state, settings) {
    if (settings.heatpump_alerts_enabled === 'false') return;

    const errorType = state['main/Error_Type']?.value;
    if (errorType && errorType !== '0' && errorType !== 'None' && errorType !== '') {
      const key = `hp_error_${errorType}`;
      if (!this.isCooldown(key, 60 * 60 * 1000)) {
        this.setCooldown(key);
        await notificationService.sendNotification({
          title: `⚠️ Lämpöpumpun vikailmoitus`,
          body: `Panasonic VILP ilmoittaa virhekoodin: ${errorType}. Tarkista pumpun tila.`,
          severity: 'warning',
          type: 'heatpump',
          url: '/',
        });
      }
    }
  }

  /**
   * 3. DHW Heater Anomaly (COP 1.00 when on electrical heater > 45min on mild weather)
   */
  async checkDhwHeaterAnomaly(state, settings) {
    if (settings.dhw_heater_alerts_enabled === 'false') return;

    const dhwHeaterState = state['main/DHW_Heater_State']?.value === '1';
    const outdoorTemp = parseFloat(state['main/Outside_Temp']?.value || state['tuya/ulko/temperature']?.value || '10');

    if (dhwHeaterState) {
      if (!this.dhwHeaterStartTime) {
        this.dhwHeaterStartTime = Date.now();
      } else {
        const durationMin = (Date.now() - this.dhwHeaterStartTime) / (60 * 1000);
        // If heater is running for > 45 min and outdoor temp > 2°C
        if (durationMin >= 45 && outdoorTemp > 2) {
          const key = 'dhw_heater_anomaly';
          if (!this.isCooldown(key, 4 * 60 * 60 * 1000)) {
            this.setCooldown(key);
            await notificationService.sendNotification({
              title: `⚡ Käyttövesivastus ollut päällä ${Math.round(durationMin)} min`,
              body: `VILP tekee käyttövettä suoralla sähkövastuksella leudolla kelillä (${outdoorTemp.toFixed(1)}°C). Tarkista asetukset.`,
              severity: 'warning',
              type: 'dhw',
              url: '/',
            });
          }
        }
      }
    } else {
      this.dhwHeaterStartTime = null;
    }
  }

  /**
   * 4. Sauna Ready Notification
   */
  async checkSaunaReady(state, settings) {
    if (settings.sauna_alerts_enabled === 'false') return;

    const targetTemp = parseFloat(settings.sauna_target_temp || '40') || 40;
    const saunaSwitch = state['tuya/sauna/switch_1']?.value === 'true' || state['tuya/sauna/switch']?.value === '1';
    const saunaTemp = parseFloat(state['tuya/sauna/temperature']?.value || '0');

    if (saunaTemp <= 0) return;

    // Reset notification when sauna cools down
    if (this.saunaNotified) {
      const resetThreshold = Math.min(targetTemp - 8, 28);
      if (!saunaSwitch || saunaTemp <= resetThreshold) {
        this.saunaNotified = false;
      }
    }

    // Trigger when temperature reaches or exceeds user target temp
    if (saunaTemp >= targetTemp && !this.saunaNotified) {
      const key = 'sauna_ready';
      if (!this.isCooldown(key, 45 * 60 * 1000)) {
        this.setCooldown(key);
        this.saunaNotified = true;
        await notificationService.sendNotification({
          title: `🧖 Sauna on valmis! (${saunaTemp.toFixed(0)} °C)`,
          body: `Sauna on saavuttanut tavoitelämmön (${targetTemp.toFixed(0)} °C). Löylyt ovat valmiina!`,
          severity: 'info',
          type: 'sauna',
          url: '/',
        });
      }
    }
  }

  /**
   * 5. Washing Machine & Dryer Finished Notifications (Tapo Smart Plugs)
   */
  async checkApplianceFinished(state, settings) {
    if (settings.appliance_alerts_enabled === 'false') return;

    try {
      const devices = db.getTapoDevices();
      const applianceDevices = devices.filter(
        d => d.id === 'pesukone' || d.id === 'kuivausrumpu' ||
             d.type === 'appliance_washing_machine' || d.type === 'appliance_dryer'
      );

      const ACTIVE_POWER_THRESHOLD = 6.0; // W (active wash/tumble)
      const FINISHED_POWER_THRESHOLD = 3.5; // W (standby / idle)
      const FINISHED_STABLE_DURATION_MS = 150 * 1000; // 2.5 min stable idle to confirm finish (filters soak/drum pause cycles)
      const MIN_CYCLE_DURATION_MS = 3 * 60 * 1000; // Minimum 3 min running or peak power > 30W to qualify as real program cycle

      const now = Date.now();

      for (const dev of applianceDevices) {
        const isWashingMachine = dev.id === 'pesukone' || dev.type === 'appliance_washing_machine';
        const label = isWashingMachine ? 'Pyykinpesukone' : 'Kuivausrumpu';
        const icon = isWashingMachine ? '🧺' : '💨';
        const type = isWashingMachine ? 'appliance_washing_machine' : 'appliance_dryer';

        // Power & energy telemetry
        const powerW = dev.power_w != null ? Number(dev.power_w) : parseFloat(state[`tapo/${dev.id}/power`]?.value || '0');
        const energyToday = dev.today_energy_kwh != null ? Number(dev.today_energy_kwh) : parseFloat(state[`tapo/${dev.id}/energy`]?.value || '0');

        let session = this.applianceStates.get(dev.id);
        if (!session) {
          // If device is already running active power at startup/first check, initialize as running
          if (powerW >= ACTIVE_POWER_THRESHOLD) {
            let estimatedStart = now;
            try {
              const history = db.getTopicHistory(`tapo/${dev.id}/power`, now - 4 * 3600 * 1000, now);
              if (history && history.length > 0) {
                const firstActive = history.find(h => h.value >= ACTIVE_POWER_THRESHOLD);
                if (firstActive) estimatedStart = firstActive.recorded_at;
              }
            } catch {
              // ignore
            }
            session = {
              status: 'running',
              startedAt: estimatedStart,
              lastActiveAt: now,
              lowPowerStartedAt: null,
              peakPowerW: powerW,
              startEnergyKwh: energyToday,
            };
            this.applianceStates.set(dev.id, session);
            console.log(`[AlertEngine] Initialized running session for ${label} (${dev.id}) at ${powerW.toFixed(1)} W`);
          } else {
            session = {
              status: 'idle',
              startedAt: 0,
              lastActiveAt: 0,
              lowPowerStartedAt: null,
              peakPowerW: 0,
              startEnergyKwh: energyToday,
            };
            this.applianceStates.set(dev.id, session);
          }
        }

        // State Machine
        if (powerW >= ACTIVE_POWER_THRESHOLD) {
          if (session.status === 'idle') {
            session.status = 'running';
            session.startedAt = now;
            session.lastActiveAt = now;
            session.lowPowerStartedAt = null;
            session.peakPowerW = powerW;
            session.startEnergyKwh = energyToday;
            console.log(`[AlertEngine] 🧺 ${label} (${dev.id}) käynnistyi (${powerW.toFixed(1)} W)`);
          } else if (session.status === 'finishing' || session.status === 'running') {
            // Power resumed during finish waiting (e.g. soak pause ended, spin cycle started)
            if (session.status === 'finishing') {
              console.log(`[AlertEngine] ${label} (${dev.id}) jatkoi ohjelmaa tauon jälkeen (${powerW.toFixed(1)} W)`);
            }
            session.status = 'running';
            session.lastActiveAt = now;
            session.lowPowerStartedAt = null;
            session.peakPowerW = Math.max(session.peakPowerW, powerW);
          }
        } else if (powerW <= FINISHED_POWER_THRESHOLD) {
          if (session.status === 'running') {
            const runDuration = now - session.startedAt;
            const hadMeaningfulWork = runDuration >= MIN_CYCLE_DURATION_MS || session.peakPowerW >= 30;
            if (hadMeaningfulWork) {
              session.status = 'finishing';
              session.lowPowerStartedAt = now;
              console.log(`[AlertEngine] ${label} (${dev.id}) teho laski lepotilaan (${powerW.toFixed(1)} W). Odotetaan 2.5 min valmistumisen vahvistusta...`);
            } else {
              // Was only briefly switched on/off (< 3 min and < 30W)
              session.status = 'idle';
              session.startedAt = 0;
              session.lowPowerStartedAt = null;
              session.peakPowerW = 0;
            }
          } else if (session.status === 'finishing') {
            const lowPowerDuration = now - session.lowPowerStartedAt;
            if (lowPowerDuration >= FINISHED_STABLE_DURATION_MS) {
              // Cycle finished!
              const totalDurationMin = Math.max(1, Math.round((now - session.startedAt) / 60000));
              const energyUsed = Math.max(0, energyToday - (session.startEnergyKwh || 0)).toFixed(2);
              const energyText = Number(energyUsed) > 0.05 ? `, sähkönkulutus ${energyUsed} kWh` : '';

              const key = `appliance_done_${dev.id}`;
              if (!this.isCooldown(key, 15 * 60 * 1000)) {
                this.setCooldown(key);
                console.log(`[AlertEngine] ✅ ${label} (${dev.id}) on VALMIS! Lähetetään ilmoitus. Kesto ~${totalDurationMin} min.`);

                await notificationService.sendNotification({
                  title: `${icon} ${label} on valmis!`,
                  body: isWashingMachine
                    ? `Pesuohjelma on päättynyt (kesto n. ${totalDurationMin} min${energyText}). Muista tyhjentää kone!`
                    : `Kuivausohjelma on päättynyt (kesto n. ${totalDurationMin} min${energyText}). Pyykit ovat kuivia!`,
                  severity: 'info',
                  type: type,
                  url: '/',
                });
              }

              // Reset to idle
              session.status = 'idle';
              session.startedAt = 0;
              session.lowPowerStartedAt = null;
              session.peakPowerW = 0;
            }
          }
        }
      }
    } catch (err) {
      console.error('[AlertEngine] checkApplianceFinished error:', err.message);
    }
  }

  /**
   * 6. Door / Garage Door Alerts
   */
  async checkDoorAlerts(state, settings) {
    if (settings.door_alerts_enabled === 'false') return;

    for (const [topic, item] of Object.entries(state)) {
      if (topic.includes('door_sensor') || topic.includes('autotalli') || topic.includes('ovi') || topic.includes('door')) {
        if (topic.endsWith('/is_open') || topic.endsWith('/open') || topic.endsWith('/switch')) {
          const isOpen = item.value === 'true' || item.value === '1' || item.value === true;
          const hadState = this.doorStates.has(topic);
          const prevOpen = this.doorStates.get(topic) || false;
          this.doorStates.set(topic, isOpen);

          // 1. Alert on door opening (ignore on first cycle to avoid startup alert)
          if (hadState && isOpen && !prevOpen) {
            this.doorOpenTimes.set(topic, Date.now());
            const key = `door_opened_${topic}`;
            if (!this.isCooldown(key, 2 * 60 * 1000)) {
              this.setCooldown(key);
              await notificationService.sendNotification({
                title: '🚪 Autotallin ovi avattiin',
                body: 'Autotallin ovi on avattu.',
                severity: 'info',
                type: 'door',
                url: '/',
              });
            }
          } else if (!isOpen) {
            this.doorOpenTimes.delete(topic);
          }

          // 2. Alert if door left open
          if (isOpen) {
            if (!this.doorOpenTimes.has(topic)) {
              this.doorOpenTimes.set(topic, Date.now());
            }
            const openedAt = this.doorOpenTimes.get(topic);
            const durationMin = (Date.now() - openedAt) / (60 * 1000);
            const warningLimit = parseInt(settings.door_left_open_minutes || '15', 10);

            if (durationMin >= warningLimit) {
              const key = `door_left_open_${topic}`;
              if (!this.isCooldown(key, 15 * 60 * 1000)) {
                this.setCooldown(key);
                await notificationService.sendNotification({
                  title: '⚠️ Autotallin ovi jäänyt auki!',
                  body: `Autotallin ovi on ollut auki jo ${Math.round(durationMin)} minuuttia. Muista sulkea ovi!`,
                  severity: 'warning',
                  type: 'door',
                  url: '/',
                });
              }
            }
          }
        }
      }
    }
  }

  /**
   * 6. Technical Room / Indoor Freeze Protection
   */
  async checkFreezeAlerts(state, settings) {
    if (settings.freeze_alerts_enabled === 'false') return;

    const tekTilaTemp = parseFloat(state['tuya/tekninen_tila/temperature']?.value || '20');
    if (tekTilaTemp < 10) {
      const key = 'freeze_tekninen_tila';
      if (!this.isCooldown(key, 6 * 60 * 60 * 1000)) {
        this.setCooldown(key);
        await notificationService.sendNotification({
          title: `❄️ Pakkasvaroitus teknisessä tilassa!`,
          body: `Teknisen tilan lämpötila on pudonnut arvoon ${tekTilaTemp.toFixed(1)} °C. Tarkista lämmitys!`,
          severity: 'critical',
          type: 'freeze',
          url: '/',
        });
      }
    }
  }

  /**
   * 6. Daily Morning Brief (07:30)
   */
  async checkDailyMorningReport(settings) {
    if (settings.daily_report_enabled === 'false') return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Check if report target time matches (e.g. 07:30)
    const reportTime = settings.daily_report_time || '07:30';
    const [targetH, targetM] = reportTime.split(':').map(Number);

    if (now.getHours() === targetH && now.getMinutes() >= targetM && now.getMinutes() <= targetM + 15) {
      if (this.lastDailyReportDate !== todayStr) {
        this.lastDailyReportDate = todayStr;

        try {
          // Get yesterday's date
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const yDateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          
          const yCost = db.getDailyCost(yDateStr);
          const cons = yCost ? yCost.total_consumption_kwh.toFixed(1) : '?';
          const cop = yCost && yCost.cop ? yCost.cop.toFixed(2) : '?';
          const savings = yCost && yCost.savings_eur ? `${yCost.savings_eur.toFixed(2)} €` : '0.00 €';

          // Get today's electricity prices
          const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
          const dayEnd = dayStart + 24 * 60 * 60 * 1000;
          const prices = getPrices(dayStart, dayEnd);

          let priceText = '';
          if (prices && prices.length > 0) {
            // Find minimum price slot
            const minPrice = Math.min(...prices.map(p => p.price));
            const minSlot = prices.find(p => p.price === minPrice);
            const minHour = minSlot ? new Date(minSlot.start_time).getHours() : 0;
            priceText = ` Tänään halvin sähkö klo ${String(minHour).padStart(2, '0')}:00 (${(minPrice / 10).toFixed(2)} snt/kWh).`;
          }

          await notificationService.sendNotification({
            title: `☀️ Kotiäly Aamukatsaus`,
            body: `Eilisen kulutus: ${cons} kWh (COP ${cop}, säästö ${savings}).${priceText}`,
            severity: 'info',
            type: 'daily_report',
            url: '/',
          });
        } catch (err) {
          console.error('[AlertEngine] Daily report generation failed:', err.message);
        }
      }
    }
  }
}

module.exports = new AlertEngine();
