const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/018_referral_rewards_split.sql'), 'utf-8');
    console.log('Running Migration 018: Referral Rewards Split...');
    await pool.query(sql);
    console.log('Migration 018 completed successfully!');

    // Check referrals table columns
    const refCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'referrals' AND column_name LIKE '%reward_paid%'
    `);
    console.log('Reward paid columns in referrals:', refCols.rows);

    // Check settings
    const settings = await pool.query(`
      SELECT key, value FROM "platform_settings" WHERE key = 'referral_settings'
    `);
    console.log('Referral settings:', JSON.stringify(settings.rows[0]?.value, null, 2));
  } catch (err) {
    console.error('Migration 018 failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
