import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/015_usdt_instant_transfer.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 015 (USDT Instant Transfer)...');
  await pool.query(sql);
  console.log('Migration 015 applied successfully!');

  // Verification checks
  const invRes = await pool.query('SELECT * FROM usdt_inventory WHERE id = 1');
  console.log('USDT Inventory Row:', invRes.rows[0]);

  const netRes = await pool.query('SELECT identifier, name, enabled, min_amount FROM crypto_networks ORDER BY display_order');
  console.log('Crypto Networks:', netRes.rows);

  const orderCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Order' AND column_name IN ('orderType', 'cryptoNetwork', 'walletAddress', 'usdtAmount', 'txHash')
  `);
  console.log('Order Crypto Columns:', orderCols.rows.map(r => r.column_name));

  await pool.end();
}

main().catch(err => {
  console.error('Migration 015 failed:', err);
  process.exit(1);
});
