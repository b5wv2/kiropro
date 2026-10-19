-- Rollback Migration 045: Revert Customer Wallets & Ledger to DOUBLE PRECISION
-- Used only in emergency rollback procedures.

ALTER TABLE "Wallet" 
    DROP CONSTRAINT IF EXISTS chk_wallet_balance_non_negative;

ALTER TABLE "Wallet" 
    ALTER COLUMN balance TYPE DOUBLE PRECISION USING balance::double precision;

ALTER TABLE "WalletTransaction" 
    ALTER COLUMN amount TYPE DOUBLE PRECISION USING amount::double precision,
    ALTER COLUMN "balanceBefore" TYPE DOUBLE PRECISION USING "balanceBefore"::double precision,
    ALTER COLUMN "balanceAfter" TYPE DOUBLE PRECISION USING "balanceAfter"::double precision;

ALTER TABLE "Order" 
    ALTER COLUMN amount TYPE DOUBLE PRECISION USING amount::double precision,
    ALTER COLUMN "chargedAmount" TYPE DOUBLE PRECISION USING "chargedAmount"::double precision;
