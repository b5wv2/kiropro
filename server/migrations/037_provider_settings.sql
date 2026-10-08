-- Migration 037: Global Provider Settings & Order Receiving Controls
-- Non-destructive & persistent provider configuration in PostgreSQL

CREATE TABLE IF NOT EXISTS "provider_settings" (
    "provider" VARCHAR(50) PRIMARY KEY,
    "orders_enabled" BOOLEAN NOT NULL DEFAULT false,
    "catalog_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "health_check_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID REFERENCES "User"("id") ON DELETE SET NULL
);

-- Seed default settings: GamesDrop enabled for orders, G2Bulk disabled for orders
INSERT INTO "provider_settings" ("provider", "orders_enabled", "catalog_sync_enabled", "health_check_enabled")
VALUES 
    ('GAMESDROP', true, true, true),
    ('G2BULK', false, true, true)
ON CONFLICT ("provider") DO NOTHING;
