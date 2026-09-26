-- Migration 024: Virtual Number Providers, Offers, and Order Snapshot
-- Implements explicit Provider selection, distinct offer pricing, and full order snapshot

-- 1. Create virtual_number_offers table
CREATE TABLE IF NOT EXISTS virtual_number_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(50) NOT NULL,
    service_code VARCHAR(50) NOT NULL,
    provider_id VARCHAR(100) NOT NULL, -- e.g. 'virtual60', 'vodafone', 'tmobile'
    provider_name VARCHAR(150) NOT NULL, -- e.g. 'Virtual 60', 'Vodafone UK'
    supplier_cost NUMERIC(12, 2) NOT NULL DEFAULT 1.50,
    supplier_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    customer_price_sdg NUMERIC(12, 2) NOT NULL DEFAULT 2500.00,
    delivery_rate NUMERIC(5, 2) DEFAULT 98.50,
    eta_text VARCHAR(255) DEFAULT 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_offer_country_service_provider UNIQUE (country_code, service_code, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_vno_country_service ON virtual_number_offers (country_code, service_code, is_active);

-- 2. Add Snapshot and Provider fields to virtual_number_orders if not exists
ALTER TABLE virtual_number_orders 
    ADD COLUMN IF NOT EXISTS provider_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS provider_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS offer_id UUID,
    ADD COLUMN IF NOT EXISTS supplier_cost NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS supplier_currency VARCHAR(10) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS customer_price NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS promotion_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- 3. Seed initial curated Provider Offers for each of the 8 countries and 6 services
-- Providing 2-3 distinct providers with different prices for every allowed combination
INSERT INTO virtual_number_offers (
    country_code, service_code, provider_id, provider_name, supplier_cost, supplier_currency, customer_price_sdg, delivery_rate, eta_text, is_active, display_order
) VALUES
    -- USA (3 providers per service)
    ('usa', 'whatsapp', 'virtual60', 'Virtual 60 Direct (الولايات المتحدة)', 1.20, 'USD', 2500.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('usa', 'whatsapp', 'tmobile', 'T-Mobile USA Premium', 1.80, 'USD', 3500.00, 99.80, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('usa', 'whatsapp', 'virtual52', 'Virtual 52 FastRoute', 1.50, 'USD', 3000.00, 97.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('usa', 'google', 'virtual60', 'Virtual 60 Direct (الولايات المتحدة)', 0.90, 'USD', 2000.00, 99.10, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('usa', 'google', 'att', 'AT&T USA Carrier', 1.60, 'USD', 3200.00, 99.70, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('usa', 'facebook', 'virtual60', 'Virtual 60 Direct', 0.80, 'USD', 1800.00, 98.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('usa', 'facebook', 'verizon', 'Verizon USA FastLine', 1.50, 'USD', 2900.00, 99.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('usa', 'instagram', 'virtual60', 'Virtual 60 Direct', 1.00, 'USD', 2200.00, 98.80, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('usa', 'instagram', 'tmobile', 'T-Mobile USA Premium', 1.70, 'USD', 3300.00, 99.40, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('usa', 'twitter', 'virtual60', 'Virtual 60 Direct', 0.90, 'USD', 2000.00, 98.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('usa', 'twitter', 'att', 'AT&T Carrier', 1.50, 'USD', 3000.00, 99.10, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('usa', 'paypal', 'tmobile', 'T-Mobile Verified Security', 2.50, 'USD', 4800.00, 99.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('usa', 'paypal', 'verizon', 'Verizon Business Line', 2.80, 'USD', 5200.00, 99.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    -- UK / England
    ('england', 'whatsapp', 'vodafone', 'Vodafone UK Premium', 1.80, 'USD', 3600.00, 99.80, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('england', 'whatsapp', 'virtual60', 'Virtual 60 UK Line', 1.30, 'USD', 2700.00, 98.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('england', 'whatsapp', 'ee', 'EE Telecom UK Direct', 2.00, 'USD', 3900.00, 99.60, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('england', 'google', 'vodafone', 'Vodafone UK', 1.20, 'USD', 2400.00, 99.40, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('england', 'google', 'ee', 'EE UK FastRoute', 1.50, 'USD', 2900.00, 99.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('england', 'facebook', 'vodafone', 'Vodafone UK', 1.10, 'USD', 2200.00, 99.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('england', 'facebook', 'virtual60', 'Virtual 60 UK', 0.90, 'USD', 1900.00, 98.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('england', 'instagram', 'vodafone', 'Vodafone UK', 1.30, 'USD', 2600.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('england', 'instagram', 'ee', 'EE UK Mobile', 1.70, 'USD', 3200.00, 99.60, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('england', 'twitter', 'vodafone', 'Vodafone UK', 1.10, 'USD', 2200.00, 98.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('england', 'twitter', 'virtual60', 'Virtual 60 UK', 0.90, 'USD', 1800.00, 98.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('england', 'paypal', 'vodafone', 'Vodafone UK Secure', 2.40, 'USD', 4600.00, 99.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('england', 'paypal', 'ee', 'EE UK High Security', 2.70, 'USD', 5100.00, 99.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    -- Canada
    ('canada', 'whatsapp', 'bell', 'Bell Canada Direct', 1.90, 'USD', 3800.00, 99.70, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('canada', 'whatsapp', 'rogers', 'Rogers Canada FastLine', 1.80, 'USD', 3600.00, 99.60, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('canada', 'whatsapp', 'virtual60', 'Virtual 60 Canada', 1.20, 'USD', 2500.00, 98.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('canada', 'google', 'bell', 'Bell Canada', 1.20, 'USD', 2400.00, 99.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('canada', 'google', 'virtual60', 'Virtual 60 Canada', 0.90, 'USD', 1900.00, 98.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('canada', 'facebook', 'rogers', 'Rogers Canada', 1.10, 'USD', 2200.00, 99.10, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('canada', 'instagram', 'bell', 'Bell Canada', 1.30, 'USD', 2600.00, 99.30, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('canada', 'twitter', 'virtual60', 'Virtual 60 Canada', 0.90, 'USD', 1800.00, 98.40, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('canada', 'paypal', 'bell', 'Bell Canada Secure', 2.50, 'USD', 4800.00, 99.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),

    -- Indonesia
    ('indonesia', 'whatsapp', 'telkomsel', 'Telkomsel Indonesia Primary', 0.90, 'USD', 1900.00, 99.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('indonesia', 'whatsapp', 'indosat', 'Indosat Ooredoo', 0.75, 'USD', 1600.00, 98.70, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('indonesia', 'whatsapp', 'axis', 'Axis XL Indonesia', 0.65, 'USD', 1400.00, 97.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('indonesia', 'google', 'telkomsel', 'Telkomsel Indonesia', 0.60, 'USD', 1300.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('indonesia', 'google', 'axis', 'Axis Indonesia', 0.50, 'USD', 1100.00, 98.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),

    ('indonesia', 'facebook', 'indosat', 'Indosat Indonesia', 0.55, 'USD', 1200.00, 98.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('indonesia', 'instagram', 'telkomsel', 'Telkomsel Indonesia', 0.70, 'USD', 1500.00, 99.10, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('indonesia', 'twitter', 'axis', 'Axis Indonesia', 0.50, 'USD', 1100.00, 97.80, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('indonesia', 'paypal', 'telkomsel', 'Telkomsel High Reliability', 1.80, 'USD', 3500.00, 99.80, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),

    -- Philippines
    ('philippines', 'whatsapp', 'globe', 'Globe Telecom Philippines', 0.85, 'USD', 1800.00, 99.40, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('philippines', 'whatsapp', 'smart', 'Smart Communications Direct', 0.80, 'USD', 1700.00, 99.10, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('philippines', 'whatsapp', 'dito', 'Dito Telecommunity', 0.65, 'USD', 1400.00, 97.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('philippines', 'google', 'globe', 'Globe Philippines', 0.60, 'USD', 1300.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('philippines', 'facebook', 'smart', 'Smart Philippines', 0.55, 'USD', 1200.00, 98.80, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('philippines', 'instagram', 'globe', 'Globe Philippines', 0.70, 'USD', 1500.00, 99.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('philippines', 'twitter', 'smart', 'Smart Philippines', 0.55, 'USD', 1200.00, 98.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('philippines', 'paypal', 'globe', 'Globe Secure Line', 1.90, 'USD', 3700.00, 99.70, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),

    -- Brazil
    ('brazil', 'whatsapp', 'claro', 'Claro Brasil Direct', 0.95, 'USD', 2000.00, 99.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('brazil', 'whatsapp', 'vivo', 'Vivo Brasil Premium', 1.10, 'USD', 2300.00, 99.60, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('brazil', 'whatsapp', 'tim', 'TIM Brasil FastRoute', 0.85, 'USD', 1800.00, 98.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('brazil', 'google', 'claro', 'Claro Brasil', 0.70, 'USD', 1500.00, 99.10, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('brazil', 'facebook', 'vivo', 'Vivo Brasil', 0.65, 'USD', 1400.00, 98.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('brazil', 'instagram', 'claro', 'Claro Brasil', 0.80, 'USD', 1700.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('brazil', 'twitter', 'tim', 'TIM Brasil', 0.60, 'USD', 1300.00, 98.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('brazil', 'paypal', 'vivo', 'Vivo Brasil Secure', 2.00, 'USD', 3900.00, 99.80, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),

    -- Poland
    ('poland', 'whatsapp', 'orange', 'Orange Polska Primary', 1.30, 'USD', 2700.00, 99.60, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('poland', 'whatsapp', 'play', 'Play Poland FastRoute', 1.10, 'USD', 2300.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('poland', 'whatsapp', 'plus', 'Plus GSM Poland', 1.20, 'USD', 2500.00, 98.70, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('poland', 'google', 'orange', 'Orange Polska', 0.80, 'USD', 1700.00, 99.30, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('poland', 'facebook', 'play', 'Play Poland', 0.75, 'USD', 1600.00, 99.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('poland', 'instagram', 'orange', 'Orange Polska', 0.90, 'USD', 1900.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('poland', 'twitter', 'plus', 'Plus Poland', 0.70, 'USD', 1500.00, 98.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('poland', 'paypal', 'orange', 'Orange Polska Secure', 2.20, 'USD', 4300.00, 99.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),

    -- Spain
    ('spain', 'whatsapp', 'movistar', 'Movistar España Direct', 1.50, 'USD', 3100.00, 99.70, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('spain', 'whatsapp', 'vodafone', 'Vodafone España Premium', 1.40, 'USD', 2900.00, 99.50, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 2),
    ('spain', 'whatsapp', 'orange', 'Orange España FastRoute', 1.30, 'USD', 2700.00, 99.10, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 3),

    ('spain', 'google', 'movistar', 'Movistar España', 0.90, 'USD', 1900.00, 99.40, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('spain', 'facebook', 'vodafone', 'Vodafone España', 0.85, 'USD', 1800.00, 99.00, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('spain', 'instagram', 'orange', 'Orange España', 1.00, 'USD', 2100.00, 99.20, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('spain', 'twitter', 'movistar', 'Movistar España', 0.85, 'USD', 1800.00, 98.70, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1),
    ('spain', 'paypal', 'movistar', 'Movistar High Security', 2.40, 'USD', 4600.00, 99.90, 'صلاحية الرقم 15 دقيقة (مهلة الكود 5 دقائق)', true, 1)

ON CONFLICT (country_code, service_code, provider_id) DO UPDATE SET
    provider_name = EXCLUDED.provider_name,
    supplier_cost = EXCLUDED.supplier_cost,
    customer_price_sdg = EXCLUDED.customer_price_sdg,
    delivery_rate = EXCLUDED.delivery_rate,
    eta_text = EXCLUDED.eta_text,
    is_active = EXCLUDED.is_active;
