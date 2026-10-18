import pool from '../src/db';

async function test() {
  const res = await pool.query(`
    SELECT id, "productName", "offerName", "providerOfferId", "fulfillment_type", provider 
    FROM "Product" 
    WHERE "fulfillment_type" = 'G2BULK_VOUCHER' OR "productType" = 'VOUCHER'
    LIMIT 10
  `);
  console.log('Voucher products in Product table:', res.rows);
  await pool.end();
}

test().catch(console.error);
