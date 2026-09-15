-- Migration 005: GamesDrop Integration and Order Fulfillment

-- 1. Add PROCESSING and REFUNDED to OrderStatus enum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- 2. Add provider and fulfillment fields to Order table
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "provider" VARCHAR(50) NOT NULL DEFAULT 'GAMESDROP';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerOrderId" BIGINT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerOfferId" INTEGER DEFAULT 999;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerStatus" VARCHAR(50);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerPrice" NUMERIC(10, 2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerCurrency" VARCHAR(10);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerPrice" NUMERIC(10, 2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "finalPrice" NUMERIC(10, 2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "fulfillmentKey" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "lastPolledAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP WITH TIME ZONE;

-- 2. Indexes for fast status polling and lookup
CREATE INDEX IF NOT EXISTS "idx_order_polling" ON "Order"("status", "lastPolledAt") WHERE "status" = 'PROCESSING';
CREATE INDEX IF NOT EXISTS "idx_order_provider_order_id" ON "Order"("providerOrderId");
CREATE INDEX IF NOT EXISTS "idx_order_user_id" ON "Order"("userId");
