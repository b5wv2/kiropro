-- Migration 049: Developer Support & Military Ranks System (نظام دعم المطورين والرتب العسكرية)
-- Adds columns to "User", creates support_transactions table, and initializes wallet balances.

BEGIN;

-- 1. Add columns to "User" table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wallet_balance" NUMERIC(16, 4) DEFAULT 0.0000;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "total_donated_amount" NUMERIC(16, 4) DEFAULT 0.0000;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "military_rank" TEXT DEFAULT 'مدني';

-- 2. Synchronize "wallet_balance" in "User" from "Wallet" for existing users
UPDATE "User" u
SET "wallet_balance" = COALESCE(w.balance, 0)
FROM "Wallet" w
WHERE w."userId" = u.id;

-- 3. Create support_transactions table
CREATE TABLE IF NOT EXISTS support_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    amount NUMERIC(16, 4) NOT NULL CHECK (amount >= 1),
    previous_rank TEXT NOT NULL,
    new_rank TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_transactions_user_id ON support_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_support_transactions_created_at ON support_transactions(created_at DESC);

-- 4. Create trigger to keep "User".wallet_balance automatically synchronized with "Wallet".balance
CREATE OR REPLACE FUNCTION sync_user_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "User"
    SET wallet_balance = NEW.balance, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = NEW."userId";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_wallet_balance ON "Wallet";
CREATE TRIGGER trg_sync_user_wallet_balance
AFTER INSERT OR UPDATE OF balance ON "Wallet"
FOR EACH ROW
EXECUTE FUNCTION sync_user_wallet_balance();

-- 5. Create or replace a convenient view for lowercase queries 'users'
CREATE OR REPLACE VIEW users AS SELECT * FROM "User";

COMMIT;
