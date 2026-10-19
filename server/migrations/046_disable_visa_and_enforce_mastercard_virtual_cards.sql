-- Migration 046: Disable Visa Virtual Cards & Enforce Genuine Mastercard Products (USA & Canada)
-- 1. Updates GameCategory 'kiropro-card' to reflect Mastercard branding exclusively (removes Visa).
-- 2. Strictly disables Visa products (b0000000-0000-0000-0000-000000000002 & b0000000-0000-0000-0000-000000000003).
-- 3. Clarifies names and descriptions of active US Mastercard products.
-- 4. Ensures Canadian Mastercard product is registered with MASTERCARD network and CAD currency.

-- 1. Update GameCategory branding
UPDATE "GameCategory" SET
  "name" = 'Virtual Cards',
  "arabicName" = 'بطاقات KIROPRO الافتراضية (Mastercard)',
  "deliveryTime" = 'تخصيص فوري وتلقائي للبطاقة',
  "badge" = 'تسليم فوري',
  "platform" = 'cards',
  "isActive" = true,
  "updatedAt" = NOW()
WHERE id = 'kiropro-card';

-- 2. Strictly disable all Visa card products
UPDATE "Product" SET
  "isActive" = false,
  "inStock" = false,
  "updatedAt" = NOW()
WHERE id IN ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003')
   OR "card_network" = 'VISA';

-- 3. Update existing active US Mastercard products with clear country and network specification
UPDATE "Product" SET
  "productName" = 'KIROPRO USA Virtual Card — Mastercard (1 USD)',
  "offerName" = 'Mastercard USA - 1 USD Balance',
  "arabicName" = 'بطاقة KIROPRO أمريكا — Mastercard ($1.00 USD)',
  "description" = 'بطاقة ماستركارد أمريكية افتراضية مسبقة الدفع برصيد 1.00 دولار أمريكي (USD). تسليم فوري وتخصيص آمن للاستخدام المباشر في الخدمات الرقمية والتفعيل.',
  "card_network" = 'MASTERCARD',
  "card_currency" = 'USD',
  "face_value" = 1.00,
  "regionCode" = 'US',
  "regionName" = 'United States',
  "subCategory" = '1 USD',
  "displayOrder" = 1,
  "isActive" = true,
  "updatedAt" = NOW()
WHERE id = 'b0000000-0000-0000-0000-000000000001';

UPDATE "Product" SET
  "productName" = 'KIROPRO USA Virtual Card — Mastercard (2 USD)',
  "offerName" = 'Mastercard USA - 2 USD Balance',
  "arabicName" = 'بطاقة KIROPRO أمريكا — Mastercard ($2.00 USD)',
  "description" = 'بطاقة ماستركارد أمريكية افتراضية مسبقة الدفع برصيد 2.00 دولار أمريكي (USD). تسليم فوري وتخصيص آمن للاستخدام المباشر في الخدمات الرقمية والتفعيل.',
  "card_network" = 'MASTERCARD',
  "card_currency" = 'USD',
  "face_value" = 2.00,
  "regionCode" = 'US',
  "regionName" = 'United States',
  "subCategory" = '2 USD',
  "displayOrder" = 2,
  "isActive" = true,
  "updatedAt" = NOW()
WHERE id = 'b0000000-0000-0000-0000-000000000004';

UPDATE "Product" SET
  "productName" = 'KIROPRO USA Virtual Card — Mastercard (3 USD)',
  "offerName" = 'Mastercard USA - 3 USD Balance',
  "arabicName" = 'بطاقة KIROPRO أمريكا — Mastercard ($3.00 USD)',
  "description" = 'بطاقة ماستركارد أمريكية افتراضية مسبقة الدفع برصيد 3.00 دولار أمريكي (USD). تسليم فوري وتخصيص آمن للاستخدام المباشر في الخدمات الرقمية والتفعيل.',
  "card_network" = 'MASTERCARD',
  "card_currency" = 'USD',
  "face_value" = 3.00,
  "regionCode" = 'US',
  "regionName" = 'United States',
  "subCategory" = '3 USD',
  "displayOrder" = 3,
  "isActive" = true,
  "updatedAt" = NOW()
WHERE id = 'b0000000-0000-0000-0000-000000000005';

-- 4. Register Canadian Mastercard product (1 CAD)
INSERT INTO "Product" (
  "id", "provider", "providerOfferId", "productName", "offerName", "arabicName", "description",
  "category", "productType", "fulfillment_type", "customerPriceUsd", "defaultPartnerPriceUsd",
  "card_network", "card_currency", "face_value", "regionCode", "regionName", "subCategory",
  "isActive", "inStock", "displayOrder", "requiresGameUserId", "requiresGameServerId", "gameCategoryId"
) VALUES (
  'b0000000-0000-0000-0000-000000000006',
  'INTERNAL',
  990007,
  'KIROPRO Canada Virtual Card — Mastercard (1 CAD)',
  'Mastercard Canada - 1 CAD Balance',
  'بطاقة KIROPRO كندا — Mastercard (1.00 CAD)',
  'بطاقة ماستركارد كندية افتراضية مسبقة الدفع برصيد 1.00 دولار كندي (CAD). تسليم فوري وتخصيص آمن للاستخدام الرقمي والتفعيل.',
  'VIRTUAL_CARD',
  'VIRTUAL_CARD',
  'KIROPRO_CARD',
  2.00,
  1.20,
  'MASTERCARD',
  'CAD',
  1.00,
  'CA',
  'Canada',
  '1 CAD',
  true,
  false,
  4,
  false,
  false,
  'kiropro-card'
) ON CONFLICT ("id") DO UPDATE SET
  "card_network" = 'MASTERCARD',
  "card_currency" = 'CAD',
  "productName" = EXCLUDED."productName",
  "offerName" = EXCLUDED."offerName",
  "arabicName" = EXCLUDED."arabicName",
  "description" = EXCLUDED."description",
  "face_value" = 1.00,
  "regionCode" = 'CA',
  "regionName" = 'Canada',
  "subCategory" = '1 CAD',
  "gameCategoryId" = 'kiropro-card',
  "isActive" = true;
