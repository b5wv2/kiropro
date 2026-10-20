-- Migration 048: Absolute Store Customer Currency Unification to SDG
-- Enforces that all customer accounts, wallets, and store operations use SDG exclusively.
-- Preserves Partner accounts, partner_wallets, and supplier USD costs completely intact.

BEGIN;

-- 1. Unify preferred_currency for all store users (CUSTOMER and ADMIN) to SDG
UPDATE "User"
SET "preferred_currency" = 'SDG', "updatedAt" = CURRENT_TIMESTAMP
WHERE role != 'PARTNER' AND ("preferred_currency" != 'SDG' OR "preferred_currency" IS NULL);

-- 2. Ensure all wallets in the store Wallet table have currency = 'SDG'
UPDATE "Wallet"
SET "currency" = 'SDG', "updatedAt" = CURRENT_TIMESTAMP
WHERE "currency" != 'SDG';

-- 3. Enforce CHECK constraint on "User" table: Any non-partner must have preferred_currency = 'SDG'
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS chk_user_customer_sdg_only;
ALTER TABLE "User" ADD CONSTRAINT chk_user_customer_sdg_only 
  CHECK (role = 'PARTNER' OR "preferred_currency" = 'SDG');

-- 4. Update Trigger function to strictly reject any non-SDG currency for store wallets
CREATE OR REPLACE FUNCTION enforce_customer_wallet_sdg()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM "User" WHERE id = NEW."userId";
    IF (user_role = 'CUSTOMER' OR user_role = 'ADMIN') AND NEW.currency != 'SDG' THEN
        RAISE EXCEPTION 'Store and Customer wallets must use SDG currency only. (Attempted: %)', NEW.currency;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_customer_wallet_sdg ON "Wallet";
CREATE TRIGGER trg_enforce_customer_wallet_sdg
BEFORE INSERT OR UPDATE OF currency ON "Wallet"
FOR EACH ROW
EXECUTE FUNCTION enforce_customer_wallet_sdg();

COMMIT;
