const express = require('express');
const router = express.Router();

const {
  getFullState,
  getTopicHistory,
  getMultiTopicHistory,
  getDailyCosts,
  getDailyCost,
  getCostSettings,
  updateCostSetting,
  getApcLogs,
  getCompressorAnalytics,
} = require('../db');
const { TOPICS, CHART_TOPICS, enrichState } = require('../topics');
const mqttClient = require('../mqtt-client');
const zigbeeClient = require('../zigbee-client');
const nordpoolClient = require('../nordpool-client');
const weatherClient = require('../weather-client');
const costCalculator = require('../cost-calculator');
const apcService = require('../apc-service');
const cameraService = require('../camera-service');
const s3Service = require('../s3-service');
const herrforsClient = require('../herrfors-client');


const {
  isLocalIp,
  getClientIp,
  generateToken,
  verifyToken,
  requireAuthOrLan,
  requireAdmin,
  checkCredentials,
  AUTH_USERNAME,
  AUTH_TOKEN_DAYS,
} = require('../auth');

/**
 * GET /api/auth/status
 * Check if the caller is in LAN or authenticated with a valid token.
 */
router.get('/auth/status', (req, res) => {
  const ip = getClientIp(req);
  const isLocal = isLocalIp(ip);

  let authenticated = false;
  let username = null;
  let role = 'viewer';

  if (isLocal) {
    authenticated = true;
    username = 'lan_user';
    role = 'admin';
  } else {
    const authHeader = req.headers['authorization'];
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.query && req.query.token) {
      token = String(req.query.token).trim();
    }
    const valid = verifyToken(token);
    if (valid) {
      authenticated = true;
      username = valid.u;
      role = valid.role || 'admin';
    }
  }

  res.json({
    isLocal,
    authenticated,
    username,
    role,
    clientIp: ip,
  });
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/auth/login', express.json(), (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Käyttäjätunnus ja salasana vaaditaan' });
  }

  const credCheck = checkCredentials(username, password);
  if (!credCheck || !credCheck.valid) {
    return res.status(401).json({ error: 'Virheellinen käyttäjätunnus tai salasana' });
  }

  const token = generateToken(credCheck.username, credCheck.role);
  const expiresAt = Date.now() + AUTH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

  res.json({
    ok: true,
    token,
    expiresAt,
    username: credCheck.username,
    role: credCheck.role,
    isLocal: isLocalIp(getClientIp(req)),
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/auth/logout', (req, res) => {
  res.json({ ok: true });
});

// Apply authentication middleware to all subsequent API routes
router.use(requireAuthOrLan);

/**
 * GET /api/state
 * Returns the full current state snapshot.
 */
router.get('/state', (req, res) => {
  res.json({
    state: enrichState(getFullState()),
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
router.post('/command', requireAdmin, express.json(), async (req, res) => {
  const { setTopic, value } = req.body;

  if (!setTopic || value === undefined) {
    return res.status(400).json({ error: 'setTopic and value are required' });
  }

  // Validate against allowed writable topics
  const writable = Object.values(TOPICS).filter((t) => t.writable && t.setTopic);
  const meta = writable.find((t) => t.setTopic === setTopic);

  if (!meta) {
    return res.status(403).json({
      error: 'Topic not writable',
      allowed: writable.map((t) => t.setTopic),
    });
  }

  let finalVal = value;

  if (setTopic.startsWith('lattialampopumppu/')) {
    // Sonoff / Tasmota relay commands (ON / OFF)
    if (typeof value === 'string') {
      const up = value.toUpperCase();
      finalVal = (up === 'ON' || up === '1' || up === 'TRUE') ? 'ON' : 'OFF';
    } else {
      finalVal = (value === 1 || value === true) ? 'ON' : 'OFF';
    }
  } else if (meta.type === 'enum' || meta.type === 'number') {
    // Panasonic Heishamon commands require numeric values (e.g. 0, 1, 2, 3)
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return res.status(400).json({ error: 'value must be a valid number or enum key' });
    }
    if (meta.min !== undefined && num < meta.min) {
      return res.status(400).json({ error: `value below minimum (${meta.min})` });
    }
    if (meta.max !== undefined && num > meta.max) {
      return res.status(400).json({ error: `value above maximum (${meta.max})` });
    }
    finalVal = Math.round(num);
    if (meta.type === 'number' && meta.step && meta.step < 1) {
      finalVal = num;
    }
  }

  try {
    if (setTopic === 'commands/SetZ1HeatRequestTemperature') {
      const dbModule = require('../db');
      const apcSettings = dbModule.getApcSettings();
      if (apcSettings.enabled) {
        dbModule.updateApcSetting('base_z1_shift', finalVal);
        apcService.evaluate();
        return res.json({ ok: true, setTopic, value: finalVal, isApcBase: true });
      }
    }

    if (setTopic === 'lattialampopumppu/cmnd/POWER' || setTopic === 'cmnd/lattialampopumppu/POWER') {
      const floorPumpDriver = require('../devices/floor-pump-driver');
      const stateStr = (finalVal === 'ON' || finalVal === 1) ? 'ON' : 'OFF';
      await floorPumpDriver.setManualOverride(stateStr, 0); // Indefinite manual override until cancelled
      return res.json({ ok: true, setTopic, value: stateStr });
    }

    mqttClient.publish(setTopic, finalVal);
    res.json({ ok: true, setTopic, value: finalVal });
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
  // getDeviceRegistry() already attaches each device's properties + availability
  const devices = zigbeeClient.getDeviceRegistry();

  res.json({
    devices,
    count: Object.keys(devices).length,
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

// ─── Daily Energy Costs Routes ───────────────────────────────────────────────

/**
 * GET /api/costs/daily?days=30&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns daily aggregated costs and consumption history.
 */
router.get('/costs/daily', (req, res) => {
  const { from, to, days } = req.query;
  const limit = days ? parseInt(days) : 30;

  // Make sure today is up to date
  const todayStr = costCalculator.toLocalDateStr(new Date());
  costCalculator.calculateDay(todayStr);

  const rows = getDailyCosts(from, to, limit);
  res.json({
    costs: rows,
    count: rows.length,
    ts: Date.now(),
  });
});

/**
 * GET /api/costs/summary
 * Returns KPI summary: today, yesterday, current month, settings.
 */
router.get('/costs/summary', (req, res) => {
  const summary = costCalculator.getCostSummary();
  res.json(summary);
});

/**
 * GET /api/costs/settings
 * Returns current electricity pricing settings (margin, transfer fee, VAT).
 */
router.get('/costs/settings', (req, res) => {
  res.json({ settings: getCostSettings() });
});

/**
 * POST /api/costs/settings
 * Body: { margin_cents_kwh, transfer_mode, transfer_cents_kwh, transfer_day_cents_kwh, transfer_night_cents_kwh, fuse_size, monthly_base_fee_eur, vat_percent }
 */
router.post('/costs/settings', requireAdmin, express.json(), (req, res) => {
  const {
    margin_cents_kwh,
    transfer_mode,
    transfer_cents_kwh,
    transfer_day_cents_kwh,
    transfer_night_cents_kwh,
    fuse_size,
    monthly_base_fee_eur,
    vat_percent,
  } = req.body || {};

  if (margin_cents_kwh != null && !isNaN(parseFloat(margin_cents_kwh))) {
    updateCostSetting('margin_cents_kwh', parseFloat(margin_cents_kwh));
  }
  if (transfer_mode != null) {
    updateCostSetting('transfer_mode', transfer_mode === 'day_night' ? 'day_night' : 'flat');
  }
  if (transfer_cents_kwh != null && !isNaN(parseFloat(transfer_cents_kwh))) {
    updateCostSetting('transfer_cents_kwh', parseFloat(transfer_cents_kwh));
  }
  if (transfer_day_cents_kwh != null && !isNaN(parseFloat(transfer_day_cents_kwh))) {
    updateCostSetting('transfer_day_cents_kwh', parseFloat(transfer_day_cents_kwh));
  }
  if (transfer_night_cents_kwh != null && !isNaN(parseFloat(transfer_night_cents_kwh))) {
    updateCostSetting('transfer_night_cents_kwh', parseFloat(transfer_night_cents_kwh));
  }
  if (fuse_size != null) {
    updateCostSetting('fuse_size', String(fuse_size));
  }
  if (monthly_base_fee_eur != null && !isNaN(parseFloat(monthly_base_fee_eur))) {
    updateCostSetting('monthly_base_fee_eur', parseFloat(monthly_base_fee_eur));
  }
  if (vat_percent != null && !isNaN(parseFloat(vat_percent))) {
    updateCostSetting('vat_percent', parseFloat(vat_percent));
  }

  // Recalculate recent history with new price settings
  costCalculator.recalculateRecentDays(30);

  // Trigger APC evaluation with updated prices
  try {
    apcService.evaluate();
  } catch (err) {
    // ignore
  }

  res.json({
    ok: true,
    settings: getCostSettings(),
  });
});

/**
 * POST /api/costs/recalculate
 * Body: { days: 30 }
 */
router.post('/costs/recalculate', requireAdmin, express.json(), (req, res) => {
  const days = req.body?.days ? parseInt(req.body.days) : 30;
  const results = costCalculator.recalculateRecentDays(days);
  res.json({
    ok: true,
    recalculatedCount: results.length,
    summary: costCalculator.getCostSummary(),
  });
});

// ─── APC (Auto Power & Price Controller) Endpoints ───────────────────────────

/**
 * GET /api/apc/status
 * Returns live status, active directive, device statuses, and computed plan.
 */
router.get('/apc/status', (req, res) => {
  res.json(apcService.getStatus());
});

/**
 * GET /api/apc/plan
 * Returns computed 24-36h quartile plan.
 */
router.get('/apc/plan', (req, res) => {
  res.json({
    plan: apcService.computedPlan,
    currentDirective: apcService.currentDirective,
  });
});

/**
 * POST /api/apc/settings
 * Body: { enabled, mode, buffer_boost_c, buffer_setback_c, dhw_target_c, dhw_min_c, cheap_threshold_cents, peak_threshold_cents, dhw_duration_hours }
 */
router.post('/apc/settings', requireAdmin, express.json(), async (req, res) => {
  try {
    const updated = await apcService.updateSettings(req.body || {});
    res.json({
      ok: true,
      status: updated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/apc/override
 * Body: { duration_hours: 2, directive: 'NORMAL' | 'BOOST' | 'SETBACK' }
 * Pass duration_hours: 0 to cancel override.
 */
router.post('/apc/override', requireAdmin, express.json(), async (req, res) => {
  try {
    const { duration_hours = 2, directive = 'NORMAL' } = req.body || {};
    const updated = await apcService.setOverride(parseFloat(duration_hours), directive);
    res.json({
      ok: true,
      status: updated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/apc/logs
 * Returns history of automated optimization events.
 */
router.get('/apc/logs', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 50;
  res.json({
    logs: getApcLogs(limit),
  });
});

// ─── Floor Heating Pump (Sonoff) Specific Endpoints ─────────────────────────

/**
 * GET /api/apc/floor-pump/status
 */
router.get('/apc/floor-pump/status', (req, res) => {
  const floorPumpDriver = require('../devices/floor-pump-driver');
  res.json(floorPumpDriver.getStatus());
});

/**
 * POST /api/apc/floor-pump/override
 * Body: { state: 'ON' | 'OFF' | null, duration_hours: 0 | 1 | 2 | 4 | 8 }
 * Passing state: null or duration_hours: 0 with state: null clears manual override.
 */
router.post('/apc/floor-pump/override', requireAdmin, express.json(), async (req, res) => {
  try {
    const floorPumpDriver = require('../devices/floor-pump-driver');
    const { state, duration_hours = 0 } = req.body || {};

    if (state === null || state === undefined || state === 'AUTO' || state === 'auto') {
      const status = await floorPumpDriver.clearManualOverride();
      // Re-evaluate APC
      apcService.evaluate();
      return res.json({ ok: true, status });
    }

    const stateStr = (state === 'ON' || state === 1 || state === true) ? 'ON' : 'OFF';
    const status = await floorPumpDriver.setManualOverride(stateStr, parseFloat(duration_hours) || 0);
    return res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/apc/floor-pump/mode
 * Body: { mode: 'auto' | 'constant_on' | 'constant_off' }
 */
router.post('/apc/floor-pump/mode', requireAdmin, express.json(), async (req, res) => {
  try {
    const floorPumpDriver = require('../devices/floor-pump-driver');
    const { mode } = req.body || {};
    const status = await floorPumpDriver.setMode(mode);
    apcService.evaluate();
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/apc/floor-pump/settings
 * Body: { summer_cutoff_temp, anti_seize_enabled }
 */
router.post('/apc/floor-pump/settings', requireAdmin, express.json(), async (req, res) => {
  try {
    const { summer_cutoff_temp, anti_seize_enabled, summer_pulse_enabled } = req.body || {};
    const dbModule = require('../db');

    if (summer_cutoff_temp !== undefined && !isNaN(parseFloat(summer_cutoff_temp))) {
      dbModule.updateApcSetting('floor_pump_summer_cutoff_temp', parseFloat(summer_cutoff_temp));
    }
    if (anti_seize_enabled !== undefined) {
      dbModule.updateApcSetting('floor_pump_anti_seize_enabled', anti_seize_enabled ? '1' : '0');
    }
    if (summer_pulse_enabled !== undefined) {
      dbModule.updateApcSetting('floor_pump_summer_pulse_enabled', summer_pulse_enabled ? '1' : '0');
    }

    apcService.evaluate();
    const floorPumpDriver = require('../devices/floor-pump-driver');
    res.json({ ok: true, status: floorPumpDriver.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Camera / RTSP Monitoring Routes ─────────────────────────────────────────

/**
 * GET /api/camera/status
 * Returns camera status and metadata.
 */
router.get('/camera/status', (req, res) => {
  res.json(cameraService.getStatus());
});

/**
 * GET /api/camera/snapshot
 * Query: ?highRes=1
 * Returns live JPEG image snapshot from the RTSP camera stream.
 */
router.get('/camera/snapshot', async (req, res) => {
  try {
    const highRes = req.query.highRes !== '0' && req.query.highRes !== 'false' && req.query.sd !== '1';
    const snapshot = await cameraService.getSnapshot(highRes);

    res.set({
      'Content-Type': snapshot.contentType,
      'Content-Length': snapshot.data.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Snapshot-Time': snapshot.ts,
      'X-Snapshot-Cached': snapshot.cached ? '1' : '0',
    });

    res.send(snapshot.data);
  } catch (err) {
    res.status(502).json({
      error: 'Kamerakuvan haku epäonnistui',
      message: err.message,
    });
  }
});

// ─── Analytics Routes ───────────────────────────────────────────────────────

/**
 * GET /api/analytics/compressor?days=7
 * Returns compressor cycles, running hours, daily averages, and forecasts.
 */
router.get('/analytics/compressor', (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const analytics = getCompressorAnalytics(days);
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── S3 / Cloud Storage Routes ─────────────────────────────────────────────

/**
 * GET /api/backup/status
 * Returns current S3 backup status and configuration.
 */
router.get('/backup/status', (req, res) => {
  res.json(s3Service.getStatus());
});

/**
 * POST /api/backup/now
 * Triggers an immediate SQLite database backup to S3.
 */
router.post('/backup/now', requireAdmin, async (req, res) => {
  try {
    const result = await s3Service.backupDatabase();
    if (result.success) {
      res.json({ message: 'Varmuuskopiointi S3-pilvitallennustilaan onnistui', ...result });
    } else {
      res.status(500).json({ error: 'Varmuuskopiointi epäonnistui', details: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/backup/list
 * Returns list of backups stored in S3.
 */
router.get('/backup/list', requireAdmin, async (req, res) => {
  try {
    const list = await s3Service.listBackups();
    res.json({ backups: list, count: list.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Herrfors Electricity Portal Routes ──────────────────────────────────────

/**
 * GET /api/herrfors/status
 * Returns session health, token expiration, last refresh & sync timestamps.
 */
router.get('/herrfors/status', (req, res) => {
  res.json(herrforsClient.getStatus());
});

/**
 * GET /api/herrfors/analytics?from=<ms>&to=<ms>&days=7
 * Returns comprehensive heating vs household electricity breakdown, totals, and series.
 */
router.get('/herrfors/analytics', (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const now = Date.now();
    const fromMs = req.query.from ? parseInt(req.query.from) : now - (days * 24 * 60 * 60 * 1000);
    const toMs = req.query.to ? parseInt(req.query.to) : now;

    const data = herrforsClient.getHeatingComparison(fromMs, toMs);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/herrfors/readings?from=<ms>&to=<ms>
 * Returns raw 15-minute readings stored from Herrfors.
 */
router.get('/herrfors/readings', (req, res) => {
  const now = Date.now();
  const fromMs = req.query.from ? parseInt(req.query.from) : now - (7 * 24 * 60 * 60 * 1000);
  const toMs = req.query.to ? parseInt(req.query.to) : now;

  const { getHerrforsReadings } = require('../db');
  const rows = getHerrforsReadings(fromMs, toMs);
  res.json({ readings: rows, count: rows.length });
});

/**
 * POST /api/herrfors/sync
 * Manually trigger data sync for past N days (default 7).
 * Body: { days: 7, startDate, endDate }
 */
router.post('/herrfors/sync', requireAdmin, express.json(), async (req, res) => {
  try {
    const { days = 7, startDate, endDate } = req.body || {};
    let result;
    if (startDate && endDate) {
      result = await herrforsClient.syncRange(startDate, endDate);
    } else {
      result = await herrforsClient.syncRecentDays(parseInt(days) || 7);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/herrfors/refresh
 * Manually trigger a session token refresh with Herrfors.
 */
router.post('/herrfors/refresh', requireAdmin, async (req, res) => {
  try {
    const result = await herrforsClient.refreshSession();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/herrfors/settings
 * Update session token, co_id, or enabled setting.
 * Body: { session_token, co_id, enabled, refresh_interval_minutes }
 */
router.post('/herrfors/settings', requireAdmin, express.json(), async (req, res) => {
  try {
    const { session_token, co_id, enabled, refresh_interval_minutes } = req.body || {};
    const { updateHerrforsSetting } = require('../db');

    if (session_token !== undefined) {
      updateHerrforsSetting('session_token', String(session_token).trim());
    }
    if (co_id !== undefined) {
      updateHerrforsSetting('co_id', String(co_id).trim());
    }
    if (enabled !== undefined) {
      updateHerrforsSetting('enabled', enabled ? '1' : '0');
    }
    if (refresh_interval_minutes !== undefined && !isNaN(parseInt(refresh_interval_minutes))) {
      updateHerrforsSetting('refresh_interval_minutes', parseInt(refresh_interval_minutes));
    }

    // Attempt an immediate session refresh with new token if provided
    if (session_token) {
      await herrforsClient.refreshSession();
    }

    res.json({
      ok: true,
      status: herrforsClient.getStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;



