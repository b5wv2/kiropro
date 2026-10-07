import pool from '../src/db.js';

async function main() {
  const res = await pool.query(`
    SELECT id, "productName", "arabicName", "gameCategoryId", category, "subCategory", "productType", fulfillment_type, "isActive"
    FROM "Product"
    WHERE id = 'b0000000-0000-0000-0000-000000000001'
  `);
  console.log('PRODUCT RECORD:', res.rows);

  const catRes = await pool.query(`
    SELECT * FROM "GameCategory" WHERE id = 'kiropro-card'
  `);
  console.log('GAME CATEGORY kiropro-card:', catRes.rows);

  const allCats = await pool.query(`SELECT id, name, "arabicName" FROM "GameCategory"`);
  console.log('ALL GAME CATEGORIES:', allCats.rows);

  process.exit(0);
}

main().catch(console.error);
