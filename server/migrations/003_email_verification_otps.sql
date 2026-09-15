-- Migration 003: Email Verification OTPs and User Email Verification Flag

-- 1. Add emailVerified column to User table (admin accounts automatically verified)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Existing admin accounts are verified
UPDATE "User" SET "emailVerified" = true WHERE "role" = 'ADMIN';

-- 2. Create email_verification_otps table
CREATE TABLE IF NOT EXISTS "email_verification_otps" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID REFERENCES "User"("id") ON DELETE CASCADE,
  "email" VARCHAR(255) NOT NULL,
  "otp_hash" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "verified_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Indexes for fast lookup and rate-limiting/cooldown queries
CREATE INDEX IF NOT EXISTS "idx_email_otps_email" ON "email_verification_otps"("email");
CREATE INDEX IF NOT EXISTS "idx_email_otps_created_at" ON "email_verification_otps"("created_at");
CREATE INDEX IF NOT EXISTS "idx_email_otps_user_id" ON "email_verification_otps"("user_id");
