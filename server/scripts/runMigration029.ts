import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env') });
import { Pool } from 'pg';

const rawDbUrl = process.env.DATABASE_URL || '';
const isLocalhost = rawDbUrl.includes('localhost') || rawDbUrl.includes('127.0.0.1');

const pool = new Pool({
  connectionString: rawDbUrl,
  ssl: isLocalhost ? false : { rejectUnauthorized: false }
});

async function main() {
  console.log('--- Applying Migration 029 (Lucky Wheel System) ---');
  const sqlPath = path.join(__dirname, '../migrations/029_lucky_wheel_system.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓ Migration 029 applied successfully!');

    const prizesRes = await pool.query('SELECT name, type, value, weight, is_active FROM "wheel_prizes" ORDER BY display_order ASC');
    console.log(`Prizes in DB (${prizesRes.rows.length}):`);
    console.table(prizesRes.rows);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Migration 029 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
