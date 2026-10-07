-- Migration 031: KiroPro Card System (Inventory, Row-Level Locking, Vouchers & Product Integration)

-- 1. Create kiropro_cards_inventory table
CREATE TABLE IF NOT EXISTS kiropro_cards_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
    card_number_encrypted TEXT NOT NULL,
    card_last4 VARCHAR(4) NOT NULL,
    exp_date VARCHAR(10) NOT NULL,
    cvv_encrypted TEXT NOT NULL,
    balance NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (balance >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'CLAIMED', 'DISABLED')),
    order_id UUID REFERENCES "Order"(id) ON DELETE SET NULL,
    assigned_to_user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE,
    claimed_by_voucher_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indexes for Zero Race Condition (SELECT ... FOR UPDATE SKIP LOCKED)
CREATE INDEX IF NOT EXISTS idx_kiropro_cards_avail 
ON kiropro_cards_inventory (product_id, status, created_at) 
WHERE status = 'AVAILABLE';

CREATE INDEX IF NOT EXISTS idx_kiropro_cards_order 
ON kiropro_cards_inventory (order_id);

CREATE INDEX IF NOT EXISTS idx_kiropro_cards_user 
ON kiropro_cards_inventory (assigned_to_user_id);

CREATE INDEX IF NOT EXISTS idx_kiropro_cards_last4 
ON kiropro_cards_inventory (card_last4);

-- 3. Create kiropro_card_vouchers table
CREATE TABLE IF NOT EXISTS kiropro_card_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
    card_id UUID REFERENCES kiropro_cards_inventory(id) ON DELETE SET NULL,
    is_redeemed BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    redeemed_by_user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    created_by_admin_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_kiropro_vouchers_code 
ON kiropro_card_vouchers (UPPER(code));

-- 4. Trigger for updated_at on cards inventory
DROP TRIGGER IF EXISTS trg_kiropro_cards_modtime ON kiropro_cards_inventory;

CREATE TRIGGER trg_kiropro_cards_modtime 
BEFORE UPDATE ON kiropro_cards_inventory 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_snake();

-- 5. Seed Category for KiroPro Card in GameCategory
INSERT INTO "GameCategory" (
  "id", "name", "arabicName", "imageUrl", "platform", "badge", "deliveryTime", "idFieldLabel", "idPlaceholder", "displayOrder", "isActive"
) VALUES (
  'kiropro-card',
  'KiroPro Card',
  'بطاقة كيرو برو | KiroPro Card',
  'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
  'cards',
  'تسليم فوري',
  'تخصيص فوري وتلقائي للبطاقة',
  'البريد الإلكتروني للاستلام',
  'التسليم تلقائي ومباشر داخل حسابك',
  5,
  true
) ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "arabicName" = EXCLUDED."arabicName",
  "deliveryTime" = EXCLUDED."deliveryTime",
  "isActive" = true;

-- 6. Seed Product for KiroPro Card in Product Catalog
INSERT INTO "Product" (
  "id",
  "provider",
  "providerOfferId",
  "productName",
  "offerName",
  "arabicName",
  "description",
  "category",
  "productType",
  "customerPriceUsd",
  "isActive",
  "inStock",
  "displayOrder",
  "requiresGameUserId",
  "requiresGameServerId",
  "gameCategoryId"
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'INTERNAL',
  990002,
  'KiroPro Virtual Mastercard',
  'KiroPro Card - $1.00 Balance',
  'بطاقة كيرو برو الافتراضية ($1.00)',
  'بطاقة ماستركارد افتراضية مسبقة الدفع برصيد 1.00 دولار للاستخدام المباشر في المتاجر والخدمات الرقمية المدعومة. تسليم فوري وتخصيص آمن برقم بطاقة فريد.',
  'VIRTUAL_CARD',
  'VIRTUAL_CARD',
  1.25,
  true,
  true,
  1,
  false,
  false,
  'kiropro-card'
) ON CONFLICT ("id") DO UPDATE SET
  "arabicName" = EXCLUDED."arabicName",
  "productType" = 'VIRTUAL_CARD',
  "category" = 'VIRTUAL_CARD',
  "gameCategoryId" = 'kiropro-card',
  "isActive" = true;
