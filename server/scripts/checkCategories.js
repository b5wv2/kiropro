const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../dist/db').default;

async function check() {
  const cats = await pool.query('SELECT * FROM "GameCategory" ORDER BY "displayOrder" ASC');
  console.log("CATEGORIES:", cats.rows);
  
  const sampleProds = await pool.query(`
    SELECT "gameCategoryId", "providerOfferId", "offerName", "providerCostUsd", "customerPriceUsd", "isActive"
    FROM "Product"
    WHERE "gameCategoryId" IN ('likee', 'telegram-stars', 'telegram-premium')
    ORDER BY "gameCategoryId", "providerCostUsd" ASC
  `);
  console.log("SAMPLE PRODUCTS:", sampleProds.rows);
  await pool.end();
}

check().catch(console.error);
