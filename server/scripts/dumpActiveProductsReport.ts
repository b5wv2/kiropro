import pool from '../src/db';

async function main() {
  const res = await pool.query(`
    SELECT 
      "providerOfferId",
      "productName",
      "offerName",
      "arabicName",
      "subCategory",
      "productType",
      "gamesDropCostUsd",
      "customerPriceUsd",
      "description"
    FROM "Product"
    WHERE "isActive" = true
    ORDER BY "productName", "displayOrder" ASC, "providerOfferId" ASC
  `);

  console.log('--- ACTIVE PRODUCTS REPORT (' + res.rows.length + ') ---');
  res.rows.forEach(r => {
    console.log(JSON.stringify(r));
  });

  const countRes = await pool.query(`
    SELECT "isActive", COUNT(*) as cnt FROM "Product" GROUP BY "isActive"
  `);
  console.log('--- STATUS COUNTS ---');
  console.log(countRes.rows);

  await pool.end();
}

main().catch(console.error);
