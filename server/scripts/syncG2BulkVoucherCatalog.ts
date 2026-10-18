import dotenv from 'dotenv';
dotenv.config();

import { g2BulkVoucherService } from '../src/services/g2bulkVoucherService';

async function main() {
  console.log('=====================================================');
  console.log('KIROPRO × G2Bulk Digital Voucher Catalog Sync Script');
  console.log('Target Categories: Free Fire Vouchers & PUBG UC Vouchers');
  console.log('=====================================================');

  const startTime = Date.now();
  // Safe sync strictly from local discovered catalog file (No external calls)
  const result = await g2BulkVoucherService.syncFromLocalCatalogFile();
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

  if (result.success) {
    console.log(`\n✓ Sync completed successfully in ${elapsedSec}s!`);
    console.log('Statistics:');
    console.log(`- Last Sync: ${result.stats.last_sync_at}`);
    console.log(`- Free Fire Categories: ${result.stats.freefire_categories_count}`);
    console.log(`- PUBG UC Categories: ${result.stats.pubg_categories_count}`);
    console.log(`- Total Voucher Products: ${result.stats.products_count}`);
    console.log(`- In-Stock Products: ${result.stats.products_in_stock_count}`);
    console.log(`- Approved for Sale Products: ${result.stats.products_approved_count}`);
    console.log('\nCatalog file generated at: server/data/g2bulk-voucher-catalog.json');
    process.exit(0);
  } else {
    console.error(`\n✕ Sync failed after ${elapsedSec}s:`, result.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
