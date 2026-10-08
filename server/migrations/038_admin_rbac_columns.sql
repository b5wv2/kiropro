-- Migration 038: Admin RBAC Columns
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "is_super_admin" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Ensure default admin has super admin rights and wildcard permissions
UPDATE "User"
SET "is_super_admin" = TRUE,
    "permissions" = '["*"]'::jsonb
WHERE role = 'ADMIN' AND email = 'admin@kiropro.com';
