import pool from '../src/db';
import { g2BulkVoucherService } from '../src/services/g2bulkVoucherService';

async function activateVouchers() {
  console.log('Activating standard voucher products in g2bulk_voucher_catalog...');

  await pool.query(`
    UPDATE g2bulk_voucher_catalog
    SET is_active = true,
        updated_at = NOW()
    WHERE customer_price_usd IS NOT NULL AND customer_price_usd > 0
  `);

  console.log('Syncing into Product table...');
  const syncRes = await g2BulkVoucherService.syncFromLocalCatalogFile();
  console.log('Sync result:', syncRes);

  const check = await pool.query(`
    SELECT "productName", "customerPriceUsd", "isActive", "inStock", "gameCategoryId"
    FROM "Product"
    WHERE fulfillment_type = 'G2BULK_VOUCHER'
    ORDER BY "gameCategoryId", "customerPriceUsd"
  `);
  console.table(check.rows);

  await pool.end();
}

activateVouchers().catch(err => {
  console.error(err);
  process.exit(1);
});
