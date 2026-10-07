-- Migration 030: Wheel Purchase Bonus & Multi-Credit System
-- Allows 1 Free Daily Spin (non-accumulating) + 1 Bonus Spin per completed eligible order (excluding USDT).
-- Drops the daily single-spin constraint from wheel_spins and introduces wheel_spin_credits with strict idempotency.

-- 1. Create wheel_spin_credits table
CREATE TABLE IF NOT EXISTS "wheel_spin_credits" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "source_type" VARCHAR(30) NOT NULL, -- 'DAILY' or 'PURCHASE'
    "source_id" VARCHAR(100),           -- Contains order_id for PURCHASE, or YYYY-MM-DD for DAILY
    "spin_date" DATE,                   -- Date of daily attempt
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'USED'
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "spin_id" UUID REFERENCES "wheel_spins"("id") ON DELETE SET NULL
);

-- 2. Strict Idempotency: Each purchase order can grant AT MOST 1 bonus spin credit
CREATE UNIQUE INDEX IF NOT EXISTS uq_wheel_credits_purchase_order 
ON "wheel_spin_credits" ("source_id") 
WHERE "source_type" = 'PURCHASE';

-- 3. Strict Idempotency: Each user can receive AT MOST 1 daily spin credit per calendar day
CREATE UNIQUE INDEX IF NOT EXISTS uq_wheel_credits_daily_user_date 
ON "wheel_spin_credits" ("user_id", "spin_date") 
WHERE "source_type" = 'DAILY';

-- 4. Index for fast querying of available user credits
CREATE INDEX IF NOT EXISTS idx_wheel_credits_user_status 
ON "wheel_spin_credits" ("user_id", "status");

-- 5. Drop the old daily-only constraint from wheel_spins so users can spin multiple times if they have bonus credits
ALTER TABLE "wheel_spins" DROP CONSTRAINT IF EXISTS uq_wheel_user_spin_date;

-- 6. Add credit tracking columns to wheel_spins
ALTER TABLE "wheel_spins" ADD COLUMN IF NOT EXISTS "credit_id" UUID REFERENCES "wheel_spin_credits"("id") ON DELETE SET NULL;
ALTER TABLE "wheel_spins" ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(30) DEFAULT 'DAILY';

-- 7. Backfill existing historical spins into wheel_spin_credits
INSERT INTO "wheel_spin_credits" ("user_id", "source_type", "source_id", "spin_date", "status", "created_at", "used_at", "spin_id")
SELECT "user_id", 'DAILY', "spin_date"::text, "spin_date", 'USED', "created_at", "created_at", "id"
FROM "wheel_spins"
ON CONFLICT DO NOTHING;
