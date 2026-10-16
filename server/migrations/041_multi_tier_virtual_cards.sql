-- Migration 041: Multi-Tier Virtual Cards (Visa Canada & Mastercard USD)
-- Non-destructive extension of kiropro_cards_inventory and Product tables

-- 1. Extend kiropro_cards_inventory with explicit card_network and currency
ALTER TABLE kiropro_cards_inventory 
  ADD COLUMN IF NOT EXISTS card_network VARCHAR(20) NOT NULL DEFAULT 'MASTERCARD',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_kiropro_cards_prod_status 
  ON kiropro_cards_inventory (product_id, status);

CREATE INDEX IF NOT EXISTS idx_kiropro_cards_network_cur 
  ON kiropro_cards_inventory (card_network, currency, status);

-- 2. Extend Product with card metadata columns
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS card_network VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_currency VARCHAR(10) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS face_value NUMERIC(10, 2) DEFAULT NULL;

-- 3. Update existing KiroPro Virtual Mastercard product (1 USD)
UPDATE "Product" SET
  card_network = 'MASTERCARD',
  card_currency = 'USD',
  face_value = 1.00,
  "regionCode" = 'US',
  "regionName" = 'United States',
  "subCategory" = '1 USD',
  "displayOrder" = 1
WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- 4. Ensure GameCategory kiropro-card supports multi-tier cards
INSERT INTO "GameCategory" (
  "id", "name", "arabicName", "imageUrl", "platform", "badge", "deliveryTime", "idFieldLabel", "idPlaceholder", "displayOrder", "isActive"
) VALUES (
  'kiropro-card',
  'Virtual Cards',
  'البطاقات الافتراضية (Visa & Mastercard)',
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
  "platform" = 'cards',
  "deliveryTime" = EXCLUDED."deliveryTime",
  "isActive" = true;

-- 5. Insert Visa Canada 1 CAD
INSERT INTO "Product" (
  "id", "provider", "providerOfferId", "productName", "offerName", "arabicName", "description",
  "category", "productType", "fulfillment_type", "customerPriceUsd", "defaultPartnerPriceUsd",
  "card_network", "card_currency", "face_value", "regionCode", "regionName", "subCategory",
  "isActive", "inStock", "displayOrder", "requiresGameUserId", "requiresGameServerId", "gameCategoryId"
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'INTERNAL',
  990003,
  'Visa Canada Virtual Card - 1 CAD',
  'Visa Canada - 1 CAD Balance',
  'بطاقة فيزا كندا الافتراضية (1 CAD)',
  'بطاقة فيزا كندا افتراضية مسبقة الدفع برصيد 1.00 دولار كندي (CAD). تسليم فوري وتخصيص آمن برقم بطاقة فريد للاستخدام الرقمي.',
  'VIRTUAL_CARD',
  'VIRTUAL_CARD',
  'KIROPRO_CARD',
  2.00,
  1.20,
  'VISA',
  'CAD',
  1.00,
  'CA',
  'Canada',
  '1 CAD',
  true,
  false,
  2,
  false,
  false,
  'kiropro-card'
) ON CONFLICT ("id") DO UPDATE SET
  "card_network" = 'VISA',
  "card_currency" = 'CAD',
  "face_value" = 1.00,
  "regionCode" = 'CA',
  "regionName" = 'Canada',
  "subCategory" = '1 CAD',
  "gameCategoryId" = 'kiropro-card';

-- 6. Insert Visa Canada 2 CAD
INSERT INTO "Product" (
  "id", "provider", "providerOfferId", "productName", "offerName", "arabicName", "description",
  "category", "productType", "fulfillment_type", "customerPriceUsd", "defaultPartnerPriceUsd",
  "card_network", "card_currency", "face_value", "regionCode", "regionName", "subCategory",
  "isActive", "inStock", "displayOrder", "requiresGameUserId", "requiresGameServerId", "gameCategoryId"
) VALUES (
  'b0000000-0000-0000-0000-000000000003',
  'INTERNAL',
  990004,
  'Visa Canada Virtual Card - 2 CAD',
  'Visa Canada - 2 CAD Balance',
  'بطاقة فيزا كندا الافتراضية (2 CAD)',
  'بطاقة فيزا كندا افتراضية مسبقة الدفع برصيد 2.00 دولار كندي (CAD). تسليم فوري وتخصيص آمن برقم بطاقة فريد للاستخدام الرقمي.',
  'VIRTUAL_CARD',
  'VIRTUAL_CARD',
  'KIROPRO_CARD',
  3.00,
  2.20,
  'VISA',
  'CAD',
  2.00,
  'CA',
  'Canada',
  '2 CAD',
  true,
  false,
  3,
  false,
  false,
  'kiropro-card'
) ON CONFLICT ("id") DO UPDATE SET
  "card_network" = 'VISA',
  "card_currency" = 'CAD',
  "face_value" = 2.00,
  "regionCode" = 'CA',
  "regionName" = 'Canada',
  "subCategory" = '2 CAD',
  "gameCategoryId" = 'kiropro-card';

-- 7. Insert Mastercard USD 2 USD
INSERT INTO "Product" (
  "id", "provider", "providerOfferId", "productName", "offerName", "arabicName", "description",
  "category", "productType", "fulfillment_type", "customerPriceUsd", "defaultPartnerPriceUsd",
  "card_network", "card_currency", "face_value", "regionCode", "regionName", "subCategory",
  "isActive", "inStock", "displayOrder", "requiresGameUserId", "requiresGameServerId", "gameCategoryId"
) VALUES (
  'b0000000-0000-0000-0000-000000000004',
  'INTERNAL',
  990005,
  'KiroPro Virtual Mastercard - 2 USD',
  'Mastercard USD - 2 USD Balance',
  'بطاقة ماستركارد USD (2.00$)',
  'بطاقة ماستركارد افتراضية مسبقة الدفع برصيد 2.00 دولار أمريكي (USD). تسليم فوري وتخصيص آمن للاستخدام المباشر في الخدمات الرقمية.',
  'VIRTUAL_CARD',
  'VIRTUAL_CARD',
  'KIROPRO_CARD',
  3.00,
  2.13,
  'MASTERCARD',
  'USD',
  2.00,
  'US',
  'United States',
  '2 USD',
  true,
  false,
  4,
  false,
  false,
  'kiropro-card'
) ON CONFLICT ("id") DO UPDATE SET
  "card_network" = 'MASTERCARD',
  "card_currency" = 'USD',
  "face_value" = 2.00,
  "regionCode" = 'US',
  "regionName" = 'United States',
  "subCategory" = '2 USD',
  "gameCategoryId" = 'kiropro-card';

-- 8. Insert Mastercard USD 3 USD
INSERT INTO "Product" (
  "id", "provider", "providerOfferId", "productName", "offerName", "arabicName", "description",
  "category", "productType", "fulfillment_type", "customerPriceUsd", "defaultPartnerPriceUsd",
  "card_network", "card_currency", "face_value", "regionCode", "regionName", "subCategory",
  "isActive", "inStock", "displayOrder", "requiresGameUserId", "requiresGameServerId", "gameCategoryId"
) VALUES (
  'b0000000-0000-0000-0000-000000000005',
  'INTERNAL',
  990006,
  'KiroPro Virtual Mastercard - 3 USD',
  'Mastercard USD - 3 USD Balance',
  'بطاقة ماستركارد USD (3.00$)',
  'بطاقة ماستركارد افتراضية مسبقة الدفع برصيد 3.00 دولار أمريكي (USD). تسليم فوري وتخصيص آمن للاستخدام المباشر في الخدمات الرقمية.',
  'VIRTUAL_CARD',
  'VIRTUAL_CARD',
  'KIROPRO_CARD',
  4.00,
  3.13,
  'MASTERCARD',
  'USD',
  3.00,
  'US',
  'United States',
  '3 USD',
  true,
  false,
  5,
  false,
  false,
  'kiropro-card'
) ON CONFLICT ("id") DO UPDATE SET
  "card_network" = 'MASTERCARD',
  "card_currency" = 'USD',
  "face_value" = 3.00,
  "regionCode" = 'US',
  "regionName" = 'United States',
  "subCategory" = '3 USD',
  "gameCategoryId" = 'kiropro-card';
