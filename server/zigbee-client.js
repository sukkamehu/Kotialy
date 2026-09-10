/**
 * Zigbee MQTT Client
 *
 * Connects to Zigbee2MQTT (or compatible) broker.
 * - Subscribes to zigbee2mqtt/bridge/devices for auto-discovery
 * - Subscribes to zigbee2mqtt/# for all sensor updates
 * - Normalizes JSON payloads into flat topic→value pairs
 * - Stores to shared SQLite DB under prefix: zigbee/<device>/<property>
 * - Broadcasts via shared WS broadcast function
 */

const mqtt = require('mqtt');
require('dotenv').config();

const { updateState, maybeAppendHistory, getFullState } = require('./db');

const ZIGBEE_HOST = process.env.ZIGBEE_MQTT_HOST || 'localhost';
const ZIGBEE_PORT = parseInt(process.env.ZIGBEE_MQTT_PORT || '1883');
const BASE_TOPIC  = process.env.ZIGBEE_BASE_TOPIC || 'zigbee2mqtt';
const HISTORY_INTERVAL_MS = parseInt(process.env.HISTORY_INTERVAL || '60') * 1000;

// Numeric sensor properties to record in history
const NUMERIC_PROPS = new Set([
  'temperature', 'humidity', 'pressure', 'battery', 'linkquality',
  'voltage', 'current', 'power', 'energy', 'illuminance', 'illuminance_lux',
  'co2', 'voc', 'pm25', 'soil_moisture', 'current_heating_setpoint',
  'local_temperature', 'pi_heating_demand',
]);

// Boolean-ish sensor properties to track as state
const STATE_PROPS = new Set([
  'contact', 'occupancy', 'water_leak', 'tamper', 'battery_low',
  'smoke', 'gas', 'carbon_monoxide',
]);

let client = null;
let connected = false;
let deviceRegistry = {}; // { friendlyName: { deviceInfo, properties } }
let wsBroadcastFn = null;

/**
 * Determine sensor type from device definition
 */
function classifyDevice(device) {
  const definition = device.definition;
  if (!definition) return 'unknown';

  const exposes = definition.exposes || [];
  const types = new Set();

  function scanExposes(items) {
    for (const ex of items) {
      if (ex.type === 'climate') types.add('thermostat');
      else if (ex.name === 'temperature') types.add('temperature');
      else if (ex.name === 'humidity') types.add('humidity');
      else if (ex.name === 'contact') types.add('contact');
      else if (ex.name === 'occupancy') types.add('motion');
      else if (ex.name === 'water_leak') types.add('water_leak');
      else if (ex.name === 'power') types.add('power_meter');
      else if (ex.name === 'illuminance') types.add('light_sensor');
      else if (ex.name === 'smoke') types.add('smoke');
      if (ex.features) scanExposes(ex.features);
    }
  }
  scanExposes(exposes);

  if (types.has('thermostat')) return 'thermostat';
  if (types.has('water_leak')) return 'water_leak';
  if (types.has('contact')) return 'contact';
  if (types.has('motion')) return 'motion';
  if (types.has('temperature') || types.has('humidity')) return 'climate';
  if (types.has('power_meter')) return 'power_meter';
  if (types.has('smoke')) return 'smoke';
  return 'unknown';
}

/**
 * Process a zigbee2mqtt device sensor message.
 * topic: friendly_name (e.g. 'living_room/temperature')
 * payload: JSON string
 */
function processSensorMessage(friendlyName, rawPayload) {
  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return; // Not JSON, skip
  }

  if (typeof payload !== 'object' || payload === null) return;

  const updates = [];

  for (const [prop, val] of Object.entries(payload)) {
    if (val === null || val === undefined) continue;

    // Skip irrelevant metadata
    if (['last_seen', 'update', 'update_available'].includes(prop)) continue;

    const dbTopic = `zigbee/${friendlyName}/${prop}`;
    const strVal  = String(val);

    // Persist state
    updateState(dbTopic, strVal);

    // History for numeric props
    if (NUMERIC_PROPS.has(prop) && typeof val === 'number') {
      maybeAppendHistory(dbTopic, val, HISTORY_INTERVAL_MS);
    }

    updates.push({ prop, val: strVal });
  }

  if (updates.length > 0 && wsBroadcastFn) {
    wsBroadcastFn({
      type: 'zigbee_update',
      device: friendlyName,
      deviceType: deviceRegistry[friendlyName]?.type || 'unknown',
      properties: Object.fromEntries(updates.map(({ prop, val }) => [prop, val])),
      ts: Date.now(),
    });
  }
}

/**
 * Handle bridge/devices payload — full device registry
 */
function handleDeviceRegistry(payload) {
  let devices;
  try {
    devices = JSON.parse(payload);
  } catch {
    return;
  }

  if (!Array.isArray(devices)) return;

  const newRegistry = {};
  for (const device of devices) {
    if (device.type === 'Coordinator') continue; // Skip the coordinator itself

    const friendlyName = device.friendly_name;
    const type = classifyDevice(device);
    const definition = device.definition || {};

    newRegistry[friendlyName] = {
      friendlyName,
      type,
      model: definition.model || 'Unknown',
      vendor: definition.vendor || '',
      description: definition.description || '',
      ieeeAddr: device.ieee_address,
      networkAddress: device.network_address,
      powerSource: device.power_source,
      interviewCompleted: device.interview_completed,
    };

    console.log(`[Zigbee] Device: ${friendlyName} (${type}) - ${definition.vendor || ''} ${definition.model || ''}`);
  }

  deviceRegistry = newRegistry;

  if (wsBroadcastFn) {
    wsBroadcastFn({
      type: 'zigbee_devices',
      devices: getDeviceRegistry(),
      ts: Date.now(),
    });
  }

  console.log(`[Zigbee] Discovered ${Object.keys(newRegistry).length} devices`);
}

function init(wsBroadcast) {
  wsBroadcastFn = wsBroadcast;

  const brokerUrl = `mqtt://${ZIGBEE_HOST}:${ZIGBEE_PORT}`;
  console.log(`[Zigbee] Connecting to ${brokerUrl} ...`);

  const options = {
    clientId: `kotialy_zigbee_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
  };

  if (process.env.ZIGBEE_MQTT_USERNAME) {
    options.username = process.env.ZIGBEE_MQTT_USERNAME;
    options.password = process.env.ZIGBEE_MQTT_PASSWORD;
  }

  client = mqtt.connect(brokerUrl, options);

  client.on('connect', () => {
    connected = true;
    console.log(`[Zigbee] Connected to ${brokerUrl}`);

    // Subscribe to device registry
    client.subscribe(`${BASE_TOPIC}/bridge/devices`, { qos: 0 });
    client.subscribe(`${BASE_TOPIC}/bridge/state`, { qos: 0 });

    // Subscribe to all device data
    client.subscribe(`${BASE_TOPIC}/#`, { qos: 0 });

    wsBroadcast({ type: 'zigbee_status', connected: true, broker: brokerUrl, ts: Date.now() });
  });

  client.on('disconnect', () => {
    connected = false;
    wsBroadcast({ type: 'zigbee_status', connected: false, ts: Date.now() });
  });

  client.on('error', (err) => {
    console.error('[Zigbee] MQTT error:', err.message);
  });

  client.on('reconnect', () => {
    console.log('[Zigbee] Reconnecting...');
    connected = false;
  });

  client.on('message', (fullTopic, buffer) => {
    const payload = buffer.toString().trim();
    if (!payload) return;

    // Strip base topic prefix
    const topic = fullTopic.startsWith(BASE_TOPIC + '/')
      ? fullTopic.slice(BASE_TOPIC.length + 1)
      : fullTopic;

    // Bridge events
    if (topic === 'bridge/devices') {
      handleDeviceRegistry(payload);
      return;
    }
    if (topic === 'bridge/state') {
      console.log(`[Zigbee] Bridge state: ${payload}`);
      return;
    }
    // Skip other bridge internal topics
    if (topic.startsWith('bridge/')) return;

    // Skip /set, /get, /availability sub-topics (not sensor data)
    if (topic.endsWith('/set') || topic.endsWith('/get')) return;
    if (topic.endsWith('/availability')) {
      // Track availability per device
      const deviceName = topic.replace('/availability', '');
      const isOnline = payload === 'online' || payload === '{"state":"online"}';
      updateState(`zigbee/${deviceName}/_availability`, isOnline ? '1' : '0');
      wsBroadcast({
        type: 'zigbee_availability',
        device: deviceName,
        online: isOnline,
        ts: Date.now(),
      });
      return;
    }

    // Sensor data message
    processSensorMessage(topic, payload);
  });
}

/**
 * Return the device registry enriched with each device's latest property
 * values and availability from the DB.
 *
 * The raw registry only holds discovery metadata. Clients render device
 * properties, so every consumer (WS snapshot, WS broadcast, REST) must get
 * the enriched shape or `device.properties` is undefined on the frontend.
 */
function getDeviceRegistry() {
  const fullState = getFullState();
  const enriched = {};

  for (const [name, device] of Object.entries(deviceRegistry)) {
    const prefix = `zigbee/${name}/`;
    const properties = {};

    for (const [topic, data] of Object.entries(fullState)) {
      if (topic.startsWith(prefix)) {
        properties[topic.slice(prefix.length)] = {
          value: data.value,
          updated_at: data.updated_at,
        };
      }
    }

    const avail = properties._availability;
    delete properties._availability;

    enriched[name] = {
      ...device,
      properties,
      online: avail ? avail.value === '1' : null,
    };
  }

  return enriched;
}

function isConnected() {
  return connected;
}

module.exports = { init, getDeviceRegistry, isConnected };
