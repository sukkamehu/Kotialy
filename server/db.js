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

module.exports = {
  db,
  updateState,
  appendHistory,
  maybeAppendHistory,
  getFullState,
  getTopicHistory,
  getMultiTopicHistory,
};
