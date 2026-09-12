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
`);

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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Update the current state for a topic.
 */
function updateState(topic, value) {
  stmtUpsertState.run(topic, String(value), Date.now());
}

/**
 * Append a history record for numeric topics.
 */
function appendHistory(topic, value) {
  const numVal = parseFloat(value);
  if (isNaN(numVal)) return;
  stmtInsertHistory.run(topic, numVal, Date.now());
}

/**
 * Append history only if enough time has passed since the last record.
 */
function maybeAppendHistory(topic, value, intervalMs) {
  const last = stmtGetLatestHistory.get(topic);
  if (!last || Date.now() - Number(last.recorded_at) >= intervalMs) {
    appendHistory(topic, value);
    return true;
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
    margin_cents_kwh: 0.50,    // 0.50 c/kWh välityspalkkio
    transfer_cents_kwh: 4.50,  // 4.50 c/kWh siirtohinta + sähkövero
    vat_percent: 25.5,         // ALV 25.5%
  };
  for (const r of rows) {
    const n = parseFloat(r.value);
    if (!isNaN(n)) settings[r.key] = n;
  }
  return settings;
}

/**
 * Update single cost setting.
 */
function updateCostSetting(key, value) {
  stmtUpsertCostSetting.run(key, String(value));
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
};
