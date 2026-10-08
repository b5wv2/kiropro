import { pool } from '../src/db.js';

async function checkSchema() {
  const res = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'Product'
  `);
  const cols = res.rows.map(r => r.column_name);
  console.log('Total Product columns:', cols.length);
  console.log('Has primaryProvider:', cols.includes('primaryProvider'));
  console.log('Has fallbackProvider:', cols.includes('fallbackProvider'));
  console.log('Has fallbackEnabled:', cols.includes('fallbackEnabled'));
  await pool.end();
}

checkSchema();
