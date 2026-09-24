-- ====================================================================
-- Migration 022: High-Performance Indexes for Referral Leaderboard & Stats
-- ====================================================================

-- 1. Accelerate lookup of referees by referrer with ordering
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created 
ON "referrals" ("referrer_id", "created_at" DESC);

-- 2. Accelerate checking qualification status (referee email verification & created)
CREATE INDEX IF NOT EXISTS idx_referrals_referee_created 
ON "referrals" ("referee_id", "created_at" DESC);

-- 3. Accelerate paying referrals calculation on Order
CREATE INDEX IF NOT EXISTS idx_orders_user_completed 
ON "Order" ("userId", "status", "amount") 
WHERE "status" = 'COMPLETED';

-- 4. Accelerate paying referrals calculation on topup_requests
CREATE INDEX IF NOT EXISTS idx_topup_requests_user_approved 
ON "topup_requests" ("user_id", "status", "amount_sdg") 
WHERE "status" = 'APPROVED';

-- 5. Accelerate risk detection by IP in security_events
CREATE INDEX IF NOT EXISTS idx_security_events_user_ip 
ON "security_events" ("user_id", "ip_address");
