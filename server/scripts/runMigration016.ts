import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/016_usdt_enhancements.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 016 (USDT Enhancements)...');
  await pool.query(sql);
  console.log('Migration 016 applied successfully!');

  // Verify constraints
  const constraints = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) as def 
    FROM pg_constraint 
    WHERE conname IN ('usdt_inventory_min_order_amount_check', 'crypto_networks_min_amount_check')
  `);
  console.log('Updated Constraints:', constraints.rows);

  await pool.end();
}

main().catch(err => {
  console.error('Migration 016 failed:', err);
  process.exit(1);
});
