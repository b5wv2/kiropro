import { pool } from '../src/db';
import { g2BulkClient } from '../src/providers/g2bulk/client';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const apiKey = g2BulkClient.getApiKey();
  console.log('--- G2BULK ENVIRONMENT & KEYS ---');
  console.log('g2BulkClient has API key configured:', Boolean(apiKey));
  console.log('API key length:', apiKey ? apiKey.length : 0);
  console.log('ALLOW_REAL_G2BULK_PURCHASE:', process.env.ALLOW_REAL_G2BULK_PURCHASE);
  console.log('NODE_ENV:', process.env.NODE_ENV);

  console.log('\n--- G2BULK VOUCHER CATALOG (DB) ---');
  const voucherCatalog = await pool.query(
    'SELECT id, provider_product_id, title, arabic_title, customer_price_usd, unit_price, is_active, is_in_stock, stock FROM g2bulk_voucher_catalog ORDER BY id ASC LIMIT 5'
  );
  console.log(JSON.stringify(voucherCatalog.rows, null, 2));

  console.log('\n--- PRODUCT TABLE (FULFILLMENT_TYPE = G2BULK_VOUCHER) ---');
  const productVouchers = await pool.query(
    'SELECT * FROM "Product" WHERE fulfillment_type = \'G2BULK_VOUCHER\' LIMIT 2'
  );
  console.log(JSON.stringify(productVouchers.rows, null, 2));

  console.log('\n--- PROVIDER SETTINGS ---');
  try {
    const provSettings = await pool.query('SELECT * FROM provider_settings');
    console.log(JSON.stringify(provSettings.rows, null, 2));
  } catch (e: any) {
    console.log('provider_settings table error:', e.message);
  }

  console.log('\n--- PLATFORM SETTINGS ---');
  const settings = await pool.query('SELECT key, value FROM platform_settings WHERE key LIKE \'%g2bulk%\' OR key LIKE \'%voucher%\'');
  console.log(JSON.stringify(settings.rows, null, 2));

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Inspection error:', err);
  process.exit(1);
});
