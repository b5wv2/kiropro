import pool from '../src/db';
import { gamesDropClient } from '../src/providers/gamesdrop/client';
import { g2BulkClient } from '../src/providers/g2bulk/client';

async function main() {
  console.log('=== 1. GAMESDROP ALL PUBG OFFERS ===');
  const res = await gamesDropClient.request<any>('/api/v1/offers/sync', {
    method: 'POST',
    body: { limit: 100, page: 1, category: 'Top Up', search: 'PUBG' }
  });
  console.log('Total GamesDrop PUBG offers count:', res.count);
  (res.rows || []).forEach((r: any) => {
    console.log(`GD Offer: ${r.offerGroupId || r.offerId} | Name: "${r.productName}" - "${r.offerGroupName || r.offerName}" | Price: $${r.price} | InStock: ${r.inStock}`);
  });

  console.log('\n=== 2. G2BULK ALL PUBGM DENOMINATIONS ===');
  const pubgmCat = await g2BulkClient.getCatalogue('pubgm');
  (pubgmCat.catalogues || []).forEach((c: any) => {
    console.log(`G2Bulk pubgm: ${c.id} | "${c.name}" | $${c.amount}`);
  });

  await pool.end();
}

main().catch(console.error);
