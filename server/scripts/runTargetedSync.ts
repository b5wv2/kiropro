import 'dotenv/config';
import { catalogSyncService } from '../src/services/catalogSyncService';
import pool from '../src/db';

async function main() {
  console.log('Running initial targeted sync...');
  const stats = await catalogSyncService.syncTargetedProducts();
  console.log('Sync result stats:', JSON.stringify(stats, null, 2));

  // Verify Likee in DB
  const likeeInDb = await pool.query(
    `SELECT "providerOfferId", "productName", "offerName", "gamesDropCostUsd", "inStock", "requiresGameUserId", "gameCategoryId" 
     FROM "Product" WHERE "gameCategoryId" = 'likee' ORDER BY "gamesDropCostUsd" ASC`
  );
  console.log(`\n--- Likee Offers in DB (${likeeInDb.rows.length}) ---`);
  console.table(likeeInDb.rows);

  // Verify Telegram Stars in DB
  const starsInDb = await pool.query(
    `SELECT "providerOfferId", "productName", "offerName", "gamesDropCostUsd", "inStock", "requiresGameUserId", "gameCategoryId" 
     FROM "Product" WHERE "gameCategoryId" = 'telegram-stars' ORDER BY "gamesDropCostUsd" ASC`
  );
  console.log(`\n--- Telegram Stars Offers in DB (${starsInDb.rows.length}) ---`);
  console.table(starsInDb.rows);

  // Verify Telegram Premium in DB
  const premInDb = await pool.query(
    `SELECT "providerOfferId", "productName", "offerName", "gamesDropCostUsd", "inStock", "requiresGameUserId", "gameCategoryId" 
     FROM "Product" WHERE "gameCategoryId" = 'telegram-premium' ORDER BY "gamesDropCostUsd" ASC`
  );
  console.log(`\n--- Telegram Premium Offers in DB (${premInDb.rows.length}) ---`);
  console.table(premInDb.rows);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
