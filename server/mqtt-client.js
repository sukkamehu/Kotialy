const mqtt = require('mqtt');
require('dotenv').config();

const { TOPICS } = require('./topics');
const { updateState, maybeAppendHistory } = require('./db');

const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883');
const BASE_TOPIC = process.env.MQTT_BASE_TOPIC || 'panasonic_heat_pump';
const HISTORY_INTERVAL_MS = parseInt(process.env.HISTORY_INTERVAL || '60') * 1000;

let client = null;
let wsClients = new Set(); // WebSocket clients to broadcast to
let connected = false;
let lastReceivedAt = null;

const SUBSCRIBE_PATTERNS = [
  `${BASE_TOPIC}/main/#`,
  `${BASE_TOPIC}/extra/#`,
  `${BASE_TOPIC}/LWT`,
  `${BASE_TOPIC}/stats`,
  `${BASE_TOPIC}/log`,
];

function init(wsBroadcast) {
  const brokerUrl = process.env.MQTT_URL || `mqtt://${MQTT_HOST}:${MQTT_PORT}`;
  console.log(`[MQTT] Connecting to ${brokerUrl} ...`);

  const opts = {
    clientId: `kotialy_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
  };

  if (process.env.MQTT_USERNAME) {
    opts.username = process.env.MQTT_USERNAME;
    opts.password = process.env.MQTT_PASSWORD;
  }

  client = mqtt.connect(brokerUrl, opts);

  client.on('connect', () => {
    connected = true;
    console.log(`[MQTT] Connected to ${brokerUrl}`);
    SUBSCRIBE_PATTERNS.forEach((pattern) => {
      client.subscribe(pattern, { qos: 0 }, (err) => {
        if (err) console.error(`[MQTT] Subscribe error for ${pattern}:`, err);
        else console.log(`[MQTT] Subscribed: ${pattern}`);
      });
    });

    // Broadcast connection status
    wsBroadcast({
      type: 'mqtt_status',
      connected: true,
      broker: brokerUrl,
      ts: Date.now(),
    });
  });

  // 'disconnect' only fires on an MQTT 5 broker-initiated DISCONNECT packet.
  // A dropped/closed connection surfaces as 'close'/'offline', so listen for
  // those too or the UI keeps showing the broker as online after it dies.
  const onDisconnected = (reason) => {
    if (!connected) return;
    connected = false;
    console.log(`[MQTT] Disconnected (${reason})`);
    wsBroadcast({ type: 'mqtt_status', connected: false, ts: Date.now() });
  };

  client.on('disconnect', () => onDisconnected('disconnect'));
  client.on('close', () => onDisconnected('close'));
  client.on('offline', () => onDisconnected('offline'));

  client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
    wsBroadcast({
      type: 'mqtt_status',
      connected: false,
      error: err.message,
      ts: Date.now(),
    });
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...');
    wsBroadcast({ type: 'mqtt_status', connected: false, reconnecting: true, ts: Date.now() });
  });

  client.on('message', (fullTopic, payload) => {
    // Strip base topic prefix
    const topic = fullTopic.startsWith(BASE_TOPIC + '/')
      ? fullTopic.slice(BASE_TOPIC.length + 1)
      : fullTopic;

    const rawValue = payload.toString().trim();
    if (rawValue === '') return;

    lastReceivedAt = Date.now();

    // Handle LWT (Last Will and Testament)
    if (topic === 'LWT') {
      const isOnline = rawValue === 'Online';
      updateState(topic, rawValue);
      wsBroadcast({ type: 'lwt', online: isOnline, ts: Date.now() });
      return;
    }

    // Look up topic metadata
    const meta = TOPICS[topic];

    // Persist to DB
    updateState(topic, rawValue);

    // History (numeric topics only, throttled to interval)
    const numVal = parseFloat(rawValue);
    if (!isNaN(numVal)) {
      maybeAppendHistory(topic, numVal, HISTORY_INTERVAL_MS);
    }

    // Build broadcast payload
    const update = {
      type: 'state_update',
      topic,
      value: rawValue,
      label: meta?.label || topic.split('/').pop(),
      unit: meta?.unit || '',
      category: meta?.category || 'misc',
      ts: Date.now(),
    };

    // Resolve enum text label if available
    if (meta?.type === 'enum' && meta.map) {
      update.displayValue = meta.map[parseInt(rawValue)] ?? rawValue;
    } else {
      update.displayValue = rawValue;
    }

    wsBroadcast(update);
  });

  return client;
}

/**
 * Publish a command to Heishamon.
 * setTopic: e.g. 'commands/SetForceDHW'
 */
function publish(setTopic, value) {
  if (!client || !connected) {
    throw new Error('MQTT not connected');
  }
  const fullTopic = `${BASE_TOPIC}/${setTopic}`;
  client.publish(fullTopic, String(value), { qos: 1 }, (err) => {
    if (err) console.error(`[MQTT] Publish error to ${fullTopic}:`, err);
    else console.log(`[MQTT] Published ${fullTopic} = ${value}`);
  });
}

function isConnected() {
  return connected;
}

function getLastReceivedAt() {
  return lastReceivedAt;
}

module.exports = { init, publish, isConnected, getLastReceivedAt };
