const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Connecting (attempt ${attempt})...`);
      const client = await pool.connect();
      console.log('Connected successfully!');

      // 1. Platform Settings
      const settings = await client.query('SELECT key, value, updated_at FROM "platform_settings"');
      console.log('=== PLATFORM SETTINGS ===');
      for (const s of settings.rows) {
        console.log(`Key [${s.key}] =>`, JSON.stringify(s.value, null, 2));
      }

      // 2. Database Tables
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      console.log('\n=== DB TABLES ===');
      console.log(tables.rows.map(t => t.table_name));

      client.release();
      break;
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
  }
  await pool.end();
}

check();
