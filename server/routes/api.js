const express = require('express');
const router = express.Router();

const { getFullState, getTopicHistory, getMultiTopicHistory } = require('../db');
const { TOPICS, CHART_TOPICS } = require('../topics');
const mqttClient = require('../mqtt-client');
const zigbeeClient = require('../zigbee-client');
const nordpoolClient = require('../nordpool-client');
const weatherClient = require('../weather-client');


/**
 * GET /api/state
 * Returns the full current state snapshot.
 */
router.get('/state', (req, res) => {
  const raw = getFullState();

  // Enrich with metadata
  const enriched = {};
  for (const [topic, data] of Object.entries(raw)) {
    const meta = TOPICS[topic];
    let displayValue = data.value;

    if (meta?.type === 'enum' && meta.map) {
      displayValue = meta.map[parseInt(data.value)] ?? data.value;
    }

    enriched[topic] = {
      ...data,
      label: meta?.label || topic.split('/').pop(),
      unit: meta?.unit || '',
      category: meta?.category || 'misc',
      type: meta?.type || 'string',
      displayValue,
    };
  }

  res.json({
    state: enriched,
    mqtt: {
      connected: mqttClient.isConnected(),
      lastReceivedAt: mqttClient.getLastReceivedAt(),
    },
    ts: Date.now(),
  });
});

/**
 * GET /api/history?topic=main/Outside_Temp&hours=24
 * GET /api/history?topic=main/Outside_Temp&from=<ms>&to=<ms>
 */
router.get('/history', (req, res) => {
  const { topic, hours, from, to } = req.query;

  if (!topic) {
    return res.status(400).json({ error: 'topic is required' });
  }

  const now = Date.now();
  const fromMs = from ? parseInt(from) : now - (parseFloat(hours || 24) * 3600 * 1000);
  const toMs = to ? parseInt(to) : now;

  const rows = getTopicHistory(topic, fromMs, toMs);
  res.json({ topic, data: rows, count: rows.length });
});

/**
 * GET /api/history/multi?topics=main/Outside_Temp,main/DHW_Temp&hours=24
 */
router.get('/history/multi', (req, res) => {
  const { topics, hours, from, to } = req.query;

  if (!topics) {
    return res.status(400).json({ error: 'topics is required (comma-separated)' });
  }

  const topicsArray = topics.split(',').map((t) => t.trim());
  const now = Date.now();
  const fromMs = from ? parseInt(from) : now - (parseFloat(hours || 24) * 3600 * 1000);
  const toMs = to ? parseInt(to) : now;

  const rows = getMultiTopicHistory(topicsArray, fromMs, toMs);

  // Group by topic
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.topic]) grouped[row.topic] = [];
    grouped[row.topic].push({ value: row.value, recorded_at: row.recorded_at });
  }

  res.json({ topics: topicsArray, data: grouped, from: fromMs, to: toMs });
});

/**
 * GET /api/topics
 * Returns all known topics with metadata and chart-able list.
 */
router.get('/topics', (req, res) => {
  res.json({ topics: TOPICS, chartTopics: CHART_TOPICS });
});

/**
 * POST /api/command
 * Publish a command to Heishamon.
 * Body: { setTopic: 'commands/SetForceDHW', value: 1 }
 */
router.post('/command', express.json(), (req, res) => {
  const { setTopic, value } = req.body;

  if (!setTopic || value === undefined) {
    return res.status(400).json({ error: 'setTopic and value are required' });
  }

  // Validate against allowed writable topics
  const allowed = Object.values(TOPICS)
    .filter((t) => t.writable && t.setTopic)
    .map((t) => t.setTopic);

  if (!allowed.includes(setTopic)) {
    return res.status(403).json({ error: 'Topic not writable', allowed });
  }

  try {
    mqttClient.publish(setTopic, value);
    res.json({ ok: true, setTopic, value });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;

// ─── Nordpool Routes ─────────────────────────────────────────────────────────

/**
 * GET /api/nordpool/prices?from=<ms>&to=<ms>
 * Returns 15-minute FI day-ahead prices in the requested window.
 */
router.get('/nordpool/prices', (req, res) => {
  const now = Date.now();
  const from = req.query.from ? parseInt(req.query.from) : now - 60 * 60 * 1000;
  const to   = req.query.to   ? parseInt(req.query.to)   : now + 24 * 60 * 60 * 1000;
  const prices = nordpoolClient.getPrices(from, to);
  res.json({ area: 'FI', currency: 'EUR', resolution: 15, prices, count: prices.length });
});

/**
 * GET /api/nordpool/current
 * Returns the current 15-minute price.
 */
router.get('/nordpool/current', (req, res) => {
  const price = nordpoolClient.getCurrentPrice();
  res.json(price || { area: 'FI', price: null, message: 'No current price available' });
});

/**
 * GET /api/nordpool/stats
 * Returns min/max/avg for today.
 */
router.get('/nordpool/stats', (req, res) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end   = start + 24 * 60 * 60 * 1000;
  const stats = nordpoolClient.getStats(start, end);
  res.json(stats || { min: null, max: null, avg: null, count: 0 });
});

/**
 * GET /api/nordpool/cheapest?hours=3
 * Returns the cheapest continuous N-hour window from now onward.
 */
router.get('/nordpool/cheapest', (req, res) => {
  const hours = Math.max(1, Math.min(24, parseInt(req.query.hours || 3)));
  const now = Date.now();
  const to  = now + 24 * 60 * 60 * 1000;
  const window = nordpoolClient.findCheapestWindow(hours, now, to);
  res.json(window || { message: 'Not enough data' });
});

// ─── Weather Routes ──────────────────────────────────────────────────────────

/**
 * GET /api/weather/current
 */
router.get('/weather/current', (req, res) => {
  const current = weatherClient.getCurrent();
  res.json(current || { message: 'No weather data available' });
});

/**
 * GET /api/weather/forecast?hours=24
 */
router.get('/weather/forecast', (req, res) => {
  const hours = Math.max(1, Math.min(72, parseInt(req.query.hours || 24)));
  const now = Date.now();
  const rows = weatherClient.getForecast(now, now + hours * 60 * 60 * 1000);
  res.json({ hours, count: rows.length, forecast: rows });
});

/**
 * GET /api/weather/daily
 */
router.get('/weather/daily', (req, res) => {
  res.json({ days: weatherClient.getDailySummary() });
});

// ─── Zigbee Routes ────────────────────────────────────────────────────────────

/**
 * GET /api/zigbee/devices
 * Returns the discovered Zigbee device registry with their latest state values.
 */
router.get('/zigbee/devices', (req, res) => {
  const registry = zigbeeClient.getDeviceRegistry();
  const fullState = getFullState();

  // Enrich each device with its latest sensor values from DB
  const enriched = {};
  for (const [name, device] of Object.entries(registry)) {
    const prefix = `zigbee/${name}/`;
    const props = {};
    for (const [topic, data] of Object.entries(fullState)) {
      if (topic.startsWith(prefix)) {
        const prop = topic.slice(prefix.length);
        props[prop] = { value: data.value, updated_at: data.updated_at };
      }
    }
    // Also check availability
    const avail = fullState[`zigbee/${name}/_availability`];
    enriched[name] = {
      ...device,
      properties: props,
      online: avail ? avail.value === '1' : null,
    };
  }

  res.json({
    devices: enriched,
    count: Object.keys(enriched).length,
    zigbeeConnected: zigbeeClient.isConnected(),
    ts: Date.now(),
  });
});

/**
 * GET /api/zigbee/history?device=living_room&property=temperature&hours=24
 */
router.get('/zigbee/history', (req, res) => {
  const { device, property, hours, from, to } = req.query;
  if (!device || !property) {
    return res.status(400).json({ error: 'device and property are required' });
  }

  const topic = `zigbee/${device}/${property}`;
  const now = Date.now();
  const fromMs = from ? parseInt(from) : now - (parseFloat(hours || 24) * 3600 * 1000);
  const toMs   = to ? parseInt(to) : now;

  const rows = getTopicHistory(topic, fromMs, toMs);
  res.json({ device, property, topic, data: rows, count: rows.length });
});

/**
 * GET /api/zigbee/state
 * Raw Zigbee state dump — all zigbee/* topics from DB.
 */
router.get('/zigbee/state', (req, res) => {
  const fullState = getFullState();
  const zigbeeState = {};
  for (const [topic, data] of Object.entries(fullState)) {
    if (topic.startsWith('zigbee/')) {
      zigbeeState[topic] = data;
    }
  }
  res.json({ state: zigbeeState, count: Object.keys(zigbeeState).length });
});

