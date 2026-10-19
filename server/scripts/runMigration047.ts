import { pool } from '../src/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const sqlPath = path.join(__dirname, '../migrations/047_update_min_wallet_topup_limit.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 047...');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration 047 applied successfully!');

    const check = await client.query("SELECT value FROM platform_settings WHERE key = 'exchange_rate'");
    console.log('Updated exchange_rate setting:', check.rows[0]?.value);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
