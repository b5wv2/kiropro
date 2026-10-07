-- Migration 034: Partner KiroPro Card Integration & Idempotency Key

-- 1. Add idempotency_key to partner_orders with unique constraint per partner
ALTER TABLE partner_orders 
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_orders_idempotency 
ON partner_orders(partner_id, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 2. Update default partner price for KiroPro Virtual Mastercard in Product table
UPDATE "Product" 
SET "defaultPartnerPriceUsd" = 1.13 
WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- 3. Insert or update default partner price setting in partner_pricing_settings
INSERT INTO partner_pricing_settings (key, value, description, updated_at)
VALUES (
  'kiropro_card_default_partner_price_usd',
  '1.1300',
  'السعر الافتراضي لبطاقة KiroPro Card للشركاء بالدولار',
  CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value,
    updated_at = CURRENT_TIMESTAMP;

-- 4. Allow non-provider orders in partner_orders and link to kiropro_cards_inventory
ALTER TABLE partner_orders ALTER COLUMN provider_offer_id DROP NOT NULL;
ALTER TABLE partner_orders ALTER COLUMN game_id DROP NOT NULL;
ALTER TABLE partner_orders ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE kiropro_cards_inventory 
ADD COLUMN IF NOT EXISTS partner_order_id UUID REFERENCES partner_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kiropro_cards_partner_order 
ON kiropro_cards_inventory(partner_order_id);
