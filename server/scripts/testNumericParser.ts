import pool from '../src/db';
import { types } from 'pg';

async function main() {
  console.log('Testing numeric parsing...');
  
  // Test query before parser change
  const beforeRes = await pool.query('SELECT 1234.5678::numeric as val');
  console.log('Before custom parser type of val:', typeof beforeRes.rows[0].val, beforeRes.rows[0].val);

  // Set parser for numeric OID 1700
  types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));

  // Test query after parser change
  const afterRes = await pool.query('SELECT 1234.5678::numeric as val');
  console.log('After custom parser type of val:', typeof afterRes.rows[0].val, afterRes.rows[0].val);

  await pool.end();
}

main().catch(console.error);
