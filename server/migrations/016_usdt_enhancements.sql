-- Migration 016: USDT Enhancements (Dynamic Minimum >= 1, Safe Network Deletions, Constraint Updates)

-- 1. Update min_order_amount check constraint on usdt_inventory (Replace >= 3.0 with >= 1.0)
ALTER TABLE "usdt_inventory" DROP CONSTRAINT IF EXISTS "usdt_inventory_min_order_amount_check";
ALTER TABLE "usdt_inventory" ADD CONSTRAINT "usdt_inventory_min_order_amount_check" CHECK ("min_order_amount" >= 1.0000);

-- 2. Update min_amount check constraint on crypto_networks (Replace >= 3.0 with >= 1.0)
ALTER TABLE "crypto_networks" DROP CONSTRAINT IF EXISTS "crypto_networks_min_amount_check";
ALTER TABLE "crypto_networks" ADD CONSTRAINT "crypto_networks_min_amount_check" CHECK ("min_amount" >= 1.0000);

-- 3. Update existing default minimums from legacy 3.0 to 1.0
UPDATE "usdt_inventory" SET "min_order_amount" = 1.0000 WHERE "min_order_amount" = 3.0000;
UPDATE "crypto_networks" SET "min_amount" = 1.0000 WHERE "min_amount" = 3.0000;

-- 4. Ensure index exists on Order for fast network order counting
CREATE INDEX IF NOT EXISTS "idx_order_crypto_network_type" ON "Order"("cryptoNetwork", "orderType");
