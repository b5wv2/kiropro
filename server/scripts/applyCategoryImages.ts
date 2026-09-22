import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import pool from '../src/db';

async function main() {
  const uploadsDir = path.resolve(__dirname, '../uploads/products');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const generatedImages = {
    likee: 'C:\\Users\\Ay166\\.gemini\\antigravity-ide\\brain\\6f0f6c7d-5ebf-4f0b-bd54-c39cde592a27\\likee_banner_1790061623797.jpg',
    telegramStars: 'C:\\Users\\Ay166\\.gemini\\antigravity-ide\\brain\\6f0f6c7d-5ebf-4f0b-bd54-c39cde592a27\\telegram_stars_banner_1790061645409.jpg',
    telegramPremium: 'C:\\Users\\Ay166\\.gemini\\antigravity-ide\\brain\\6f0f6c7d-5ebf-4f0b-bd54-c39cde592a27\\telegram_premium_banner_1790061664978.jpg',
  };

  const targetFiles = {
    likee: 'likee-card.jpg',
    telegramStars: 'telegram-stars-card.jpg',
    telegramPremium: 'telegram-premium-card.jpg',
  };

  // 1. Copy files
  if (fs.existsSync(generatedImages.likee)) {
    fs.copyFileSync(generatedImages.likee, path.join(uploadsDir, targetFiles.likee));
    console.log('Copied likee-card.jpg');
  }
  if (fs.existsSync(generatedImages.telegramStars)) {
    fs.copyFileSync(generatedImages.telegramStars, path.join(uploadsDir, targetFiles.telegramStars));
    console.log('Copied telegram-stars-card.jpg');
  }
  if (fs.existsSync(generatedImages.telegramPremium)) {
    fs.copyFileSync(generatedImages.telegramPremium, path.join(uploadsDir, targetFiles.telegramPremium));
    console.log('Copied telegram-premium-card.jpg');
  }

  // 2. Update GameCategory in database
  await pool.query(
    `UPDATE "GameCategory"
     SET "imageUrl" = $1, "updatedAt" = NOW()
     WHERE id = 'likee'`,
    [`/uploads/products/${targetFiles.likee}`]
  );

  await pool.query(
    `UPDATE "GameCategory"
     SET "imageUrl" = $1, "updatedAt" = NOW()
     WHERE id = 'telegram-stars'`,
    [`/uploads/products/${targetFiles.telegramStars}`]
  );

  await pool.query(
    `UPDATE "GameCategory"
     SET "imageUrl" = $1, "updatedAt" = NOW()
     WHERE id = 'telegram-premium'`,
    [`/uploads/products/${targetFiles.telegramPremium}`]
  );

  // 3. Update products default images if null
  await pool.query(
    `UPDATE "Product"
     SET "imageUrl" = $1
     WHERE "gameCategoryId" = 'likee' AND ("imageUrl" IS NULL OR "imageUrl" = '')`,
    [`/uploads/products/${targetFiles.likee}`]
  );

  await pool.query(
    `UPDATE "Product"
     SET "imageUrl" = $1
     WHERE "gameCategoryId" = 'telegram-stars' AND ("imageUrl" IS NULL OR "imageUrl" = '')`,
    [`/uploads/products/${targetFiles.telegramStars}`]
  );

  await pool.query(
    `UPDATE "Product"
     SET "imageUrl" = $1
     WHERE "gameCategoryId" = 'telegram-premium' AND ("imageUrl" IS NULL OR "imageUrl" = '')`,
    [`/uploads/products/${targetFiles.telegramPremium}`]
  );

  console.log('Successfully updated category and product images in DB!');
  await pool.end();
}

main().catch(err => {
  console.error('Error applying category images:', err);
  process.exit(1);
});
