require('dotenv').config();
const express            = require('express');
const http               = require('http');
const { Server }         = require('socket.io');
const cors               = require('cors');
const helmet             = require('helmet');
const client             = require('prom-client');
const mq                 = require('./shared/rabbitmq');
const { setupSocket, getTotalConnections } = require('./socket/syncHandler');
const { startConsumers } = require('./consumer/fileConsumer');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
const PORT = process.env.PORT || 3004;

// ─── Metrics ──────────────────────────────────────────────────
client.collectDefaultMetrics({ prefix: 'sync_' });

const connectionsGauge = new client.Gauge({
  name: 'sync_active_websocket_connections',
  help: 'Number of active WebSocket connections',
});

setInterval(() => {
  connectionsGauge.set(getTotalConnections());
}, 10000);

// ─── Middleware ───────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:      'ok',
    service:     'sync',
    uptime:      process.uptime(),
    connections: getTotalConnections(),
  });
});

// ─── Metrics endpoint ─────────────────────────────────────────
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Init then start ──────────────────────────────────────────
const start = async () => {
  console.log('[sync] Connecting to RabbitMQ...');

  // Retry up to 10 times with 5s delay — gives RabbitMQ time to be ready
  await mq.connect(10, 5000);

  console.log('[sync] Setting up Socket.io...');
  setupSocket(io);

  console.log('[sync] Starting RabbitMQ consumers...');
  await startConsumers(io);

  server.listen(PORT, () => {
    console.log(`[sync] Running on port ${PORT}`);
    console.log('[sync] Ready to receive events and push to clients');
  });
};

start().catch((err) => {
  console.error('[sync] Failed to start:', err.message);
  process.exit(1);
});

module.exports = { app, io };