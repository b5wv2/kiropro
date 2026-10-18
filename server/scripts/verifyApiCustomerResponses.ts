import pool from '../src/db';

async function verify() {
  console.log('=== Checking Store Products for PUBG and Test Top-up ===');
  const pubgProds = await pool.query(`
    SELECT id, "productName", "offerName", "customerPriceUsd", "providerCostUsd", "isActive", "inStock", "primaryProvider", "fallbackProvider"
    FROM "Product"
    WHERE "gameCategoryId" = 'pubg-mobile' AND "isActive" = true
    ORDER BY "customerPriceUsd" ASC
  `);
  console.log(`Active PUBG Products: ${pubgProds.rows.length}`);
  pubgProds.rows.forEach(p => {
    console.log(`  - ${p.offerName} | Retail: $${p.customerPriceUsd} | Cost: $${p.providerCostUsd} | Primary: ${p.primaryProvider} | Fallback: ${p.fallbackProvider}`);
  });

  const testTopup = await pool.query(`
    SELECT id, "productName", "offerName", "customerPriceUsd", "providerCostUsd", "gameCategoryId", "isActive"
    FROM "Product"
    WHERE "productName" = '[اختبار مؤقت] Test Top-up'
  `);
  console.log('\nTest Top-up Product:', testTopup.rows[0]);

  const testVoucher = await pool.query(`
    SELECT id, provider_product_id, title, arabic_title, customer_price_usd, unit_price, stock, is_active
    FROM g2bulk_voucher_catalog
    WHERE provider_product_id = 73
  `);
  console.log('\nTest Gift Card Voucher:', testVoucher.rows[0]);

  await pool.end();
}

verify().catch(console.error);
