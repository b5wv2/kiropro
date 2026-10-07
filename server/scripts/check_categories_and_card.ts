import { pool } from '../src/db.js';

async function check() {
  const cats = await pool.query(`
    SELECT id, name, "arabicName", platform, "isActive", "displayOrder"
    FROM "GameCategory"
    ORDER BY "displayOrder" ASC
  `);
  console.log('ALL GAME CATEGORIES:');
  console.table(cats.rows);

  const prod = await pool.query(`
    SELECT id, "productName", "arabicName", category, "gameCategoryId", "productType", fulfillment_type, "customerPriceUsd", "isActive", "inStock"
    FROM "Product"
    WHERE id = 'b0000000-0000-0000-0000-000000000001'
  `);
  console.log('MASTERCARD PRODUCT ROW:');
  console.log(prod.rows[0]);

  process.exit(0);
}

check().catch(console.error);
