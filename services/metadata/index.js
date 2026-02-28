require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const client      = require('prom-client');
const db          = require('./shared/db');
const fileRoutes  = require('./routes/files');

const app  = express();
const PORT = process.env.PORT || 3003;

client.collectDefaultMetrics({ prefix: 'metadata_' });


app.use(helmet());
app.use(cors());
app.use(express.json());


app.get('/health', async (req, res) => {
  try {
    await db.healthCheck();
    res.json({ status: 'ok', service: 'metadata', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'DB unreachable' });
  }
});


app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});


app.use('/files', fileRoutes);


app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});


app.listen(PORT, () => {
  console.log(`[metadata] Running on port ${PORT}`);
});

module.exports = app;