-- Migration 013: Add created_by_type to WalletTransaction to properly separate actor type from user UUID
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "created_by_type" VARCHAR(20) DEFAULT 'SYSTEM';

-- Ensure createdBy column allows NULL (system actions use NULL createdBy with created_by_type = 'SYSTEM')
ALTER TABLE "WalletTransaction" ALTER COLUMN "createdBy" DROP NOT NULL;

-- Backfill existing records: if createdBy is not null, it's an ADMIN; otherwise SYSTEM
UPDATE "WalletTransaction" 
SET "created_by_type" = CASE 
  WHEN "createdBy" IS NOT NULL THEN 'ADMIN' 
  ELSE 'SYSTEM' 
END
WHERE "created_by_type" IS NULL;
