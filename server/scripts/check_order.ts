import { pool } from '../src/db.js';

async function checkOrder() {
  const ord = await pool.query('SELECT * FROM "Order" WHERE id = $1', ['f62599d4-c3f9-43d8-a83f-adb892742c56']);
  console.log('ORDER in "Order":', ord.rows);

  const pord = await pool.query('SELECT * FROM partner_orders WHERE id = $1', ['f62599d4-c3f9-43d8-a83f-adb892742c56']);
  console.log('ORDER in partner_orders:', pord.rows);

  process.exit(0);
}

checkOrder().catch(console.error);
