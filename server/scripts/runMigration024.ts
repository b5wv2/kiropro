import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/024_virtual_number_providers_and_offers.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 024 (Virtual Number Providers and Offers)...');
  await pool.query(sql);
  console.log('Migration 024 applied successfully!');

  // Verification checks
  const countRes = await pool.query('SELECT count(*) FROM virtual_number_offers');
  console.log('Total Allowed Provider Offers Seeded:', countRes.rows[0].count);

  const sampleOffers = await pool.query('SELECT country_code, service_code, provider_id, provider_name, customer_price_sdg, delivery_rate FROM virtual_number_offers LIMIT 5');
  console.log('Sample Provider Offers:', sampleOffers.rows);

  await pool.end();
}

main().catch(err => {
  console.error('Migration 024 failed:', err);
  process.exit(1);
});
