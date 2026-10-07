import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  console.log('🚀 Running Migration 032: KiroPro Card V2 Updates...');
  const sqlPath = path.join(__dirname, '../migrations/032_kiropro_card_v2.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 032 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 032 failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
