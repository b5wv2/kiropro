const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../dist/db').default;

async function check() {
  const cats = await pool.query('SELECT id, name, "arabicName", "imageUrl" FROM "GameCategory" ORDER BY "displayOrder" ASC');
  console.log("CATEGORIES:", cats.rows);
  
  const imgProds = await pool.query(`
    SELECT "gameCategoryId", "productName", "offerName", "imageUrl"
    FROM "Product"
    WHERE "imageUrl" IS NOT NULL AND "imageUrl" != ''
    LIMIT 20
  `);
  console.log("PRODUCTS WITH IMAGE:", imgProds.rows);
  await pool.end();
}

check().catch(console.error);
