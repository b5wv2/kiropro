import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/025_partner_system.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('--- Applying Migration 025 (KIROPRO Partner Platform) ---');
  await pool.query(sql);
  console.log('✓ Migration 025 applied successfully!');

  // Verification checks
  const tables = [
    'partner_levels',
    'partner_profiles',
    'partner_setup_tokens',
    'partner_wallets',
    'partner_ledger',
    'partner_product_pricing',
    'partner_deposits',
    'partner_orders',
    'exchange_rate_history'
  ];

  for (const table of tables) {
    const check = await pool.query(
      `SELECT count(*) FROM information_schema.tables WHERE table_name = $1`,
      [table]
    );
    const exists = parseInt(check.rows[0].count, 10) > 0;
    console.log(`Table [${table}]: ${exists ? 'OK ✓' : 'MISSING ✗'}`);
  }

  const levelsRes = await pool.query('SELECT name, arabic_name, min_points, max_points, discount_percent FROM partner_levels ORDER BY display_order ASC');
  console.log('Seeded Partner Levels:', levelsRes.rows);

  const productColCheck = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Product' AND column_name = 'defaultPartnerPriceUsd'
  `);
  console.log('Product defaultPartnerPriceUsd column:', productColCheck.rows);

  await pool.end();
  console.log('--- Migration 025 Verification Completed ---');
}

main().catch(err => {
  console.error('Migration 025 failed:', err);
  process.exit(1);
});
