-- Migration 011: Multi-Currency Architecture, Customer Wallet, Cashback System & Promo Credit Redesign

-- 1. Extend User table with preferred_currency ('USD' or 'SDG')
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferred_currency" VARCHAR(10) NOT NULL DEFAULT 'USD';
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_preferred_currency'
  ) THEN 
    ALTER TABLE "User" ADD CONSTRAINT chk_user_preferred_currency CHECK ("preferred_currency" IN ('USD', 'SDG'));
  END IF;
END $$;

-- 2. Extend Wallet table with currency
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';

-- 3. Extend WalletTransaction table for multi-currency, exchange rate lock, balance audit & references
ALTER TABLE "WalletTransaction" ALTER COLUMN "type" TYPE VARCHAR(50);
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "source_amount_usd" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "exchange_rate" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "balanceBefore" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "balanceAfter" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "referenceType" VARCHAR(50);
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "referenceId" VARCHAR(100);
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "createdBy" VARCHAR(50) DEFAULT 'SYSTEM';

-- 4. Extend Order table to record immutable historical pricing and locked rate
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerPriceUsd" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "chargedAmount" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "chargedCurrency" VARCHAR(10) DEFAULT 'USD';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "exchangeRateUsed" DOUBLE PRECISION DEFAULT 1.0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cashbackAmount" DOUBLE PRECISION DEFAULT 0.0;

-- 5. Extend promo_codes to support currency (USD or SDG for WALLET_CREDIT)
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';

-- 6. Extend topup_requests for customer currency and requested amount
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "requested_currency" VARCHAR(10) DEFAULT 'SDG';
ALTER TABLE "topup_requests" ADD COLUMN IF NOT EXISTS "requested_amount" DOUBLE PRECISION;

-- Backfill topup_requests requested values
UPDATE "topup_requests" 
SET 
  "requested_currency" = COALESCE("requested_currency", 'SDG'),
  "requested_amount" = COALESCE("requested_amount", "amount_sdg")
WHERE "requested_amount" IS NULL;

-- 7. Create cashback_rules table
CREATE TABLE IF NOT EXISTS cashback_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    percentage NUMERIC(5, 2) NOT NULL,
    max_cashback_usd NUMERIC(10, 2),
    scope_type VARCHAR(30) NOT NULL DEFAULT 'ALL_PRODUCTS', -- 'ALL_PRODUCTS', 'CATEGORY', 'SELECTED_PRODUCTS'
    eligible_ids JSONB DEFAULT '[]'::jsonb,
    usage_limit_total INTEGER,
    usage_limit_per_user INTEGER NOT NULL DEFAULT 1,
    max_cashback_per_user_usd NUMERIC(10, 2),
    allow_promo_stacking BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES "User"(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Create cashback_redemptions table (Enforces idempotency: ONE cashback per order via UNIQUE constraint)
CREATE TABLE IF NOT EXISTS cashback_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cashback_rule_id UUID NOT NULL REFERENCES cashback_rules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    order_id UUID NOT NULL UNIQUE REFERENCES "Order"(id) ON DELETE CASCADE,
    base_cashback_usd DOUBLE PRECISION NOT NULL,
    credited_amount DOUBLE PRECISION NOT NULL,
    credited_currency VARCHAR(10) NOT NULL,
    exchange_rate DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Indexes for speed and integrity
CREATE INDEX IF NOT EXISTS idx_cashback_rules_active ON cashback_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_cashback_redemptions_user ON cashback_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_cashback_redemptions_order ON cashback_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_cashback_redemptions_rule ON cashback_redemptions(cashback_rule_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON "WalletTransaction"("walletId");
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created_at ON "WalletTransaction"("createdAt" DESC);
