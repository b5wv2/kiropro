import 'dotenv/config';
import pool from '../src/db';

async function main() {
  const cats = await pool.query('SELECT id, name, "arabicName", "displayOrder", "isActive", "imageUrl" FROM "GameCategory" ORDER BY "displayOrder" ASC');
  console.log('Categories in DB:');
  console.log(JSON.stringify(cats.rows, null, 2));
  process.exit(0);
}

main().catch(console.error);
