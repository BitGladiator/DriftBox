require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const client       = require('prom-client');
const mq           = require('./shared/rabbitmq');
const db           = require('./shared/db');
const shareRoutes  = require('./routes/share');

const app  = express();
const PORT = process.env.PORT || 3005;


client.collectDefaultMetrics({ prefix: 'share_' });


app.use(helmet());
app.use(cors());
app.use(express.json());


app.get('/health', async (req, res) => {
  try {
    await db.healthCheck();
    res.json({ status: 'ok', service: 'share', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'DB unreachable' });
  }
});


app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});


app.use('/share', shareRoutes);


app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const start = async () => {
  await mq.connect(10, 5000);
  app.listen(PORT, () => {
    console.log(`[share] Running on port ${PORT}`);
  });
};

start().catch((err) => {
  console.error('[share] Failed to start:', err.message);
  process.exit(1);
});

module.exports = app;