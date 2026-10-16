-- Migration 042: Digital Gift Cards & Vouchers (Free Fire & PUBG Mobile)
-- Clean, additive, and secure

-- 1. Table for persistent local voucher catalog
CREATE TABLE IF NOT EXISTS "g2bulk_voucher_catalog" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "provider_category_id" INTEGER NOT NULL,
    "provider_product_id" INTEGER NOT NULL UNIQUE,
    "title" VARCHAR(255) NOT NULL,
    "arabic_title" VARCHAR(255),
    "description" TEXT,
    "category_title" VARCHAR(255) NOT NULL,
    "game_key" VARCHAR(50) NOT NULL, -- 'freefire' or 'pubg'
    "unit_price" NUMERIC(12, 4) NOT NULL,
    "face_value" NUMERIC(12, 4),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "custom_image_url" TEXT, -- Admin managed ONLY. Provider images strictly forbidden.
    "currency" VARCHAR(10) DEFAULT 'USD',
    "customer_price_usd" NUMERIC(12, 4), -- Set by Admin
    "is_active" BOOLEAN NOT NULL DEFAULT false, -- Inactive until Admin sets price
    "is_in_stock" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_g2bulk_voucher_game_key" ON "g2bulk_voucher_catalog"("game_key");
CREATE INDEX IF NOT EXISTS "idx_g2bulk_voucher_active" ON "g2bulk_voucher_catalog"("is_active");
CREATE INDEX IF NOT EXISTS "idx_g2bulk_voucher_prov_id" ON "g2bulk_voucher_catalog"("provider_product_id");

-- 2. Table for securely storing delivered encrypted voucher codes
CREATE TABLE IF NOT EXISTS "order_voucher_codes" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "product_id" VARCHAR(100) NOT NULL,
    "provider_product_id" VARCHAR(100) NOT NULL,
    "game_type" VARCHAR(50) NOT NULL,
    "code_encrypted" TEXT NOT NULL,
    "code_masked" VARCHAR(50) NOT NULL,
    "face_value" NUMERIC(10, 2),
    "currency" VARCHAR(10) DEFAULT 'USD',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_order_voucher_order_id" ON "order_voucher_codes"("order_id");
CREATE INDEX IF NOT EXISTS "idx_order_voucher_user_id" ON "order_voucher_codes"("user_id");

-- 3. Register Categories in GameCategory (Using Local Admin Images, Never Provider Images)
INSERT INTO "GameCategory" (
    id, name, "arabicName", "imageUrl", platform, badge, "deliveryTime", 
    "idFieldLabel", "idPlaceholder", "displayOrder", "isActive"
) VALUES 
(
    'freefire-vouchers',
    'Free Fire Vouchers',
    'قسائم فري فاير (Free Fire Vouchers)',
    '/uploads/products/prod_1789435947312_54dc7dd7.webp',
    'cards',
    'أكواد رسمية فورية',
    'تسليم فوري للأكواد الرقمية',
    'البريد الإلكتروني للاستلام',
    'التسليم تلقائي وفوري داخل حسابك وعلى بريدك',
    7,
    true
),
(
    'pubg-vouchers',
    'PUBG Mobile UC Vouchers',
    'بطاقات ببجي شدات (PUBG UC Vouchers)',
    '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg',
    'cards',
    'أكواد Midasbuy رسمية',
    'تسليم فوري للأكواد الرقمية',
    'البريد الإلكتروني للاستلام',
    'التسليم تلقائي وفوري داخل حسابك وعلى بريدك',
    8,
    true
)
ON CONFLICT (id) DO UPDATE SET
    "arabicName" = EXCLUDED."arabicName",
    "deliveryTime" = EXCLUDED."deliveryTime",
    "isActive" = true;
