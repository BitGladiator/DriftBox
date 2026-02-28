require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const client  = require('prom-client');

const app  = express();
const PORT = process.env.PORT || 3002;


client.collectDefaultMetrics({ prefix: 'upload_' });


app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'upload', uptime: process.uptime() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Routes 
// const uploadRoutes = require('./routes/upload');
// app.use('/upload', uploadRoutes);


app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});


app.listen(PORT, () => {
  console.log(`[upload] Running on port ${PORT}`);
});

module.exports = app;