const db = require('./db');

const HERRFORS_BASE_URL = 'https://portal.herrfors.fi';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

class HerrforsClient {
  constructor() {
    this.sessionTimer = null;
    this.syncTimer = null;
    this.isRefreshing = false;
    this.isSyncing = false;
    this.lastError = null;
    this.sessionInfo = null;
  }

  /**
   * Get current settings from DB / Env
   */
  getSettings() {
    return db.getHerrforsSettings();
  }

  /**
   * Get active session token
   */
  getToken() {
    const settings = this.getSettings();
    return settings.session_token || process.env.HERRFORS_SESSION_TOKEN || '';
  }

  /**
   * Get active coId / contract ID
   */
  getCoId() {
    const settings = this.getSettings();
    return settings.co_id || process.env.HERRFORS_CO_ID || '60931591';
  }

  /**
   * Helper headers for Herrfors API calls
   */
  getHeaders(token) {
    return {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'fi,en-US;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'referer': `${HERRFORS_BASE_URL}/fi-FI/charts`,
      'user-agent': USER_AGENT,
      'cookie': `__Secure-next-auth.session-token=${token};`,
    };
  }

  /**
   * Refresh session token by querying /api/auth/session
   * This extends the token validity by 24 hours.
   */
  async refreshSession() {
    const token = this.getToken();
    if (!token) {
      this.lastError = 'Herrfors session token puuttuu';
      return { ok: false, error: this.lastError };
    }

    if (this.isRefreshing) {
      return { ok: true, message: 'Refresh already in progress' };
    }

    this.isRefreshing = true;
    try {
      console.log('[HERRFORS] Virkistetään session token...');
      const res = await fetch(`${HERRFORS_BASE_URL}/api/auth/session`, {
        method: 'GET',
        headers: this.getHeaders(token),
      });

      if (!res.ok) {
        throw new Error(`Herrfors auth/session palautti tilakoodin ${res.status} ${res.statusText}`);
      }

      // Check if a new cookie was set
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        const match = setCookie.match(/__Secure-next-auth\.session-token=([^;]+)/);
        if (match && match[1] && match[1] !== token) {
          console.log('[HERRFORS] Uusi session token vastaanotettu ja päivitetty.');
          db.updateHerrforsSetting('session_token', match[1]);
        }
      }

      const data = await res.json();
      this.sessionInfo = data;
      this.lastError = null;

      if (data?.expires) {
        db.updateHerrforsSetting('token_expires', data.expires);
      }
      db.updateHerrforsSetting('last_refresh_at', Date.now());

      console.log(`[HERRFORS] Session token virkistetty onnistuneesti (Voimassa: ${data?.expires || '24h'})`);
      return {
        ok: true,
        expires: data.expires,
        refreshedAt: Date.now(),
      };
    } catch (err) {
      this.lastError = err.message;
      console.error('[HERRFORS] Session virkistys epäonnistui:', err.message);
      return { ok: false, error: err.message };
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Fetch 15-minute readings for a specific date range [fromIso, toIso]
   */
  async fetchReadingsChunk(fromIso, toIso) {
    const token = this.getToken();
    const coId = this.getCoId();
    if (!token || !coId) {
      throw new Error('Herrfors token tai coId puuttuu');
    }

    const url = `${HERRFORS_BASE_URL}/api/charts/readings?coId=${encodeURIComponent(coId)}&consumption=true&price=true&temp=false&timeStep=15&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(token),
    });

    if (!res.ok) {
      throw new Error(`Herrfors charts/readings palautti tilakoodin ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const values = data.values || [];
    const readings = [];

    for (const v of values) {
      if (!v.date) continue;
      const startMs = new Date(v.date).getTime();
      if (isNaN(startMs)) continue;
      const endMs = startMs + 15 * 60 * 1000;
      const dateStr = new Date(startMs).toISOString().slice(0, 10);

      readings.push({
        start_time: startMs,
        end_time: endMs,
        date_str: dateStr,
        consumption_kwh: v.consumption != null ? Number(v.consumption) : null,
        price: v.price != null ? Number(v.price) : null,
        price_with_vat: v.priceWithVat != null ? Number(v.priceWithVat) : null,
        fetched_at: Date.now(),
      });
    }

    if (readings.length > 0) {
      db.upsertHerrforsReadings(readings);
    }

    return {
      count: readings.length,
      maxPower: data.maximumPowerConsumption || null,
      readings,
    };
  }

  /**
   * Fetch and sync readings for a date range in 1-day chunks (to preserve 15-minute resolution)
   */
  async syncRange(startDate, endDate) {
    if (this.isSyncing) {
      return { ok: true, message: 'Sync already in progress' };
    }

    this.isSyncing = true;
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;

    let currentStart = startMs;
    let totalSaved = 0;

    try {
      // First ensure session is fresh
      await this.refreshSession();

      while (currentStart < endMs) {
        const currentEnd = Math.min(currentStart + DAY_MS, endMs);
        const fromIso = new Date(currentStart).toISOString();
        const toIso = new Date(currentEnd).toISOString();

        console.log(`[HERRFORS] Haetaan mittaukset väliltä ${fromIso} - ${toIso}...`);
        const result = await this.fetchReadingsChunk(fromIso, toIso);
        totalSaved += result.count;

        currentStart = currentEnd;
        // Brief pause to avoid hammering API
        await new Promise(r => setTimeout(r, 300));
      }

      db.updateHerrforsSetting('last_sync_at', Date.now());
      db.updateHerrforsSetting('last_sync_status', 'OK');
      console.log(`[HERRFORS] Synkronointi valmis. Tallennettu yhteensä ${totalSaved} 15-min mittauspistettä.`);

      // Automatically push backup to Cloudflare R2 if configured
      if (totalSaved > 0) {
        try {
          const s3Service = require('./s3-service');
          if (s3Service && s3Service.isConfigured()) {
            s3Service.backupDatabase().catch(err => {
              console.error('[R2] Post-sync backup failed:', err.message);
            });
          }
        } catch {
          // ignore
        }
      }

      return { ok: true, totalSaved };
    } catch (err) {
      this.lastError = err.message;
      db.updateHerrforsSetting('last_sync_status', `Virhe: ${err.message}`);
      console.error('[HERRFORS] Synkronointivirhe:', err.message);
      return { ok: false, error: err.message, totalSaved };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync past N days
   */
  async syncRecentDays(days = 7) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    return this.syncRange(start.toISOString(), end.toISOString());
  }

  /**
   * Get comprehensive heating vs total electricity analysis
   */
  getHeatingComparison(fromMs, toMs) {
    const now = Date.now();
    const effectiveFrom = fromMs ? Number(fromMs) : now - 7 * 24 * 60 * 60 * 1000;
    const effectiveTo = toMs ? Number(toMs) : now;

    // 1. Fetch Herrfors readings for this window
    const herrforsRows = db.getHerrforsReadings(effectiveFrom, effectiveTo);

    // 2. Fetch Heat pump consumption topics from sensor_history
    const heatHistory = db.getTopicHistory('main/Heat_Power_Consumption', effectiveFrom - 3600000, effectiveTo);
    const dhwHistory = db.getTopicHistory('main/DHW_Power_Consumption', effectiveFrom - 3600000, effectiveTo);
    const coolHistory = db.getTopicHistory('main/Cool_Power_Consumption', effectiveFrom - 3600000, effectiveTo);

    const heatProdHistory = db.getTopicHistory('main/Heat_Power_Production', effectiveFrom - 3600000, effectiveTo);
    const dhwProdHistory = db.getTopicHistory('main/DHW_Power_Production', effectiveFrom - 3600000, effectiveTo);

    const costSettings = db.getCostSettings();
    const vatMultiplier = 1 + (costSettings.vat_percent || 25.5) / 100;
    const marginCents = costSettings.margin_cents_kwh || 0.286;

    const getTransferCents = (timeMs) => {
      if (costSettings.transfer_mode === 'day_night') {
        const h = new Date(timeMs).getHours();
        const isNight = h >= 22 || h < 7;
        return isNight
          ? (costSettings.transfer_night_cents_kwh != null ? costSettings.transfer_night_cents_kwh : 3.12)
          : (costSettings.transfer_day_cents_kwh != null ? costSettings.transfer_day_cents_kwh : 5.11);
      }
      return costSettings.transfer_cents_kwh || 4.50;
    };

    const helperAvgPower = (history, start, end) => {
      if (!history || history.length === 0) return 0;
      const pts = history.filter(p => p.recorded_at >= start && p.recorded_at <= end);
      if (pts.length > 0) {
        return pts.reduce((s, p) => s + (p.value || 0), 0) / pts.length;
      }
      const prior = history.filter(p => p.recorded_at < start);
      if (prior.length > 0) return prior[prior.length - 1].value || 0;
      return 0;
    };

    // Construct 15-min aligned series
    const series = [];
    let totalHouseKwh = 0;
    let totalHeatPumpKwh = 0;
    let totalHeatingKwh = 0;
    let totalDhwKwh = 0;
    let totalHouseholdOtherKwh = 0;

    let totalHeatProdKwh = 0;
    let totalDhwProdKwh = 0;

    let totalHouseCostEur = 0;
    let totalHeatPumpCostEur = 0;
    let totalHouseholdOtherCostEur = 0;
    let totalDirectElectricCostEur = 0;

    let peakHousePowerKw = 0;
    let peakHousePowerTime = null;

    for (const h of herrforsRows) {
      const slotStart = h.start_time;
      const slotEnd = h.end_time;
      const durationHours = 0.25; // 15 min

      const houseKwh = h.consumption_kwh != null ? h.consumption_kwh : 0;
      const houseKw = houseKwh * 4; // instantaneous kW average

      if (houseKw > peakHousePowerKw) {
        peakHousePowerKw = houseKw;
        peakHousePowerTime = slotStart;
      }

      const heatPowerW = helperAvgPower(heatHistory, slotStart, slotEnd);
      const dhwPowerW = helperAvgPower(dhwHistory, slotStart, slotEnd);
      const coolPowerW = helperAvgPower(coolHistory, slotStart, slotEnd);

      const heatProdW = helperAvgPower(heatProdHistory, slotStart, slotEnd);
      const dhwProdW = helperAvgPower(dhwProdHistory, slotStart, slotEnd);

      const heatKwh = (heatPowerW * durationHours) / 1000;
      const dhwKwh = (dhwPowerW * durationHours) / 1000;
      const coolKwh = (coolPowerW * durationHours) / 1000;
      const hpTotalKwh = heatKwh + dhwKwh + coolKwh;

      const heatProdSlotKwh = (heatProdW * durationHours) / 1000;
      const dhwProdSlotKwh = (dhwProdW * durationHours) / 1000;
      const totalProdSlotKwh = heatProdSlotKwh + dhwProdSlotKwh;

      // Household other electricity = House Total - HeatPump Total
      // (Clamp to 0 in case of minor meter timing variances)
      const otherKwh = Math.max(0, houseKwh - hpTotalKwh);

      // Price: use Herrfors priceWithVat if available, else spot
      const priceWithVatCents = h.price_with_vat != null
        ? h.price_with_vat
        : (h.price != null ? h.price * vatMultiplier : 5.0);

      const transferCents = getTransferCents(slotStart);
      const fullPriceCentsKwh = priceWithVatCents + marginCents + transferCents;

      const houseCostEur = houseKwh * (fullPriceCentsKwh / 100);
      const hpCostEur = hpTotalKwh * (fullPriceCentsKwh / 100);
      const otherCostEur = otherKwh * (fullPriceCentsKwh / 100);
      const directElecCostEur = totalProdSlotKwh * (fullPriceCentsKwh / 100);

      totalHouseKwh += houseKwh;
      totalHeatPumpKwh += hpTotalKwh;
      totalHeatingKwh += heatKwh;
      totalDhwKwh += dhwKwh;
      totalHouseholdOtherKwh += otherKwh;

      totalHeatProdKwh += heatProdSlotKwh;
      totalDhwProdKwh += dhwProdSlotKwh;

      totalHouseCostEur += houseCostEur;
      totalHeatPumpCostEur += hpCostEur;
      totalHouseholdOtherCostEur += otherCostEur;
      totalDirectElectricCostEur += directElecCostEur;

      series.push({
        time: slotStart,
        date_str: h.date_str,
        house_kwh: Number(houseKwh.toFixed(3)),
        heatpump_kwh: Number(hpTotalKwh.toFixed(3)),
        heating_kwh: Number(heatKwh.toFixed(3)),
        dhw_kwh: Number(dhwKwh.toFixed(3)),
        other_kwh: Number(otherKwh.toFixed(3)),
        price_cents: Number(priceWithVatCents.toFixed(2)),
        full_price_cents: Number(fullPriceCentsKwh.toFixed(2)),
        house_power_kw: Number(houseKw.toFixed(2)),
        heatpump_power_kw: Number(((hpTotalKwh * 4)).toFixed(2)),
        other_power_kw: Number(((otherKwh * 4)).toFixed(2)),
      });
    }

    const heatingSharePercent = totalHouseKwh > 0
      ? Number(((totalHeatPumpKwh / totalHouseKwh) * 100).toFixed(1))
      : 0;
    const otherSharePercent = totalHouseKwh > 0
      ? Number(((totalHouseholdOtherKwh / totalHouseKwh) * 100).toFixed(1))
      : 0;

    const totalProdKwh = totalHeatProdKwh + totalDhwProdKwh;
    const overallCop = totalHeatPumpKwh > 0 ? Number((totalProdKwh / totalHeatPumpKwh).toFixed(2)) : null;
    const estimatedSavingsEur = Number(Math.max(0, totalDirectElectricCostEur - totalHeatPumpCostEur).toFixed(2));
    const avgRealizedPriceCents = totalHouseKwh > 0
      ? Number(((totalHouseCostEur / totalHouseKwh) * 100).toFixed(2))
      : 0;

    // Daily breakdown
    const dailyMap = {};
    for (const pt of series) {
      if (!dailyMap[pt.date_str]) {
        dailyMap[pt.date_str] = {
          date: pt.date_str,
          timestamp: pt.time,
          house_kwh: 0,
          heatpump_kwh: 0,
          heating_kwh: 0,
          dhw_kwh: 0,
          other_kwh: 0,
          house_cost_eur: 0,
          heatpump_cost_eur: 0,
          other_cost_eur: 0,
          slot_count: 0,
        };
      }
      const d = dailyMap[pt.date_str];
      d.house_kwh += pt.house_kwh;
      d.heatpump_kwh += pt.heatpump_kwh;
      d.heating_kwh += pt.heating_kwh;
      d.dhw_kwh += pt.dhw_kwh;
      d.other_kwh += pt.other_kwh;
      d.house_cost_eur += pt.house_kwh * (pt.full_price_cents / 100);
      d.heatpump_cost_eur += pt.heatpump_kwh * (pt.full_price_cents / 100);
      d.other_cost_eur += pt.other_kwh * (pt.full_price_cents / 100);
      d.slot_count++;
    }

    const dailyBreakdown = Object.values(dailyMap).map(d => ({
      ...d,
      house_kwh: Number(d.house_kwh.toFixed(2)),
      heatpump_kwh: Number(d.heatpump_kwh.toFixed(2)),
      heating_kwh: Number(d.heating_kwh.toFixed(2)),
      dhw_kwh: Number(d.dhw_kwh.toFixed(2)),
      other_kwh: Number(d.other_kwh.toFixed(2)),
      house_cost_eur: Number(d.house_cost_eur.toFixed(2)),
      heatpump_cost_eur: Number(d.heatpump_cost_eur.toFixed(2)),
      other_cost_eur: Number(d.other_cost_eur.toFixed(2)),
      heating_share_percent: d.house_kwh > 0 ? Number(((d.heatpump_kwh / d.house_kwh) * 100).toFixed(1)) : 0,
    }));

    return {
      summary: {
        total_house_kwh: Number(totalHouseKwh.toFixed(2)),
        total_heatpump_kwh: Number(totalHeatPumpKwh.toFixed(2)),
        total_heating_kwh: Number(totalHeatingKwh.toFixed(2)),
        total_dhw_kwh: Number(totalDhwKwh.toFixed(2)),
        total_other_kwh: Number(totalHouseholdOtherKwh.toFixed(2)),
        heating_share_percent: heatingSharePercent,
        other_share_percent: otherSharePercent,
        total_house_cost_eur: Number(totalHouseCostEur.toFixed(2)),
        total_heatpump_cost_eur: Number(totalHeatPumpCostEur.toFixed(2)),
        total_other_cost_eur: Number(totalHouseholdOtherCostEur.toFixed(2)),
        avg_realized_price_cents: avgRealizedPriceCents,
        cop: overallCop,
        savings_eur: estimatedSavingsEur,
        peak_power_kw: Number(peakHousePowerKw.toFixed(2)),
        peak_power_time: peakHousePowerTime,
        readings_count: herrforsRows.length,
      },
      daily: dailyBreakdown,
      series,
      from: effectiveFrom,
      to: effectiveTo,
    };
  }

  /**
   * Get client status
   */
  getStatus() {
    const settings = this.getSettings();
    const stats = db.getHerrforsStats();
    const refreshMinutes = settings.refresh_interval_minutes || 5;
    const lastRefresh = settings.last_refresh_at || 0;
    const nextRefresh = lastRefresh ? lastRefresh + refreshMinutes * 60 * 1000 : null;

    return {
      enabled: settings.enabled,
      configured: Boolean(settings.session_token && settings.co_id),
      session_active: Boolean(settings.token_expires && !this.lastError),
      co_id: settings.co_id,
      token_expires: settings.token_expires,
      last_refresh_at: settings.last_refresh_at,
      next_refresh_at: nextRefresh,
      last_sync_at: settings.last_sync_at,
      last_sync_status: settings.last_sync_status,
      last_error: this.lastError,
      is_refreshing: this.isRefreshing,
      is_syncing: this.isSyncing,
      stats,
    };
  }

  /**
   * Start periodic schedulers:
   * 1. Session token refresh (every ~4.5 minutes)
   * 2. Periodic reading sync (every 15 minutes)
   */
  startScheduler() {
    const settings = this.getSettings();
    if (!settings.enabled) {
      console.log('[HERRFORS] Integraatio pois päältä (HERRFORS_ENABLED=false)');
      return;
    }

    console.log('[HERRFORS] Käynnistetään Herrfors-asiakaspalvelu ja ajastimet...');

    // 1. Initial session refresh & 7-day sync on startup
    setTimeout(async () => {
      try {
        const refRes = await this.refreshSession();
        if (refRes.ok) {
          // Sync last 7 days
          await this.syncRecentDays(7);
        }
      } catch (err) {
        console.error('[HERRFORS] Startup sync error:', err.message);
      }
    }, 3000);

    // 2. Session refresh timer (every 4.5 minutes = 270,000 ms)
    const refreshIntervalMs = Math.max(2, (settings.refresh_interval_minutes || 5) - 0.5) * 60 * 1000;
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    this.sessionTimer = setInterval(() => {
      this.refreshSession().catch(err => {
        console.error('[HERRFORS] Scheduled refresh error:', err.message);
      });
    }, refreshIntervalMs);

    // 3. Periodic reading sync (every 15 minutes, fetch past 48h to catch settled meter readings)
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      this.syncRecentDays(2).catch(err => {
        console.error('[HERRFORS] Scheduled sync error:', err.message);
      });
    }, 15 * 60 * 1000);
  }

  stopScheduler() {
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.sessionTimer = null;
    this.syncTimer = null;
  }
}

const herrforsClient = new HerrforsClient();
module.exports = herrforsClient;
