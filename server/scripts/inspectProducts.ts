import 'dotenv/config';
import pool from '../src/db';

async function main() {
  const cats = await pool.query('SELECT id, name, "arabicName", platform, badge, "isActive", "displayOrder" FROM "GameCategory" ORDER BY "displayOrder" ASC');
  console.log('GameCategories:');
  console.table(cats.rows);

  const likeeProds = await pool.query('SELECT id, "providerOfferId", "productName", "offerName", "customerPriceUsd", "providerCostUsd", "isActive", "inStock", "requiresGameUserId", "requiresGameServerId", "gameCategoryId" FROM "Product" WHERE "productName" ILIKE \'%Likee%\'');
  console.log('Likee in DB:');
  console.table(likeeProds.rows);

  const tgStars = await pool.query('SELECT id, "providerOfferId", "productName", "offerName", "customerPriceUsd", "providerCostUsd", "isActive", "inStock", "requiresGameUserId", "requiresGameServerId", "gameCategoryId" FROM "Product" WHERE "productName" ILIKE \'%Telegram%Stars%\'');
  console.log('Telegram Stars in DB:');
  console.table(tgStars.rows);

  const tgPrem = await pool.query('SELECT id, "providerOfferId", "productName", "offerName", "customerPriceUsd", "providerCostUsd", "isActive", "inStock", "requiresGameUserId", "requiresGameServerId", "gameCategoryId" FROM "Product" WHERE "productName" ILIKE \'%Telegram%Premium%\'');
  console.log('Telegram Premium in DB:');
  console.table(tgPrem.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
