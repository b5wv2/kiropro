-- Migration 035: Partner Portal Enhancements
-- 1. Product Fulfillment Types & Requirements Configuration
-- 2. Deposit Payment Methods Enhancements
-- 3. Multi-Quantity & Partner Tracking for Digital Accounts

-- 1. Add fulfillment and requirement configuration columns to Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fulfillment_type" VARCHAR(50) DEFAULT 'DIRECT_TOPUP';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "requires_player_id" BOOLEAN DEFAULT true;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "requires_server_id" BOOLEAN DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "requires_quantity" BOOLEAN DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "requires_inventory" BOOLEAN DEFAULT false;

-- Sync existing products to their proper fulfillment_type and requirements
-- A: KiroPro Virtual Card
UPDATE "Product"
SET "fulfillment_type" = 'KIROPRO_CARD',
    "requires_player_id" = false,
    "requires_server_id" = false,
    "requires_quantity" = false,
    "requires_inventory" = true,
    "requiresGameUserId" = false,
    "requiresGameServerId" = false
WHERE id = 'b0000000-0000-0000-0000-000000000001' OR "productType" = 'VIRTUAL_CARD';

-- B: Digital Accounts (e.g. Google Play Points Account)
UPDATE "Product"
SET "fulfillment_type" = 'DIGITAL_ACCOUNT',
    "requires_player_id" = false,
    "requires_server_id" = false,
    "requires_quantity" = true,
    "requires_inventory" = true,
    "requiresGameUserId" = false,
    "requiresGameServerId" = false
WHERE id = 'a0000000-0000-0000-0000-000000000001' OR "productType" = 'DIGITAL_ACCOUNT' OR "category" = 'DIGITAL_ACCOUNT';

-- C: Direct Top-up Games (PUBG, Free Fire, Likee, etc.)
UPDATE "Product"
SET "fulfillment_type" = 'DIRECT_TOPUP',
    "requires_player_id" = true,
    "requires_server_id" = COALESCE("requiresGameServerId", false),
    "requires_quantity" = false,
    "requires_inventory" = false
WHERE "fulfillment_type" IS NULL OR "fulfillment_type" = 'DIRECT_TOPUP';

-- 2. Enhance payment_methods for wallets and QR codes
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "phone_number" TEXT;
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "qr_code_url" TEXT;

-- 3. Enhance partner_orders for multi-quantity and unit pricing
ALTER TABLE "partner_orders" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "partner_orders" ADD COLUMN IF NOT EXISTS "unit_price_usd" NUMERIC(10, 2);

-- Backfill unit_price_usd on partner_orders
UPDATE "partner_orders"
SET "unit_price_usd" = "partner_price_usd"
WHERE "unit_price_usd" IS NULL;

-- 4. Link digital_product_accounts to partner_orders
ALTER TABLE "digital_product_accounts" ADD COLUMN IF NOT EXISTS "partner_order_id" UUID REFERENCES "partner_orders"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_digital_account_partner_order" ON "digital_product_accounts"("partner_order_id");

-- 5. Link digital_account_assignments to partner_orders
ALTER TABLE "digital_account_assignments" ADD COLUMN IF NOT EXISTS "partner_order_id" UUID REFERENCES "partner_orders"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_assignment_partner_order" ON "digital_account_assignments"("partner_order_id");

-- Allow digital_account_assignments user_id to be nullable if purchased via partner account
ALTER TABLE "digital_account_assignments" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "digital_account_assignments" ALTER COLUMN "user_id" DROP NOT NULL;
