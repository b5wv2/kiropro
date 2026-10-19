-- Migration 044: Enforce Database-Level Idempotency on Order Refunds
-- Prevents double refunds, concurrent refund race conditions, and replay attacks on orders

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_order_refund
ON "WalletTransaction" ("walletId", "referenceType", "referenceId")
WHERE "type" = 'REFUND' AND "referenceType" = 'ORDER' AND "referenceId" IS NOT NULL;
