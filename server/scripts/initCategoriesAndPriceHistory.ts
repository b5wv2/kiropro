import 'dotenv/config';
import pool from '../src/db';

async function main() {
  console.log('--- Initializing Categories and PriceHistory Table ---');

  // 1. PriceHistory table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "PriceHistory" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "providerOfferId" INTEGER NOT NULL,
      "productName" VARCHAR(255),
      "offerName" VARCHAR(255),
      "oldPrice" NUMERIC(12, 4),
      "newPrice" NUMERIC(12, 4),
      currency VARCHAR(10) DEFAULT 'USD',
      "detectedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_price_history_offer" ON "PriceHistory" ("providerOfferId");
  `);
  console.log('PriceHistory table ready.');

  // 2. Ensure GameCategory records for Likee, Telegram Stars, Telegram Premium
  const categories = [
    {
      id: 'likee',
      name: 'Likee',
      arabicName: 'لايكي (Likee)',
      platform: 'mobile',
      badge: 'شحن فوري',
      deliveryTime: 'تسليم تلقائي فوري',
      idFieldLabel: 'معرف حساب Likee (Likee ID)',
      idPlaceholder: 'أدخل معرّف حساب Likee الخاص بك',
      displayOrder: 4,
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      isActive: true
    },
    {
      id: 'telegram-stars',
      name: 'Telegram Stars',
      arabicName: 'نجوم تيليجرام (Telegram Stars)',
      platform: 'digital',
      badge: 'تسليم بالمعرف',
      deliveryTime: 'شحن فوري مباشر',
      idFieldLabel: 'معرف تيليجرام أو اسم المستخدم (@username / User ID)',
      idPlaceholder: 'أدخل @username أو معرّف تيليجرام الرقمي',
      displayOrder: 5,
      imageUrl: 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?auto=format&fit=crop&w=800&q=80',
      isActive: true
    },
    {
      id: 'telegram-premium',
      name: 'Telegram Premium',
      arabicName: 'اشتراكات تيليجرام بريميوم (Telegram Premium)',
      platform: 'digital',
      badge: 'تفعيل رسمي',
      deliveryTime: 'فوري وتلقائي',
      idFieldLabel: 'معرف تيليجرام أو اسم المستخدم (@username)',
      idPlaceholder: 'أدخل @username أو معرّف تيليجرام',
      displayOrder: 6,
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      isActive: true
    }
  ];

  for (const cat of categories) {
    await pool.query(`
      INSERT INTO "GameCategory" (
        id, name, "arabicName", platform, badge, "deliveryTime",
        "idFieldLabel", "idPlaceholder", "displayOrder", "imageUrl", "isActive",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        "arabicName" = EXCLUDED."arabicName",
        platform = EXCLUDED.platform,
        badge = EXCLUDED.badge,
        "deliveryTime" = EXCLUDED."deliveryTime",
        "idFieldLabel" = EXCLUDED."idFieldLabel",
        "idPlaceholder" = EXCLUDED."idPlaceholder",
        "displayOrder" = EXCLUDED."displayOrder",
        "isActive" = true,
        "updatedAt" = NOW()
    `, [
      cat.id, cat.name, cat.arabicName, cat.platform, cat.badge, cat.deliveryTime,
      cat.idFieldLabel, cat.idPlaceholder, cat.displayOrder, cat.imageUrl, cat.isActive
    ]);
    console.log(`Category "${cat.id}" configured.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
