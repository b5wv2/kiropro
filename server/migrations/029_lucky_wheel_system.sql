-- Migration 029: Lucky Wheel System (عجلة الحظ اليومية 1 Account = 1 Spin Per Day)
-- Economic protection, server-side weighted selection, budget caps, and daily unique constraint

-- 1. Create wheel_prizes table
CREATE TABLE IF NOT EXISTS "wheel_prizes" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "type" VARCHAR(50) NOT NULL, -- 'NO_PRIZE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'WALLET_CREDIT', 'FREE_ATTEMPT'
    "value" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(30) NOT NULL DEFAULT '#F59E0B',
    "icon" VARCHAR(50) NOT NULL DEFAULT 'Gift',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_winners" INTEGER DEFAULT NULL,
    "current_winners" INTEGER NOT NULL DEFAULT 0,
    "max_total_cost" NUMERIC(14, 2) DEFAULT NULL,
    "current_total_cost" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "starts_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "expires_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create wheel_spins table with strict UNIQUE(user_id, spin_date)
CREATE TABLE IF NOT EXISTS "wheel_spins" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "spin_date" DATE NOT NULL,
    "prize_id" UUID REFERENCES "wheel_prizes"("id") ON DELETE SET NULL,
    "reward_type" VARCHAR(50) NOT NULL,
    "reward_value" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "reward_details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_wheel_user_spin_date UNIQUE ("user_id", "spin_date")
);

-- 3. Create performance and auditing indexes
CREATE INDEX IF NOT EXISTS idx_wheel_spins_user_id ON "wheel_spins"("user_id");
CREATE INDEX IF NOT EXISTS idx_wheel_spins_date ON "wheel_spins"("spin_date");
CREATE INDEX IF NOT EXISTS idx_wheel_spins_prize_id ON "wheel_spins"("prize_id");
CREATE INDEX IF NOT EXISTS idx_wheel_prizes_active ON "wheel_prizes"("is_active", "weight");

-- 4. Seed initial prizes with economy-first weighted distribution (Total Weight = 10,000 = 100%)
INSERT INTO "wheel_prizes" ("id", "name", "description", "type", "value", "weight", "color", "icon", "is_active", "max_winners", "display_order")
VALUES
  ('11111111-1111-4111-a111-000000000001', 'حظ أوفر', 'لم يحالفك الحظ اليوم، عاود المحاولة غداً!', 'NO_PRIZE', 0.00, 6000, '#64748B', 'Frown', true, NULL, 1),
  ('11111111-1111-4111-a111-000000000002', 'خصم 100 ج.س', 'كود خصم فوري بقيمة 100 جنيه سوداني', 'DISCOUNT_FIXED', 100.00, 1500, '#10B981', 'Tag', true, NULL, 2),
  ('11111111-1111-4111-a111-000000000003', 'خصم 200 ج.س', 'كود خصم فوري بقيمة 200 جنيه سوداني', 'DISCOUNT_FIXED', 200.00, 1000, '#06B6D4', 'Ticket', true, NULL, 3),
  ('11111111-1111-4111-a111-000000000004', 'خصم 500 ج.س', 'كود خصم مميز بقيمة 500 جنيه سوداني', 'DISCOUNT_FIXED', 500.00, 700, '#3B82F6', 'Gift', true, NULL, 4),
  ('11111111-1111-4111-a111-000000000005', 'محاولة مجانية', 'محاولة مجانية لأرقام التفعيل الافتراضية', 'FREE_ATTEMPT', 800.00, 500, '#8B5CF6', 'Smartphone', true, NULL, 5),
  ('11111111-1111-4111-a111-000000000006', 'خصم 1,000 ج.س', 'كود خصم ذهبي بقيمة 1,000 جنيه سوداني', 'DISCOUNT_FIXED', 1000.00, 200, '#EC4899', 'Zap', true, NULL, 6),
  ('11111111-1111-4111-a111-000000000007', 'خصم 2,000 ج.س', 'كود خصم نادر بقيمة 2,000 جنيه سوداني', 'DISCOUNT_FIXED', 2000.00, 80, '#F97316', 'Flame', true, 50, 7),
  ('11111111-1111-4111-a111-000000000008', 'خصم 5,000 ج.س', 'جائزة كبرى نادرة جداً بقيمة 5,000 جنيه سوداني', 'DISCOUNT_FIXED', 5000.00, 15, '#E11D48', 'Crown', true, 10, 8),
  ('11111111-1111-4111-a111-000000000009', 'خصم 20% شامل', 'كود خصم استثنائي 20% على أي باقة', 'DISCOUNT_PERCENT', 20.00, 5, '#F59E0B', 'Sparkles', true, 5, 9)
ON CONFLICT ("id") DO NOTHING;
