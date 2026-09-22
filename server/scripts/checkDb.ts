import 'dotenv/config';
import pool from '../src/db';

async function main() {
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('Tables:', tables.rows.map(r => r.table_name));
  
  const cols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='Product' ORDER BY ordinal_position");
  console.log('Product columns:');
  console.table(cols.rows);

  const catCols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='GameCategory' ORDER BY ordinal_position");
  console.log('GameCategory columns:');
  console.table(catCols.rows);

  const cats = await pool.query('SELECT * FROM "GameCategory"');
  console.log('Existing GameCategories:');
  console.table(cats.rows);

  const prodCount = await pool.query('SELECT count(*), count(*) FILTER (WHERE "isActive" = true) as active FROM "Product"');
  console.log('Product counts:', prodCount.rows[0]);

  const distinctProds = await pool.query('SELECT DISTINCT "productName", count(*) FROM "Product" GROUP BY "productName"');
  console.log('Distinct Product Names:');
  console.table(distinctProds.rows);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
