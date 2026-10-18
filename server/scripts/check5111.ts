import pool from '../src/db';

async function test() {
  const res = await pool.query('SELECT id, "productName", "providerOfferId" FROM "Product" WHERE "providerOfferId" = 5111');
  console.log('Product with providerOfferId 5111:', res.rows);
  await pool.end();
}

test().catch(console.error);
