const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/017_referral_system.sql'), 'utf-8');
    console.log('Running Migration 017: Referral System...');
    await pool.query(sql);
    console.log('Migration 017 completed successfully!');

    // Check User columns
    const userCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name IN ('referral_code', 'referred_by_id')
    `);
    console.log('User referral columns:', userCols.rows);

    // Check referrals table
    const refCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'referrals'
      ORDER BY ordinal_position
    `);
    console.log('Referrals columns count:', refCols.rows.length);

    // Check settings
    const settings = await pool.query(`
      SELECT key, value FROM "platform_settings" WHERE key = 'referral_settings'
    `);
    console.log('Referral settings:', settings.rows[0]);
  } catch (err) {
    console.error('Migration 017 failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
