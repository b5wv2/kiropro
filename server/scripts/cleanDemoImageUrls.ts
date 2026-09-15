import pool from '../src/db';

async function main() {
  console.log('Cleaning dummy Unsplash URLs from Product table...');
  const res = await pool.query(`
    UPDATE "Product"
    SET "imageUrl" = NULL
    WHERE "imageUrl" LIKE '%unsplash.com%'
  `);
  console.log(`Updated ${res.rowCount} products: set imageUrl = NULL to inherit Category Image.`);

  // Verify
  const check = await pool.query(`
    SELECT count(*) FROM "Product" WHERE "imageUrl" IS NOT NULL
  `);
  console.log(`Products with specific custom imageUrl remaining: ${check.rows[0].count}`);

  await pool.end();
}

main().catch(console.error);
