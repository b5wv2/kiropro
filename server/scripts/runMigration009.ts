import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function main() {
  const sqlPath = path.join(__dirname, '../migrations/009_game_categories.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running Migration 009...');
  await pool.query(sql);
  console.log('Migration 009 completed successfully.');

  const res = await pool.query('SELECT * FROM "GameCategory"');
  console.log('Game Categories:', res.rows);

  const prodCheck = await pool.query(`
    SELECT "gameCategoryId", count(*) 
    FROM "Product" 
    WHERE "isActive" = true 
    GROUP BY "gameCategoryId"
  `);
  console.log('Active products per category:', prodCheck.rows);

  await pool.end();
}

main().catch(err => {
  console.error('Migration 009 failed:', err);
  process.exit(1);
});
