import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function runMigration046() {
  console.log('--- Running Migration 046: Disable Visa & Enforce Mastercard Virtual Cards ---');
  const sqlPath = path.join(__dirname, '../migrations/046_disable_visa_and_enforce_mastercard_virtual_cards.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 046 applied successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 046 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration046();
