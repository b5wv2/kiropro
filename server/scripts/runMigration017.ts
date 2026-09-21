import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/017_referral_system.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 017: Referral System...');
  await pool.query(sql);
  console.log('Migration 017 executed successfully!');

  // Verification 1: Check User columns
  const userCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'User' AND column_name IN ('referral_code', 'referred_by_id')
  `);
  console.log('User referral columns:', userCols.rows);

  // Verification 2: Check referrals table
  const refTable = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'referrals'
    ORDER BY ordinal_position
  `);
  console.log('Referrals table columns count:', refTable.rows.length);

  // Verification 3: Check platform_settings for referral_settings
  const settingsRes = await pool.query(`
    SELECT key, value 
    FROM "platform_settings" 
    WHERE key = 'referral_settings'
  `);
  console.log('Referral settings:', settingsRes.rows[0]);

  await pool.end();
}

main().catch(err => {
  console.error('Migration 017 failed:', err);
  process.exit(1);
});
