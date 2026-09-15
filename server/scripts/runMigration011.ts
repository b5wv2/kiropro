import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/011_currency_cashback_system.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 011...');
  await pool.query(sql);
  console.log('Migration 011 applied successfully.');

  // Quick verification
  const userCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'User' AND column_name = 'preferred_currency'
  `);
  console.log('User preferred_currency column:', userCols.rows);

  const walletCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Wallet' AND column_name = 'currency'
  `);
  console.log('Wallet currency column:', walletCols.rows);

  const cashbackCheck = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name IN ('cashback_rules', 'cashback_redemptions')
  `);
  console.log('Cashback tables:', cashbackCheck.rows.map(r => r.table_name));

  await pool.end();
}

main().catch(err => {
  console.error('Migration 011 failed:', err);
  process.exit(1);
});
