import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/023_virtual_numbers.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 023 (Virtual Numbers)...');
  await pool.query(sql);
  console.log('Migration 023 applied successfully!');

  // Verification checks
  const settingsRes = await pool.query('SELECT * FROM virtual_number_settings WHERE id = 1');
  console.log('Virtual Number Settings:', settingsRes.rows[0]);

  const countRes = await pool.query('SELECT count(*) FROM virtual_number_products');
  console.log('Total Allowed Products Seeded:', countRes.rows[0].count);

  const sampleProducts = await pool.query('SELECT country_code, service_code, country_name_ar, service_name_ar FROM virtual_number_products LIMIT 6');
  console.log('Sample Products:', sampleProducts.rows);

  await pool.end();
}

main().catch(err => {
  console.error('Migration 023 failed:', err);
  process.exit(1);
});
