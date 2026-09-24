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
    console.log('Running Migration 022...');
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/022_referral_leaderboard_indexes.sql'), 'utf8');
    await client.query(sql);
    console.log('✓ Migration 022 executed successfully!');
  } catch (err) {
    console.error('Migration 022 error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
