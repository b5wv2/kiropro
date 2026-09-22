import pool from '../db';
import { revokeAllUserSessions } from './sessionService';
import { logSecurityEvent } from './securityEventService';

export type BanScope =
  | 'ACCOUNT'
  | 'IP'
  | 'DEVICE'
  | 'ACCOUNT_IP'
  | 'ACCOUNT_DEVICE'
  | 'ACCOUNT_IP_DEVICE';

export type BanStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface UserBanRecord {
  id: string;
  user_id?: string | null;
  ip_address?: string | null;
  device_id?: string | null;
  scope: BanScope;
  reason: string;
  created_by?: string | null;
  created_at: Date;
  expires_at?: Date | null;
  revoked_at?: Date | null;
  revoked_by?: string | null;
  revoke_reason?: string | null;
  status: BanStatus;
  creator_name?: string;
  creator_email?: string;
}

export interface CheckBanParams {
  userId?: string | null;
  ip?: string | null;
  deviceId?: string | null;
}

export interface BanCheckResult {
  isBanned: boolean;
  matchedScope?: BanScope | undefined;
  reason?: string | undefined;
  banId?: string | undefined;
  expiresAt?: Date | null | undefined;
}

export interface PublicBanResponse {
  code: string;
  message: string;
  restrictionMessage?: string | undefined;
  reason: string;
  expiresAt: string | null;
  permanent: boolean;
}

/**
 * Format a safe, structured ban response for public/client consumption.
 * Strictly avoids leaking internal IDs, device_id, internal IP, admin IDs, SQL details, or security metadata.
 */
export function formatBanResponse(
  banResult: BanCheckResult,
  context: 'login' | 'register' | 'operation' = 'login'
): PublicBanResponse {
  const scope = banResult.matchedScope || 'ACCOUNT';
  const expiresAt = banResult.expiresAt ? new Date(banResult.expiresAt).toISOString() : null;
  const permanent = !banResult.expiresAt;
  const rawReason = banResult.reason?.trim();

  // Distinguish ban code per scope
  const code = `${scope}_BANNED`;

  if (context === 'register') {
    return {
      code,
      message: 'لا يمكنك إنشاء حساب حاليًا',
      restrictionMessage: 'تم تقييد الوصول من قبل إدارة KIROPRO.',
      reason: rawReason || 'تم تقييد الوصول من هذا الجهاز أو الشبكة من قبل إدارة KIROPRO.',
      expiresAt,
      permanent
    };
  }

  if (context === 'operation') {
    return {
      code,
      message: 'تم تقييد الوصول من قبل إدارة KIROPRO',
      restrictionMessage: 'لا يمكن إتمام هذه العملية بسبب تقييد أمني نشط.',
      reason: rawReason || 'مخالفة السياسات الأمنية وشروط الاستخدام.',
      expiresAt,
      permanent
    };
  }

  // context === 'login'
  const isAccountScope =
    scope === 'ACCOUNT' ||
    scope === 'ACCOUNT_IP' ||
    scope === 'ACCOUNT_DEVICE' ||
    scope === 'ACCOUNT_IP_DEVICE';

  const message = isAccountScope
    ? 'تم حظر حسابك من قبل إدارة KIROPRO'
    : 'تم تقييد الوصول من هذا الجهاز أو الشبكة من قبل إدارة KIROPRO';

  return {
    code,
    message,
    reason: rawReason || 'مخالفة شروط الاستخدام والسياسات الأمنية.',
    expiresAt,
    permanent
  };
}

/**
 * Auto-expire temporary bans that have exceeded expires_at.
 * Runs inline before checking to ensure 100% precision.
 */
export async function expireOverdueBans(): Promise<number> {
  try {
    const res = await pool.query(`
      UPDATE "user_bans"
      SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' 
        AND expires_at IS NOT NULL 
        AND expires_at <= CURRENT_TIMESTAMP
      RETURNING id, user_id, ip_address, device_id, scope, reason
    `);

    for (const b of res.rows) {
      await logSecurityEvent({
        userId: b.user_id,
        eventType: 'BAN_EXPIRED',
        ipAddress: b.ip_address || '0.0.0.0',
        deviceId: b.device_id || null,
        metadata: {
          ban_id: b.id,
          scope: b.scope,
          original_reason: b.reason
        }
      });
    }

    return res.rows.length;
  } catch (err: any) {
    console.error('[BanService] Error expiring bans:', err?.message || err);
    return 0;
  }
}

/**
 * Check if the given identity (User ID, IP, and/or Device ID) matches an active ban.
 */
export async function checkBan(params: CheckBanParams): Promise<BanCheckResult> {
  const { userId, ip, deviceId } = params;

  // 1. Process any expired bans first
  await expireOverdueBans();

  // If no identifiers provided, cannot match
  if (!userId && !ip && !deviceId) {
    return { isBanned: false };
  }

  // 2. Fetch all potentially relevant active bans
  const query = `
    SELECT * FROM "user_bans"
    WHERE status = 'ACTIVE'
      AND (
        ($1::uuid IS NOT NULL AND user_id = $1::uuid) OR
        ($2::varchar IS NOT NULL AND ip_address = $2::varchar) OR
        ($3::varchar IS NOT NULL AND device_id = $3::varchar)
      )
    ORDER BY created_at DESC
  `;

  const res = await pool.query(query, [userId || null, ip || null, deviceId || null]);
  const activeBans: UserBanRecord[] = res.rows;

  if (activeBans.length === 0) {
    return { isBanned: false };
  }

  // 3. Evaluate scope matching strictly
  for (const ban of activeBans) {
    const scope = ban.scope;

    switch (scope) {
      case 'ACCOUNT':
        if (userId && ban.user_id === userId) {
          return {
            isBanned: true,
            matchedScope: 'ACCOUNT',
            reason: ban.reason,
            banId: ban.id,
            expiresAt: ban.expires_at
          };
        }
        break;

      case 'IP':
        if (ip && ban.ip_address === ip) {
          return {
            isBanned: true,
            matchedScope: 'IP',
            reason: ban.reason,
            banId: ban.id,
            expiresAt: ban.expires_at
          };
        }
        break;

      case 'DEVICE':
        if (deviceId && ban.device_id === deviceId) {
          return {
            isBanned: true,
            matchedScope: 'DEVICE',
            reason: ban.reason,
            banId: ban.id,
            expiresAt: ban.expires_at
          };
        }
        break;

      case 'ACCOUNT_IP':
        if (userId && ip && ban.user_id === userId && ban.ip_address === ip) {
          return {
            isBanned: true,
            matchedScope: 'ACCOUNT_IP',
            reason: ban.reason,
            banId: ban.id,
            expiresAt: ban.expires_at
          };
        }
        break;

      case 'ACCOUNT_DEVICE':
        if (userId && deviceId && ban.user_id === userId && ban.device_id === deviceId) {
          return {
            isBanned: true,
            matchedScope: 'ACCOUNT_DEVICE',
            reason: ban.reason,
            banId: ban.id,
            expiresAt: ban.expires_at
          };
        }
        break;

      case 'ACCOUNT_IP_DEVICE':
        // Default mode: matches if the account is banned, or all 3 match
        if (
          (userId && ban.user_id === userId) ||
          (userId && ip && deviceId && ban.user_id === userId && ban.ip_address === ip && ban.device_id === deviceId)
        ) {
          return {
            isBanned: true,
            matchedScope: 'ACCOUNT_IP_DEVICE',
            reason: ban.reason,
            banId: ban.id,
            expiresAt: ban.expires_at
          };
        }
        break;
    }
  }

  // If a device or IP is banned under a scoped rule and a different account accesses it:
  // We record a BAN_MATCH / SUSPICIOUS_LOGIN signal without automatically blocking the innocent user unless IP/DEVICE alone was banned.
  for (const ban of activeBans) {
    if (ban.device_id && deviceId && ban.device_id === deviceId && ban.user_id !== userId) {
      await logSecurityEvent({
        userId: userId || null,
        eventType: 'BAN_MATCH',
        ipAddress: ip || '0.0.0.0',
        deviceId,
        metadata: {
          matched_ban_id: ban.id,
          matched_scope: ban.scope,
          note: 'Device ID associated with a previously banned account'
        }
      });
    }
  }

  return { isBanned: false };
}

export interface CreateBanParams {
  userId?: string | null;
  ip?: string | null;
  deviceId?: string | null;
  scope?: BanScope;
  reason: string;
  createdBy?: string | null;
  durationHours?: number | null; // null or undefined = Permanent
  expiresAt?: Date | null;
}

/**
 * Create a new ban record in database, revoke all active sessions, and log BAN_CREATED.
 */
export async function createBan(params: CreateBanParams): Promise<UserBanRecord> {
  const {
    userId = null,
    ip = null,
    deviceId = null,
    scope = 'ACCOUNT_IP_DEVICE',
    reason,
    createdBy = null,
    durationHours = null
  } = params;

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new Error('سبب الحظر مطلوب (Ban reason is required).');
  }

  let expiresAt: Date | null = null;
  if (params.expiresAt instanceof Date) {
    expiresAt = params.expiresAt;
  } else if (durationHours && durationHours > 0) {
    expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertRes = await client.query(
      `INSERT INTO "user_bans" (
        user_id,
        ip_address,
        device_id,
        scope,
        reason,
        created_by,
        created_at,
        expires_at,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, 'ACTIVE')
      RETURNING *`,
      [
        userId || null,
        ip ? ip.substring(0, 45) : null,
        deviceId ? deviceId.substring(0, 64) : null,
        scope,
        reason.trim(),
        createdBy,
        expiresAt
      ]
    );

    const banRecord: UserBanRecord = insertRes.rows[0];

    // If account was banned, revoke ALL active sessions immediately
    if (userId) {
      await revokeAllUserSessions(userId, createdBy || undefined, `ACCOUNT_BANNED: ${reason.trim()}`);
    }

    await client.query('COMMIT');

    // Log BAN_CREATED security event
    await logSecurityEvent({
      userId: userId || null,
      eventType: 'BAN_CREATED',
      ipAddress: ip || '0.0.0.0',
      deviceId: deviceId || null,
      metadata: {
        ban_id: banRecord.id,
        scope,
        reason: reason.trim(),
        expires_at: expiresAt,
        permanent: !expiresAt,
        created_by: createdBy
      }
    });

    return banRecord;
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[BanService] Failed to create ban:', err?.message || err);
    throw err;
  } finally {
    client.release();
  }
}

export interface RevokeBanParams {
  banId: string;
  revokedBy: string;
  revokeReason?: string;
}

/**
 * Revoke an active ban (Unban).
 * IMPORTANT: Unbanning does NOT restore old sessions. Users must log in again.
 */
export async function revokeBan(params: RevokeBanParams): Promise<UserBanRecord> {
  const { banId, revokedBy, revokeReason = 'فك الحظر من قبل الإدارة' } = params;

  const res = await pool.query(
    `UPDATE "user_bans"
     SET status = 'REVOKED',
         revoked_at = CURRENT_TIMESTAMP,
         revoked_by = $1,
         revoke_reason = $2
     WHERE id = $3 AND status = 'ACTIVE'
     RETURNING *`,
    [revokedBy, revokeReason.trim(), banId]
  );

  if (res.rows.length === 0) {
    throw new Error('سجل الحظر غير موجود أو تم فكه مسبقاً.');
  }

  const banRecord: UserBanRecord = res.rows[0];

  // Log BAN_REVOKED
  await logSecurityEvent({
    userId: banRecord.user_id || null,
    eventType: 'BAN_REVOKED',
    ipAddress: banRecord.ip_address || '0.0.0.0',
    deviceId: banRecord.device_id || null,
    metadata: {
      ban_id: banRecord.id,
      scope: banRecord.scope,
      revoke_reason: revokeReason.trim(),
      revoked_by: revokedBy
    }
  });

  return banRecord;
}

/**
 * Fetch all bans associated with a specific user.
 */
export async function getUserBans(userId: string): Promise<UserBanRecord[]> {
  const res = await pool.query(
    `SELECT 
       b.*,
       u.name as creator_name,
       u.email as creator_email
     FROM "user_bans" b
     LEFT JOIN "User" u ON b.created_by = u.id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`,
    [userId]
  );
  return res.rows;
}

/**
 * Quick check if a user account currently has an active ban.
 */
export async function isAccountBanned(userId: string): Promise<boolean> {
  await expireOverdueBans();
  const res = await pool.query(
    `SELECT id FROM "user_bans"
     WHERE user_id = $1 AND status = 'ACTIVE'
     LIMIT 1`,
    [userId]
  );
  return res.rows.length > 0;
}
