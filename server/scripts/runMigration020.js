const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

async function migrate() {
  console.log('Running Migration 020: User Security System...');
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/020_user_security_system.sql'), 'utf-8');
    await pool.query(sql);
    console.log('Migration 020 executed successfully!');

    // Verify tables
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('user_sessions', 'security_events', 'user_bans')
      ORDER BY table_name;
    `);
    console.log('Verified security tables:', tablesRes.rows.map(r => r.table_name));

    // Verify indexes
    const idxRes = await pool.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename IN ('user_sessions', 'security_events', 'user_bans')
      ORDER BY tablename, indexname;
    `);
    console.log(`Verified ${idxRes.rows.length} indexes created.`);
  } catch (err) {
    console.error('Migration 020 failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
