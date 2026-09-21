-- Migration 018: Referral Rewards Split & Comprehensive Program Settings

-- 1. Add split reward tracking columns to referrals table
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referee_reward_paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referee_reward_paid_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referrer_reward_paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "referrer_reward_paid_at" TIMESTAMP WITH TIME ZONE;

-- 2. Performance indexes for fast querying of reward statuses
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_paid ON "referrals"("referrer_id", "referrer_reward_paid");
CREATE INDEX IF NOT EXISTS idx_referrals_referee_paid ON "referrals"("referee_id", "referee_reward_paid");

-- 3. Update or initialize full controls in platform_settings
INSERT INTO "platform_settings" ("key", "value", "updated_at")
VALUES (
    'referral_settings',
    jsonb_build_object(
        'enabled', true,
        'referrer_reward', 1000,
        'referee_reward', 1000,
        'currency', 'جنيه',
        'min_order_amount', 5000,
        'max_referrer_earnings', 10000,
        'allow_existing_users_binding', true,
        'first_order_only', true,
        'allow_crypto_orders', true,
        'allow_game_orders', true,
        'allow_cards_orders', true
    ),
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "value" = jsonb_build_object(
    'enabled', COALESCE(("platform_settings"."value"->>'enabled')::boolean, true),
    'referrer_reward', COALESCE(("platform_settings"."value"->>'referrer_reward')::numeric, 1000),
    'referee_reward', COALESCE(("platform_settings"."value"->>'referee_reward')::numeric, 1000),
    'currency', COALESCE("platform_settings"."value"->>'currency', 'جنيه'),
    'min_order_amount', COALESCE(("platform_settings"."value"->>'min_order_amount')::numeric, 5000),
    'max_referrer_earnings', COALESCE(("platform_settings"."value"->>'max_referrer_earnings')::numeric, 10000),
    'allow_existing_users_binding', COALESCE(("platform_settings"."value"->>'allow_existing_users_binding')::boolean, true),
    'first_order_only', COALESCE(("platform_settings"."value"->>'first_order_only')::boolean, true),
    'allow_crypto_orders', COALESCE(("platform_settings"."value"->>'allow_crypto_orders')::boolean, true),
    'allow_game_orders', COALESCE(("platform_settings"."value"->>'allow_game_orders')::boolean, true),
    'allow_cards_orders', COALESCE(("platform_settings"."value"->>'allow_cards_orders')::boolean, true)
),
"updated_at" = CURRENT_TIMESTAMP;
