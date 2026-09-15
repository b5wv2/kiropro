-- Migration 007: Redesign Price Fields & Clarify GamesDrop Cost vs Supplier Cost

ALTER TABLE "Product" 
ADD COLUMN IF NOT EXISTS "gamesDropCostUsd" NUMERIC(12, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "supplierCostUsd" NUMERIC(12, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "gamesDropAddedPercent" NUMERIC(6, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "gamesDropFxRate" NUMERIC(10, 4) DEFAULT 1;

-- Allow customerPriceUsd to be NULL for inactive/unconfigured products
ALTER TABLE "Product" ALTER COLUMN "customerPriceUsd" DROP NOT NULL;

-- Backfill from existing providerCostUsd
UPDATE "Product" 
SET 
  "gamesDropCostUsd" = COALESCE("providerCostUsd", 0),
  "supplierCostUsd" = COALESCE("providerCostUsd", 0)
WHERE "gamesDropCostUsd" = 0 AND "providerCostUsd" > 0;
