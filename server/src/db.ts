import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import dns from 'node:dns';
dotenv.config();

// Ensure IPv4 first on Node.js to prevent connection stalls with Neon AWS Postgres
dns.setDefaultResultOrder('ipv4first');

// Create a new pool using the connection string from environment variables
// It expects DATABASE_URL to be formatted like: postgresql://postgres:password@localhost:5432/kiropro
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  max: 20,
});

// Prevent unhandled error event on idle clients from crashing Node.js
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool] Unexpected error on idle client:', err.message);
});

// Prevent unhandled error event on individual client instances when Neon/AWS resets sockets
pool.on('connect', (client: PoolClient) => {
  client.on('error', (err: any) => {
    console.warn('[PostgreSQL Client] Socket/connection error handled:', err.message);
  });
});

// Global process handler for transient network socket resets (ECONNRESET/EPIPE)
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'ECONNRESET' || err?.code === 'EPIPE' || err?.code === 'ETIMEDOUT') {
    console.warn('[Process] Caught recoverable network socket reset:', err.message);
    return;
  }
  console.error('[Process] Uncaught Exception:', err);
});

// Test the connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Failed to connect to PostgreSQL:', err.message);
  } else {
    console.log('Connected to PostgreSQL successfully at', res.rows[0].now);
  }
});

export default pool;
