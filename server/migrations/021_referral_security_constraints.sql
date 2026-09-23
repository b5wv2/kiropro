-- ====================================================================
-- Migration 021: Strict Database-Level Referral Constraints & Protection
-- ====================================================================

-- 1. Ensure unique referee bonus per wallet & referral record (prevents double payouts, race conditions, and replay attacks)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_referral_bonus 
ON "WalletTransaction" ("walletId", "referenceType", "referenceId") 
WHERE "type" = 'REFERRAL_BONUS' AND "referenceType" = 'REFERRAL' AND "referenceId" IS NOT NULL;

-- 2. Ensure each qualifying order can only reward ONE referral (prevents one order paying multiple referrers)
CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_qualifying_order 
ON "referrals" ("qualifying_order_id") 
WHERE "qualifying_order_id" IS NOT NULL;

-- 3. Update platform_settings referral_settings with emergency safety flag
UPDATE "platform_settings"
SET "value" = jsonb_set(
  COALESCE("value", '{}'::jsonb),
  '{payouts_frozen}',
  'true'::jsonb
),
"updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'referral_settings';
