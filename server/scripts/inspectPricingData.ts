import { pool } from '../src/db';

async function main() {
  try {
    const totalActive = await pool.query(`
      SELECT 
        COUNT(*) as total_active,
        COUNT(CASE WHEN "supplierCostUsd" > 0 THEN 1 END) as with_supplier_cost,
        COUNT(CASE WHEN "gamesDropCostUsd" > 0 THEN 1 END) as with_gamesdrop_cost,
        COUNT(CASE WHEN ("supplierCostUsd" > 0 OR "gamesDropCostUsd" > 0) THEN 1 END) as with_any_cost,
        COUNT(CASE WHEN ("supplierCostUsd" IS NULL OR "supplierCostUsd" = 0) AND ("gamesDropCostUsd" IS NULL OR "gamesDropCostUsd" = 0) THEN 1 END) as zero_cost_count
      FROM "Product"
      WHERE "isActive" = true
    `);
    console.log('Total Active Product Stats:');
    console.log(totalActive.rows[0]);

    const zeroCost = await pool.query(`
      SELECT id, "productName", "offerName", "customerPriceUsd", "supplierCostUsd", "gamesDropCostUsd", "defaultPartnerPriceUsd", "primaryProvider", fulfillment_type, "productType"
      FROM "Product"
      WHERE ("supplierCostUsd" IS NULL OR "supplierCostUsd" = 0) 
        AND ("gamesDropCostUsd" IS NULL OR "gamesDropCostUsd" = 0)
        AND "isActive" = true
    `);
    console.log(`\nFound ${zeroCost.rows.length} active products with ZERO/NULL cost:`);
    console.table(zeroCost.rows);

    const g2bulkProducts = await pool.query(`
      SELECT id, "productName", "offerName", "customerPriceUsd", "supplierCostUsd", "gamesDropCostUsd", "defaultPartnerPriceUsd", "primaryProvider", fulfillment_type, "productType", "providerOfferId"
      FROM "Product"
      WHERE "primaryProvider" = 'G2BULK' OR fulfillment_type = 'G2BULK_VOUCHER'
      LIMIT 10
    `);
    console.log(`\nG2BULK products sample:`);
    console.table(g2bulkProducts.rows);

    const cardProducts = await pool.query(`
      SELECT id, "productName", "offerName", "customerPriceUsd", "supplierCostUsd", "gamesDropCostUsd", "defaultPartnerPriceUsd", "primaryProvider", fulfillment_type, "productType"
      FROM "Product"
      WHERE fulfillment_type = 'KIROPRO_CARD' OR "productType" = 'VIRTUAL_CARD'
    `);
    console.log(`\nCard Products:`);
    console.table(cardProducts.rows);

    const defaultPartnerPriceStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN "defaultPartnerPriceUsd" = 0.03 THEN 1 END) as count_is_0_03,
        COUNT(CASE WHEN "defaultPartnerPriceUsd" = "customerPriceUsd" THEN 1 END) as count_equals_customer_price,
        COUNT(CASE WHEN "defaultPartnerPriceUsd" IS NULL THEN 1 END) as count_is_null
      FROM "Product"
      WHERE "isActive" = true
    `);
    console.log('\ndefaultPartnerPriceUsd distribution:');
    console.log(defaultPartnerPriceStats.rows[0]);

    process.exit(0);
  } catch (err) {
    console.error('Inspection error:', err);
    process.exit(1);
  }
}

main();
