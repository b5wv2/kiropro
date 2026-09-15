-- Migration 004: Comprehensive Promo Codes & Gift Codes System

-- 1. Create or recreate promo_codes table
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(30) NOT NULL, -- 'DISCOUNT' or 'WALLET_CREDIT'
    discount_type VARCHAR(20), -- 'PERCENTAGE' or 'FIXED'
    discount_value NUMERIC(10, 2),
    max_discount NUMERIC(10, 2),
    credit_amount NUMERIC(10, 2),
    usage_limit INTEGER,
    usage_count INTEGER NOT NULL DEFAULT 0,
    per_user_limit INTEGER NOT NULL DEFAULT 1,
    starts_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create promo_code_redemptions table to track redemptions and enforce single-use per user
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    order_id UUID REFERENCES "Order"(id) ON DELETE SET NULL,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    credit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_promo_user UNIQUE (promo_code_id, user_id)
);

-- 3. Indexes for fast lookup and race-condition safety
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promo_code_redemptions(promo_code_id);

-- 4. Add promo code columns to Order table
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "promoCode" VARCHAR(50);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "originalAmount" DOUBLE PRECISION;

-- 5. Seed default demo codes for testing
INSERT INTO promo_codes (code, type, discount_type, discount_value, max_discount, usage_limit, per_user_limit, is_active)
VALUES ('WELCOME10', 'DISCOUNT', 'PERCENTAGE', 10, 5, 500, 1, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO promo_codes (code, type, credit_amount, usage_limit, per_user_limit, is_active)
VALUES ('GIFT10', 'WALLET_CREDIT', 10, 200, 1, true)
ON CONFLICT (code) DO NOTHING;
