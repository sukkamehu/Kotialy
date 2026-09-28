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

    const saunaSwitch = state['tuya/sauna/switch_1']?.value === 'true' || state['tuya/sauna/switch']?.value === '1';
    const saunaTemp = parseFloat(state['tuya/sauna/temperature']?.value || '0');

    if (saunaSwitch) {
      // Trigger when temp reaches 60°C for the first time during session
      if (saunaTemp >= 60 && !this.saunaNotified) {
        this.saunaNotified = true;
        await notificationService.sendNotification({
          title: `🧖 Sauna on lämmin! (${saunaTemp.toFixed(0)} °C)`,
          body: `Kiuas on saavuttanut tavoitelämmön. Löylyt ovat valmiina!`,
          severity: 'info',
          type: 'sauna',
          url: '/',
        });
      }
    } else {
      // Reset notification flag when sauna is turned off
      this.saunaNotified = false;
    }
  }

  /**
   * 5. Door / Garage Door Alerts
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
