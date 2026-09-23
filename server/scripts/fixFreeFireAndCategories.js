const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../dist/db').default;

async function run() {
  console.log('=== Starting Database Category & Free Fire Isolation Fix ===');

  // 1. Assign correct gameCategoryId to all Telegram products
  const fixTgPrem = await pool.query(`
    UPDATE "Product"
    SET "gameCategoryId" = 'telegram-premium',
        "updatedAt" = NOW()
    WHERE (LOWER("productName") LIKE '%telegram%premium%' OR LOWER("offerName") LIKE '%telegram%premium%' OR LOWER("offerName") LIKE '%telegram premium%')
      AND ("gameCategoryId" IS DISTINCT FROM 'telegram-premium')
  `);
  console.log(`Updated ${fixTgPrem.rowCount} Telegram Premium products to gameCategoryId='telegram-premium'`);

  const fixTgStars = await pool.query(`
    UPDATE "Product"
    SET "gameCategoryId" = 'telegram-stars',
        "updatedAt" = NOW()
    WHERE (
      LOWER("productName") LIKE '%telegram%stars%' OR 
      LOWER("offerName") LIKE '%telegram%stars%' OR 
      LOWER("offerName") LIKE '%telegram%star%' OR
      LOWER("productName") LIKE '%stars%' OR
      (LOWER("productName") LIKE '%telegram%' AND LOWER("offerName") NOT LIKE '%premium%')
    )
    AND ("gameCategoryId" IS DISTINCT FROM 'telegram-stars')
    AND "gameCategoryId" != 'telegram-premium'
  `);
  console.log(`Updated ${fixTgStars.rowCount} Telegram Stars products to gameCategoryId='telegram-stars'`);

  // 2. Assign Likee products
  const fixLikee = await pool.query(`
    UPDATE "Product"
    SET "gameCategoryId" = 'likee',
        "updatedAt" = NOW()
    WHERE (LOWER("productName") LIKE '%likee%' OR LOWER("offerName") LIKE '%likee%')
      AND ("gameCategoryId" IS DISTINCT FROM 'likee')
  `);
  console.log(`Updated ${fixLikee.rowCount} Likee products to gameCategoryId='likee'`);

  // 3. Deactivate duplicate Telegram products (3822-3835) because 425-440 & 459-461 are the primary curated ones
  const deactDuplicates = await pool.query(`
    UPDATE "Product"
    SET "isActive" = false,
        "updatedAt" = NOW()
    WHERE "providerOfferId" IN (3822, 3823, 3824, 3825, 3826, 3827, 3828, 3829, 3830, 3831, 3832, 3833, 3834, 3835)
  `);
  console.log(`Deactivated ${deactDuplicates.rowCount} duplicate Telegram products (3822-3835)`);

  // 4. Update 75887 (1000 Stars) and 75888 (750 Stars) to telegram-stars with category image
  const updateExtraTg = await pool.query(`
    UPDATE "Product"
    SET "gameCategoryId" = 'telegram-stars',
        "imageUrl" = COALESCE("imageUrl", '/uploads/products/prod_1790076568074_2b5df6d4.jpg'),
        "updatedAt" = NOW()
    WHERE "providerOfferId" IN (75887, 75888)
  `);
  console.log(`Updated ${updateExtraTg.rowCount} extra Telegram Stars packages (75887, 75888)`);

  // 5. Deactivate orphaned Wild Rift product (75915)
  const deactWildRift = await pool.query(`
    UPDATE "Product"
    SET "isActive" = false,
        "updatedAt" = NOW()
    WHERE "providerOfferId" = 75915
  `);
  console.log(`Deactivated Wild Rift orphan (75915): ${deactWildRift.rowCount}`);

  // 6. Ensure NO non-freefire product has gameCategoryId = 'freefire-me'
  const removeContamination = await pool.query(`
    UPDATE "Product"
    SET "gameCategoryId" = NULL,
        "updatedAt" = NOW()
    WHERE "gameCategoryId" = 'freefire-me'
      AND LOWER("productName") NOT LIKE '%freefire%'
      AND LOWER("productName") NOT LIKE '%free fire%'
      AND LOWER("offerName") NOT LIKE '%freefire%'
      AND LOWER("offerName") NOT LIKE '%free fire%'
  `);
  console.log(`Cleaned contaminated products from freefire-me: ${removeContamination.rowCount}`);

  // 7. Verify counts
  const ffCount = await pool.query(`
    SELECT COUNT(*) as count FROM "Product"
    WHERE "gameCategoryId" = 'freefire-me' AND "isActive" = true
  `);
  console.log(`Active Free Fire packages in DB: ${ffCount.rows[0].count}`);

  const activeNullCat = await pool.query(`
    SELECT COUNT(*) as count FROM "Product"
    WHERE "gameCategoryId" IS NULL AND "isActive" = true
  `);
  console.log(`Active products with NULL gameCategoryId: ${activeNullCat.rows[0].count}`);

  const activeTgStars = await pool.query(`
    SELECT COUNT(*) as count FROM "Product"
    WHERE "gameCategoryId" = 'telegram-stars' AND "isActive" = true
  `);
  console.log(`Active Telegram Stars packages: ${activeTgStars.rows[0].count}`);

  const activeTgPrem = await pool.query(`
    SELECT COUNT(*) as count FROM "Product"
    WHERE "gameCategoryId" = 'telegram-premium' AND "isActive" = true
  `);
  console.log(`Active Telegram Premium packages: ${activeTgPrem.rows[0].count}`);

  await pool.end();
  console.log('=== Database Category Fix Completed Successfully ===');
}

run().catch(console.error);
