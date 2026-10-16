import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('=== RUNNING MIGRATION 041 ===');
    const sqlPath = path.join(__dirname, '../migrations/041_multi_tier_virtual_cards.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration 041 executed and committed successfully!');

    // Verify products
    const res = await client.query(`
      SELECT id, "productName", "arabicName", "customerPriceUsd", "defaultPartnerPriceUsd",
             card_network, card_currency, face_value, "isActive", "inStock", "displayOrder"
      FROM "Product"
      WHERE "gameCategoryId" = 'kiropro-card'
      ORDER BY "displayOrder" ASC
    `);
    console.log('\nVerified Virtual Card Products in Database:');
    console.table(res.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration 041 failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
