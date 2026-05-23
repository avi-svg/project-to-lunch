const { Pool } = require('pg');
const { loadEnvFile } = require('../lib/load-env');

loadEnvFile();

function getPoolConfig() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing required DATABASE_URL environment variable.');
  }

  const config = {
    // Supabase is a hosted PostgreSQL service, so we connect through a single
    // connection string instead of separate local host/user/password settings.
    connectionString: process.env.DATABASE_URL,

    // Cloud-hosted databases usually benefit from a smaller default pool size
    // to avoid exhausting connection limits on smaller plans.
    max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 5,
    idleTimeoutMillis: process.env.PGIDLE_TIMEOUT
      ? Number(process.env.PGIDLE_TIMEOUT)
      : 10000,
    connectionTimeoutMillis: process.env.PGCONNECT_TIMEOUT
      ? Number(process.env.PGCONNECT_TIMEOUT)
      : 10000,

    // Supabase requires SSL for direct Postgres connections. We disable
    // certificate rejection here because managed providers commonly rotate or
    // proxy certificates in a way that breaks strict local validation.
    ssl: {
      rejectUnauthorized: false,
    },

    // Allow idle pooled connections to close cleanly in short-lived processes.
    allowExitOnIdle: true,
  };

  return config;
}

const pool = new Pool(getPoolConfig());

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

async function testConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing required DATABASE_URL environment variable.');
  }

  try {
    const client = await pool.connect();
    client.release();
  } catch (error) {
    console.error('PostgreSQL connection error:', error);
    throw error;
  }
}

async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error('PostgreSQL query error:', error);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  testConnection,
};
