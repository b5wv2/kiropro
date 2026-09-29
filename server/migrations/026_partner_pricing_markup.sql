-- Migration 026: Partner Pricing Markup Settings and Snapshots

CREATE TABLE IF NOT EXISTS "partner_pricing_settings" (
  "key" VARCHAR(50) PRIMARY KEY,
  "value" NUMERIC(10, 4) NOT NULL,
  "description" TEXT,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "partner_pricing_settings" ("key", "value", "description")
VALUES 
  ('default_markup_usd', 0.0300, 'الهامش الافتراضي بالدولار لأسعار الشركاء فوق تكلفة المورد'),
  ('min_markup_usd', 0.0100, 'الحد الأدنى للهامش بالدولار'),
  ('max_markup_usd', 0.0500, 'الحد الأقصى للهامش بالدولار')
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "partner_orders" 
ADD COLUMN IF NOT EXISTS "markup_usd" NUMERIC(10, 4) DEFAULT 0.0300;

ALTER TABLE "partner_product_pricing" 
ADD COLUMN IF NOT EXISTS "markup_usd" NUMERIC(10, 4);
