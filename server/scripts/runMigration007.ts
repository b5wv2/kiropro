import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  const filePath = path.join(__dirname, '../migrations/007_price_fields_redesign.sql');
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log('[Migration] Applying 007_price_fields_redesign.sql...');
  await pool.query(sql);
  console.log('[Migration] Migration 007 applied successfully!');
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('[Migration] Failed:', err);
  process.exit(1);
});
