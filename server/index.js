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
const { getFullState } = require('./db');

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

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const wsClients = new Set();

wss.on('connection', (ws, req) => {
  console.log(`[WS] Client connected (${wss.clients.size} total)`);
  wsClients.add(ws);

  // Send full state snapshot on connect
  const snapshot = getFullState();
  ws.send(
    JSON.stringify({
      type: 'snapshot',
      state: snapshot,
      mqtt: {
        connected: mqttClient.isConnected(),
        lastReceivedAt: mqttClient.getLastReceivedAt(),
      },
      zigbee: {
        connected: zigbeeClient.isConnected(),
        devices: zigbeeClient.getDeviceRegistry(),
      },
      ts: Date.now(),
    })
  );

  ws.on('message', (data) => {
    // Handle client commands via WS (optional, mostly we use REST)
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
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
 * Broadcast a message to all connected WebSocket clients.
 */
function wsBroadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) {
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
