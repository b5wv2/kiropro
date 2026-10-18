import { pool } from '../src/db.js';

async function checkSchema() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Product'
    ORDER BY column_name
  `);
  console.table(res.rows);
  await pool.end();
}

checkSchema();
