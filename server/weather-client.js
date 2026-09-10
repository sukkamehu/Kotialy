const https = require('https');

const API_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const LAT = 60.4730;
const LON = 25.0899;
const SOURCE = `metno-${LAT}-${LON}`;

let dbModule = null;

function setDb(db) {
  dbModule = db;
}

function log(...args) {
  console.log('[WEATHER]', ...args);
}

function warn(...args) {
  console.warn('[WEATHER]', ...args);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Kotialy/1.0 (+https://kotialy.local)' }, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function calcFeelsLike(temp, wind) {
  // Simple approximation; MET provides no direct value in compact
  if (temp == null || wind == null) return null;
  if (temp >= 10) return temp;
  // Wind chill formula (approximate)
  return 13.12 + 0.6215 * temp - 11.37 * Math.pow(wind, 0.16) + 0.3965 * temp * Math.pow(wind, 0.16);
}

function parseForecast(data) {
  const entries = [];
  if (!data?.properties?.timeseries) return entries;
  for (const item of data.properties.timeseries) {
    const time = new Date(item.time).getTime();
    const instant = item.data?.instant?.details || {};
    const next1 = item.data?.next_1_hours?.details || {};
    const symbol = item.data?.next_1_hours?.summary?.symbol_code || item.data?.next_6_hours?.summary?.symbol_code || null;
    entries.push({
      source: SOURCE,
      time,
      temperature: instant.air_temperature,
      feels_like: calcFeelsLike(instant.air_temperature, instant.wind_speed),
      humidity: instant.relative_humidity,
      wind_speed: instant.wind_speed,
      wind_dir: instant.wind_from_direction,
      pressure: instant.air_pressure_at_sea_level,
      rain_mm: next1.precipitation_amount,
      symbol,
    });
  }
  return entries;
}

function upsert(entries) {
  if (!dbModule || !dbModule.db) return 0;
  const stmt = dbModule.db.prepare(`
    INSERT INTO weather_forecast (source, time, temperature, feels_like, humidity, wind_speed, wind_dir, symbol, rain_mm, pressure, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(time) DO UPDATE SET
      temperature = excluded.temperature,
      feels_like = excluded.feels_like,
      humidity = excluded.humidity,
      wind_speed = excluded.wind_speed,
      wind_dir = excluded.wind_dir,
      symbol = excluded.symbol,
      rain_mm = excluded.rain_mm,
      pressure = excluded.pressure,
      fetched_at = excluded.fetched_at
  `);
  const now = Date.now();
  let count = 0;
  for (const e of entries) {
    if (e.temperature == null) continue;
    const safe = (v) => (v === undefined ? null : v);
    stmt.run(e.source, e.time, e.temperature, safe(e.feels_like), safe(e.humidity), safe(e.wind_speed), safe(e.wind_dir), safe(e.symbol), safe(e.rain_mm), safe(e.pressure), now);
    count++;
  }
  return count;
}

function prune() {
  if (!dbModule || !dbModule.db) return;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  dbModule.db.exec(`DELETE FROM weather_forecast WHERE time < ${cutoff}`);
}

async function fetchAndStore() {
  try {
    const url = `${API_URL}?lat=${LAT}&lon=${LON}`;
    const data = await fetchJson(url);
    const entries = parseForecast(data);
    const inserted = upsert(entries);
    prune();
    log(`Stored ${inserted} forecast entries`);
    return entries;
  } catch (err) {
    warn('Fetch failed:', err.message);
    throw err;
  }
}

function getForecast(from, to) {
  if (!dbModule || !dbModule.db) return [];
  const stmt = dbModule.db.prepare(`
    SELECT source, time, temperature, feels_like, humidity, wind_speed, wind_dir, symbol, rain_mm, pressure, fetched_at
    FROM weather_forecast
    WHERE time >= ? AND time < ?
    ORDER BY time ASC
  `);
  return stmt.all(from, to).map((row) => ({
    source: row.source,
    time: Number(row.time),
    temperature: Number(row.temperature),
    feels_like: row.feels_like == null ? null : Number(row.feels_like),
    humidity: Number(row.humidity),
    wind_speed: Number(row.wind_speed),
    wind_dir: Number(row.wind_dir),
    symbol: row.symbol,
    rain_mm: Number(row.rain_mm),
    pressure: Number(row.pressure),
    fetched_at: Number(row.fetched_at),
  }));
}

function getCurrent() {
  const now = Date.now();
  const rows = getForecast(now - 60 * 60 * 1000, now + 60 * 60 * 1000);
  for (const r of rows) {
    if (r.time >= now - 30 * 60 * 1000) return r;
  }
  return rows[rows.length - 1] || null;
}

function getDailySummary() {
  if (!dbModule || !dbModule.db) return [];
  const stmt = dbModule.db.prepare(`
    SELECT date(time/1000, 'unixepoch') as day,
           MIN(temperature) as min_temp,
           MAX(temperature) as max_temp,
           AVG(rain_mm) as avg_rain,
           GROUP_CONCAT(symbol) as symbols
    FROM weather_forecast
    WHERE time >= ?
    GROUP BY day
    ORDER BY day ASC
    LIMIT 7
  `);
  const start = Date.now();
  return stmt.all(start).map((row) => ({
    day: row.day,
    minTemp: row.min_temp,
    maxTemp: row.max_temp,
    avgRain: row.avg_rain,
    symbols: row.symbols,
  }));
}

function startScheduler(intervalMs = 30 * 60 * 1000) {
  fetchAndStore().catch(() => {});
  return setInterval(() => fetchAndStore().catch(() => {}), intervalMs);
}

module.exports = {
  setDb,
  fetchAndStore,
  getForecast,
  getCurrent,
  getDailySummary,
  startScheduler,
};
