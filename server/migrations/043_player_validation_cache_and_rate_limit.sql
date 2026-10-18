-- Migration 043: Player Validation Cache, Persistent Rate Limiting, and Webhook Deduplication
-- Additive and non-destructive for PostgreSQL

-- 1. Player Validation Cache Table
CREATE TABLE IF NOT EXISTS "player_validation_cache" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "game_key" VARCHAR(50) NOT NULL,
    "player_id_normalized" VARCHAR(100) NOT NULL,
    "server_id" VARCHAR(100) NOT NULL DEFAULT '',
    "provider" VARCHAR(50) NOT NULL,
    "player_name" VARCHAR(255) NOT NULL,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "raw_response" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "uq_player_validation_cache" UNIQUE ("game_key", "player_id_normalized", "server_id")
);

CREATE INDEX IF NOT EXISTS "idx_pvc_lookup" 
ON "player_validation_cache" ("game_key", "player_id_normalized", "server_id", "expires_at");

-- 2. Persistent Atomic Rate Limiting Table (5 checks per hour per user / player ID / IP)
CREATE TABLE IF NOT EXISTS "player_validation_rate_limits" (
    "rate_key" VARCHAR(200) PRIMARY KEY,
    "window_start" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_pvrl_window" 
ON "player_validation_rate_limits" ("window_start");

-- 3. Webhook Events Table for Deduplication and Audit
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "event_id" VARCHAR(200) PRIMARY KEY,
    "provider" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "order_id" UUID,
    "provider_order_id" VARCHAR(100),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMPTZ,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_webhook_events_provider_order" 
ON "webhook_events" ("provider", "provider_order_id");
