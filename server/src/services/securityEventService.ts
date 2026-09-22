import pool from '../db';

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'REGISTER'
  | 'DEVICE_SEEN'
  | 'IP_CHANGED'
  | 'BAN_CREATED'
  | 'BAN_REVOKED'
  | 'BAN_EXPIRED'
  | 'BAN_MATCH'
  | 'SUSPICIOUS_LOGIN'
  | 'ABUSE_SIGNAL';

export interface LogSecurityEventParams {
  userId?: string | null;
  eventType: SecurityEventType;
  ipAddress: string;
  deviceId?: string | null;
  sessionId?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any>;
}

// Sensitive keys that must NEVER be persisted in security events
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /jwt/i,
  /otp/i,
  /code/i,
  /key/i,
  /auth/i,
  /card/i,
  /cvv/i,
  /cookie/i,
  /hash/i,
  /mac/i,
  /imei/i,
  /serial/i,
  /hardware/i
];

/**
 * Recursively sanitize metadata to remove any secret, credentials, or privacy-violating values.
 */
export function sanitizeMetadata(data?: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== 'object') return {};

  const clean: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    // Check if key matches sensitive patterns
    const isSensitive = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
    if (isSensitive) {
      continue; // Scrub completely
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeMetadata(value);
    } else if (Array.isArray(value)) {
      clean[key] = value.map(item => (item && typeof item === 'object' ? sanitizeMetadata(item) : item));
    } else {
      clean[key] = value;
    }
  }

  return clean;
}

/**
 * Asynchronously log a security event to database.
 * Does not throw or block the caller if logging encounters a DB issue.
 */
export async function logSecurityEvent(params: LogSecurityEventParams): Promise<void> {
  try {
    const {
      userId = null,
      eventType,
      ipAddress,
      deviceId = null,
      sessionId = null,
      userAgent = null,
      metadata = {}
    } = params;

    const safeMeta = sanitizeMetadata(metadata);

    await pool.query(
      `INSERT INTO "security_events" 
        (user_id, event_type, ip_address, device_id, session_id, user_agent, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        userId || null,
        eventType,
        ipAddress.substring(0, 45),
        deviceId ? deviceId.substring(0, 64) : null,
        sessionId ? sessionId.substring(0, 64) : null,
        userAgent ? userAgent.substring(0, 1000) : null,
        JSON.stringify(safeMeta)
      ]
    );
  } catch (err: any) {
    console.error('[SecurityEventService] Failed to log security event:', err?.message || err);
  }
}

/**
 * Filter options for querying security events.
 */
export interface SecurityEventsFilter {
  userId?: string | undefined;
  email?: string | undefined;
  ipAddress?: string | undefined;
  deviceId?: string | undefined;
  eventType?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Query security events with rich filters and pagination.
 */
export async function querySecurityEvents(filter: SecurityEventsFilter) {
  const {
    userId,
    email,
    ipAddress,
    deviceId,
    eventType,
    startDate,
    endDate,
    search,
    limit = 50,
    offset = 0
  } = filter;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (userId) {
    conditions.push(`se.user_id = $${paramIdx++}`);
    values.push(userId);
  }

  if (email) {
    conditions.push(`LOWER(u.email) = LOWER($${paramIdx++})`);
    values.push(email.trim());
  }

  if (ipAddress) {
    conditions.push(`se.ip_address = $${paramIdx++}`);
    values.push(ipAddress.trim());
  }

  if (deviceId) {
    conditions.push(`se.device_id = $${paramIdx++}`);
    values.push(deviceId.trim());
  }

  if (eventType) {
    conditions.push(`se.event_type = $${paramIdx++}`);
    values.push(eventType);
  }

  if (startDate) {
    conditions.push(`se.created_at >= $${paramIdx++}`);
    values.push(new Date(startDate));
  }

  if (endDate) {
    conditions.push(`se.created_at <= $${paramIdx++}`);
    values.push(new Date(endDate));
  }

  if (search) {
    conditions.push(`(
      se.event_type ILIKE $${paramIdx} OR 
      se.ip_address ILIKE $${paramIdx} OR 
      se.device_id ILIKE $${paramIdx} OR 
      u.email ILIKE $${paramIdx} OR 
      u.name ILIKE $${paramIdx}
    )`);
    values.push(`%${search.trim()}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM "security_events" se
    LEFT JOIN "User" u ON se.user_id = u.id
    ${whereClause}
  `;
  const countRes = await pool.query(countQuery, values);
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  // Get records
  const dataQuery = `
    SELECT 
      se.id,
      se.user_id,
      se.event_type,
      se.ip_address,
      se.device_id,
      se.session_id,
      se.user_agent,
      se.metadata,
      se.created_at,
      json_build_object('name', u.name, 'email', u.email, 'role', u.role) as user
    FROM "security_events" se
    LEFT JOIN "User" u ON se.user_id = u.id
    ${whereClause}
    ORDER BY se.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;
  values.push(limit, offset);

  const dataRes = await pool.query(dataQuery, values);

  return {
    total,
    limit,
    offset,
    events: dataRes.rows
  };
}
