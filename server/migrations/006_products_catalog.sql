-- Migration 006: Product Catalog & Admin Pricing Architecture

CREATE TABLE IF NOT EXISTS "Product" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "provider" VARCHAR(50) NOT NULL DEFAULT 'GAMESDROP',
    "providerOfferId" INTEGER NOT NULL UNIQUE,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "offerName" TEXT NOT NULL,
    "category" VARCHAR(50) NOT NULL DEFAULT 'TOP_UP',
    "platformCode" VARCHAR(50),
    "platformName" VARCHAR(100),
    "regionCode" VARCHAR(50),
    "regionName" VARCHAR(100),
    "providerCostUsd" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "providerCurrency" VARCHAR(10) DEFAULT 'USD',
    "customerPriceUsd" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "requiresGameUserId" BOOLEAN NOT NULL DEFAULT false,
    "requiresGameServerId" BOOLEAN NOT NULL DEFAULT false,
    "lastProviderSyncAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_product_active" ON "Product"("isActive", "displayOrder");
CREATE INDEX IF NOT EXISTS "idx_product_provider_offer" ON "Product"("providerOfferId");
CREATE INDEX IF NOT EXISTS "idx_product_category" ON "Product"("category");
