-- Migration 050: Update KiroPro Mastercard Product Name, Price, and Currency
-- Target Product ID: 'b0000000-0000-0000-0000-000000000006'
-- New Name: بطاقة ماستركارد KiroPro / KiroPro Mastercard Virtual Card
-- New Price: 0.70 USD
-- Currency: USD

UPDATE "Product"
SET 
  "arabicName" = 'بطاقة ماستركارد KiroPro',
  "productName" = 'KiroPro Mastercard Virtual Card',
  "offerName" = 'Mastercard KiroPro',
  "description" = 'بطاقة ماستركارد KiroPro افتراضية مسبقة الدفع للتسوق والمدفوعات الإلكترونية الدولية بأمان وتسليم فوري.',
  "customerPriceUsd" = 0.70,
  "defaultPartnerPriceUsd" = 0.70,
  "card_currency" = 'USD',
  "card_network" = 'MASTERCARD',
  "regionCode" = 'GLOBAL',
  "regionName" = 'Global',
  "subCategory" = 'KiroPro Card',
  "updatedAt" = NOW()
WHERE id = 'b0000000-0000-0000-0000-000000000006';

-- Update any existing inventory cards linked to this product to ensure USD currency
UPDATE kiropro_cards_inventory
SET currency = 'USD', updated_at = NOW()
WHERE product_id = 'b0000000-0000-0000-0000-000000000006' AND currency = 'CAD';
