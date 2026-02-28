require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const client     = require('prom-client');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const PORT   = process.env.PORT || 3004;


client.collectDefaultMetrics({ prefix: 'sync_' });

const activeConnections = new client.Gauge({
  name: 'sync_active_websocket_connections',
  help: 'Number of active WebSocket connections',
});


app.use(helmet());
app.use(cors());
app.use(express.json());


app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sync',
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
  });
});


app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});


io.on('connection', (socket) => {
  activeConnections.inc();
  console.log(`[sync] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    activeConnections.dec();
    console.log(`[sync] Client disconnected: ${socket.id}`);
  });
});


app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});


server.listen(PORT, () => {
  console.log(`[sync] Running on port ${PORT}`);
});

module.exports = { app, io };