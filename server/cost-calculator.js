const db = require('./db');
const { getPrices } = require('./nordpool-client');

/**
 * Helper to get local date string YYYY-MM-DD
 */
function toLocalDateStr(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get start and end timestamp in ms for a local date YYYY-MM-DD
 */
function getDayBounds(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  return { start, end };
}

/**
 * Calculate power average (Watts) in a time window [from, to] from history points
 */
function getAveragePowerInWindow(historyPoints, from, to) {
  if (!historyPoints || historyPoints.length === 0) return 0;

  // Filter points within window
  const windowPoints = historyPoints.filter(p => p.recorded_at >= from && p.recorded_at <= to);

  if (windowPoints.length > 0) {
    const sum = windowPoints.reduce((acc, p) => acc + (p.value || 0), 0);
    return sum / windowPoints.length;
  }

  // If no points in window, find the closest point before 'from'
  const prior = historyPoints.filter(p => p.recorded_at < from);
  if (prior.length > 0) {
    return prior[prior.length - 1].value || 0;
  }

  return 0;
}

/**
 * Calculate energy and costs for a given date 'YYYY-MM-DD'
 */
function calculateDay(dateStr) {
  const settings = db.getCostSettings();
  const { start, end } = getDayBounds(dateStr);
  const now = Date.now();
  const isPastDay = end < now;
  const effectiveEnd = isPastDay ? end : Math.min(end, now);

  if (start >= effectiveEnd) {
    return null;
  }

  // Consumption topics (prefer main, check extra)
  const heatConsHistory = db.getTopicHistory('main/Heat_Power_Consumption', start - 3600000, effectiveEnd);
  const dhwConsHistory = db.getTopicHistory('main/DHW_Power_Consumption', start - 3600000, effectiveEnd);
  const coolConsHistory = db.getTopicHistory('main/Cool_Power_Consumption', start - 3600000, effectiveEnd);

  // Production topics
  const heatProdHistory = db.getTopicHistory('main/Heat_Power_Production', start - 3600000, effectiveEnd);
  const dhwProdHistory = db.getTopicHistory('main/DHW_Power_Production', start - 3600000, effectiveEnd);
  const coolProdHistory = db.getTopicHistory('main/Cool_Power_Production', start - 3600000, effectiveEnd);

  // Fetch prices for this day
  const prices = db.db.prepare(`
    SELECT start_time, end_time, price FROM nordpool_prices
    WHERE start_time >= ? AND start_time <= ?
    ORDER BY start_time ASC
  `).all(start - 3600000, effectiveEnd + 3600000);

  // Default day average price in case of missing spot slots (EUR/MWh)
  let fallbackPrice = 50; // 5.0 c/kWh default
  if (prices.length > 0) {
    fallbackPrice = prices.reduce((acc, p) => acc + p.price, 0) / prices.length;
  }

  // Divide day into 15-minute slots (900,000 ms)
  const SLOT_MS = 15 * 60 * 1000;
  let currentSlotStart = start;

  let totalHeatConsKwh = 0;
  let totalDhwConsKwh = 0;
  let totalCoolConsKwh = 0;

  let totalHeatProdKwh = 0;
  let totalDhwProdKwh = 0;
  let totalCoolProdKwh = 0;

  let totalSpotCostEur = 0;
  let totalTransferCostEur = 0;
  let totalDirectElectricCostEur = 0;

  const vatMultiplier = 1 + (settings.vat_percent || 25.5) / 100;
  const marginCents = settings.margin_cents_kwh || 0.5;
  const transferCents = settings.transfer_cents_kwh || 4.5;

  while (currentSlotStart < effectiveEnd) {
    const slotEnd = Math.min(currentSlotStart + SLOT_MS, effectiveEnd);
    const durationHours = (slotEnd - currentSlotStart) / (1000 * 60 * 60);

    // Power in watts
    const heatConsW = getAveragePowerInWindow(heatConsHistory, currentSlotStart, slotEnd);
    const dhwConsW = getAveragePowerInWindow(dhwConsHistory, currentSlotStart, slotEnd);
    const coolConsW = getAveragePowerInWindow(coolConsHistory, currentSlotStart, slotEnd);

    const heatProdW = getAveragePowerInWindow(heatProdHistory, currentSlotStart, slotEnd);
    const dhwProdW = getAveragePowerInWindow(dhwProdHistory, currentSlotStart, slotEnd);
    const coolProdW = getAveragePowerInWindow(coolProdHistory, currentSlotStart, slotEnd);

    // kWh in this slot
    const slotHeatConsKwh = (heatConsW * durationHours) / 1000;
    const slotDhwConsKwh = (dhwConsW * durationHours) / 1000;
    const slotCoolConsKwh = (coolConsW * durationHours) / 1000;
    const slotTotalConsKwh = slotHeatConsKwh + slotDhwConsKwh + slotCoolConsKwh;

    const slotHeatProdKwh = (heatProdW * durationHours) / 1000;
    const slotDhwProdKwh = (dhwProdW * durationHours) / 1000;
    const slotCoolProdKwh = (coolProdW * durationHours) / 1000;
    const slotTotalProdKwh = slotHeatProdKwh + slotDhwProdKwh + slotCoolProdKwh;

    totalHeatConsKwh += slotHeatConsKwh;
    totalDhwConsKwh += slotDhwConsKwh;
    totalCoolConsKwh += slotCoolConsKwh;

    totalHeatProdKwh += slotHeatProdKwh;
    totalDhwProdKwh += slotDhwProdKwh;
    totalCoolProdKwh += slotCoolProdKwh;

    // Find price for this slot
    const slotPriceObj = prices.find(p => p.start_time <= currentSlotStart && p.end_time > currentSlotStart);
    const rawPriceEurMWh = slotPriceObj ? slotPriceObj.price : fallbackPrice;

    // Spot price with VAT in c/kWh: (EUR/MWh / 10) * vatMultiplier
    const spotPriceCentsKwh = (rawPriceEurMWh / 10) * vatMultiplier;
    const totalElecPriceCentsKwh = spotPriceCentsKwh + marginCents + transferCents;

    // Costs
    const slotSpotCostEur = slotTotalConsKwh * (spotPriceCentsKwh / 100);
    const slotTransferCostEur = slotTotalConsKwh * ((marginCents + transferCents) / 100);

    totalSpotCostEur += slotSpotCostEur;
    totalTransferCostEur += slotTransferCostEur;

    // Direct electric comparison (production * full electricity price)
    totalDirectElectricCostEur += slotTotalProdKwh * (totalElecPriceCentsKwh / 100);

    currentSlotStart += SLOT_MS;
  }

  const totalConsumptionKwh = totalHeatConsKwh + totalDhwConsKwh + totalCoolConsKwh;
  const totalProductionKwh = totalHeatProdKwh + totalDhwProdKwh + totalCoolProdKwh;
  const totalCostEur = totalSpotCostEur + totalTransferCostEur;

  const cop = totalConsumptionKwh > 0 ? Number((totalProductionKwh / totalConsumptionKwh).toFixed(2)) : null;
  const avgPriceCentsKwh = totalConsumptionKwh > 0 ? Number(((totalCostEur / totalConsumptionKwh) * 100).toFixed(2)) : null;
  const savingsEur = Number(Math.max(0, totalDirectElectricCostEur - totalCostEur).toFixed(2));

  const result = {
    date: dateStr,
    heat_consumption_kwh: Number(totalHeatConsKwh.toFixed(3)),
    dhw_consumption_kwh: Number(totalDhwConsKwh.toFixed(3)),
    cool_consumption_kwh: Number(totalCoolConsKwh.toFixed(3)),
    total_consumption_kwh: Number(totalConsumptionKwh.toFixed(3)),
    heat_production_kwh: Number(totalHeatProdKwh.toFixed(3)),
    dhw_production_kwh: Number(totalDhwProdKwh.toFixed(3)),
    total_production_kwh: Number(totalProductionKwh.toFixed(3)),
    cop,
    spot_cost_eur: Number(totalSpotCostEur.toFixed(2)),
    transfer_cost_eur: Number(totalTransferCostEur.toFixed(2)),
    total_cost_eur: Number(totalCostEur.toFixed(2)),
    avg_price_cents_kwh: avgPriceCentsKwh,
    savings_eur: savingsEur,
    is_final: isPastDay ? 1 : 0,
    updated_at: Date.now(),
  };

  db.upsertDailyCost(result);
  return result;
}

/**
 * Recalculate past N days (defaults to last 30 days)
 */
function recalculateRecentDays(days = 30) {
  const now = new Date();
  const results = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = toLocalDateStr(d);
    try {
      const res = calculateDay(dateStr);
      if (res) results.push(res);
    } catch (err) {
      console.error(`[COST-CALC] Failed to calculate for ${dateStr}:`, err.message);
    }
  }
  return results;
}

/**
 * Get summary stats (today, yesterday, this month, 30d totals)
 */
function getCostSummary() {
  const todayStr = toLocalDateStr(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateStr(yesterday);

  // Recalculate today to ensure real-time accuracy
  calculateDay(todayStr);

  const todayCost = db.getDailyCost(todayStr);
  const yesterdayCost = db.getDailyCost(yesterdayStr);

  // Current month prefix 'YYYY-MM'
  const currentMonthPrefix = todayStr.slice(0, 7);
  const allRows = db.getDailyCosts(null, null, 90);

  const monthRows = allRows.filter(r => r.date.startsWith(currentMonthPrefix));

  const monthTotalCost = monthRows.reduce((sum, r) => sum + (r.total_cost_eur || 0), 0);
  const monthTotalKwh = monthRows.reduce((sum, r) => sum + (r.total_consumption_kwh || 0), 0);
  const monthTotalProdKwh = monthRows.reduce((sum, r) => sum + (r.total_production_kwh || 0), 0);
  const monthSavings = monthRows.reduce((sum, r) => sum + (r.savings_eur || 0), 0);

  const monthCop = monthTotalKwh > 0 ? Number((monthTotalProdKwh / monthTotalKwh).toFixed(2)) : null;
  const monthAvgPrice = monthTotalKwh > 0 ? Number(((monthTotalCost / monthTotalKwh) * 100).toFixed(2)) : null;

  return {
    today: todayCost || {
      date: todayStr,
      total_consumption_kwh: 0,
      total_production_kwh: 0,
      total_cost_eur: 0,
      spot_cost_eur: 0,
      transfer_cost_eur: 0,
      savings_eur: 0,
      cop: null,
      avg_price_cents_kwh: null,
    },
    yesterday: yesterdayCost || null,
    month: {
      month: currentMonthPrefix,
      days_count: monthRows.length,
      total_cost_eur: Number(monthTotalCost.toFixed(2)),
      total_consumption_kwh: Number(monthTotalKwh.toFixed(1)),
      total_production_kwh: Number(monthTotalProdKwh.toFixed(1)),
      savings_eur: Number(monthSavings.toFixed(2)),
      cop: monthCop,
      avg_price_cents_kwh: monthAvgPrice,
    },
    settings: db.getCostSettings(),
  };
}

/**
 * Start periodic scheduler (every 10 minutes)
 */
function startScheduler() {
  // Initial run on startup: calculate recent days & today
  try {
    recalculateRecentDays(7);
  } catch (err) {
    console.error('[COST-CALC] Initial calculation error:', err.message);
  }

  // Periodic interval (every 10 min)
  return setInterval(() => {
    try {
      const todayStr = toLocalDateStr(new Date());
      calculateDay(todayStr);

      // Check if it's right after midnight (e.g. 00:00 - 00:20), finalize yesterday
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 25) {
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        calculateDay(toLocalDateStr(y));
      }
    } catch (err) {
      console.error('[COST-CALC] Periodic update error:', err.message);
    }
  }, 10 * 60 * 1000);
}

module.exports = {
  calculateDay,
  recalculateRecentDays,
  getCostSummary,
  startScheduler,
  toLocalDateStr,
};
