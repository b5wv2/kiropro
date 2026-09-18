-- Migration 015: USDT Instant Transfer, Inventory Lock, Crypto Networks & Telegram Reminders

-- 1. Extend OrderStatus Enum with AWAITING_TRANSFER and CANCELED
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_TRANSFER';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

-- 2. Extend Order Table for Crypto / USDT Specific Attributes
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderType" VARCHAR(30) NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cryptoNetwork" VARCHAR(50);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "walletAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "usdtAmount" NUMERIC(18, 4);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "txHash" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "completedBy" UUID REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "canceledReason" TEXT;

-- 3. Dedicated USDT Inventory & Configuration Table
CREATE TABLE IF NOT EXISTS "usdt_inventory" (
    "id" INTEGER PRIMARY KEY DEFAULT 1,
    "available" NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK ("available" >= 0),
    "reserved" NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK ("reserved" >= 0),
    "sold" NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK ("sold" >= 0),
    "min_order_amount" NUMERIC(18, 4) NOT NULL DEFAULT 3.0000 CHECK ("min_order_amount" >= 3.0000),
    "exchange_rate" NUMERIC(18, 4) NOT NULL DEFAULT 5000.0000 CHECK ("exchange_rate" > 0),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    CONSTRAINT single_row_inventory CHECK (id = 1)
);

-- Seed initial row if not existing
INSERT INTO "usdt_inventory" ("id", "available", "reserved", "sold", "min_order_amount", "exchange_rate")
VALUES (1, 50.0000, 0.0000, 0.0000, 3.0000, 5000.0000)
ON CONFLICT ("id") DO NOTHING;

-- 4. Crypto Networks Management Table
CREATE TABLE IF NOT EXISTS "crypto_networks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "identifier" VARCHAR(50) NOT NULL UNIQUE,
    "name" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(20) NOT NULL DEFAULT 'USDT',
    "validator_type" VARCHAR(50) NOT NULL DEFAULT 'EVM',
    "min_amount" NUMERIC(18, 4) NOT NULL DEFAULT 3.0000 CHECK ("min_amount" >= 3.0000),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed Polygon as the primary ready network, with BSC and TRON configured for future enablement
INSERT INTO "crypto_networks" ("identifier", "name", "currency", "validator_type", "min_amount", "enabled", "display_order")
VALUES 
  ('POLYGON', 'Polygon (POL/MATIC)', 'USDT', 'EVM', 3.0000, true, 1),
  ('BSC', 'BNB Smart Chain (BEP20)', 'USDT', 'EVM', 3.0000, false, 2),
  ('TRON', 'TRON (TRC20)', 'USDT', 'TRON', 3.0000, false, 3)
ON CONFLICT ("identifier") DO NOTHING;

-- 5. Telegram Reminders Tracking Table (for decoupled 10-second polling & deduplication)
CREATE TABLE IF NOT EXISTS "usdt_telegram_reminders" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE CASCADE,
    "last_notified_at" TIMESTAMP WITH TIME ZONE,
    "notification_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_usdt_reminders_active" ON "usdt_telegram_reminders"("is_active");
CREATE INDEX IF NOT EXISTS "idx_order_order_type" ON "Order"("orderType");
CREATE INDEX IF NOT EXISTS "idx_order_crypto_network" ON "Order"("cryptoNetwork");
