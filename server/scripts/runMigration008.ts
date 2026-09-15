import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  const filePath = path.join(__dirname, '../migrations/008_catalog_curation.sql');
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log('[Migration] Applying 008_catalog_curation.sql...');
  await pool.query(sql);
  console.log('[Migration] Migration 008 applied successfully!');
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('[Migration] Failed:', err);
  process.exit(1);
});
