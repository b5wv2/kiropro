const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, '../migrations/021_referral_security_constraints.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Applying Migration 021...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓ Migration 021 applied successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration 021 failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
