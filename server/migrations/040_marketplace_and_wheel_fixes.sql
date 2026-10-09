-- Migration 040: Fix Lucky Wheel and Marketplace Drafts & Payments Schema
-- Adds missing columns and indexes to wheel_spins and account_listing_payments safely.

-- 1. Lucky Wheel (عجلة الحظ): Add missing columns to wheel_spins
ALTER TABLE "wheel_spins" 
  ADD COLUMN IF NOT EXISTS "credit_id" UUID REFERENCES "wheel_spin_credits"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(30) DEFAULT 'DAILY';

-- 2. Marketplace Payments (دفع رسوم الإعلانات والمسودات): Add missing columns to account_listing_payments
ALTER TABLE "account_listing_payments"
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "draft_data" JSONB DEFAULT '{}'::jsonb;

-- 3. Indexes for Idempotency & Active Unconsumed Drafts
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_listing_payments_idempotency 
  ON "account_listing_payments"("idempotency_key") 
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_listing_payments_active_draft
  ON "account_listing_payments"("user_id", "status", "is_consumed")
  WHERE "status" = 'PAID' AND "is_consumed" = false;
