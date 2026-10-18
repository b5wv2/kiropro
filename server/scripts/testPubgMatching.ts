import pool from '../src/db';
import { g2BulkClient } from '../src/providers/g2bulk/client';

async function testMatching() {
  const pubgmCat = await g2BulkClient.getCatalogue('pubgm');
  const g2bItems = pubgmCat.catalogues || [];

  const dbRes = await pool.query(`
    SELECT id, "productName", "offerName", "providerOfferId", "customerPriceUsd", "gamesDropCostUsd", "isActive"
    FROM "Product"
    WHERE "gameCategoryId" = 'pubg-mobile' OR "productName" ILIKE '%pubg%'
    ORDER BY "customerPriceUsd" ASC
  `);
  const dbProds = dbRes.rows;

  console.log(`Found ${g2bItems.length} G2Bulk items, ${dbProds.length} DB products.\n`);

  for (const prod of dbProds) {
    const pName = `${prod.productName} ${prod.offerName}`.toLowerCase();
    
    // Find matching G2Bulk item
    const match = g2bItems.find((item: any) => {
      const iName = String(item.name).toLowerCase().trim();
      
      // Exact UC match
      const ucMatch = pName.match(/\b(\d+)\s*uc\b/);
      if (ucMatch && !pName.includes('wow')) {
        const uc = ucMatch[1];
        if (iName === uc) return true;
        if (iName === `${uc} uc (discounted)`) return true;
      }

      // WOW Coins match
      const wowMatch = pName.match(/\b(\d+)\s*wow\b/);
      if (wowMatch) {
        const wow = wowMatch[1];
        if (iName === `${wow} wow coins`) return true;
      }

      // Prime / Prime Plus / Elite Pass
      if (pName.includes('prime plus (1 month)')) return iName.includes('prime plus (1 month)');
      if (pName.includes('prime plus (3 months)')) return iName.includes('prime plus (3 months)');
      if (pName.includes('prime plus (6 months)')) return iName.includes('prime plus (6 months)');
      if (pName.includes('prime plus (12 months)')) return iName.includes('prime plus (12 months)');
      if (pName.includes('prime (1 month)') && !pName.includes('plus')) return iName === 'prime (1 month)';
      if (pName.includes('prime (3 months)') && !pName.includes('plus')) return iName === 'prime (3 months)';
      if (pName.includes('prime (6 months)') && !pName.includes('plus')) return iName === 'prime (6 months)';
      if (pName.includes('prime (12 months)') && !pName.includes('plus')) return iName === 'prime (12 months)';
      if (pName.includes('elite pass plus lv1-100')) return iName.includes('elite pass plus lv1-100');
      if (pName.includes('elite pass lv1-100') && !pName.includes('plus')) return iName.includes('elite pass lv1-100');
      if (pName.includes('elite pass lv1-50')) return iName.includes('elite pass lv1-50');

      return false;
    });

    if (match) {
      console.log(`[MATCH] "${prod.offerName}" (GD Offer: ${prod.providerOfferId}, Cost: $${prod.gamesDropCostUsd}) <=> G2Bulk ID: ${match.id} "${match.name}" (Cost: $${match.amount})`);
    } else {
      console.log(`[NO G2BULK MATCH] "${prod.offerName}" (GD Offer: ${prod.providerOfferId}, Cost: $${prod.gamesDropCostUsd}, Active: ${prod.isActive})`);
    }
  }

  await pool.end();
}

testMatching().catch(console.error);
