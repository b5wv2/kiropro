-- Migration 014: Password Reset OTPs, Secure Reset Tokens & Session Invalidation

CREATE TABLE IF NOT EXISTS "password_reset_otps" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID REFERENCES "User"("id") ON DELETE CASCADE,
  "email" VARCHAR(255) NOT NULL,
  "otp_hash" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "verified_at" TIMESTAMP WITH TIME ZONE,
  "reset_token_hash" VARCHAR(255),
  "reset_token_expires_at" TIMESTAMP WITH TIME ZONE,
  "used_at" TIMESTAMP WITH TIME ZONE,
  "invalidated_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_password_reset_email" ON "password_reset_otps"("email");
CREATE INDEX IF NOT EXISTS "idx_password_reset_created_at" ON "password_reset_otps"("created_at");
CREATE INDEX IF NOT EXISTS "idx_password_reset_user_id" ON "password_reset_otps"("user_id");
CREATE INDEX IF NOT EXISTS "idx_password_reset_token_hash" ON "password_reset_otps"("reset_token_hash");

-- Add passwordChangedAt to User to track password updates and invalidate older sessions
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP WITH TIME ZONE;
