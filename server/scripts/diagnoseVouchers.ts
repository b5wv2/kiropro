import pool from '../src/db';

async function diagnose() {
  console.log('=== Diagnosing Vouchers in Database ===');
  
  // 1. Check g2bulk_voucher_catalog
  const catalogRes = await pool.query(`
    SELECT id, provider_product_id, title, arabic_title, game_key, unit_price, customer_price_usd, is_active, is_in_stock, stock
    FROM g2bulk_voucher_catalog
    ORDER BY game_key ASC, unit_price ASC
  `);
  console.log(`\n[1] g2bulk_voucher_catalog: Found ${catalogRes.rows.length} rows:`);
  console.table(catalogRes.rows);

  // 2. Check GameCategory
  const catRes = await pool.query(`
    SELECT id, name, "arabicName", platform, badge, "isActive", "displayOrder"
    FROM "GameCategory"
    WHERE id IN ('freefire-vouchers', 'pubg-vouchers')
  `);
  console.log(`\n[2] GameCategory entries for vouchers: Found ${catRes.rows.length} rows:`);
  console.table(catRes.rows);

  // 3. Check Product table for G2BULK_VOUCHER
  const prodRes = await pool.query(`
    SELECT id, "productName", "offerName", "arabicName", "customerPriceUsd", "isActive", "inStock", "gameCategoryId", "fulfillment_type"
    FROM "Product"
    WHERE fulfillment_type = 'G2BULK_VOUCHER' OR "gameCategoryId" LIKE '%voucher%'
  `);
  console.log(`\n[3] Product table for vouchers: Found ${prodRes.rows.length} rows:`);
  console.table(prodRes.rows);

  // 4. Test GET /api/products response for vouchers
  // Let's see what resolver in products.ts does for these
  const testQuery = await pool.query(`
    SELECT 
      p.id, p."productName", p."offerName", p."gameCategoryId", p."isActive", p."inStock",
      c.id as cat_id, c.name as cat_name, c.platform as cat_platform
    FROM "Product" p
    LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
    WHERE p.fulfillment_type = 'G2BULK_VOUCHER'
  `);
  console.log(`\n[4] Products joined with GameCategory: Found ${testQuery.rows.length} rows:`);
  console.table(testQuery.rows);

  process.exit(0);
}

diagnose().catch(err => {
  console.error(err);
  process.exit(1);
});
