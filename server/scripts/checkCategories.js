const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../dist/db').default;

async function check() {
  const tg = await pool.query(`
    SELECT id, "providerOfferId", "productName", "offerName", "gameCategoryId", "customerPriceUsd", "providerCostUsd", "inStock", "isActive"
    FROM "Product"
    WHERE LOWER("productName") LIKE '%telegram%' OR LOWER("offerName") LIKE '%telegram%' OR LOWER("productName") LIKE '%stars%' OR LOWER("offerName") LIKE '%stars%'
    ORDER BY "offerName" ASC
  `);
  console.log(`TOTAL TELEGRAM PRODUCTS: ${tg.rows.length}`);
  console.table(tg.rows);

  await pool.end();
}

check().catch(console.error);
