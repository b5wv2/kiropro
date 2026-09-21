-- Migration 017: Referral & Friend Invitation System (نادي صاحبك واكسب)

-- 1. Add referral_code and referred_by_id to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referral_code" VARCHAR(30);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referred_by_id" UUID REFERENCES "User"("id") ON DELETE SET NULL;

-- 2. Backfill existing users with unique referral codes
UPDATE "User" 
SET "referral_code" = 'KP' || UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE "referral_code" IS NULL;

-- 3. Enforce Unique constraint on referral_code
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_referral_code'
  ) THEN 
    ALTER TABLE "User" ADD CONSTRAINT uq_user_referral_code UNIQUE ("referral_code");
  END IF;
END $$;

-- 4. Create referrals table to track each invited user, progress, and awarded amounts
CREATE TABLE IF NOT EXISTS "referrals" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "referrer_id" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "referee_id" UUID NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'CANCELLED'
    "qualifying_order_id" UUID REFERENCES "Order"("id") ON DELETE SET NULL,
    "referrer_reward_amount" NUMERIC(12, 2) DEFAULT 0,
    "referee_reward_amount" NUMERIC(12, 2) DEFAULT 0,
    "currency" VARCHAR(20) DEFAULT 'جنيه',
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON "referrals"("referrer_id");
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON "referrals"("referee_id");
CREATE INDEX IF NOT EXISTS idx_referrals_status ON "referrals"("status");
CREATE INDEX IF NOT EXISTS idx_user_referral_code ON "User"("referral_code");

-- 6. Seed initial referral program configuration in platform_settings
INSERT INTO "platform_settings" ("key", "value", "updated_at")
VALUES (
    'referral_settings',
    jsonb_build_object(
        'enabled', true,
        'referrer_reward', 1000,
        'referee_reward', 1000,
        'currency', 'جنيه',
        'min_order_amount', 0
    ),
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
