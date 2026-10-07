import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const sqlPath = path.join(__dirname, '..', 'migrations', '035_partner_portal_enhancements.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 035...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration 035 applied successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to run migration 035:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
