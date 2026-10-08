-- Migration 039: Account Marketplace (سوق الحسابات)
-- Supports PUBG Mobile & Free Fire accounts with paid listing fees, strict review lifecycle, and privacy.

CREATE TABLE IF NOT EXISTS account_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_code VARCHAR(32) NOT NULL UNIQUE,
    slug VARCHAR(64) NOT NULL UNIQUE,
    seller_user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
    game VARCHAR(32) NOT NULL CHECK (game IN ('PUBG_MOBILE', 'FREE_FIRE')),
    title VARCHAR(255) NOT NULL,
    price NUMERIC(14, 2) NOT NULL CHECK (price > 0),
    price_currency VARCHAR(10) NOT NULL DEFAULT 'SDG',
    is_negotiable BOOLEAN NOT NULL DEFAULT false,
    account_level VARCHAR(32) NOT NULL CHECK (account_level IN ('1-20', '21-40', '41-60', '61-80', '81-100', '100+')),
    binding_type VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    notes TEXT,
    seller_whatsapp VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'SOLD', 'CANCELLED', 'REFUNDED')),
    duration_days INTEGER NOT NULL CHECK (duration_days IN (15, 30)),
    listing_fee NUMERIC(14, 2) NOT NULL,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason VARCHAR(100),
    rejection_notes TEXT,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason VARCHAR(100),
    cancellation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES account_listings(id) ON DELETE CASCADE,
    image_url VARCHAR(512) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_listing_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES account_listings(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
    wallet_id UUID NOT NULL REFERENCES "Wallet"(id) ON DELETE RESTRICT,
    wallet_transaction_id UUID REFERENCES "WalletTransaction"(id) ON DELETE SET NULL,
    duration_days INTEGER NOT NULL CHECK (duration_days IN (15, 30)),
    amount NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'SDG',
    payment_method VARCHAR(32) NOT NULL DEFAULT 'WALLET',
    status VARCHAR(32) NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'FAILED', 'REFUNDED')),
    payment_type VARCHAR(32) NOT NULL DEFAULT 'NEW_LISTING' CHECK (payment_type IN ('NEW_LISTING', 'RENEWAL')),
    is_consumed BOOLEAN NOT NULL DEFAULT false,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    refunded_at TIMESTAMPTZ,
    refund_amount NUMERIC(14, 2),
    refund_reason VARCHAR(255),
    refunded_by_admin_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_listing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES account_listings(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
    actor_type VARCHAR(32) NOT NULL DEFAULT 'SYSTEM' CHECK (actor_type IN ('SYSTEM', 'USER', 'ADMIN')),
    event_type VARCHAR(50) NOT NULL,
    old_status VARCHAR(32),
    new_status VARCHAR(32),
    metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & query optimization
CREATE INDEX IF NOT EXISTS idx_account_listings_game_status ON account_listings(game, status);
CREATE INDEX IF NOT EXISTS idx_account_listings_status_expires ON account_listings(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_account_listings_seller ON account_listings(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_account_listings_price ON account_listings(price);
CREATE INDEX IF NOT EXISTS idx_account_listings_created_at ON account_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_listing_images_listing ON account_listing_images(listing_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_account_listing_payments_user ON account_listing_payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_account_listing_events_listing ON account_listing_events(listing_id, created_at DESC);

-- Seed default configurable marketplace settings in platform_settings
INSERT INTO "platform_settings" (key, value, updated_at)
VALUES (
    'account_marketplace_settings',
    '{"fee_15_days": 1500, "fee_30_days": 2500, "currency": "SDG", "max_images": 10, "max_image_size_mb": 10, "enabled": true}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;
