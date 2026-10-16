import pool from '../src/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  const sqlPath = path.join(__dirname, '../migrations/042_g2bulk_vouchers.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('[Migration 042] Running migration from:', sqlPath);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Migration 042] SUCCESS: Migration applied cleanly!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Migration 042] FAILED:', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration().catch(err => {
  console.error('[Migration 042] Fatal error:', err);
  process.exit(1);
});
