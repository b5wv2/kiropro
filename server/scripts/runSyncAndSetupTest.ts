import pool from '../src/db';
import { syncPubgTopupCatalog } from '../src/services/pubgSyncService';
import { setupTemporaryTestProducts } from '../src/services/testProductsService';

async function main() {
  console.log('=== STEP 1: Running PUBG Mobile Synchronization ===');
  const pubgResult = await syncPubgTopupCatalog();
  console.log('PUBG Mobile Sync Result:', {
    success: pubgResult.success,
    gameCode: pubgResult.gameCode,
    denominationsSynced: pubgResult.denominationsSynced,
    productsMapped: pubgResult.productsMapped
  });

  console.log('\n=== STEP 2: Setting up Temporary Test Products ===');
  const testResult = await setupTemporaryTestProducts();
  console.log('Test Products Setup Result:', JSON.stringify(testResult, null, 2));

  console.log('\n=== STEP 3: Verifying Database State ===');
  const mappingCount = await pool.query(`
    SELECT provider, count(*)::int as count 
    FROM "product_provider_mappings" 
    GROUP BY provider
  `);
  console.log('Product Provider Mappings by Provider:', mappingCount.rows);

  const activePubg = await pool.query(`
    SELECT id, "productName", "offerName", "customerPriceUsd", "providerCostUsd", "primaryProvider", "fallbackProvider", "fallbackEnabled", "isActive"
    FROM "Product"
    WHERE "gameCategoryId" = 'pubg-mobile' AND "isActive" = true
    ORDER BY "customerPriceUsd" ASC
  `);
  console.log(`Active PUBG Products in DB: ${activePubg.rows.length}`);
  activePubg.rows.slice(0, 5).forEach(r => {
    console.log(`  - ${r.offerName} | Sell: $${r.customerPriceUsd} | Cost: $${r.providerCostUsd} | Fallback: ${r.fallbackProvider} (${r.fallbackEnabled})`);
  });

  const testTopup = await pool.query(`SELECT * FROM "Product" WHERE "productName" = '[اختبار مؤقت] Test Top-up'`);
  console.log('\nTest Top-up Product in DB:', {
    id: testTopup.rows[0]?.id,
    name: testTopup.rows[0]?.productName,
    price: testTopup.rows[0]?.customerPriceUsd,
    cost: testTopup.rows[0]?.providerCostUsd,
    primaryProvider: testTopup.rows[0]?.primaryProvider,
    active: testTopup.rows[0]?.isActive
  });

  const testVoucher = await pool.query(`SELECT * FROM g2bulk_voucher_catalog WHERE provider_product_id = 73`);
  console.log('Test Voucher in DB:', {
    id: testVoucher.rows[0]?.id,
    title: testVoucher.rows[0]?.title,
    price: testVoucher.rows[0]?.customer_price_usd,
    cost: testVoucher.rows[0]?.unit_price,
    stock: testVoucher.rows[0]?.stock,
    active: testVoucher.rows[0]?.is_active
  });

  await pool.end();
}

main().catch(console.error);
