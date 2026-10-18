import pool from '../src/db';

async function test() {
  const res = await pool.query('SELECT id, "productName", "offerName", "providerOfferId", provider, "gameCategoryId" FROM "Product" WHERE "providerOfferId" = 73');
  console.log('Product with providerOfferId 73:', res.rows);

  const constr = await pool.query(`
    SELECT conname, contype 
    FROM pg_constraint 
    WHERE conrelid = '"Product"'::regclass
  `);
  console.log('Constraints on Product table:', constr.rows);

  await pool.end();
}

test().catch(console.error);
