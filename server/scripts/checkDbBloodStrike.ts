import 'dotenv/config';
import pool from '../src/db';

async function main() {
  const res = await pool.query(`
    SELECT 
      id, "providerOfferId", "productName", "offerName", "category",
      "customerPriceUsd", "supplierCostUsd", "gamesDropCostUsd",
      "inStock", "isActive", "gameCategoryId"
    FROM "Product"
    WHERE "productName" IN ('Blood Strike', 'Blood Strike MENA')
    ORDER BY "productName" ASC, "providerOfferId" ASC
  `);

  console.log(`Found ${res.rows.length} Blood Strike products in DB:`);
  
  const globalItems = res.rows.filter(r => r.productName === 'Blood Strike');
  const menaItems = res.rows.filter(r => r.productName === 'Blood Strike MENA');

  console.log(`\n--- Global ("Blood Strike"): ${globalItems.length} products ---`);
  globalItems.forEach(g => {
    console.log(`ID: ${g.id} | providerOfferId: ${g.providerOfferId} | Name: "${g.offerName}" | Active: ${g.isActive} | CustomerPrice: ${g.customerPriceUsd} | Cost: ${g.gamesDropCostUsd}`);
  });

  console.log(`\n--- MENA ("Blood Strike MENA"): ${menaItems.length} products ---`);
  menaItems.forEach(m => {
    console.log(`ID: ${m.id} | providerOfferId: ${m.providerOfferId} | Name: "${m.offerName}" | Active: ${m.isActive} | CustomerPrice: ${m.customerPriceUsd} | Cost: ${m.gamesDropCostUsd}`);
  });

  process.exit(0);
}

main().catch(console.error);
