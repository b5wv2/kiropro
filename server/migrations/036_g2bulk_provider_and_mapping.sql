-- Migration 036: G2Bulk Provider Integration & Multi-Provider Architecture
-- Additive & Non-destructive: preserves 100% of existing GamesDrop functionality

-- 1. Extend OrderStatus Enum with PROVIDER_UNKNOWN to prevent double fulfillment
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PROVIDER_UNKNOWN';

-- 2. Enhance "Order" table for robust idempotency and provider cost snapshotting
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "idempotencyKey" UUID;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerCostUsd" NUMERIC(12, 4);

-- Unique index on idempotencyKey (allowing NULL for legacy orders)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_order_idempotency_key" 
ON "Order"("idempotencyKey") 
WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_order_provider" ON "Order"("provider");

-- 3. Enhance "partner_orders" table with explicit provider tracking
ALTER TABLE "partner_orders" ADD COLUMN IF NOT EXISTS "provider" VARCHAR(50) NOT NULL DEFAULT 'GAMESDROP';
ALTER TABLE "partner_orders" ADD COLUMN IF NOT EXISTS "provider_product_id" VARCHAR(100);

-- 4. Enhance "Product" table with provider routing controls (backward compatible)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryProvider" VARCHAR(50) NOT NULL DEFAULT 'GAMESDROP';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fallbackProvider" VARCHAR(50);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fallbackEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 5. Multi-Provider Product Mappings Table
CREATE TABLE IF NOT EXISTS "product_provider_mappings" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "productId" UUID NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
    "provider" VARCHAR(50) NOT NULL,
    "providerProductId" VARCHAR(100) NOT NULL,
    "providerCostUsd" NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "providerMetadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_product_provider_mapping" UNIQUE ("productId", "provider", "providerProductId")
);

CREATE INDEX IF NOT EXISTS "idx_ppm_product_id" ON "product_provider_mappings"("productId");
CREATE INDEX IF NOT EXISTS "idx_ppm_provider_lookup" ON "product_provider_mappings"("provider", "providerProductId");

-- Enforce at most 1 primary provider per product in database
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_single_primary" 
ON "product_provider_mappings" ("productId") 
WHERE "isPrimary" = true;

-- Enforce at most 1 fallback provider per product in database
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_single_fallback" 
ON "product_provider_mappings" ("productId") 
WHERE "isFallback" = true;

-- 6. Safe & Idempotent Backfill: Register all existing GamesDrop products as primary
INSERT INTO "product_provider_mappings" (
    "productId",
    "provider",
    "providerProductId",
    "providerCostUsd",
    "isActive",
    "isPrimary",
    "isFallback",
    "providerMetadata"
)
SELECT 
    p.id,
    'GAMESDROP',
    p."providerOfferId"::text,
    COALESCE(p."gamesDropCostUsd", p."providerCostUsd", 0),
    p."isActive",
    true,
    false,
    jsonb_build_object(
        'offerName', p."offerName",
        'platformCode', p."platformCode",
        'regionCode', p."regionCode"
    )
FROM "Product" p
WHERE p."providerOfferId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_provider_mappings" ppm 
    WHERE ppm."productId" = p.id AND ppm."provider" = 'GAMESDROP'
  );
