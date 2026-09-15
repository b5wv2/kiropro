-- Migration 012: Transactional Emails Logging, Reviews & Rating System, and Secure Review Tokens

-- 1. Create email_events Table for Idempotent Transactional Email Delivery
CREATE TABLE IF NOT EXISTS "email_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "order_id" UUID REFERENCES "Order"("id") ON DELETE SET NULL,
    "topup_id" UUID REFERENCES "topup_requests"("id") ON DELETE SET NULL,
    "event_type" VARCHAR(50) NOT NULL, -- 'TOPUP_CREATED', 'TOPUP_APPROVED', 'TOPUP_REJECTED', 'ORDER_PROCESSING', 'ORDER_COMPLETED'
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED'
    "error_message" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP WITH TIME ZONE
);

-- Unique indexes to strictly enforce idempotency (never send duplicate email for the same event)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_events_unique_order" 
ON "email_events"("event_type", "order_id") 
WHERE "order_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_events_unique_topup" 
ON "email_events"("event_type", "topup_id") 
WHERE "topup_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_email_events_user_id" ON "email_events"("user_id");
CREATE INDEX IF NOT EXISTS "idx_email_events_created_at" ON "email_events"("created_at" DESC);

-- 2. Create review_tokens Table for Secure Random Tokenized Links (Order-Specific & General)
CREATE TABLE IF NOT EXISTS "review_tokens" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "token_hash" VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of the random 48-hex secret token
    "type" VARCHAR(30) NOT NULL DEFAULT 'ORDER_SPECIFIC', -- 'ORDER_SPECIFIC' or 'GENERAL'
    "order_id" UUID REFERENCES "Order"("id") ON DELETE SET NULL,
    "product_id" VARCHAR(100),
    "product_name" VARCHAR(255),
    "label" VARCHAR(255), -- Friendly admin label e.g., 'WhatsApp Link - Ahmed'
    "created_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "expires_at" TIMESTAMP WITH TIME ZONE,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_review_tokens_order_id" ON "review_tokens"("order_id");
CREATE INDEX IF NOT EXISTS "idx_review_tokens_is_active" ON "review_tokens"("is_active");
CREATE INDEX IF NOT EXISTS "idx_review_tokens_created_at" ON "review_tokens"("created_at" DESC);

-- 3. Create reviews Table
CREATE TABLE IF NOT EXISTS "reviews" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID REFERENCES "User"("id") ON DELETE SET NULL, -- NULL for Guest / Anonymous
    "order_id" UUID REFERENCES "Order"("id") ON DELETE SET NULL,
    "product_id" VARCHAR(100),
    "product_name" VARCHAR(255),
    "rating" INTEGER NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
    "comment" VARCHAR(1000),
    "reviewer_type" VARCHAR(20) NOT NULL DEFAULT 'AUTHENTICATED', -- 'AUTHENTICATED' or 'GUEST'
    "customer_name" VARCHAR(150) NOT NULL DEFAULT 'مستخدم مجهول', -- Public display name ('Ahmed' or 'مستخدم مجهول')
    "review_token_id" UUID REFERENCES "review_tokens"("id") ON DELETE SET NULL,
    "ip_hash" VARCHAR(64), -- Hashed IP for anti-spam abuse protection
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    "admin_note" TEXT,
    "moderated_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "moderated_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique index to prevent duplicate reviews per order for authenticated users
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviews_unique_user_order" 
ON "reviews"("user_id", "order_id") 
WHERE "user_id" IS NOT NULL AND "order_id" IS NOT NULL;

-- Unique index to ensure each order-specific token is only redeemed once in reviews
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviews_unique_order_review" 
ON "reviews"("order_id") 
WHERE "order_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_reviews_product_id" ON "reviews"("product_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_status" ON "reviews"("status");
CREATE INDEX IF NOT EXISTS "idx_reviews_user_id" ON "reviews"("user_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_created_at" ON "reviews"("created_at" DESC);
