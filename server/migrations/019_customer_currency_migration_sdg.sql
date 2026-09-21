-- Migration 019: Production Customer Currency Migration to SDG & Audit Snapshots

-- 1. Create audit table for currency migration snapshots
CREATE TABLE IF NOT EXISTS "currency_migration_snapshots" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "wallet_id" UUID NOT NULL REFERENCES "Wallet"("id") ON DELETE CASCADE,
    "user_email" VARCHAR(255) NOT NULL,
    "old_currency" VARCHAR(20) NOT NULL,
    "old_balance" NUMERIC(18, 4) NOT NULL,
    "exchange_rate_used" NUMERIC(12, 4) NOT NULL,
    "new_currency" VARCHAR(20) NOT NULL,
    "new_balance" NUMERIC(18, 4) NOT NULL,
    "migration_timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(30) NOT NULL DEFAULT 'COMPLETED'
);

CREATE INDEX IF NOT EXISTS idx_curr_mig_user_id ON "currency_migration_snapshots"("user_id");
CREATE INDEX IF NOT EXISTS idx_curr_mig_wallet_id ON "currency_migration_snapshots"("wallet_id");

-- 2. Database Trigger to strictly enforce that all CUSTOMER wallets must use SDG
CREATE OR REPLACE FUNCTION enforce_customer_wallet_sdg()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM "User" WHERE id = NEW."userId";
    IF user_role = 'CUSTOMER' AND NEW.currency != 'SDG' THEN
        RAISE EXCEPTION 'Customer wallets must use SDG currency only. (Attempted: %)', NEW.currency;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_customer_wallet_sdg ON "Wallet";
CREATE TRIGGER trg_enforce_customer_wallet_sdg
BEFORE INSERT OR UPDATE OF currency ON "Wallet"
FOR EACH ROW
EXECUTE FUNCTION enforce_customer_wallet_sdg();
