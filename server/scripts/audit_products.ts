import { pool } from '../src/db.js';

async function main() {
  const typesRes = await pool.query(`
    SELECT DISTINCT "productType", category, "requiresGameUserId", "requiresGameServerId"
    FROM "Product"
  `);
  console.log('--- PRODUCT TYPES & REQUIREMENTS IN DB ---');
  console.log(typesRes.rows);

  const sampleProducts = await pool.query(`
    SELECT id, "productName", "arabicName", "productType", category, "requiresGameUserId", "requiresGameServerId", "inStock", "customerPriceUsd", "defaultPartnerPriceUsd"
    FROM "Product"
    WHERE "isActive" = true
    LIMIT 20
  `);
  console.log('--- SAMPLE PRODUCTS ---');
  console.log(sampleProducts.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
