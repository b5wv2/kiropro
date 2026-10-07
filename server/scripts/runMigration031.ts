import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  console.log('🚀 Running Migration 031: KiroPro Card System...');
  const sqlPath = path.join(__dirname, '../migrations/031_kiropro_card_system.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 031 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 031 failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
