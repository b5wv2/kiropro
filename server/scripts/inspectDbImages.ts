import pool from '../src/db';

async function main() {
  const cats = await pool.query('SELECT id, name, "imageUrl" FROM "GameCategory"');
  console.log('Categories:', cats.rows);

  const uploadsProds = await pool.query('SELECT id, "productName", "offerName", "imageUrl" FROM "Product" WHERE "imageUrl" LIKE \'%/uploads/%\'');
  console.log('Products with /uploads/:', uploadsProds.rows);

  const unsplashProds = await pool.query('SELECT count(*) FROM "Product" WHERE "imageUrl" LIKE \'%unsplash%\'');
  console.log('Products with unsplash count:', unsplashProds.rows[0].count);

  await pool.end();
}

main().catch(console.error);
