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
  `${BASE_TOPIC}/lattialampopumppu/#`,
  `lattialampopumppu/#`,
  `stat/lattialampopumppu/#`,
  `tele/lattialampopumppu/#`,
  `cmnd/lattialampopumppu/#`,
  `stat/#`,
  `tele/#`,
  `${BASE_TOPIC}/LWT`,
  `${BASE_TOPIC}/stats`,
  `${BASE_TOPIC}/log`,
];

function init(wsBroadcast, onConnect) {
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

    if (typeof onConnect === 'function') {
      try {
        onConnect();
      } catch (err) {
        console.error('[MQTT] onConnect handler error:', err);
      }
    }

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
    // Strip base topic prefix if present
    const topic = fullTopic.startsWith(BASE_TOPIC + '/')
      ? fullTopic.slice(BASE_TOPIC.length + 1)
      : fullTopic;

    const rawValue = payload.toString().trim();
    if (rawValue === '') return;

    lastReceivedAt = Date.now();

    // Handle Tasmota JSON telemetry / results (e.g. stat/lattialampopumppu/RESULT = {"POWER":"ON"})
    if (
      (topic.includes('lattialampopumppu') || fullTopic.includes('lattialampopumppu')) &&
      rawValue.startsWith('{')
    ) {
      try {
        const parsed = JSON.parse(rawValue);
        if (parsed.POWER) {
          const pVal = parsed.POWER.toUpperCase();
          updateState('lattialampopumppu/stat/POWER', pVal);
          updateState('stat/lattialampopumppu/POWER', pVal);
          wsBroadcast({
            type: 'state_update',
            topic: 'lattialampopumppu/stat/POWER',
            value: pVal,
            label: 'Lattialämmityksen kiertopumppu (Sonoff)',
            unit: '',
            category: 'buffer',
            displayValue: pVal === 'ON' ? 'Käynnissä' : 'Pois päältä',
            ts: Date.now(),
          });
        }
      } catch {
        // Not valid json, proceed normally
      }
    }

    // Handle direct Tasmota power status
    if (
      topic === 'stat/lattialampopumppu/POWER' ||
      topic === 'lattialampopumppu/stat/POWER' ||
      fullTopic === 'stat/lattialampopumppu/POWER' ||
      fullTopic === 'lattialampopumppu/stat/POWER'
    ) {
      const pVal = rawValue.toUpperCase() === 'ON' || rawValue === '1' ? 'ON' : 'OFF';
      updateState('lattialampopumppu/stat/POWER', pVal);
      updateState('stat/lattialampopumppu/POWER', pVal);
      wsBroadcast({
        type: 'state_update',
        topic: 'lattialampopumppu/stat/POWER',
        value: pVal,
        label: 'Lattialämmityksen kiertopumppu (Sonoff)',
        unit: '',
        category: 'buffer',
        displayValue: pVal === 'ON' ? 'Käynnissä' : 'Pois päältä',
        ts: Date.now(),
      });
      return;
    }

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
 * Publish a command to Heishamon or Tasmota/Sonoff.
 * setTopic: e.g. 'commands/SetForceDHW' or 'cmnd/lattialampopumppu/POWER'
 */
function publish(setTopic, value) {
  if (!client || !connected) {
    throw new Error('MQTT not connected');
  }

  // If it is a floor pump command, publish to all possible Tasmota topic schemes
  if (setTopic.includes('lattialampopumppu') || setTopic.endsWith('/POWER')) {
    const pVal = (value === 'ON' || value === 1 || value === '1' || value === true) ? 'ON' : 'OFF';
    const topicsToPublish = [
      'cmnd/lattialampopumppu/POWER',
      'lattialampopumppu/cmnd/POWER',
      `${BASE_TOPIC}/lattialampopumppu/cmnd/POWER`,
    ];
    return new Promise((resolve) => {
      topicsToPublish.forEach((t) => {
        client.publish(t, pVal, { qos: 1 }, (err) => {
          if (err) console.error(`[MQTT] Error publishing to ${t}:`, err);
          else console.log(`[MQTT] Published ${t} = ${pVal}`);
        });
      });
      // Also update local state
      updateState('lattialampopumppu/stat/POWER', pVal);
      updateState('stat/lattialampopumppu/POWER', pVal);
      resolve(true);
    });
  }

  const fullTopic = `${BASE_TOPIC}/${setTopic}`;
  return new Promise((resolve, reject) => {
    client.publish(fullTopic, String(value), { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Publish error to ${fullTopic}:`, err);
        reject(err);
      } else {
        console.log(`[MQTT] Published ${fullTopic} = ${value}`);
        resolve(true);
      }
    });
  });
}

function isConnected() {
  return connected;
}

function getLastReceivedAt() {
  return lastReceivedAt;
}

module.exports = {
  init,
  publish,
  sendCommand: publish,
  isConnected,
  getLastReceivedAt,
};
