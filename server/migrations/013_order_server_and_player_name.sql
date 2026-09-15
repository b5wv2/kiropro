-- Migration 013: Add optional serverId and playerName to Order table
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "serverId" text;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "playerName" text;
