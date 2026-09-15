import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Create a new pool using the connection string from environment variables
// It expects DATABASE_URL to be formatted like: postgresql://postgres:password@localhost:5432/kiropro
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Prevent unhandled error event on idle clients from crashing Node.js
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool] Unexpected error on idle client:', err.message);
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
