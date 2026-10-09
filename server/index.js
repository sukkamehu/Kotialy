require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

const apiRoutes = require('./routes/api');
const mqttClient = require('./mqtt-client');
const zigbeeClient = require('./zigbee-client');
const nordpoolClient = require('./nordpool-client');
const weatherClient = require('./weather-client');
const costCalculator = require('./cost-calculator');
const apcService = require('./apc-service');
const cameraService = require('./camera-service');
const s3Service = require('./s3-service');
const herrforsClient = require('./herrfors-client');
const tapoService = require('./devices/tapo-service');
const tuyaService = require('./devices/tuya-service');
const outdoorLightsDriver = require('./devices/outdoor-lights-driver');
const { getFullState } = require('./db');
const { enrichState } = require('./topics');

const PORT = parseInt(process.env.PORT || '3001');

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mqtt: mqttClient.isConnected(),
    lastMqtt: mqttClient.getLastReceivedAt(),
    uptime: process.uptime(),
    ts: Date.now(),
  });
});

// API routes
app.use('/api', apiRoutes);

const { isLocalIp, getClientIp, verifyToken } = require('./auth');

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const wsClients = new Set();

wss.on('connection', (ws, req) => {
  const ip = getClientIp(req);
  const isLocal = isLocalIp(ip);

  let token = null;
  let validToken = null;
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    token = parsedUrl.searchParams.get('token');
    if (token) validToken = verifyToken(token);
  } catch {}

  let authenticated = isLocal || validToken !== null;
  let userRole = isLocal ? 'admin' : (validToken?.role || 'viewer');
  let userName = isLocal ? 'lan_user' : (validToken?.u || null);

  ws.isAuth = authenticated;
  ws.isLocal = isLocal;
  ws.role = userRole;
  ws.user = userName;

  console.log(`[WS] Client connected from ${ip} (Local: ${isLocal}, Auth: ${authenticated}, Role: ${userRole})`);
  wsClients.add(ws);

  const sendSnapshot = () => {
    ws.send(
      JSON.stringify({
        type: 'snapshot',
        state: enrichState(getFullState()),
        mqtt: {
          connected: mqttClient.isConnected(),
          lastReceivedAt: mqttClient.getLastReceivedAt(),
        },
        zigbee: {
          connected: zigbeeClient.isConnected(),
          devices: zigbeeClient.getDeviceRegistry(),
        },
        auth: {
          isLocal,
          authenticated: true,
          role: ws.role || userRole,
          username: ws.user || userName,
        },
        apc: apcService.getStatus(),
        tapo: tapoService.getAllStatuses(),
        tuya: {
          devices: tuyaService.devices,
          sauna: tuyaService.getSaunaStatus(),
        },
        outdoorLights: outdoorLightsDriver.getStatus(),
        ts: Date.now(),
      })
    );
  };

  if (authenticated) {
    sendSnapshot();
  } else {
    ws.send(JSON.stringify({ type: 'auth_required', isLocal: false }));
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'auth') {
        const valid = verifyToken(msg.token);
        if (valid) {
          ws.isAuth = true;
          authenticated = true;
          ws.role = valid.role || 'viewer';
          ws.user = valid.u;
          sendSnapshot();
        } else {
          ws.send(JSON.stringify({ type: 'auth_error', error: 'Virheellinen kirjautumistunniste' }));
        }
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected (${wss.clients.size} remaining)`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    wsClients.delete(ws);
  });
});

/**
 * Broadcast a message to all authenticated connected WebSocket clients.
 */
function wsBroadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN && ws.isAuth) {
      ws.send(msg);
    }
  }
}

// ─── APC Smart Optimizer ─────────────────────────────────────────────────────
apcService.setWsBroadcast(wsBroadcast);
apcService.setMqttClient(mqttClient);
apcService.start();

// ─── MQTT Bridges ────────────────────────────────────────────────────────────

mqttClient.init(wsBroadcast, () => {
  apcService.evaluate();
});
zigbeeClient.init(wsBroadcast);
nordpoolClient.setDb(require('./db'));
nordpoolClient.startScheduler();
weatherClient.setDb(require('./db'));
weatherClient.startScheduler();
costCalculator.startScheduler();
cameraService.startScheduler();
s3Service.startScheduler();
herrforsClient.startScheduler();

// ─── Tuya & SmartLife Service ───────────────────────────────────────────────
tuyaService.init(wsBroadcast);

// ─── Tapo Smart Plugs Service ───────────────────────────────────────────────
tapoService.setWsBroadcast(wsBroadcast);
tapoService.setMqttClient(mqttClient);
tapoService.start();

// ─── Outdoor Lights Driver (Astronomical Dusk / Dawn) ──────────────────────
outdoorLightsDriver.setWsBroadcast(wsBroadcast);
outdoorLightsDriver.start();

// ─── Notification & Alert Engine ───────────────────────────────────────────
const notificationService = require('./notification-service');
const alertEngine = require('./alert-engine');
notificationService.setWsClients(wsClients);
alertEngine.start();

// Periodic MQTT State Broadcaster (for ESP32 displays & IoT clients)
function publishMqttLiveStates() {
  if (!mqttClient || !mqttClient.isConnected()) return;

  // 1. Nordpool electricity spot price (converted EUR/MWh -> snt/kWh)
  const np = nordpoolClient.getCurrentPrice();
  if (np && np.price != null) {
    const priceCentsKWh = (np.price / 10).toFixed(2);
    mqttClient.publish('nordpool/current_price', String(priceCentsKWh), { retain: true });
  }

  // 2. Sauna state
  const sauna = tuyaService.getSaunaStatus();
  if (sauna) {
    mqttClient.publish('tuya/sauna/switch', sauna.isOn ? '1' : '0', { retain: true });
    if (sauna.temperature != null) {
      mqttClient.publish('tuya/sauna/temperature', String(sauna.temperature), { retain: true });
    }
    if (sauna.humidity != null) {
      mqttClient.publish('tuya/sauna/humidity', String(sauna.humidity), { retain: true });
    }
    if (sauna.autoOffAt) {
      mqttClient.publish('tuya/sauna/auto_off_at', String(sauna.autoOffAt), { retain: true });
    }
    if (sauna.durationMinutes) {
      mqttClient.publish('tuya/sauna/duration', String(sauna.durationMinutes), { retain: true });
    }
  }
}
setInterval(publishMqttLiveStates, 2_000);
setTimeout(publishMqttLiveStates, 1_000);

// Daily database maintenance (prune records older than 30 days & truncate WAL)
const { pruneOldHistory, vacuumDatabase } = require('./db');
setTimeout(() => pruneOldHistory(30), 60_000);
setInterval(() => {
  pruneOldHistory(30);
}, 24 * 60 * 60 * 1000);

// ─── Start ───────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════╗
  ║       Kotiäly Server v1.0       ║
  ╠══════════════════════════════════╣
  ║  HTTP API: http://localhost:${PORT}  ║
  ║  WebSocket: ws://localhost:${PORT}/ws║
  ╚══════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  server.close(() => process.exit(0));
});
