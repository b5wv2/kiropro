import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, '../migrations/034_partner_kiropro_card.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('✅ Applied migration 034 successfully.');

    // Verify
    const prodRes = await client.query(`
      SELECT id, "productName", "customerPriceUsd", "defaultPartnerPriceUsd" 
      FROM "Product" 
      WHERE id = 'b0000000-0000-0000-0000-000000000001'
    `);
    console.log('Product status:', prodRes.rows[0]);

    const settingRes = await client.query(`
      SELECT * FROM partner_pricing_settings WHERE key = 'kiropro_card_default_partner_price_usd'
    `);
    console.log('Pricing setting:', settingRes.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration 034 failed:', err);
  process.exit(1);
});
