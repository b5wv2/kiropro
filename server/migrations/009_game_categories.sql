-- Migration 009: Game Categories Architecture & Category Images
-- Allows a single category image to be inherited by all child products automatically.

CREATE TABLE IF NOT EXISTS "GameCategory" (
    "id" VARCHAR(100) PRIMARY KEY,
    "name" VARCHAR(150) NOT NULL,
    "arabicName" VARCHAR(150),
    "imageUrl" TEXT,
    "platform" VARCHAR(50) DEFAULT 'mobile',
    "badge" VARCHAR(50) DEFAULT 'تسليم فوري',
    "deliveryTime" VARCHAR(100) DEFAULT 'تسليم فوري وتلقائي',
    "idFieldLabel" VARCHAR(100) DEFAULT 'معرّف اللاعب (Player ID)',
    "idPlaceholder" VARCHAR(150) DEFAULT 'أدخل معرّف اللاعب الخاص بك (Player ID)',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key reference in Product table if not exists
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gameCategoryId" VARCHAR(100) REFERENCES "GameCategory"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_product_game_category" ON "Product"("gameCategoryId");

-- Seed the initial categories
INSERT INTO "GameCategory" ("id", "name", "arabicName", "imageUrl", "displayOrder", "isActive")
VALUES 
  ('pubg-mobile', 'PUBG Mobile', 'PUBG Mobile', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80', 1, true),
  ('freefire-me', 'Free Fire Middle East', 'Free Fire (الشرق الأوسط)', 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80', 2, true)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "arabicName" = EXCLUDED."arabicName";

-- Link existing products to their categories
UPDATE "Product" 
SET "gameCategoryId" = 'pubg-mobile' 
WHERE LOWER("productName") LIKE '%pubg%';

UPDATE "Product" 
SET "gameCategoryId" = 'freefire-me' 
WHERE LOWER("productName") LIKE '%freefire%';
