/**
 * rtl_433 RF 433 MHz MQTT Client
 *
 * Connects to MQTT broker and listens to rtl_433 published topics.
 * Decodes 433 MHz wireless sensor events (temperature, humidity, weather, battery),
 * maintains device registry, persists readings in SQLite, and broadcasts real-time
 * updates via WebSocket.
 */

const mqtt = require('mqtt');
require('dotenv').config();

const {
  updateState,
  maybeAppendHistory,
  getFullState,
  getAllRtl433Devices,
  upsertRtl433Device,
  updateRtl433DeviceAlias,
  updateRtl433LastSeen,
  deleteRtl433Device: dbDeleteDevice,
  blacklistRtl433Device,
  unblacklistRtl433Device,
  purgeRtl433Device,
} = require('./db');

const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883');
const BASE_TOPIC = process.env.RTL433_BASE_TOPIC || 'rtl_433';
const HISTORY_INTERVAL_MS = parseInt(process.env.HISTORY_INTERVAL || '60') * 1000;

// Numeric sensor properties to log into sensor_history
const NUMERIC_PROPS = new Set([
  'temperature',
  'humidity',
  'battery',
  'pressure',
  'wind_speed',
  'wind_direction',
  'rain',
  'rssi',
  'snr',
]);

let client = null;
let connected = false;
let lastReceivedAt = null;
let packetCount = 0;
let wsBroadcastFn = null;

// In-memory cache of discovered 433 MHz devices: { [deviceId]: deviceObj }
const deviceRegistry = {};

function cleanSlug(text) {
  if (!text) return 'unknown';
  return String(text)
    .toLowerCase()
    .replace(/[äå]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Load persisted device aliases and metadata from SQLite on startup
 */
function loadKnownDevicesFromDb() {
  try {
    const rows = getAllRtl433Devices();
    for (const row of rows) {
      deviceRegistry[row.id] = {
        id: row.id,
        model: row.model,
        channel: row.channel,
        customName: row.custom_name,
        category: row.category || 'climate',
        location: row.location || null,
        isOutdoor: Boolean(row.is_outdoor),
        isIgnored: Boolean(row.is_ignored),
        lastSeen: row.last_seen,
        properties: {},
        packetCount: 0,
      };
    }
    console.log(`[rtl_433] Loaded ${rows.length} known devices from database`);
  } catch (err) {
    console.warn('[rtl_433] Failed to load devices from DB:', err.message);
  }
}

/**
 * Extract and normalize measurement properties from rtl_433 JSON payload
 */
function extractProperties(payload) {
  const result = {};

  // 1. Temperature (°C)
  if (typeof payload.temperature_C === 'number') {
    result.temperature = Math.round(payload.temperature_C * 10) / 10;
  } else if (typeof payload.temperature === 'number') {
    result.temperature = Math.round(payload.temperature * 10) / 10;
  } else if (typeof payload.temperature_F === 'number') {
    result.temperature = Math.round(((payload.temperature_F - 32) * 5 / 9) * 10) / 10;
  }

  // 2. Humidity (%)
  if (typeof payload.humidity === 'number') {
    result.humidity = Math.max(0, Math.min(100, Math.round(payload.humidity * 10) / 10));
  }

  // 3. Battery status
  if (typeof payload.battery_ok === 'number') {
    result.battery_ok = payload.battery_ok === 1;
    result.battery = payload.battery_ok === 1 ? 100 : 10;
  } else if (typeof payload.battery_percent === 'number') {
    result.battery = Math.max(0, Math.min(100, Math.round(payload.battery_percent)));
    result.battery_ok = result.battery > 15;
  } else if (typeof payload.battery_mV === 'number') {
    result.battery_mV = payload.battery_mV;
    result.battery_ok = payload.battery_mV > 2500;
  }

  // 4. Barometric pressure (hPa)
  if (typeof payload.pressure_hPa === 'number') {
    result.pressure = Math.round(payload.pressure_hPa * 10) / 10;
  } else if (typeof payload.pressure_kPa === 'number') {
    result.pressure = Math.round(payload.pressure_kPa * 100) / 10;
  }

  // 5. Wind & Weather
  if (typeof payload.wind_avg_m_s === 'number') {
    result.wind_speed = Math.round(payload.wind_avg_m_s * 10) / 10;
  } else if (typeof payload.wind_avg_km_h === 'number') {
    result.wind_speed = Math.round((payload.wind_avg_km_h / 3.6) * 10) / 10;
  }
  if (typeof payload.wind_dir_deg === 'number') {
    result.wind_direction = Math.round(payload.wind_dir_deg);
  }
  if (typeof payload.rain_mm === 'number') {
    result.rain = Math.round(payload.rain_mm * 10) / 10;
  }

  // 6. Signal quality (RSSI, SNR)
  if (typeof payload.rssi === 'number') result.rssi = Math.round(payload.rssi);
  if (typeof payload.snr === 'number') result.snr = Math.round(payload.snr);

  return result;
}

/**
 * Handle incoming MQTT message from rtl_433
 */
function handleMessage(topic, rawPayload) {
  lastReceivedAt = Date.now();
  packetCount += 1;

  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    // If not JSON, skip or flat topic
    return;
  }

  if (typeof payload !== 'object' || payload === null) return;

  // Extract model and ID from payload or topic
  const model = payload.model || 'Generic_433';
  const rawId = payload.id !== undefined
    ? String(payload.id)
    : payload.channel !== undefined
    ? `ch${payload.channel}`
    : topic.split('/').pop() || '0';

  const channel = typeof payload.channel === 'number' ? payload.channel : null;
  const deviceId = cleanSlug(`${model}_${rawId}`);

  // 1. Blacklist check: silently drop all packets from blacklisted / ignored devices
  if (deviceRegistry[deviceId]?.isIgnored) {
    return;
  }

  const properties = extractProperties(payload);
  if (Object.keys(properties).length === 0) return;

  const now = Date.now();
  let isNewDevice = false;

  if (!deviceRegistry[deviceId]) {
    isNewDevice = true;
    deviceRegistry[deviceId] = {
      id: deviceId,
      model,
      rawId,
      channel,
      customName: null,
      category: 'climate',
      location: null,
      isOutdoor: false,
      isIgnored: false,
      lastSeen: now,
      properties: {},
      packetCount: 0,
    };

    // Persist new device in SQLite
    upsertRtl433Device({
      id: deviceId,
      model,
      channel,
      custom_name: null,
      category: 'climate',
      location: null,
      is_outdoor: 0,
      is_ignored: 0,
      last_seen: now,
      created_at: now,
    });
  }

  const dev = deviceRegistry[deviceId];
  dev.lastSeen = now;
  dev.packetCount = (dev.packetCount || 0) + 1;
  dev.raw = payload;

  // Merge updated properties
  Object.assign(dev.properties, properties);
  updateRtl433LastSeen(deviceId, now);

  // If marked as ignored, don't write to main sensor_state or history
  if (dev.isIgnored) return;

  // Persist sensor state and history in DB
  const updates = [];
  for (const [prop, val] of Object.entries(properties)) {
    const strVal = String(val);
    const dbTopic = `rtl433/${deviceId}/${prop}`;

    updateState(dbTopic, strVal);
    if (NUMERIC_PROPS.has(prop) && typeof val === 'number') {
      maybeAppendHistory(dbTopic, val, HISTORY_INTERVAL_MS);
    }
    updates.push({ prop, val: strVal });

    // If device has a custom friendly name, also update alias topic
    if (dev.customName) {
      const aliasSlug = cleanSlug(dev.customName);
      const aliasTopic = `rtl433/${aliasSlug}/${prop}`;
      updateState(aliasTopic, strVal);
      if (NUMERIC_PROPS.has(prop) && typeof val === 'number') {
        maybeAppendHistory(aliasTopic, val, HISTORY_INTERVAL_MS);
      }
    }

    // If flagged as outdoor sensor, compute and record consensus (median/average)
    if (dev.isOutdoor) {
      if (NUMERIC_PROPS.has(prop) && typeof val === 'number') {
        const allDevs = Object.values(deviceRegistry);
        const outdoorDevs = allDevs.filter(
          (d) => Boolean(d.isOutdoor) && !d.isIgnored && typeof d.properties?.[prop] === 'number'
        );
        const vals = outdoorDevs.map((d) => d.properties[prop]);
        if (vals.length > 0) {
          vals.sort((a, b) => a - b);
          const mid = Math.floor(vals.length / 2);
          const medianVal = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
          const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
          const roundedMedian = prop === 'humidity' ? Math.round(medianVal) : Math.round(medianVal * 10) / 10;
          const roundedAvg = prop === 'humidity' ? Math.round(avgVal) : Math.round(avgVal * 10) / 10;

          // Main outdoor topic stores median
          const outdoorTopic = `rtl433/outdoor/${prop}`;
          updateState(outdoorTopic, String(roundedMedian));
          maybeAppendHistory(outdoorTopic, roundedMedian, HISTORY_INTERVAL_MS);

          // Additional median and average topics for analytics
          updateState(`rtl433/outdoor/${prop}_median`, String(roundedMedian));
          updateState(`rtl433/outdoor/${prop}_average`, String(roundedAvg));
        }
      } else {
        const outdoorTopic = `rtl433/outdoor/${prop}`;
        updateState(outdoorTopic, strVal);
      }
    }
  }

  // Broadcast WebSocket update
  if (wsBroadcastFn) {
    wsBroadcastFn({
      type: 'rtl433_update',
      deviceId,
      properties,
      lastSeen: now,
      ts: now,
    });

    if (isNewDevice) {
      wsBroadcastFn({
        type: 'rtl433_devices',
        devices: getDevices(),
        ts: now,
      });
    }
  }
}

/**
 * Initialize MQTT connection and subscribe to rtl_433 topics
 */
function init(wsBroadcast) {
  wsBroadcastFn = wsBroadcast;
  loadKnownDevicesFromDb();

  const brokerUrl = `mqtt://${MQTT_HOST}:${MQTT_PORT}`;
  console.log(`[rtl_433] Connecting to MQTT broker at ${brokerUrl} (base topic: ${BASE_TOPIC}) ...`);

  const options = {
    clientId: `kotialy_rtl433_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
  };

  if (process.env.MQTT_USERNAME) {
    options.username = process.env.MQTT_USERNAME;
    options.password = process.env.MQTT_PASSWORD;
  }

  client = mqtt.connect(brokerUrl, options);

  client.on('connect', () => {
    connected = true;
    console.log(`[rtl_433] Connected to MQTT broker ${brokerUrl}`);

    client.subscribe(`${BASE_TOPIC}/#`, { qos: 0 }, (err) => {
      if (err) console.error(`[rtl_433] Subscription error on ${BASE_TOPIC}/#:`, err.message);
      else console.log(`[rtl_433] Subscribed to ${BASE_TOPIC}/#`);
    });

    if (wsBroadcastFn) {
      wsBroadcastFn({
        type: 'rtl433_status',
        connected: true,
        ts: Date.now(),
      });
    }
  });

  client.on('disconnect', () => {
    connected = false;
    if (wsBroadcastFn) {
      wsBroadcastFn({ type: 'rtl433_status', connected: false, ts: Date.now() });
    }
  });

  client.on('error', (err) => {
    console.error('[rtl_433] MQTT client error:', err.message);
  });

  client.on('message', (fullTopic, buffer) => {
    const rawPayload = buffer.toString().trim();
    if (!rawPayload) return;
    handleMessage(fullTopic, rawPayload);
  });
}

/**
 * Return all registered devices with their latest properties and availability status
 */
function getDevices() {
  const fullState = getFullState();
  const list = [];
  const now = Date.now();

  for (const [id, dev] of Object.entries(deviceRegistry)) {
    const prefix = `rtl433/${id}/`;
    const properties = { ...dev.properties };

    // Supplement properties from DB sensor_state if available
    for (const [topic, data] of Object.entries(fullState)) {
      if (topic.startsWith(prefix)) {
        const prop = topic.slice(prefix.length);
        if (properties[prop] === undefined) {
          const num = parseFloat(data.value);
          properties[prop] = isNaN(num) ? data.value : num;
        }
      }
    }

    // Determine online status: considered active if packet seen within last 45 minutes
    const isOnline = dev.lastSeen ? now - dev.lastSeen < 45 * 60 * 1000 : false;

    list.push({
      ...dev,
      properties,
      online: isOnline,
    });
  }

  // Sort by lastSeen descending
  return list.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

function getDevice(id) {
  const devices = getDevices();
  return devices.find((d) => d.id === id) || null;
}

function updateAlias(id, updates) {
  const updated = updateRtl433DeviceAlias(id, updates);
  if (!updated) return null;

  if (deviceRegistry[id]) {
    if (updates.custom_name !== undefined) deviceRegistry[id].customName = updates.custom_name;
    if (updates.category !== undefined) deviceRegistry[id].category = updates.category;
    if (updates.location !== undefined) deviceRegistry[id].location = updates.location;
    if (updates.is_outdoor !== undefined) deviceRegistry[id].isOutdoor = Boolean(updates.is_outdoor);
    if (updates.is_ignored !== undefined) deviceRegistry[id].isIgnored = Boolean(updates.is_ignored);
  }

  if (wsBroadcastFn) {
    wsBroadcastFn({
      type: 'rtl433_devices',
      devices: getDevices(),
      ts: Date.now(),
    });
  }

  return getDevice(id);
}

function deleteDevice(id) {
  // Blacklist in database & purge state/history so radio packets will be dropped
  blacklistRtl433Device(id);

  if (deviceRegistry[id]) {
    deviceRegistry[id].isIgnored = true;
    deviceRegistry[id].properties = {};
  } else {
    deviceRegistry[id] = { id, isIgnored: true, properties: {} };
  }

  if (wsBroadcastFn) {
    wsBroadcastFn({
      type: 'rtl433_devices',
      devices: getDevices(),
      ts: Date.now(),
    });
  }
}

function unblacklistDevice(id) {
  unblacklistRtl433Device(id);

  if (deviceRegistry[id]) {
    deviceRegistry[id].isIgnored = false;
  }

  if (wsBroadcastFn) {
    wsBroadcastFn({
      type: 'rtl433_devices',
      devices: getDevices(),
      ts: Date.now(),
    });
  }

  return getDevice(id);
}

function purgeDevice(id) {
  purgeRtl433Device(id);
  delete deviceRegistry[id];

  if (wsBroadcastFn) {
    wsBroadcastFn({
      type: 'rtl433_devices',
      devices: getDevices(),
      ts: Date.now(),
    });
  }
}

function getStatus() {
  return {
    connected,
    packetCount,
    deviceCount: Object.keys(deviceRegistry).length,
    lastReceivedAt,
    baseTopic: BASE_TOPIC,
  };
}

function isConnected() {
  return connected;
}

function getLastReceivedAt() {
  return lastReceivedAt;
}

module.exports = {
  init,
  getDevices,
  getDevice,
  updateAlias,
  deleteDevice,
  blacklistDevice: deleteDevice,
  unblacklistDevice,
  purgeDevice,
  getStatus,
  isConnected,
  getLastReceivedAt,
};

