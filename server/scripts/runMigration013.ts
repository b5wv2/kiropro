import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  const sqlPath = path.join(__dirname, '..', 'migrations', '013_wallet_transaction_actor.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Applying migration 013...');
  await pool.query(sql);
  console.log('Migration 013 applied successfully.');

  const res = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name = 'WalletTransaction' AND column_name IN ('createdBy', 'created_by_type');
  `);
  console.table(res.rows);

  await pool.end();
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
