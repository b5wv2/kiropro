-- Migration 027: Digital Product Accounts (Credentials Inventory, Atomic Skip-Locked Assignment & Anti-Duplicate Protection)

-- 1. Create digital_product_accounts table
CREATE TABLE IF NOT EXISTS digital_product_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_encrypted TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    order_id UUID REFERENCES "Order"(id) ON DELETE SET NULL,
    assigned_to_user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_digital_account_status CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'DISABLED'))
);

-- 2. Constraints & Performance Indexes
-- A: Disallow duplicate email for the same product
CREATE UNIQUE INDEX IF NOT EXISTS uq_digital_account_product_email 
ON digital_product_accounts (product_id, LOWER(email));

-- B: Disallow duplicate sale to the same user for this product (Strict DB-level business rule)
CREATE UNIQUE INDEX IF NOT EXISTS uq_digital_account_user_product 
ON digital_product_accounts (product_id, assigned_to_user_id) 
WHERE status = 'SOLD' AND assigned_to_user_id IS NOT NULL;

-- C: Rapid index for SELECT ... FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS idx_digital_account_avail 
ON digital_product_accounts (product_id, status, created_at);

-- D: Foreign lookup indexes
CREATE INDEX IF NOT EXISTS idx_digital_account_order 
ON digital_product_accounts (order_id);

CREATE INDEX IF NOT EXISTS idx_digital_account_user 
ON digital_product_accounts (assigned_to_user_id);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_snake()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_digital_product_accounts_modtime ON digital_product_accounts;

CREATE TRIGGER trg_digital_product_accounts_modtime 
BEFORE UPDATE ON digital_product_accounts 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_snake();

-- 4. Make providerOfferId nullable on Product so internal digital accounts do not require GamesDrop ID
ALTER TABLE "Product" ALTER COLUMN "providerOfferId" DROP NOT NULL;

-- 5. Seed Category for Google Play Points
INSERT INTO "GameCategory" (
  "id", "name", "arabicName", "imageUrl", "platform", "badge", "deliveryTime", "idFieldLabel", "idPlaceholder", "displayOrder", "isActive"
) VALUES (
  'google-play-points',
  'Google Play Points',
  'حساب نقاط تشغيل / Google',
  'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?auto=format&fit=crop&w=800&q=80',
  'mobile',
  'تسليم فوري',
  'تسليم فوري للحساب (Email & Password)',
  'البريد الإلكتروني للاستلام',
  'لا يلزم إدخال معرف - التسليم فوري وتلقائي',
  10,
  true
) ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "arabicName" = EXCLUDED."arabicName",
  "deliveryTime" = EXCLUDED."deliveryTime",
  "isActive" = true;

-- 6. Seed Product for Google Play Points Account
INSERT INTO "Product" (
  "id",
  "provider",
  "providerOfferId",
  "productName",
  "offerName",
  "arabicName",
  "description",
  "category",
  "productType",
  "customerPriceUsd",
  "isActive",
  "inStock",
  "displayOrder",
  "requiresGameUserId",
  "requiresGameServerId",
  "gameCategoryId"
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'INTERNAL',
  990001,
  'Google Play Points Account',
  'حساب نقاط تشغيل / Google',
  'حساب نقاط تشغيل / Google',
  'حساب جوجل جاهز يحتوي على نقاط تشغيل (Google Play Points). تسليم فوري وتلقائي لبيانات الحساب (Email & Password) بمجرد إتمام الشراء.',
  'DIGITAL_ACCOUNT',
  'DIGITAL_ACCOUNT',
  10.00,
  true,
  true,
  1,
  false,
  false,
  'google-play-points'
) ON CONFLICT ("id") DO UPDATE SET
  "arabicName" = EXCLUDED."arabicName",
  "productType" = 'DIGITAL_ACCOUNT',
  "category" = 'DIGITAL_ACCOUNT',
  "gameCategoryId" = 'google-play-points',
  "isActive" = true;
