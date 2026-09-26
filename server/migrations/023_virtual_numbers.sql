-- Migration 023: Virtual Numbers (5SIM Integration, Strict Allowlist, Free Attempts, Safe Wallet Hold & Cancellation)

-- 1. Create virtual_number_settings table
CREATE TABLE IF NOT EXISTS "virtual_number_settings" (
    "id" INTEGER PRIMARY KEY DEFAULT 1,
    "free_attempts_limit" INTEGER NOT NULL DEFAULT 5,
    "default_paid_price_sdg" NUMERIC(12, 2) NOT NULL DEFAULT 800.00,
    "is_system_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row_vn_settings CHECK (id = 1)
);

-- Seed singleton settings row
INSERT INTO "virtual_number_settings" ("id", "free_attempts_limit", "default_paid_price_sdg", "is_system_active")
VALUES (1, 5, 800.00, true)
ON CONFLICT ("id") DO NOTHING;

-- 2. Create virtual_number_products table (Country + Service matrix with optional price override & active toggle)
CREATE TABLE IF NOT EXISTS "virtual_number_products" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "country_code" VARCHAR(30) NOT NULL,
    "country_name_ar" VARCHAR(100) NOT NULL,
    "service_code" VARCHAR(30) NOT NULL,
    "service_name_ar" VARCHAR(100) NOT NULL,
    "custom_price_sdg" NUMERIC(12, 2) DEFAULT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vn_country_service UNIQUE ("country_code", "service_code")
);

-- Seed the 8 strictly allowed countries x 6 strictly allowed services
-- Allowed Countries: usa, england, canada, indonesia, philippines, brazil, poland, spain
-- Allowed Services: google, whatsapp, facebook, instagram, twitter, paypal

INSERT INTO "virtual_number_products" ("country_code", "country_name_ar", "service_code", "service_name_ar", "display_order")
VALUES
  -- United States (أمريكا)
  ('usa', 'أمريكا (United States)', 'google', 'Google', 1),
  ('usa', 'أمريكا (United States)', 'whatsapp', 'WhatsApp', 2),
  ('usa', 'أمريكا (United States)', 'facebook', 'Facebook', 3),
  ('usa', 'أمريكا (United States)', 'instagram', 'Instagram', 4),
  ('usa', 'أمريكا (United States)', 'twitter', 'Twitter (X)', 5),
  ('usa', 'أمريكا (United States)', 'paypal', 'PayPal', 6),

  -- United Kingdom (بريطانيا) - mapped to england in 5SIM
  ('england', 'بريطانيا (United Kingdom)', 'google', 'Google', 10),
  ('england', 'بريطانيا (United Kingdom)', 'whatsapp', 'WhatsApp', 11),
  ('england', 'بريطانيا (United Kingdom)', 'facebook', 'Facebook', 12),
  ('england', 'بريطانيا (United Kingdom)', 'instagram', 'Instagram', 13),
  ('england', 'بريطانيا (United Kingdom)', 'twitter', 'Twitter (X)', 14),
  ('england', 'بريطانيا (United Kingdom)', 'paypal', 'PayPal', 15),

  -- Canada (كندا)
  ('canada', 'كندا (Canada)', 'google', 'Google', 20),
  ('canada', 'كندا (Canada)', 'whatsapp', 'WhatsApp', 21),
  ('canada', 'كندا (Canada)', 'facebook', 'Facebook', 22),
  ('canada', 'كندا (Canada)', 'instagram', 'Instagram', 23),
  ('canada', 'كندا (Canada)', 'twitter', 'Twitter (X)', 24),
  ('canada', 'كندا (Canada)', 'paypal', 'PayPal', 25),

  -- Indonesia (إندونيسيا)
  ('indonesia', 'إندونيسيا (Indonesia)', 'google', 'Google', 30),
  ('indonesia', 'إندونيسيا (Indonesia)', 'whatsapp', 'WhatsApp', 31),
  ('indonesia', 'إندونيسيا (Indonesia)', 'facebook', 'Facebook', 32),
  ('indonesia', 'إندونيسيا (Indonesia)', 'instagram', 'Instagram', 33),
  ('indonesia', 'إندونيسيا (Indonesia)', 'twitter', 'Twitter (X)', 34),
  ('indonesia', 'إندونيسيا (Indonesia)', 'paypal', 'PayPal', 35),

  -- Philippines (الفلبين)
  ('philippines', 'الفلبين (Philippines)', 'google', 'Google', 40),
  ('philippines', 'الفلبين (Philippines)', 'whatsapp', 'WhatsApp', 41),
  ('philippines', 'الفلبين (Philippines)', 'facebook', 'Facebook', 42),
  ('philippines', 'الفلبين (Philippines)', 'instagram', 'Instagram', 43),
  ('philippines', 'الفلبين (Philippines)', 'twitter', 'Twitter (X)', 44),
  ('philippines', 'الفلبين (Philippines)', 'paypal', 'PayPal', 45),

  -- Brazil (البرازيل)
  ('brazil', 'البرازيل (Brazil)', 'google', 'Google', 50),
  ('brazil', 'البرازيل (Brazil)', 'whatsapp', 'WhatsApp', 51),
  ('brazil', 'البرازيل (Brazil)', 'facebook', 'Facebook', 52),
  ('brazil', 'البرازيل (Brazil)', 'instagram', 'Instagram', 53),
  ('brazil', 'البرازيل (Brazil)', 'twitter', 'Twitter (X)', 54),
  ('brazil', 'البرازيل (Brazil)', 'paypal', 'PayPal', 55),

  -- Poland (بولندا)
  ('poland', 'بولندا (Poland)', 'google', 'Google', 60),
  ('poland', 'بولندا (Poland)', 'whatsapp', 'WhatsApp', 61),
  ('poland', 'بولندا (Poland)', 'facebook', 'Facebook', 62),
  ('poland', 'بولندا (Poland)', 'instagram', 'Instagram', 63),
  ('poland', 'بولندا (Poland)', 'twitter', 'Twitter (X)', 64),
  ('poland', 'بولندا (Poland)', 'paypal', 'PayPal', 65),

  -- Spain (إسبانيا)
  ('spain', 'إسبانيا (Spain)', 'google', 'Google', 70),
  ('spain', 'إسبانيا (Spain)', 'whatsapp', 'WhatsApp', 71),
  ('spain', 'إسبانيا (Spain)', 'facebook', 'Facebook', 72),
  ('spain', 'إسبانيا (Spain)', 'instagram', 'Instagram', 73),
  ('spain', 'إسبانيا (Spain)', 'twitter', 'Twitter (X)', 74),
  ('spain', 'إسبانيا (Spain)', 'paypal', 'PayPal', 75)
ON CONFLICT ("country_code", "service_code") DO NOTHING;

-- 3. Create virtual_number_orders table
CREATE TABLE IF NOT EXISTS "virtual_number_orders" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "country_code" VARCHAR(30) NOT NULL,
    "country_name_ar" VARCHAR(100) NOT NULL,
    "service_code" VARCHAR(30) NOT NULL,
    "service_name_ar" VARCHAR(100) NOT NULL,
    "provider_order_id" VARCHAR(100),
    "phone_number" VARCHAR(50),
    "operator" VARCHAR(50) DEFAULT 'any',
    "sms_code" VARCHAR(50),
    "sms_text" TEXT,
    "sms_received_at" TIMESTAMP WITH TIME ZONE,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "is_free_attempt" BOOLEAN NOT NULL DEFAULT false,
    "charged_amount" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "charged_currency" VARCHAR(10) NOT NULL DEFAULT 'SDG',
    "is_refunded" BOOLEAN NOT NULL DEFAULT false,
    "refund_amount" NUMERIC(12, 2) DEFAULT 0.00,
    "refund_tx_id" VARCHAR(100),
    "failure_reason" TEXT,
    "expires_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance and quick lookups
CREATE INDEX IF NOT EXISTS "idx_vn_orders_user_id" ON "virtual_number_orders"("user_id");
CREATE INDEX IF NOT EXISTS "idx_vn_orders_status" ON "virtual_number_orders"("status");
CREATE INDEX IF NOT EXISTS "idx_vn_orders_provider_order_id" ON "virtual_number_orders"("provider_order_id");
CREATE INDEX IF NOT EXISTS "idx_vn_orders_created_at" ON "virtual_number_orders"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_vn_orders_active_polling" ON "virtual_number_orders"("status") WHERE "status" IN ('PENDING', 'WAITING_FOR_NUMBER', 'WAITING_FOR_CODE');
