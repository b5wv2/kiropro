import { pool } from '../src/db.js';

async function checkOrder() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Order' 
    ORDER BY column_name
  `);
  console.table(res.rows);
  process.exit(0);
}

checkOrder().catch(console.error);
