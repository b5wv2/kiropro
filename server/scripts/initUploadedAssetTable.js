const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../dist/db').default;

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

async function main() {
  console.log('--- Initializing UploadedAsset Table for Permanent Image Storage ---');

  // 1. Create UploadedAsset table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "UploadedAsset" (
      "id" VARCHAR(255) PRIMARY KEY,
      "filename" VARCHAR(255) UNIQUE NOT NULL,
      "mimeType" VARCHAR(100) NOT NULL,
      "dataBase64" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_uploaded_asset_filename" ON "UploadedAsset" ("filename");
  `);
  console.log('✓ UploadedAsset table created or verified.');

  // 2. Backup all existing files in server/uploads/products into UploadedAsset
  const uploadsDir = path.resolve(__dirname, '../uploads/products');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    console.log(`Found ${files.length} files in server/uploads/products. Persisting into database...`);

    for (const filename of files) {
      const filePath = path.join(uploadsDir, filename);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      const ext = path.extname(filename).toLowerCase();
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString('base64');

      await pool.query(`
        INSERT INTO "UploadedAsset" ("id", "filename", "mimeType", "dataBase64", "fileSize", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT ("filename") DO UPDATE SET
          "dataBase64" = EXCLUDED."dataBase64",
          "fileSize" = EXCLUDED."fileSize",
          "mimeType" = EXCLUDED."mimeType",
          "updatedAt" = NOW()
      `, [filename, filename, mimeType, base64, stat.size]);

      console.log(`  ✓ Persisted: ${filename} (${Math.round(stat.size / 1024)} KB)`);
    }
  }

  // 3. Fix category platforms & clean images in GameCategory
  console.log('Updating GameCategory platforms and default verified images...');

  await pool.query(`
    UPDATE "GameCategory"
    SET "platform" = 'games', "updatedAt" = NOW()
    WHERE id IN ('pubg-mobile', 'freefire-me', 'blood-strike-global', 'blood-strike-me')
  `);

  await pool.query(`
    UPDATE "GameCategory"
    SET "platform" = 'apps',
        "badge" = 'شحن فوري',
        "deliveryTime" = 'تسليم تلقائي فوري',
        "imageUrl" = '/uploads/products/likee-card.jpg',
        "updatedAt" = NOW()
    WHERE id = 'likee'
  `);

  await pool.query(`
    UPDATE "GameCategory"
    SET "platform" = 'digital',
        "badge" = 'تسليم بالمعرف',
        "deliveryTime" = 'شحن فوري مباشر',
        "imageUrl" = '/uploads/products/telegram-stars-card.jpg',
        "updatedAt" = NOW()
    WHERE id = 'telegram-stars'
  `);

  await pool.query(`
    UPDATE "GameCategory"
    SET "platform" = 'subscriptions',
        "badge" = 'تفعيل رسمي',
        "deliveryTime" = 'فوري وتلقائي',
        "imageUrl" = '/uploads/products/telegram-premium-card.jpg',
        "updatedAt" = NOW()
    WHERE id = 'telegram-premium'
  `);

  // Ensure games have verified existing images
  await pool.query(`
    UPDATE "GameCategory"
    SET "imageUrl" = '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg'
    WHERE id = 'pubg-mobile' AND ("imageUrl" IS NULL OR "imageUrl" LIKE '%prod_179006%')
  `);

  await pool.query(`
    UPDATE "GameCategory"
    SET "imageUrl" = '/uploads/products/prod_1789435947312_54dc7dd7.webp'
    WHERE id = 'freefire-me' AND ("imageUrl" IS NULL OR "imageUrl" LIKE '%prod_179006%')
  `);

  await pool.query(`
    UPDATE "GameCategory"
    SET "imageUrl" = '/uploads/products/images (2).jpg'
    WHERE id IN ('blood-strike-global', 'blood-strike-me') AND ("imageUrl" IS NULL OR "imageUrl" LIKE '%prod_179006%')
  `);

  console.log('✓ All categories updated successfully!');
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
