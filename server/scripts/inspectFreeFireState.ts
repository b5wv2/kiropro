import pool from '../src/db';
import { g2BulkClient } from '../src/providers/g2bulk/client';
import { gamesDropProvider } from '../src/providers/gamesdrop';

async function run() {
  console.log('--- 1. Querying DB for Free Fire products ---');
  const dbRes = await pool.query(`
    SELECT p.id, p."productName", p."arabicName", p."offerName", p."providerOfferId", p."provider",
           p."gamesDropCostUsd", p."providerCostUsd", p."customerPriceUsd", p."gameCategoryId", p."isActive",
           p."primaryProvider", p."fallbackProvider", p."fallbackEnabled"
    FROM "Product" p
    WHERE LOWER(p."productName") LIKE '%free%' OR LOWER(p."productName") LIKE '%fire%'
       OR LOWER(p."gameCategoryId") LIKE '%free%' OR LOWER(p."offerName") LIKE '%free%'
    ORDER BY p."customerPriceUsd" ASC
  `);
  console.log(`Found ${dbRes.rows.length} Free Fire products in DB:`);
  for (const row of dbRes.rows) {
    console.log(`- [${row.id}] ${row.productName} (${row.offerName}) | GD Offer: ${row.providerOfferId} | Cost: $${row.gamesDropCostUsd || row.providerCostUsd} | Price: $${row.customerPriceUsd} | Active: ${row.isActive} | Primary: ${row.primaryProvider} | Fallback: ${row.fallbackProvider} (Enabled: ${row.fallbackEnabled})`);
  }

  console.log('\n--- 2. Checking product_provider_mappings for Free Fire ---');
  const ppmRes = await pool.query(`
    SELECT ppm.id, ppm."productId", ppm.provider, ppm."providerProductId", ppm."providerCostUsd", ppm."isActive", ppm."isPrimary", ppm."isFallback", ppm."providerMetadata"
    FROM product_provider_mappings ppm
    JOIN "Product" p ON ppm."productId" = p.id
    WHERE LOWER(p."productName") LIKE '%free%' OR LOWER(p."productName") LIKE '%fire%'
       OR LOWER(p."gameCategoryId") LIKE '%free%'
  `);
  console.log(`Found ${ppmRes.rows.length} mappings:`);
  for (const m of ppmRes.rows) {
    console.log(`- Product: ${m.productId} | Provider: ${m.provider} | ProviderProdId: ${m.providerProductId} | Cost: $${m.providerCostUsd} | Primary: ${m.isPrimary} | Fallback: ${m.isFallback}`);
  }

  console.log('\n--- 3. Querying G2Bulk GET /v1/games to discover Free Fire real game code ---');
  try {
    const gamesRes = await g2BulkClient.getGames();
    console.log(`G2Bulk games count: ${gamesRes.games?.length || 0}`);
    const ffMatches = (gamesRes.games || []).filter(g => 
      g.name.toLowerCase().includes('free') || 
      g.code.toLowerCase().includes('free') ||
      g.code.toLowerCase().includes('ff')
    );
    console.log('Free Fire matches in G2Bulk /v1/games:', JSON.stringify(ffMatches, null, 2));

    for (const match of ffMatches) {
      console.log(`\nFetching fields for ${match.code}...`);
      try {
        const fields = await g2BulkClient.getGameFields(match.code);
        console.log(`Fields for ${match.code}:`, JSON.stringify(fields, null, 2));
      } catch (fErr: any) {
        console.log(`Error fetching fields for ${match.code}:`, fErr.message);
      }

      console.log(`\nFetching catalogue for ${match.code}...`);
      try {
        const cat = await g2BulkClient.getCatalogue(match.code);
        console.log(`Catalogue for ${match.code} (count: ${cat.catalogues?.length || 0}):`, JSON.stringify(cat.catalogues, null, 2));
      } catch (cErr: any) {
        console.log(`Error fetching catalogue for ${match.code}:`, cErr.message);
      }
    }
  } catch (gErr: any) {
    console.error('Failed to fetch G2Bulk games:', gErr);
  }

  console.log('\n--- 4. Checking GamesDrop connection & token status ---');
  try {
    const bal = await gamesDropProvider.getBalance();
    console.log('GamesDrop Balance:', bal);
  } catch (gdErr: any) {
    console.log('GamesDrop Balance error:', gdErr.code || gdErr.message, gdErr.status);
  }

  await pool.end();
}

run().catch(console.error);
