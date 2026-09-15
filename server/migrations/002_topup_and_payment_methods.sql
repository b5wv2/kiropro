-- Add TOPUP to TxType Enum if not exists
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'TOPUP';

-- Add metadata columns to WalletTransaction
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "referenceId" UUID;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "referenceType" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "balanceBefore" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "balanceAfter" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "createdBy" UUID;

-- Payment Methods Table
CREATE TABLE IF NOT EXISTS "payment_methods" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "currency" TEXT NOT NULL DEFAULT 'SDG',
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "instructions" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Platform Settings Table (Key-Value JSONB)
CREATE TABLE IF NOT EXISTS "platform_settings" (
    "key" TEXT PRIMARY KEY,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID REFERENCES "User"("id") ON DELETE SET NULL
);

-- Top-up Requests Table
CREATE TABLE IF NOT EXISTS "topup_requests" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "payment_method_id" UUID REFERENCES "payment_methods"("id") ON DELETE SET NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "exchange_rate" DOUBLE PRECISION NOT NULL,
    "amount_sdg" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "receipt_url" TEXT NOT NULL,
    "user_note" TEXT,
    "admin_note" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS "idx_topup_requests_user_id" ON "topup_requests"("user_id");
CREATE INDEX IF NOT EXISTS "idx_topup_requests_status" ON "topup_requests"("status");
CREATE INDEX IF NOT EXISTS "idx_topup_requests_created_at" ON "topup_requests"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_topup_requests_payment_method_id" ON "topup_requests"("payment_method_id");

-- Insert Default Exchange Rate Setting if not exists
INSERT INTO "platform_settings" ("key", "value")
VALUES (
    'exchange_rate', 
    '{"rate": 5000, "base_currency": "USD", "quote_currency": "SDG", "min_topup": 1, "max_topup": 500}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;

-- Insert Default Payment Method (Bank of Khartoum - Bankak) if none exists
INSERT INTO "payment_methods" ("name", "type", "currency", "account_name", "account_number", "bank_name", "instructions", "enabled", "display_order")
SELECT 
    'بنك الخرطوم (تطبيق بنكك)',
    'BANK_TRANSFER',
    'SDG',
    'KIROPRO Gaming Services',
    '1829304',
    'بنك الخرطوم (Bank of Khartoum)',
    'يرجى إرسال التحويل المالي عبر تطبيق بنكك إلى الحساب أعلاه مع كتابة اسمك في حقل الملاحظات، ثم رفع صورة إشعار التحويل بصيغة واضحة.',
    true,
    1
WHERE NOT EXISTS (SELECT 1 FROM "payment_methods");
