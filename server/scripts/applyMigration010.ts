import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/010_blood_strike_categories.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Applying Migration 010...');
  await pool.query(sql);

  // Verification
  const globalCountRes = await pool.query(
    `SELECT COUNT(*)::int as count FROM "Product" WHERE "gameCategoryId" = 'blood-strike-global'`
  );
  const meCountRes = await pool.query(
    `SELECT COUNT(*)::int as count FROM "Product" WHERE "gameCategoryId" = 'blood-strike-me'`
  );
  const inactiveCheck = await pool.query(
    `SELECT COUNT(*)::int as count FROM "Product" WHERE "gameCategoryId" IN ('blood-strike-global', 'blood-strike-me') AND "isActive" = false`
  );
  const catRes = await pool.query(
    `SELECT id, name, "arabicName", "displayOrder", "isActive" FROM "GameCategory" WHERE id LIKE 'blood-strike%'`
  );

  console.log('Categories created/updated:');
  console.log(catRes.rows);
  console.log(`Blood Strike Global products linked: ${globalCountRes.rows[0].count}`);
  console.log(`Blood Strike Middle East products linked: ${meCountRes.rows[0].count}`);
  console.log(`Total inactive Blood Strike products (isActive = false): ${inactiveCheck.rows[0].count}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
