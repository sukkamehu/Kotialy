const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Use Node.js v22.5+ built-in sqlite (no native compilation required)
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || './data/kotialy.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA busy_timeout = 5000');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sensor_state (
    topic       TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sensor_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    topic       TEXT NOT NULL,
    value       REAL NOT NULL,
    recorded_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_history_topic_time
    ON sensor_history (topic, recorded_at);

  CREATE TABLE IF NOT EXISTS nordpool_prices (
    start_time INTEGER PRIMARY KEY,
    end_time   INTEGER NOT NULL,
    price      REAL    NOT NULL,
    currency   TEXT    NOT NULL,
    resolution INTEGER NOT NULL,
    area       TEXT    NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_nordpool_start
    ON nordpool_prices (start_time);

  CREATE TABLE IF NOT EXISTS weather_forecast (
    source      TEXT    NOT NULL,
    time        INTEGER PRIMARY KEY,
    temperature REAL    NOT NULL,
    feels_like  REAL,
    humidity    REAL,
    wind_speed  REAL,
    wind_dir    REAL,
    symbol      TEXT,
    rain_mm     REAL,
    pressure    REAL,
    fetched_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_weather_time
    ON weather_forecast (time);

  CREATE TABLE IF NOT EXISTS daily_costs (
    date                   TEXT PRIMARY KEY,
    heat_consumption_kwh   REAL NOT NULL DEFAULT 0,
    dhw_consumption_kwh    REAL NOT NULL DEFAULT 0,
    cool_consumption_kwh   REAL NOT NULL DEFAULT 0,
    total_consumption_kwh  REAL NOT NULL DEFAULT 0,
    heat_production_kwh    REAL NOT NULL DEFAULT 0,
    dhw_production_kwh     REAL NOT NULL DEFAULT 0,
    total_production_kwh   REAL NOT NULL DEFAULT 0,
    cop                    REAL,
    spot_cost_eur          REAL NOT NULL DEFAULT 0,
    transfer_cost_eur      REAL NOT NULL DEFAULT 0,
    total_cost_eur         REAL NOT NULL DEFAULT 0,
    avg_price_cents_kwh    REAL,
    savings_eur            REAL NOT NULL DEFAULT 0,
    is_final               INTEGER NOT NULL DEFAULT 0,
    updated_at             INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_daily_costs_date
    ON daily_costs (date);

  CREATE TABLE IF NOT EXISTS cost_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS apc_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS apc_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     INTEGER NOT NULL,
    action        TEXT NOT NULL,
    reason        TEXT NOT NULL,
    price_cents   REAL,
    outdoor_temp  REAL,
    buffer_temp   REAL,
    dhw_temp      REAL,
    directive     TEXT NOT NULL,
    details       TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_apc_logs_time
    ON apc_logs (timestamp);

  CREATE TABLE IF NOT EXISTS herrfors_readings (
    start_time      INTEGER PRIMARY KEY,
    end_time        INTEGER NOT NULL,
    date_str        TEXT NOT NULL,
    consumption_kwh REAL,
    price           REAL,
    price_with_vat  REAL,
    temperature     REAL,
    fetched_at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_herrfors_start
    ON herrfors_readings (start_time);

  CREATE INDEX IF NOT EXISTS idx_herrfors_date
    ON herrfors_readings (date_str);

  CREATE TABLE IF NOT EXISTS herrfors_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Safe migrations
try {
  db.exec(`ALTER TABLE herrfors_readings ADD COLUMN temperature REAL;`);
} catch {
  // column already exists
}

// ─── Prepared Statements ─────────────────────────────────────────────────────
// node:sqlite uses ? placeholders and positional arguments

const stmtUpsertState = db.prepare(`
  INSERT INTO sensor_state (topic, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(topic) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

const stmtInsertHistory = db.prepare(`
  INSERT INTO sensor_history (topic, value, recorded_at)
  VALUES (?, ?, ?)
`);

const stmtGetState = db.prepare(`SELECT * FROM sensor_state`);

const stmtGetHistory = db.prepare(`
  SELECT topic, value, recorded_at
  FROM sensor_history
  WHERE topic = ?
    AND recorded_at >= ?
    AND recorded_at <= ?
  ORDER BY recorded_at ASC
`);

const stmtGetHistoryMulti = db.prepare(`
  SELECT topic, value, recorded_at
  FROM sensor_history
  WHERE topic IN (SELECT value FROM json_each(?))
    AND recorded_at >= ?
    AND recorded_at <= ?
  ORDER BY recorded_at ASC
`);

const stmtGetLatestHistory = db.prepare(`
  SELECT recorded_at FROM sensor_history
  WHERE topic = ?
  ORDER BY recorded_at DESC LIMIT 1
`);

const stmtUpsertDailyCost = db.prepare(`
  INSERT INTO daily_costs (
    date,
    heat_consumption_kwh,
    dhw_consumption_kwh,
    cool_consumption_kwh,
    total_consumption_kwh,
    heat_production_kwh,
    dhw_production_kwh,
    total_production_kwh,
    cop,
    spot_cost_eur,
    transfer_cost_eur,
    total_cost_eur,
    avg_price_cents_kwh,
    savings_eur,
    is_final,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET
    heat_consumption_kwh = excluded.heat_consumption_kwh,
    dhw_consumption_kwh = excluded.dhw_consumption_kwh,
    cool_consumption_kwh = excluded.cool_consumption_kwh,
    total_consumption_kwh = excluded.total_consumption_kwh,
    heat_production_kwh = excluded.heat_production_kwh,
    dhw_production_kwh = excluded.dhw_production_kwh,
    total_production_kwh = excluded.total_production_kwh,
    cop = excluded.cop,
    spot_cost_eur = excluded.spot_cost_eur,
    transfer_cost_eur = excluded.transfer_cost_eur,
    total_cost_eur = excluded.total_cost_eur,
    avg_price_cents_kwh = excluded.avg_price_cents_kwh,
    savings_eur = excluded.savings_eur,
    is_final = excluded.is_final,
    updated_at = excluded.updated_at
`);

const stmtGetDailyCosts = db.prepare(`
  SELECT * FROM daily_costs
  WHERE date >= ? AND date <= ?
  ORDER BY date ASC
`);

const stmtGetRecentDailyCosts = db.prepare(`
  SELECT * FROM daily_costs
  ORDER BY date DESC
  LIMIT ?
`);

const stmtGetDailyCostByDate = db.prepare(`
  SELECT * FROM daily_costs
  WHERE date = ?
`);

const stmtGetCostSettings = db.prepare(`SELECT key, value FROM cost_settings`);

const stmtUpsertCostSetting = db.prepare(`
  INSERT INTO cost_settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const stmtUpsertHerrforsReading = db.prepare(`
  INSERT INTO herrfors_readings (start_time, end_time, date_str, consumption_kwh, price, price_with_vat, temperature, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(start_time) DO UPDATE SET
    end_time = excluded.end_time,
    date_str = excluded.date_str,
    consumption_kwh = COALESCE(excluded.consumption_kwh, herrfors_readings.consumption_kwh),
    price = COALESCE(excluded.price, herrfors_readings.price),
    price_with_vat = COALESCE(excluded.price_with_vat, herrfors_readings.price_with_vat),
    temperature = COALESCE(excluded.temperature, herrfors_readings.temperature),
    fetched_at = excluded.fetched_at
`);

const stmtGetHerrforsReadings = db.prepare(`
  SELECT start_time, end_time, date_str, consumption_kwh, price, price_with_vat, temperature, fetched_at
  FROM herrfors_readings
  WHERE start_time >= ? AND start_time <= ?
  ORDER BY start_time ASC
`);

const stmtGetHerrforsSettings = db.prepare(`SELECT key, value FROM herrfors_settings`);

const stmtUpsertHerrforsSetting = db.prepare(`
  INSERT INTO herrfors_settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const stmtGetHerrforsLatestReading = db.prepare(`
  SELECT start_time, date_str, consumption_kwh, price, temperature, fetched_at
  FROM herrfors_readings
  WHERE consumption_kwh IS NOT NULL
  ORDER BY start_time DESC
  LIMIT 1
`);

const stmtGetHerrforsCount = db.prepare(`SELECT COUNT(*) as count FROM herrfors_readings`);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Update the current state for a topic.
 */
function updateState(topic, value) {
  try {
    stmtUpsertState.run(topic, String(value), Date.now());
  } catch (err) {
    console.error(`[DB] updateState failed for ${topic}:`, err.message);
  }
}

/**
 * Append a history record for numeric topics.
 */
function appendHistory(topic, value) {
  const numVal = parseFloat(value);
  if (isNaN(numVal)) return;
  try {
    stmtInsertHistory.run(topic, numVal, Date.now());
  } catch (err) {
    console.error(`[DB] appendHistory failed for ${topic}:`, err.message);
  }
}

/**
 * Append history only if enough time has passed since the last record.
 */
function maybeAppendHistory(topic, value, intervalMs) {
  try {
    const last = stmtGetLatestHistory.get(topic);
    if (!last || Date.now() - Number(last.recorded_at) >= intervalMs) {
      appendHistory(topic, value);
      return true;
    }
  } catch (err) {
    console.error(`[DB] maybeAppendHistory failed for ${topic}:`, err.message);
  }
  return false;
}

/**
 * Get the full current state as { topic: { value, updated_at } }
 */
function getFullState() {
  const rows = stmtGetState.all();
  const state = {};
  for (const row of rows) {
    state[row.topic] = { value: row.value, updated_at: Number(row.updated_at) };
  }
  return state;
}

/**
 * Get history for a single topic between from/to Unix ms timestamps.
 */
function getTopicHistory(topic, from, to) {
  return stmtGetHistory.all(topic, from, to).map((r) => ({
    topic: r.topic,
    value: Number(r.value),
    recorded_at: Number(r.recorded_at),
  }));
}

/**
 * Get history for multiple topics.
 */
function getMultiTopicHistory(topicsArray, from, to) {
  return stmtGetHistoryMulti.all(JSON.stringify(topicsArray), from, to).map((r) => ({
    topic: r.topic,
    value: Number(r.value),
    recorded_at: Number(r.recorded_at),
  }));
}

/**
 * Upsert daily cost entry.
 */
function upsertDailyCost(cost) {
  stmtUpsertDailyCost.run(
    cost.date,
    cost.heat_consumption_kwh || 0,
    cost.dhw_consumption_kwh || 0,
    cost.cool_consumption_kwh || 0,
    cost.total_consumption_kwh || 0,
    cost.heat_production_kwh || 0,
    cost.dhw_production_kwh || 0,
    cost.total_production_kwh || 0,
    cost.cop != null ? cost.cop : null,
    cost.spot_cost_eur || 0,
    cost.transfer_cost_eur || 0,
    cost.total_cost_eur || 0,
    cost.avg_price_cents_kwh != null ? cost.avg_price_cents_kwh : null,
    cost.savings_eur || 0,
    cost.is_final ? 1 : 0,
    cost.updated_at || Date.now()
  );
}

/**
 * Get daily costs for a date range or latest N days.
 */
function getDailyCosts(startDate, endDate, limit = 30) {
  if (startDate && endDate) {
    return stmtGetDailyCosts.all(startDate, endDate);
  }
  const rows = stmtGetRecentDailyCosts.all(limit);
  return rows.reverse(); // chronological order
}

/**
 * Get single day cost.
 */
function getDailyCost(dateStr) {
  return stmtGetDailyCostByDate.get(dateStr) || null;
}

/**
 * Get cost settings with defaults.
 */
function getCostSettings() {
  const rows = stmtGetCostSettings.all();
  const settings = {
    margin_cents_kwh: 0.286,         // 0.286 c/kWh välityspalkkio (sis. alv)
    transfer_mode: 'day_night',       // 'flat' | 'day_night'
    transfer_cents_kwh: 4.50,        // Yksiaikainen siirtohinta (fallback)
    transfer_day_cents_kwh: 5.11,    // Päiväsiirto klo 07–22 (alv 25,5 %)
    transfer_night_cents_kwh: 3.12,  // Yösiirto klo 22–07 (alv 25,5 %)
    fuse_size: '25A',                // Sulakekoko
    monthly_base_fee_eur: 0,         // Kiinteää perusmaksua ei lasketa lämmityksen kuluihin
    vat_percent: 25.5,               // ALV 25.5%
  };
  for (const r of rows) {
    if (r.key === 'transfer_mode' || r.key === 'fuse_size') {
      settings[r.key] = r.value;
    } else {
      const n = parseFloat(r.value);
      if (!isNaN(n)) settings[r.key] = n;
    }
  }
  return settings;
}

/**
 * Update single cost setting.
 */
function updateCostSetting(key, value) {
  stmtUpsertCostSetting.run(key, String(value));
}

const stmtGetApcSettings = db.prepare(`SELECT key, value FROM apc_settings`);

const stmtUpsertApcSetting = db.prepare(`
  INSERT INTO apc_settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const stmtInsertApcLog = db.prepare(`
  INSERT INTO apc_logs (timestamp, action, reason, price_cents, outdoor_temp, buffer_temp, dhw_temp, directive, details)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtGetApcLogs = db.prepare(`
  SELECT * FROM apc_logs
  ORDER BY timestamp DESC
  LIMIT ?
`);

/**
 * Get APC settings with defaults.
 */
function getApcSettings() {
  const rows = stmtGetApcSettings.all();
  const settings = {
    enabled: true,
    mode: 'balanced', // 'balanced' | 'eco' | 'comfort' | 'dhw_only'
    base_z1_shift: 0,
    buffer_boost_c: 3,
    buffer_setback_c: -2,
    dhw_target_c: 55,
    dhw_boost_target_c: 55,
    dhw_normal_target_c: 50,
    dhw_min_c: 45,
    dhw_boost_on_cheap: true,
    cheap_threshold_cents: 3.0,
    peak_threshold_cents: 20.0,
    dhw_duration_hours: 2,
    override_until: 0,
    override_directive: null,
    heating_cutoff_c: 13,
    prevent_curve_shift_above_cutoff: true,
    floor_pump_mode: 'auto', // 'auto' | 'constant_on' | 'constant_off'
    floor_pump_summer_cutoff_temp: 20.0,
    floor_pump_summer_pulse_enabled: true,
    floor_pump_anti_seize_enabled: true,
    floor_pump_override_until: 0,
    floor_pump_override_state: null,
    defrost_cable_mode: 'auto', // 'auto' | 'constant_on' | 'constant_off'
    defrost_cable_temp_threshold: 2.0,
    defrost_cable_hard_freeze_temp: -5.0,
    defrost_cable_defrost_runover_min: 20,
    defrost_cable_override_until: 0,
    defrost_cable_override_state: null,
  };

  for (const r of rows) {
    if (r.key === 'enabled') {
      settings.enabled = r.value === '1' || r.value === 'true';
    } else if (r.key === 'dhw_boost_on_cheap') {
      settings.dhw_boost_on_cheap = r.value === '1' || r.value === 'true';
    } else if (r.key === 'prevent_curve_shift_above_cutoff') {
      settings.prevent_curve_shift_above_cutoff = r.value === '1' || r.value === 'true';
    } else if (r.key === 'floor_pump_anti_seize_enabled') {
      settings.floor_pump_anti_seize_enabled = r.value === '1' || r.value === 'true';
    } else if (r.key === 'floor_pump_summer_pulse_enabled') {
      settings.floor_pump_summer_pulse_enabled = r.value === '1' || r.value === 'true';
    } else if (
      r.key === 'mode' ||
      r.key === 'override_directive' ||
      r.key === 'floor_pump_mode' ||
      r.key === 'floor_pump_override_state' ||
      r.key === 'defrost_cable_mode' ||
      r.key === 'defrost_cable_override_state'
    ) {
      settings[r.key] = r.value;
    } else {
      const n = parseFloat(r.value);
      if (!isNaN(n)) settings[r.key] = n;
    }
  }
  return settings;
}

/**
 * Update single APC setting.
 */
function updateApcSetting(key, value) {
  stmtUpsertApcSetting.run(key, String(value));
}

/**
 * Insert an APC activity log entry.
 */
function insertApcLog({ action, reason, price_cents = null, outdoor_temp = null, buffer_temp = null, dhw_temp = null, directive = 'NORMAL', details = null }) {
  stmtInsertApcLog.run(
    Date.now(),
    action,
    reason,
    price_cents != null ? price_cents : null,
    outdoor_temp != null ? outdoor_temp : null,
    buffer_temp != null ? buffer_temp : null,
    dhw_temp != null ? dhw_temp : null,
    directive,
    details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null
  );
}

/**
 * Get recent APC logs.
 */
function getApcLogs(limit = 50) {
  return stmtGetApcLogs.all(limit).map((r) => ({
    id: r.id,
    timestamp: Number(r.timestamp),
    action: r.action,
    reason: r.reason,
    price_cents: r.price_cents != null ? Number(r.price_cents) : null,
    outdoor_temp: r.outdoor_temp != null ? Number(r.outdoor_temp) : null,
    buffer_temp: r.buffer_temp != null ? Number(r.buffer_temp) : null,
    dhw_temp: r.dhw_temp != null ? Number(r.dhw_temp) : null,
    directive: r.directive,
    details: r.details ? (() => { try { return JSON.parse(r.details); } catch { return r.details; } })() : null,
  }));
}

/**
 * Calculate compressor cycles, running hours, daily averages, and forecasts.
 */
function getCompressorAnalytics(days = 7) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const historyStart = todayStart - (days * 24 * 60 * 60 * 1000);

  // 1. Current state
  const state = getFullState();
  const currentCounter = state['main/Operations_Counter']?.value ? parseFloat(state['main/Operations_Counter'].value) : null;
  const currentHours = state['main/Operations_Hours']?.value ? parseFloat(state['main/Operations_Hours'].value) : null;
  const currentFreq = state['main/Compressor_Freq']?.value ? parseFloat(state['main/Compressor_Freq'].value) : null;
  const hpState = state['main/Heatpump_State']?.value ?? '0';

  // 2. Query history
  const counterRows = getTopicHistory('main/Operations_Counter', historyStart, Date.now());
  const hoursRows = getTopicHistory('main/Operations_Hours', historyStart, Date.now());

  // 3. Find baseline at midnight
  let todayStartCounter = null;
  let todayStartHours = null;

  const beforeTodayCounters = counterRows.filter(r => r.recorded_at <= todayStart);
  if (beforeTodayCounters.length > 0) {
    todayStartCounter = beforeTodayCounters[beforeTodayCounters.length - 1].value;
  } else {
    const todayCounters = counterRows.filter(r => r.recorded_at >= todayStart);
    if (todayCounters.length > 0) {
      todayStartCounter = todayCounters[0].value;
    } else if (currentCounter != null) {
      todayStartCounter = currentCounter;
    }
  }

  const beforeTodayHours = hoursRows.filter(r => r.recorded_at <= todayStart);
  if (beforeTodayHours.length > 0) {
    todayStartHours = beforeTodayHours[beforeTodayHours.length - 1].value;
  } else {
    const todayHoursRows = hoursRows.filter(r => r.recorded_at >= todayStart);
    if (todayHoursRows.length > 0) {
      todayStartHours = todayHoursRows[0].value;
    } else if (currentHours != null) {
      todayStartHours = currentHours;
    }
  }

  // Today metrics
  const cyclesToday = (currentCounter != null && todayStartCounter != null)
    ? Math.max(0, Math.round(currentCounter - todayStartCounter))
    : 0;
  const hoursToday = (currentHours != null && todayStartHours != null)
    ? Math.max(0, Math.round((currentHours - todayStartHours) * 10) / 10)
    : 0;
  const avgCycleHoursToday = (cyclesToday > 0 && hoursToday > 0)
    ? Math.round((hoursToday / cyclesToday) * 10) / 10
    : null;

  const elapsedMs = Math.max(60000, Date.now() - todayStart);
  const elapsedHours = elapsedMs / (3600 * 1000);

  // Daily historical breakdown
  const dailyBreakdown = [];
  let totalDailyCycles = 0;
  let totalDailyHours = 0;
  let completedDaysCount = 0;

  for (let d = days; d >= 1; d--) {
    const dStart = todayStart - d * 24 * 60 * 60 * 1000;
    const dEnd = dStart + 24 * 60 * 60 * 1000;
    const dDate = new Date(dStart);
    const dDateStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;

    const cAtStart = counterRows.filter(r => r.recorded_at <= dStart).pop() || counterRows.find(r => r.recorded_at >= dStart && r.recorded_at <= dEnd);
    const cAtEnd = counterRows.filter(r => r.recorded_at <= dEnd).pop();

    const hAtStart = hoursRows.filter(r => r.recorded_at <= dStart).pop() || hoursRows.find(r => r.recorded_at >= dStart && r.recorded_at <= dEnd);
    const hAtEnd = hoursRows.filter(r => r.recorded_at <= dEnd).pop();

    if (cAtStart && cAtEnd && cAtEnd.value >= cAtStart.value) {
      const dayCycles = Math.round(cAtEnd.value - cAtStart.value);
      const dayHours = (hAtStart && hAtEnd && hAtEnd.value >= hAtStart.value) ? Math.round((hAtEnd.value - hAtStart.value) * 10) / 10 : 0;
      const dayAvg = dayCycles > 0 && dayHours > 0 ? Math.round((dayHours / dayCycles) * 10) / 10 : null;

      dailyBreakdown.push({
        date: dDateStr,
        timestamp: dStart,
        cycles: dayCycles,
        hours: dayHours,
        avgCycleHours: dayAvg,
      });

      totalDailyCycles += dayCycles;
      totalDailyHours += dayHours;
      completedDaysCount++;
    }
  }

  // Daily averages
  const avgCyclesPerDay = completedDaysCount > 0
    ? Math.round((totalDailyCycles / completedDaysCount) * 10) / 10
    : (cyclesToday > 0 && elapsedHours > 4 ? Math.round((cyclesToday / elapsedHours) * 24 * 10) / 10 : null);
  const avgHoursPerDay = completedDaysCount > 0
    ? Math.round((totalDailyHours / completedDaysCount) * 10) / 10
    : (hoursToday > 0 && elapsedHours > 4 ? Math.round((hoursToday / elapsedHours) * 24 * 10) / 10 : null);
  const avgCycleDuration = (avgHoursPerDay && avgCyclesPerDay && avgCyclesPerDay > 0)
    ? Math.round((avgHoursPerDay / avgCyclesPerDay) * 10) / 10
    : null;

  // 24h forecast for today
  let forecastCycles = null;
  let forecastHours = null;

  if (elapsedHours >= 1.5) {
    const rawCycleForecast = (cyclesToday / elapsedHours) * 24;
    const rawHoursForecast = (hoursToday / elapsedHours) * 24;

    if (avgCyclesPerDay != null && elapsedHours < 14) {
      const weightToday = elapsedHours / 24;
      const weightHist = 1 - weightToday;
      forecastCycles = Math.round(rawCycleForecast * weightToday + avgCyclesPerDay * weightHist);
      forecastHours = Math.round((rawHoursForecast * weightToday + avgHoursPerDay * weightHist) * 10) / 10;
    } else {
      forecastCycles = Math.round(rawCycleForecast);
      forecastHours = Math.round(rawHoursForecast * 10) / 10;
    }
  } else if (avgCyclesPerDay != null) {
    forecastCycles = Math.round(avgCyclesPerDay);
    forecastHours = avgHoursPerDay;
  }

  const lifetimeAvgCycleHours = (currentHours != null && currentCounter != null && currentCounter > 0)
    ? Math.round((currentHours / currentCounter) * 10) / 10
    : null;

  return {
    current: {
      operationsCounter: currentCounter,
      operationsHours: currentHours,
      compressorFreq: currentFreq,
      heatpumpState: hpState,
    },
    today: {
      cycles: cyclesToday,
      hours: hoursToday,
      avgCycleHours: avgCycleHoursToday,
      elapsedHours: Math.round(elapsedHours * 10) / 10,
      forecastCycles: Math.max(cyclesToday, forecastCycles ?? cyclesToday),
      forecastHours: Math.max(hoursToday, forecastHours ?? hoursToday),
    },
    dailyAverage: {
      avgCyclesPerDay: avgCyclesPerDay ?? (cyclesToday > 0 ? cyclesToday : null),
      avgHoursPerDay: avgHoursPerDay ?? (hoursToday > 0 ? hoursToday : null),
      avgCycleDuration: avgCycleDuration ?? avgCycleHoursToday ?? lifetimeAvgCycleHours,
      daysAnalyzed: completedDaysCount,
    },
    lifetime: {
      totalHours: currentHours,
      totalCycles: currentCounter,
      avgCycleHours: lifetimeAvgCycleHours,
    },
    history: dailyBreakdown,
  };
}

/**
 * Herrfors Database Methods
 */
function upsertHerrforsReadings(readings) {
  if (!Array.isArray(readings) || readings.length === 0) return 0;
  let count = 0;
  for (const r of readings) {
    if (!r.start_time || !r.end_time) continue;
    stmtUpsertHerrforsReading.run(
      r.start_time,
      r.end_time,
      r.date_str || new Date(r.start_time).toISOString().slice(0, 10),
      r.consumption_kwh != null ? r.consumption_kwh : null,
      r.price != null ? r.price : null,
      r.price_with_vat != null ? r.price_with_vat : null,
      r.temperature != null ? r.temperature : null,
      r.fetched_at || Date.now()
    );
    count++;
  }
  return count;
}

function getHerrforsReadings(fromMs, toMs) {
  return stmtGetHerrforsReadings.all(fromMs, toMs).map(r => ({
    start_time: Number(r.start_time),
    end_time: Number(r.end_time),
    date_str: r.date_str,
    consumption_kwh: r.consumption_kwh != null ? Number(r.consumption_kwh) : null,
    price: r.price != null ? Number(r.price) : null,
    price_with_vat: r.price_with_vat != null ? Number(r.price_with_vat) : null,
    temperature: r.temperature != null ? Number(r.temperature) : null,
    fetched_at: Number(r.fetched_at),
  }));
}

function getHerrforsSettings() {
  const rows = stmtGetHerrforsSettings.all();
  const settings = {
    enabled: process.env.HERRFORS_ENABLED === 'true' || process.env.HERRFORS_ENABLED === '1',
    co_id: process.env.HERRFORS_CO_ID || '60931591',
    session_token: process.env.HERRFORS_SESSION_TOKEN || '',
    username: process.env.HERRFORS_USERNAME || '',
    password: process.env.HERRFORS_PASSWORD || '',
    refresh_interval_minutes: parseInt(process.env.HERRFORS_REFRESH_INTERVAL_MINUTES || '5'),
    token_expires: null,
    last_refresh_at: null,
    last_login_at: null,
    last_sync_at: null,
    last_sync_status: null,
  };
  for (const r of rows) {
    if (r.key === 'enabled') {
      settings.enabled = r.value === '1' || r.value === 'true';
    } else if (r.key === 'refresh_interval_minutes') {
      const n = parseInt(r.value);
      if (!isNaN(n)) settings.refresh_interval_minutes = n;
    } else if (r.key === 'last_refresh_at' || r.key === 'last_login_at' || r.key === 'last_sync_at') {
      const n = parseInt(r.value);
      if (!isNaN(n)) settings[r.key] = n;
    } else {
      settings[r.key] = r.value;
    }
  }
  return settings;
}

function updateHerrforsSetting(key, value) {
  stmtUpsertHerrforsSetting.run(key, value != null ? String(value) : '');
}

function getHerrforsStats() {
  const countRow = stmtGetHerrforsCount.get();
  const latestRow = stmtGetHerrforsLatestReading.get();
  return {
    totalReadings: countRow?.count ? Number(countRow.count) : 0,
    latestReading: latestRow ? {
      start_time: Number(latestRow.start_time),
      date_str: latestRow.date_str,
      consumption_kwh: latestRow.consumption_kwh != null ? Number(latestRow.consumption_kwh) : null,
      price: latestRow.price != null ? Number(latestRow.price) : null,
      fetched_at: Number(latestRow.fetched_at),
    } : null,
  };
}

module.exports = {
  db,
  updateState,
  appendHistory,
  maybeAppendHistory,
  getFullState,
  getTopicHistory,
  getMultiTopicHistory,
  upsertDailyCost,
  getDailyCosts,
  getDailyCost,
  getCostSettings,
  updateCostSetting,
  getApcSettings,
  updateApcSetting,
  insertApcLog,
  getApcLogs,
  getCompressorAnalytics,
  upsertHerrforsReadings,
  getHerrforsReadings,
  getHerrforsSettings,
  updateHerrforsSetting,
  getHerrforsStats,
};
