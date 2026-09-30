import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
dotenv.config();

// Ensure IPv4 first on Node.js to prevent connection stalls with Neon AWS Postgres
dns.setDefaultResultOrder('ipv4first');

// Pool configuration: limit to 10 connections by default (configurable via DB_POOL_MAX)
const poolMax = Number(process.env.DB_POOL_MAX || 10);

const rawDbUrl = process.env.DATABASE_URL || '';
const isLocalhost = rawDbUrl.includes('localhost') || rawDbUrl.includes('127.0.0.1');

/**
 * Resolve CA Certificate for PostgreSQL SSL connection.
 * Priority:
 * 1. Environment variable: AIVEN_CA_CERT or DATABASE_CA_CERT (Direct PEM string or base64)
 * 2. Environment variable: PGSSLROOTCERT or AIVEN_CA_PATH (File path)
 * 3. Local cert file (if present in server/certs/aiven_ca.pem)
 */
function getDatabaseCaCert(): string | undefined {
  const envCert = process.env.AIVEN_CA_CERT || process.env.DATABASE_CA_CERT;
  if (envCert) {
    let trimmed = envCert.trim();
    // Handle base64 encoded PEM
    if (!trimmed.includes('BEGIN CERTIFICATE') && !trimmed.includes('\n')) {
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        if (decoded.includes('BEGIN CERTIFICATE')) {
          return decoded;
        }
      } catch {
        // Not base64, proceed
      }
    }
    // Handle escaped newlines (\n) if pasted in single-line env input
    if (trimmed.includes('\\n')) {
      trimmed = trimmed.replace(/\\n/g, '\n');
    }
    return trimmed;
  }

  // Check file path from environment variable
  const envPath = process.env.PGSSLROOTCERT || process.env.AIVEN_CA_PATH;
  if (envPath && fs.existsSync(envPath)) {
    try {
      return fs.readFileSync(envPath, 'utf8');
    } catch {
      // Proceed to local file check
    }
  }

  // Check git-ignored local certs directory
  const localCertPath = path.resolve(__dirname, '../certs/aiven_ca.pem');
  if (fs.existsSync(localCertPath)) {
    try {
      return fs.readFileSync(localCertPath, 'utf8');
    } catch {
      // Fallback
    }
  }

  return undefined;
}

const caCert = getDatabaseCaCert();

// When connecting to cloud Postgres, strip sslmode from query string
// so pg's internal connection parser does not conflict with our explicit ssl config.
const connectionString = isLocalhost
  ? rawDbUrl
  : rawDbUrl.replace(/([?&])sslmode=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');

// Secure TLS configuration:
// - rejectUnauthorized is strictly TRUE when connecting over SSL
// - Uses custom CA certificate (Aiven Project CA) if provided, or default system CAs (Neon/AWS)
const sslConfig = isLocalhost
  ? false
  : caCert
    ? {
        ca: caCert,
        rejectUnauthorized: true,
      }
    : {
        rejectUnauthorized: true,
      };

// Create a new pool using the connection string from environment variables
// It expects DATABASE_URL to be formatted like: postgresql://postgres:password@localhost:5432/kiropro
export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  max: poolMax,
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
