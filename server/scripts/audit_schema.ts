import { pool } from '../src/db.js';

async function main() {
  const productCols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'Product'
    ORDER BY ordinal_position
  `);
  console.log('--- PRODUCT COLUMNS ---');
  console.log(productCols.rows);

  const paymentMethodsCols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'payment_methods'
    ORDER BY ordinal_position
  `);
  console.log('--- PAYMENT_METHODS COLUMNS ---');
  console.log(paymentMethodsCols.rows);

  const paymentMethods = await pool.query(`SELECT * FROM payment_methods`);
  console.log('--- PAYMENT_METHODS DATA ---');
  console.log(paymentMethods.rows);

  const partnerOrdersCols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'partner_orders'
    ORDER BY ordinal_position
  `);
  console.log('--- PARTNER_ORDERS COLUMNS ---');
  console.log(partnerOrdersCols.rows);

  const assignCols = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'digital_account_assignments'
  `);
  console.log('--- ASSIGNMENT COLS ---', assignCols.rows.map(r => r.column_name));

  const cardProds = await pool.query(`
    SELECT id, "productName", "arabicName", "productType", fulfillment_type, "customerPriceUsd"
    FROM "Product"
    WHERE "productType" = 'VIRTUAL_CARD' OR "productName" ILIKE '%Card%' OR "arabicName" ILIKE '%بطاقة%'
  `);
  console.log('--- CARD PRODUCTS ---', cardProds.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
