-- Migration 045: Harden Customer Wallets & Financial Ledger Precision (SEC-FIN-04)
-- Description:
-- 1. Validates that no violating negative balances exist.
-- 2. Converts Wallet.balance to NUMERIC(16, 4) for high-value SDG platform balances.
-- 3. Adds CHECK constraint (chk_wallet_balance_non_negative) to guarantee balance >= 0.
-- 4. Converts WalletTransaction financial amounts (amount, balanceBefore, balanceAfter) to NUMERIC(16, 4).
-- 5. Converts Order financial amounts (amount, chargedAmount) to NUMERIC(16, 4).

-- Step 1: Pre-validation assertion
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Wallet" WHERE balance < 0 OR balance IS NULL) THEN
        RAISE EXCEPTION 'Pre-migration check failed: Invalid or negative balance found in Wallet';
    END IF;
END $$;

-- Step 2: Convert Wallet.balance to NUMERIC(16, 4)
ALTER TABLE "Wallet" 
    ALTER COLUMN balance TYPE NUMERIC(16, 4) USING ROUND(balance::numeric, 4);

-- Step 3: Enforce Non-Negative Balance Constraint
ALTER TABLE "Wallet" 
    DROP CONSTRAINT IF EXISTS chk_wallet_balance_non_negative;

ALTER TABLE "Wallet" 
    ADD CONSTRAINT chk_wallet_balance_non_negative CHECK (balance >= 0);

-- Step 4: Convert WalletTransaction financial audit fields to NUMERIC(16, 4)
ALTER TABLE "WalletTransaction" 
    ALTER COLUMN amount TYPE NUMERIC(16, 4) USING ROUND(amount::numeric, 4),
    ALTER COLUMN "balanceBefore" TYPE NUMERIC(16, 4) USING ROUND("balanceBefore"::numeric, 4),
    ALTER COLUMN "balanceAfter" TYPE NUMERIC(16, 4) USING ROUND("balanceAfter"::numeric, 4);

-- Step 5: Convert Order financial fields to NUMERIC(16, 4)
ALTER TABLE "Order" 
    ALTER COLUMN amount TYPE NUMERIC(16, 4) USING ROUND(amount::numeric, 4),
    ALTER COLUMN "chargedAmount" TYPE NUMERIC(16, 4) USING ROUND("chargedAmount"::numeric, 4);
