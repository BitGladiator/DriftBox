const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
  process.exit(-1);
});


const query = (text, params) => pool.query(text, params);


const getClient = () => pool.connect();


const healthCheck = async () => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('SELECT 1');
    return true;
  } finally {
    dbClient.release();
  }
};

module.exports = { query, getClient, pool, healthCheck };