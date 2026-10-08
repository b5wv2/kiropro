import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const sqlPath = path.join(__dirname, '..', 'migrations', '039_account_marketplace.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 039 (Account Marketplace)...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 039 applied successfully!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to run migration 039:', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
