import { syncFreeFireTopupCatalog } from '../src/services/freeFireSyncService';
import pool from '../src/db';

async function run() {
  console.log('--- Running Free Fire Top-Up Catalog Sync ---');
  const result = await syncFreeFireTopupCatalog();
  console.log('Sync Result Summary:', {
    success: result.success,
    gameCodes: result.gameCodes,
    denominationsSynced: result.denominationsSynced,
    productsMapped: result.productsMapped
  });

  // Verify DB state for Free Fire mappings
  const verifyRes = await pool.query(`
    SELECT p.id, p."productName", p."offerName", p."customerPriceUsd", p."primaryProvider", p."fallbackProvider", p."fallbackEnabled",
           ppm.provider, ppm."providerProductId", ppm."providerCostUsd", ppm."isPrimary", ppm."isFallback",
           ppm."providerMetadata"->>'gameCode' as "g2bGameCode"
    FROM "Product" p
    JOIN product_provider_mappings ppm ON ppm."productId" = p.id
    WHERE p."isActive" = true AND (
      LOWER(p."productName") LIKE '%free%' OR LOWER(p."productName") LIKE '%fire%'
    )
    ORDER BY p."customerPriceUsd" ASC, ppm."isPrimary" DESC
  `);

  console.log('\n--- Active Free Fire Mappings in DB ---');
  for (const r of verifyRes.rows) {
    console.log(`[${r.primaryProvider} -> ${r.fallbackProvider} (Fallback: ${r.fallbackEnabled})] ${r.productName} (${r.offerName}) | Retail: $${r.customerPriceUsd} | Mapped Provider: ${r.provider} (ID: ${r.providerProductId}, Cost: $${r.providerCostUsd}, Primary: ${r.isPrimary}, Fallback: ${r.isFallback}, GameCode: ${r.g2bGameCode})`);
  }

  await pool.end();
}

run().catch(console.error);
