import pool from '../src/db';

async function test() {
  const res = await pool.query(`
    SELECT column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Product' AND column_name = 'providerOfferId'
  `);
  console.log('providerOfferId col info:', res.rows[0]);
  await pool.end();
}

test().catch(console.error);
