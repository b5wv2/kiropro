-- Migration 010: Add Blood Strike Categories (Global & Middle East)
-- Partitioned strictly into two separate categories

INSERT INTO "GameCategory" (
    "id", 
    "name", 
    "arabicName", 
    "imageUrl", 
    "platform", 
    "badge", 
    "deliveryTime", 
    "idFieldLabel", 
    "idPlaceholder", 
    "displayOrder", 
    "isActive"
) VALUES 
(
    'blood-strike-global',
    'Blood Strike (Global)',
    'Blood Strike — السيرفر العالمي',
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    'mobile',
    'تسليم فوري',
    'تسليم فوري وتلقائي',
    'معرّف اللاعب (User ID)',
    'أدخل معرّف اللاعب الخاص بك (User ID)',
    3,
    true
),
(
    'blood-strike-me',
    'Blood Strike (Middle East)',
    'Blood Strike — الشرق الأوسط',
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    'mobile',
    'تسليم فوري',
    'تسليم فوري وتلقائي',
    'معرّف اللاعب (User ID)',
    'أدخل معرّف اللاعب الخاص بك (User ID)',
    4,
    true
)
ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "arabicName" = EXCLUDED."arabicName",
    "displayOrder" = EXCLUDED."displayOrder",
    "isActive" = EXCLUDED."isActive";

-- Update Global Blood Strike products (23 offers)
UPDATE "Product"
SET 
    "gameCategoryId" = 'blood-strike-global',
    "category" = 'BLOOD_STRIKE_GLOBAL',
    "regionName" = COALESCE("regionName", 'Global'),
    "regionCode" = COALESCE("regionCode", 'GLB'),
    "isActive" = false
WHERE "productName" = 'Blood Strike';

-- Update Middle East Blood Strike products (23 offers)
UPDATE "Product"
SET 
    "gameCategoryId" = 'blood-strike-me',
    "category" = 'BLOOD_STRIKE_MIDDLE_EAST',
    "regionName" = 'Middle East (MENA)',
    "regionCode" = 'ME',
    "isActive" = false
WHERE "productName" = 'Blood Strike MENA';
