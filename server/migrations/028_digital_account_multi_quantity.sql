-- Migration 028: Multi-Quantity Digital Account Purchasing & Assignments Table
-- 1. Remove 1-account-per-user restriction (Allow multiple quantity and repeated purchases)
DROP INDEX IF EXISTS uq_digital_account_user_product;

-- 2. Add quantity and unit prices to Order table
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "unitPrice" NUMERIC;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "unitPriceUsd" NUMERIC;

-- 3. Create digital_account_assignments table (Explicit 1-to-many Order tracking with strict UNIQUE per account)
CREATE TABLE IF NOT EXISTS digital_account_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
    digital_account_id UUID NOT NULL REFERENCES digital_product_accounts(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_assignment_digital_account UNIQUE (digital_account_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_order ON digital_account_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_assignment_user ON digital_account_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_account ON digital_account_assignments(digital_account_id);

-- 4. Backfill existing sold accounts into assignments table
INSERT INTO digital_account_assignments (order_id, digital_account_id, user_id, created_at)
SELECT order_id, id, assigned_to_user_id, COALESCE(assigned_at, created_at)
FROM digital_product_accounts
WHERE status = 'SOLD' AND order_id IS NOT NULL AND assigned_to_user_id IS NOT NULL
ON CONFLICT (digital_account_id) DO NOTHING;

-- 5. Standardize Google Play Points product commercial naming and type
UPDATE "Product"
SET "productType" = 'DIGITAL_ACCOUNT',
    "category" = 'DIGITAL_ACCOUNT',
    "arabicName" = 'حساب نقاط تشغيل / Google'
WHERE id = 'a0000000-0000-0000-0000-000000000001';
