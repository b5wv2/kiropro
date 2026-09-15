import 'dotenv/config';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { gamesDropClient } from '../src/providers/gamesdrop/client';

async function main() {
  console.log('Fetching offers with search: "Blood Strike"...');
  const res = await gamesDropClient.request<any>('/api/v1/offers/sync', {
    method: 'POST',
    body: {
      search: 'Blood Strike',
      limit: 100
    }
  });

  const rows: any[] = res?.rows || [];
  console.log(`Total rows returned: ${rows.length}\n`);

  const groups: Record<string, any[]> = {};

  for (const r of rows) {
    const pName = r.productName || 'Unknown Product';
    if (!groups[pName]) groups[pName] = [];
    groups[pName].push(r);
  }

  for (const [prod, items] of Object.entries(groups)) {
    console.log(`\n======================================================`);
    console.log(`PRODUCT: "${prod}" (${items.length} offers)`);
    console.log(`======================================================`);
    for (const item of items) {
      console.log(`- OfferID: ${item.offerId || item.offerGroupId} | Name: "${item.offerGroupName || item.offerName}" | Region: "${item.regionName || ''}" (${item.regionCode || ''}) | Price: $${item.price} | ProviderPrice: $${item.priceBreakdown?.providerPrice} | providerProductId: "${item.providerProductId}" | requiredGameUserId: ${item.isRequiredGameUserId} | countryCompatibility: ${item.countryCompatibility}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
