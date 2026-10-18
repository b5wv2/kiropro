import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  console.log('Running Migration 043...');
  const sqlPath = path.resolve(__dirname, '../migrations/043_player_validation_cache_and_rate_limit.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration 043 executed successfully!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Migration 043 failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
