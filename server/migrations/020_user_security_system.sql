-- ====================================================================
-- Migration 020: Comprehensive User Security & Monitoring System
-- ====================================================================

-- 1. user_sessions table
CREATE TABLE IF NOT EXISTS "user_sessions" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  session_id VARCHAR(64) UNIQUE NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT NOT NULL,
  browser VARCHAR(64),
  browser_version VARCHAR(32),
  operating_system VARCHAR(64),
  os_version VARCHAR(32),
  device_type VARCHAR(32) DEFAULT 'Desktop',
  language VARCHAR(32),
  timezone VARCHAR(64),
  login_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, REVOKED, LOGGED_OUT
  login_method VARCHAR(32) NOT NULL DEFAULT 'PASSWORD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON "user_sessions"(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON "user_sessions"(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_id ON "user_sessions"(device_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_ip_address ON "user_sessions"(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON "user_sessions"(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen ON "user_sessions"(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON "user_sessions"(expires_at);

-- 2. security_events table
CREATE TABLE IF NOT EXISTS "security_events" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  device_id VARCHAR(64),
  session_id VARCHAR(64),
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sec_events_user_id ON "security_events"(user_id);
CREATE INDEX IF NOT EXISTS idx_sec_events_event_type ON "security_events"(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_ip ON "security_events"(ip_address);
CREATE INDEX IF NOT EXISTS idx_sec_events_device ON "security_events"(device_id);
CREATE INDEX IF NOT EXISTS idx_sec_events_session ON "security_events"(session_id);
CREATE INDEX IF NOT EXISTS idx_sec_events_created_at ON "security_events"(created_at DESC);

-- 3. user_bans table
CREATE TABLE IF NOT EXISTS "user_bans" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES "User"(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  device_id VARCHAR(64),
  scope VARCHAR(32) NOT NULL DEFAULT 'ACCOUNT_IP_DEVICE',
  reason TEXT NOT NULL,
  created_by UUID REFERENCES "User"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES "User"(id),
  revoke_reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' -- ACTIVE, REVOKED, EXPIRED
);

CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON "user_bans"(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bans_ip ON "user_bans"(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_bans_device ON "user_bans"(device_id);
CREATE INDEX IF NOT EXISTS idx_user_bans_status ON "user_bans"(status);
CREATE INDEX IF NOT EXISTS idx_user_bans_expires_at ON "user_bans"(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_bans_created_at ON "user_bans"(created_at DESC);
