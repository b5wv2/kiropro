import 'dotenv/config';
import pool from '../src/db';

async function main() {
  const res = await pool.query(`
    SELECT 
      "providerOfferId", 
      "productName", 
      "offerName", 
      "supplierCostUsd", 
      "gamesDropCostUsd", 
      "gamesDropAddedPercent", 
      "gamesDropFxRate", 
      "customerPriceUsd" 
    FROM "Product" 
    WHERE "providerOfferId" IN (396, 397, 398, 399, 400) 
    ORDER BY "providerOfferId" ASC
  `);

  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
