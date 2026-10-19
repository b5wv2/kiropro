import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  console.log('Running Migration 044 (Order Refund Unique Constraint)...');
  const sqlPath = path.resolve(__dirname, '../migrations/044_order_refund_unique_constraint.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration 044 executed successfully!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Migration 044 failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
