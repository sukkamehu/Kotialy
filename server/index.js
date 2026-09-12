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

// ─── MQTT Bridges ────────────────────────────────────────────────────────────

mqttClient.init(wsBroadcast);
zigbeeClient.init(wsBroadcast);
nordpoolClient.setDb(require('./db'));
nordpoolClient.startScheduler();
weatherClient.setDb(require('./db'));
weatherClient.startScheduler();
costCalculator.startScheduler();

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
