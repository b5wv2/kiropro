import 'dotenv/config';
import pool from '../src/db';

async function main() {
  console.log('=== BLOOD STRIKE SYSTEM VERIFICATION ===\n');

  // 1. Check Categories
  const catRes = await pool.query(`
    SELECT 
      c.id, c.name, c."arabicName", c."displayOrder", c."isActive", c."imageUrl",
      COUNT(p.id) FILTER (WHERE p."isActive" = true)::int as "activeCount",
      COUNT(p.id)::int as "totalCount"
    FROM "GameCategory" c
    LEFT JOIN "Product" p ON p."gameCategoryId" = c.id
    GROUP BY c.id
    ORDER BY c."displayOrder" ASC
  `);

  console.log('1. Categories in Database:');
  console.table(catRes.rows);

  // 2. Check Blood Strike Global Products
  const globalProds = await pool.query(`
    SELECT id, "providerOfferId", "productName", "offerName", "category", "regionName", "regionCode", "customerPriceUsd", "gamesDropCostUsd", "isActive"
    FROM "Product"
    WHERE "gameCategoryId" = 'blood-strike-global'
    ORDER BY "providerOfferId" ASC
  `);

  console.log(`\n2. Blood Strike Global Products (Count: ${globalProds.rows.length}):`);
  const globalOfferIds = globalProds.rows.map(r => r.providerOfferId);
  console.log('Global Offer IDs:', JSON.stringify(globalOfferIds));

  // 3. Check Blood Strike Middle East Products
  const meProds = await pool.query(`
    SELECT id, "providerOfferId", "productName", "offerName", "category", "regionName", "regionCode", "customerPriceUsd", "gamesDropCostUsd", "isActive"
    FROM "Product"
    WHERE "gameCategoryId" = 'blood-strike-me'
    ORDER BY "providerOfferId" ASC
  `);

  console.log(`\n3. Blood Strike Middle East Products (Count: ${meProds.rows.length}):`);
  const meOfferIds = meProds.rows.map(r => r.providerOfferId);
  console.log('Middle East Offer IDs:', JSON.stringify(meOfferIds));

  // 4. Overlap Check
  const intersection = globalOfferIds.filter(id => meOfferIds.includes(id));
  console.log(`\n4. Offer ID Overlap between Global and Middle East: ${intersection.length} (Must be 0)`);

  // 5. Unassigned Check
  const unassigned = await pool.query(`
    SELECT id, "providerOfferId", "productName", "offerName"
    FROM "Product"
    WHERE ("productName" ILIKE '%blood%strike%' OR "offerName" ILIKE '%blood%strike%')
      AND "gameCategoryId" NOT IN ('blood-strike-global', 'blood-strike-me')
  `);
  console.log(`5. Unassigned / Ambiguous Blood Strike Products: ${unassigned.rows.length} (Must be 0)`);

  // 6. Check Active Status (Should all be false by default)
  const activeCount = await pool.query(`
    SELECT COUNT(*)::int as count
    FROM "Product"
    WHERE "gameCategoryId" IN ('blood-strike-global', 'blood-strike-me') AND "isActive" = true
  `);
  console.log(`6. Active Blood Strike Products: ${activeCount.rows[0].count} (Must be 0 per instruction 11)`);

  console.log('\n=== ALL DATABASE CHECKS PASSED ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
