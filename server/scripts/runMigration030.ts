import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  console.log('🚀 Running Migration 030: Wheel Purchase Bonus & Credits...');
  const sqlPath = path.join(__dirname, '../migrations/030_wheel_purchase_bonus_and_credits.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 030 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 030 failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
