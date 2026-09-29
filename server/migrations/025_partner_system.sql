-- Migration 025: Comprehensive KIROPRO Partner Platform
-- Dealer/Partner Portal, Wallet in USD, Immutable Ledger, Levels & Points,
-- Custom Partner Pricing, Permanent Database Receipt Storage & Exchange Rate History

-- 1. Add PARTNER role to "Role" enum if not exists
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PARTNER';

-- 2. Add defaultPartnerPriceUsd to Product table
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "defaultPartnerPriceUsd" NUMERIC(10, 2);

-- Backfill defaultPartnerPriceUsd: default to customerPriceUsd or calculated margin
UPDATE "Product"
SET "defaultPartnerPriceUsd" = ROUND(COALESCE("customerPriceUsd", 0) * 0.95, 2)
WHERE "defaultPartnerPriceUsd" IS NULL AND "customerPriceUsd" > 0;

-- 3. Partner Levels Table
CREATE TABLE IF NOT EXISTS "partner_levels" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "arabic_name" VARCHAR(100) NOT NULL,
    "min_points" NUMERIC(12, 2) NOT NULL DEFAULT 0,
    "max_points" NUMERIC(12, 2),
    "discount_percent" NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    "badge_color" VARCHAR(30) DEFAULT '#F59E0B',
    "perks_description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial Partner Levels if not exists
INSERT INTO "partner_levels" ("name", "arabic_name", "min_points", "max_points", "discount_percent", "badge_color", "perks_description", "display_order")
SELECT 'Bronze', 'برونزي', 0, 500, 0.00, '#CD7F32', 'مستوى البداية لجميع الشركاء الجدد', 1
WHERE NOT EXISTS (SELECT 1 FROM "partner_levels" WHERE "name" = 'Bronze');

INSERT INTO "partner_levels" ("name", "arabic_name", "min_points", "max_points", "discount_percent", "badge_color", "perks_description", "display_order")
SELECT 'Silver', 'فضي', 501, 2000, 1.00, '#C0C0C0', 'خصم إضافي 1% على جميع باقات الألعاب', 2
WHERE NOT EXISTS (SELECT 1 FROM "partner_levels" WHERE "name" = 'Silver');

INSERT INTO "partner_levels" ("name", "arabic_name", "min_points", "max_points", "discount_percent", "badge_color", "perks_description", "display_order")
SELECT 'Gold', 'ذهبي', 2001, 5000, 2.00, '#FFD700', 'خصم إضافي 2% وأولوية في معالجة طلبات الإيداع', 3
WHERE NOT EXISTS (SELECT 1 FROM "partner_levels" WHERE "name" = 'Gold');

INSERT INTO "partner_levels" ("name", "arabic_name", "min_points", "max_points", "discount_percent", "badge_color", "perks_description", "display_order")
SELECT 'Diamond', 'ماسي', 5001, NULL, 3.00, '#00E5FF', 'خصم إضافي 3% ودعم فني مخصص على مدار الساعة', 4
WHERE NOT EXISTS (SELECT 1 FROM "partner_levels" WHERE "name" = 'Diamond');

-- 4. Partner Profiles Table
CREATE TABLE IF NOT EXISTS "partner_profiles" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    "business_name" VARCHAR(150),
    "phone" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "level_id" UUID REFERENCES "partner_levels"("id") ON DELETE SET NULL,
    "total_points" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_partner_profiles_user" ON "partner_profiles"("user_id");
CREATE INDEX IF NOT EXISTS "idx_partner_profiles_status" ON "partner_profiles"("status");

-- 5. Partner Setup Tokens (One-Time Password Setup Token)
CREATE TABLE IF NOT EXISTS "partner_setup_tokens" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL REFERENCES "partner_profiles"("id") ON DELETE CASCADE,
    "token_hash" VARCHAR(255) NOT NULL UNIQUE,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_partner_setup_tokens_lookup" ON "partner_setup_tokens"("token_hash") WHERE "used_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_partner_setup_tokens_partner" ON "partner_setup_tokens"("partner_id");

-- 6. Partner Wallets Table (USD Balance exclusively)
CREATE TABLE IF NOT EXISTS "partner_wallets" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL UNIQUE REFERENCES "partner_profiles"("id") ON DELETE CASCADE,
    "balance" NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "total_deposited_usd" NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    "total_spent_usd" NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_partner_wallet_balance_positive" CHECK ("balance" >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_partner_wallets_partner" ON "partner_wallets"("partner_id");

-- 7. Partner Financial Ledger (Immutable Double-Entry Audit Trail)
CREATE TABLE IF NOT EXISTS "partner_ledger" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL REFERENCES "partner_profiles"("id") ON DELETE CASCADE,
    "wallet_id" UUID NOT NULL REFERENCES "partner_wallets"("id") ON DELETE CASCADE,
    "type" VARCHAR(30) NOT NULL,
    "amount" NUMERIC(12, 4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "balance_before" NUMERIC(12, 4) NOT NULL,
    "balance_after" NUMERIC(12, 4) NOT NULL,
    "reference_id" VARCHAR(100),
    "reference_type" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    "actor_id" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_partner_ledger_partner" ON "partner_ledger"("partner_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_partner_ledger_reference" ON "partner_ledger"("reference_id", "reference_type");
CREATE INDEX IF NOT EXISTS "idx_partner_ledger_type" ON "partner_ledger"("type");

-- 8. Partner Product Pricing (Specific per Partner + Product)
CREATE TABLE IF NOT EXISTS "partner_product_pricing" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL REFERENCES "partner_profiles"("id") ON DELETE CASCADE,
    "product_id" UUID NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
    "partner_price_usd" NUMERIC(10, 2) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_partner_product" UNIQUE ("partner_id", "product_id")
);

CREATE INDEX IF NOT EXISTS "idx_partner_pricing_lookup" ON "partner_product_pricing"("partner_id", "product_id");

-- 9. Partner Deposits Table (with Permanent DB Receipt Storage)
CREATE TABLE IF NOT EXISTS "partner_deposits" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL REFERENCES "partner_profiles"("id") ON DELETE CASCADE,
    "amount_usd" NUMERIC(10, 2) NOT NULL,
    "exchange_rate" NUMERIC(12, 4) NOT NULL,
    "amount_local" NUMERIC(14, 2) NOT NULL,
    "currency_local" VARCHAR(10) NOT NULL DEFAULT 'SDG',
    "payment_method_id" UUID REFERENCES "payment_methods"("id") ON DELETE SET NULL,
    "receipt_filename" VARCHAR(255) NOT NULL,
    "receipt_mime_type" VARCHAR(100) NOT NULL,
    "receipt_data_base64" TEXT NOT NULL,
    "receipt_file_size" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "partner_notes" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_partner_deposits_partner" ON "partner_deposits"("partner_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_partner_deposits_status" ON "partner_deposits"("status", "created_at" DESC);

-- 10. Partner Orders Table
CREATE TABLE IF NOT EXISTS "partner_orders" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL REFERENCES "partner_profiles"("id") ON DELETE CASCADE,
    "product_id" UUID REFERENCES "Product"("id") ON DELETE SET NULL,
    "provider_offer_id" INTEGER NOT NULL,
    "game_id" VARCHAR(100) NOT NULL,
    "package_name" VARCHAR(150) NOT NULL,
    "player_id" VARCHAR(150) NOT NULL,
    "server_id" VARCHAR(50),
    "player_name" VARCHAR(150),
    "cost_price_usd" NUMERIC(10, 2) NOT NULL,
    "partner_price_usd" NUMERIC(10, 2) NOT NULL,
    "points_awarded" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
    "provider_order_id" BIGINT,
    "provider_status" VARCHAR(50),
    "fulfillment_key" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_partner_orders_partner" ON "partner_orders"("partner_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_partner_orders_status" ON "partner_orders"("status") WHERE "status" = 'PROCESSING';
CREATE INDEX IF NOT EXISTS "idx_partner_orders_provider_order_id" ON "partner_orders"("provider_order_id");

-- 11. Exchange Rate History Table
CREATE TABLE IF NOT EXISTS "exchange_rate_history" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "old_rate" NUMERIC(12, 4) NOT NULL,
    "new_rate" NUMERIC(12, 4) NOT NULL,
    "base_currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "quote_currency" VARCHAR(10) NOT NULL DEFAULT 'SDG',
    "changed_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_exchange_rate_history_created" ON "exchange_rate_history"("created_at" DESC);
