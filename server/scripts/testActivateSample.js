const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../dist/db').default;

async function test() {
  // Activate 1 sample package for each of the 3 new products with profitable manual retail price
  await pool.query(`
    UPDATE "Product"
    SET "customerPriceUsd" = 2.10, "isActive" = true
    WHERE "providerOfferId" = 2650
  `);

  await pool.query(`
    UPDATE "Product"
    SET "customerPriceUsd" = 0.95, "isActive" = true
    WHERE "providerOfferId" = 425
  `);

  await pool.query(`
    UPDATE "Product"
    SET "customerPriceUsd" = 14.50, "isActive" = true
    WHERE "providerOfferId" = 459
  `);

  console.log('Sample products activated with manual retail price.');
  await pool.end();
}

test().catch(console.error);
