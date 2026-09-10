const https = require('https');

const API_URL = 'https://dataportal-api.nordpoolgroup.com/api/DayAheadPriceIndices';
const AREA = 'FI';
const CURRENCY = 'EUR';
const RESOLUTION = 15;

let dbModule = null;

try {
  dbModule = require('./db');
} catch (e) {
  // Will be set externally if needed
}

function setDb(db) {
  dbModule = db;
}

function log(...args) {
  console.log('[NORDPOOL]', ...args);
}

function warn(...args) {
  console.warn('[NORDPOOL]', ...args);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchDay(date) {
  const dateStr = toISODate(date);
  const url = `${API_URL}?currency=${CURRENCY}&market=DayAhead&date=${dateStr}&resolutionInMinutes=${RESOLUTION}&indexNames=${AREA}`;
  return fetchJson(url);
}

function parseEntries(response) {
  if (!response || !Array.isArray(response.multiIndexEntries)) return [];
  const entries = [];
  for (const entry of response.multiIndexEntries) {
    const start = new Date(entry.deliveryStart).getTime();
    const end = new Date(entry.deliveryEnd).getTime();
    const price = entry.entryPerArea && entry.entryPerArea[AREA];
    if (typeof price !== 'number') continue;
    entries.push({ start_time: start, end_time: end, price, area: AREA, currency: CURRENCY, resolution: RESOLUTION });
  }
  return entries;
}

function upsertPrices(entries) {
  if (!dbModule || !dbModule.db) return 0;
  const insert = dbModule.db.prepare(`
    INSERT INTO nordpool_prices (start_time, end_time, price, currency, resolution, area, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(start_time) DO UPDATE SET
      end_time = excluded.end_time,
      price = excluded.price,
      fetched_at = excluded.fetched_at
  `);
  const now = Date.now();
  let count = 0;
  for (const e of entries) {
    insert.run(e.start_time, e.end_time, e.price, e.currency, e.resolution, e.area, now);
    count++;
  }
  return count;
}

function pruneOldPrices() {
  if (!dbModule || !dbModule.db) return;
  // Keep 7 days of history
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  dbModule.db.exec(`DELETE FROM nordpool_prices WHERE start_time < ${cutoff}`);
}

async function fetchAndStore() {
  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayResponse = await fetchDay(today);
    const tomorrowResponse = await fetchDay(tomorrow).catch((err) => {
      warn('Tomorrow fetch failed:', err.message);
      return null;
    });

    const entries = [...parseEntries(todayResponse)];
    if (tomorrowResponse) entries.push(...parseEntries(tomorrowResponse));

    const inserted = upsertPrices(entries);
    pruneOldPrices();
    log(`Stored ${inserted} price entries`);
    return entries;
  } catch (err) {
    warn('Fetch failed:', err.message);
    throw err;
  }
}

function getPrices(from, to) {
  if (!dbModule || !dbModule.db) return [];
  const stmt = dbModule.db.prepare(`
    SELECT start_time, end_time, price, currency, resolution, area, fetched_at
    FROM nordpool_prices
    WHERE start_time >= ? AND start_time < ?
    ORDER BY start_time ASC
  `);
  return stmt.all(from, to).map((row) => ({
    start_time: Number(row.start_time),
    end_time: Number(row.end_time),
    price: Number(row.price),
    currency: row.currency,
    resolution: Number(row.resolution),
    area: row.area,
    fetched_at: Number(row.fetched_at),
  }));
}

function getCurrentPrice() {
  const now = Date.now();
  const prices = getPrices(now - 15 * 60 * 1000, now + 15 * 60 * 1000);
  for (const p of prices) {
    if (p.start_time <= now && p.end_time > now) return p;
  }
  return null;
}

function getStats(from, to) {
  const prices = getPrices(from, to).map(p => p.price);
  if (!prices.length) return null;
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    count: prices.length,
  };
}

function findCheapestWindow(hours, from, to) {
  const prices = getPrices(from, to);
  const windowQuarters = hours * 4;
  if (!prices.length || prices.length < windowQuarters) return null;

  let best = null;
  let bestAvg = Infinity;
  for (let i = 0; i <= prices.length - windowQuarters; i++) {
    const slice = prices.slice(i, i + windowQuarters);
    const total = slice.reduce((sum, p) => sum + p.price, 0);
    const avg = total / windowQuarters;
    if (avg < bestAvg) {
      bestAvg = avg;
      best = {
        start: slice[0].start_time,
        end: slice[slice.length - 1].end_time,
        avgPrice: avg,
        totalPrice: total,
        quarters: slice,
      };
    }
  }
  return best;
}

function startScheduler(intervalMs = 60 * 60 * 1000) {
  fetchAndStore().catch(() => {});
  return setInterval(() => fetchAndStore().catch(() => {}), intervalMs);
}

module.exports = {
  setDb,
  fetchAndStore,
  getPrices,
  getCurrentPrice,
  getStats,
  findCheapestWindow,
  startScheduler,
};
