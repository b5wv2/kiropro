-- Migration 032: KiroPro Card V2 Updates
-- 1. Ensure product price is strictly $2.00 and description accurately reflects $1.00 balance
UPDATE "Product" 
SET "customerPriceUsd" = 2.00,
    "description" = 'بطاقة ماستركارد افتراضية مسبقة الدفع برصيد 1.00 دولار للاستخدام المباشر في المتاجر والخدمات الرقمية المدعومة. سعر إصدار البطاقة 2.00 دولار مع تسليم فوري وتخصيص آمن برقم بطاقة فريد.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'b0000000-0000-0000-0000-000000000001' OR "productType" = 'VIRTUAL_CARD';

-- 2. Add columns to kiropro_card_vouchers for full lifecycle tracking
ALTER TABLE kiropro_card_vouchers 
ADD COLUMN IF NOT EXISTS value NUMERIC(10,2) NOT NULL DEFAULT 2.00,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN IF NOT EXISTS redeemed_order_id UUID REFERENCES "Order"(id) ON DELETE SET NULL;

-- 3. Update existing vouchers status based on boolean flags
UPDATE kiropro_card_vouchers
SET status = CASE 
  WHEN is_redeemed = true THEN 'REDEEMED'
  WHEN is_active = false THEN 'DISABLED'
  WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 'EXPIRED'
  ELSE 'AVAILABLE'
END;

-- 4. Create index for fast status and code lookups
CREATE INDEX IF NOT EXISTS idx_kiropro_vouchers_status ON kiropro_card_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_kiropro_vouchers_order ON kiropro_card_vouchers (redeemed_order_id);

-- 5. Upsert platform settings for KiroPro Card
INSERT INTO platform_settings (key, value, updated_at) 
VALUES (
  'kiropro_card_settings', 
  jsonb_build_object(
    'lowStockThreshold', 10,
    'defaultBalance', 1.00,
    'productPriceUsd', 2.00,
    'complianceNotice', 'هذه البطاقة مخصصة للاستخدام وفق شروط KiroPro Card. لا تشارك بيانات البطاقة مع أي شخص.'
  ),
  CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = CURRENT_TIMESTAMP;
