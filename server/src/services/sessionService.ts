import crypto from 'crypto';
import pool from '../db';
import { ClientInfo } from './clientInfoService';
import { logSecurityEvent } from './securityEventService';

export type SessionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'LOGGED_OUT';

export interface UserSessionRecord {
  id: string;
  user_id: string;
  session_id: string;
  device_id: string;
  ip_address: string;
  user_agent: string;
  browser: string;
  browser_version: string;
  operating_system: string;
  os_version: string;
  device_type: string;
  language: string;
  timezone: string;
  login_at: Date;
  last_seen_at: Date;
  logout_at?: Date | null;
  expires_at: Date;
  revoked_at?: Date | null;
  status: SessionStatus;
  login_method: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionParams {
  userId: string;
  clientInfo: ClientInfo;
  loginMethod?: string;
  durationMs?: number; // Defaults to 7 days
}

/**
 * Generate a cryptographically secure, random Session ID.
 */
export function generateSessionId(): string {
  return `ses_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Create a new user session record in PostgreSQL and log SESSION_CREATED.
 */
export async function createSession(params: CreateSessionParams): Promise<string> {
  const {
    userId,
    clientInfo,
    loginMethod = 'PASSWORD',
    durationMs = 7 * 24 * 60 * 60 * 1000 // 7 days
  } = params;

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + durationMs);

  await pool.query(
    `INSERT INTO "user_sessions" (
      user_id,
      session_id,
      device_id,
      ip_address,
      user_agent,
      browser,
      browser_version,
      operating_system,
      os_version,
      device_type,
      language,
      timezone,
      login_at,
      last_seen_at,
      expires_at,
      status,
      login_method,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $13, 'ACTIVE', $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      userId,
      sessionId,
      clientInfo.deviceId,
      clientInfo.ip,
      clientInfo.userAgent,
      clientInfo.browser,
      clientInfo.browserVersion,
      clientInfo.os,
      clientInfo.osVersion,
      clientInfo.deviceType,
      clientInfo.language,
      clientInfo.timezone,
      expiresAt,
      loginMethod
    ]
  );

  // Log session created event
  await logSecurityEvent({
    userId,
    eventType: 'SESSION_CREATED',
    ipAddress: clientInfo.ip,
    deviceId: clientInfo.deviceId,
    sessionId,
    userAgent: clientInfo.userAgent,
    metadata: {
      browser: clientInfo.browser,
      os: clientInfo.os,
      device_type: clientInfo.deviceType,
      login_method: loginMethod
    }
  });

  return sessionId;
}

/**
 * Validate session status server-side.
 * Rejects revoked, expired, or non-existent sessions.
 */
export async function validateSession(sessionId: string): Promise<{
  valid: boolean;
  status?: SessionStatus;
  userId?: string;
  error?: string;
}> {
  if (!sessionId) {
    return { valid: false, error: 'Session ID is required' };
  }

  try {
    const res = await pool.query(
      `SELECT id, user_id, status, expires_at, last_seen_at 
       FROM "user_sessions" 
       WHERE session_id = $1`,
      [sessionId]
    );

    const session = res.rows[0];
    if (!session) {
      return { valid: false, error: 'الجلسة غير موجودة.' };
    }

    if (session.status === 'REVOKED') {
      return { valid: false, status: 'REVOKED', error: 'تم إلغاء هذه الجلسة من قبل إدارة النظام.' };
    }

    if (session.status === 'LOGGED_OUT') {
      return { valid: false, status: 'LOGGED_OUT', error: 'تم تسجيل الخروج من هذه الجلسة.' };
    }

    // Check if expired
    if (new Date() > new Date(session.expires_at)) {
      await pool.query(
        `UPDATE "user_sessions" SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [session.id]
      );
      return { valid: false, status: 'EXPIRED', error: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.' };
    }

    return { valid: true, status: 'ACTIVE', userId: session.user_id };
  } catch (err: any) {
    console.error('[SessionService] Validation error:', err?.message || err);
    return { valid: false, error: 'فشل التحقق من الجلسة.' };
  }
}

/**
 * Throttled update to last_seen_at (at most once every 5 minutes) to save DB writes.
 */
export async function touchSession(sessionId: string, currentIp?: string): Promise<void> {
  if (!sessionId) return;
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (currentIp) {
      await pool.query(
        `UPDATE "user_sessions" 
         SET last_seen_at = CURRENT_TIMESTAMP, 
             ip_address = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $2 
           AND (last_seen_at < $3 OR ip_address != $1)`,
        [currentIp, sessionId, fiveMinutesAgo]
      );
    } else {
      await pool.query(
        `UPDATE "user_sessions" 
         SET last_seen_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1 
           AND last_seen_at < $2`,
        [sessionId, fiveMinutesAgo]
      );
    }
  } catch (err: any) {
    // Non-critical background update
  }
}

/**
 * Revoke a specific session (Admin or User action).
 */
export async function revokeSession(
  sessionId: string,
  adminId?: string,
  reason = 'REVOKED_BY_ADMIN'
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE "user_sessions" 
     SET status = 'REVOKED', 
         revoked_at = CURRENT_TIMESTAMP, 
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = $1 AND status = 'ACTIVE'
     RETURNING user_id, ip_address, device_id, user_agent`,
    [sessionId]
  );

  if (res.rows.length === 0) {
    return false;
  }

  const s = res.rows[0];
  await logSecurityEvent({
    userId: s.user_id,
    eventType: 'SESSION_REVOKED',
    ipAddress: s.ip_address,
    deviceId: s.device_id,
    sessionId,
    userAgent: s.user_agent,
    metadata: {
      revoked_by_admin: !!adminId,
      admin_id: adminId || null,
      reason
    }
  });

  return true;
}

/**
 * Revoke ALL active sessions for a user (Used upon Ban, Password Change, or Security Reset).
 */
export async function revokeAllUserSessions(
  userId: string,
  adminId?: string,
  reason = 'REVOKE_ALL_SESSIONS'
): Promise<number> {
  const res = await pool.query(
    `UPDATE "user_sessions" 
     SET status = 'REVOKED', 
         revoked_at = CURRENT_TIMESTAMP, 
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND status = 'ACTIVE'
     RETURNING session_id, ip_address, device_id, user_agent`,
    [userId]
  );

  const revokedCount = res.rows.length;

  if (revokedCount > 0) {
    await logSecurityEvent({
      userId,
      eventType: 'SESSION_REVOKED',
      ipAddress: res.rows[0]?.ip_address || '0.0.0.0',
      deviceId: res.rows[0]?.device_id || null,
      metadata: {
        all_sessions_revoked: true,
        count: revokedCount,
        admin_id: adminId || null,
        reason
      }
    });
  }

  return revokedCount;
}

/**
 * Cleanly close a session upon user logout.
 */
export async function closeSession(sessionId?: string): Promise<void> {
  if (!sessionId) return;
  try {
    const res = await pool.query(
      `UPDATE "user_sessions" 
       SET status = 'LOGGED_OUT', 
           logout_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND status = 'ACTIVE'
       RETURNING user_id, ip_address, device_id, user_agent`,
      [sessionId]
    );

    if (res.rows.length > 0) {
      const s = res.rows[0];
      await logSecurityEvent({
        userId: s.user_id,
        eventType: 'LOGOUT',
        ipAddress: s.ip_address,
        deviceId: s.device_id,
        sessionId,
        userAgent: s.user_agent,
        metadata: { clean_logout: true }
      });
    }
  } catch (err: any) {
    console.error('[SessionService] Logout error:', err?.message || err);
  }
}

/**
 * Fetch all sessions for a user.
 */
export async function getUserSessions(userId: string): Promise<UserSessionRecord[]> {
  const res = await pool.query(
    `SELECT * FROM "user_sessions" 
     WHERE user_id = $1 
     ORDER BY last_seen_at DESC 
     LIMIT 50`,
    [userId]
  );
  return res.rows;
}
