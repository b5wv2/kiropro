-- Migration 008: Catalog Curation, Arabic Names, Descriptions, Subcategories & Types

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "arabicName" TEXT,
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "subCategory" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "productType" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "idx_product_subcategory" ON "Product"("subCategory");
CREATE INDEX IF NOT EXISTS "idx_product_type" ON "Product"("productType");
