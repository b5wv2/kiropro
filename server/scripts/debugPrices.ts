import 'dotenv/config';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { gamesDropClient } from '../src/providers/gamesdrop/client';

async function main() {
  const ids = [396, 397, 398, 399, 400];
  console.log('--- FETCHING FIND-ONE FOR 396, 397, 398, 399, 400 ---');

  for (const id of ids) {
    try {
      const res = await gamesDropClient.request<any>('/api/v1/offers/find-one', {
        method: 'POST',
        body: { offerId: id }
      });

      console.log(`\n================ OFFER ${id} ================`);
      console.log('offerId:', res.offerId);
      console.log('offerGroupId:', res.offerGroupId);
      console.log('productName:', res.productName);
      console.log('offerName:', res.offerName || res.offerGroupName);
      console.log('FINAL price:', res.price, res.currency);
      console.log('priceBreakdown:', JSON.stringify(res.priceBreakdown, null, 2));
      console.log('quoteCheckedAt:', res.quoteCheckedAt);
      console.log('quoteExpiresAt:', res.quoteExpiresAt);
    } catch (err: any) {
      console.error(`Error fetching offer ${id}:`, err.message);
    }
  }

  console.log('\n--- FETCHING FROM /offers/sync (first page) TO COMPARE ROW ---');
  try {
    const syncRes = await gamesDropClient.request<any>('/api/v1/offers/sync', {
      method: 'POST',
      body: {
        category: 'Top Up',
        limit: 1000,
        page: 1
      }
    });

    const syncRows = syncRes.rows || [];
    for (const id of ids) {
      const row = syncRows.find((r: any) => r.offerGroupId === id || r.offerId === id || r.productOfferId === id);
      if (row) {
        console.log(`\n[/offers/sync row for offerId ${id}]:`);
        console.log(JSON.stringify({
          offerGroupId: row.offerGroupId,
          offerId: row.offerId,
          productOfferId: row.productOfferId,
          productName: row.productName,
          offerName: row.offerGroupName || row.offerName,
          price: row.price,
          currency: row.currency,
          priceBreakdown: row.priceBreakdown
        }, null, 2));
      } else {
        console.log(`[/offers/sync row for ${id}]: Not found in page 1`);
      }
    }
  } catch (err: any) {
    console.error('Error in sync test:', err.message);
  }
}

main().catch(console.error);
