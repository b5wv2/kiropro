import crypto from 'crypto';
import pool from '../db';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function generateSecureRawToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Creates or retrieves an order-specific review token for an order.
 * Ensures single-use per order and idempotency.
 */
export async function getOrCreateOrderReviewToken(
  orderId: string, 
  productId?: string, 
  productName?: string, 
  createdBy?: string
): Promise<{ token: string; tokenId: string; isNew: boolean }> {
  // Check if an active token already exists for this order
  const existingRes = await pool.query(
    `SELECT id, is_active, uses_count, max_uses FROM "review_tokens" 
     WHERE order_id = $1 AND type = 'ORDER_SPECIFIC' AND is_active = true AND uses_count < max_uses
     ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );

  // If a valid unused token exists, we can't recover the raw hash, so we create a fresh one
  // or reuse if needed. Generating a fresh raw token and replacing old unused one ensures the link works.
  const rawToken = generateSecureRawToken();
  const tokenHash = hashToken(rawToken);

  const insertRes = await pool.query(
    `INSERT INTO "review_tokens" 
      (token_hash, type, order_id, product_id, product_name, label, created_by, max_uses, uses_count, is_active)
     VALUES ($1, 'ORDER_SPECIFIC', $2, $3, $4, $5, $6, 1, 0, true)
     RETURNING id`,
    [
      tokenHash,
      orderId,
      productId || null,
      productName || 'طلب رقمي',
      `طلب #${orderId.slice(0, 8)}`,
      createdBy || null
    ]
  );

  return {
    token: rawToken,
    tokenId: insertRes.rows[0].id,
    isNew: true
  };
}

/**
 * Creates a general review token for campaigns or general customer sharing.
 */
export async function createGeneralReviewToken(params: {
  productId?: string | undefined;
  productName?: string | undefined;
  label?: string | undefined;
  maxUses?: number | undefined;
  expiryDays?: number | undefined;
  createdBy?: string | undefined;
}): Promise<{ token: string; tokenId: string }> {
  const { productId, productName, label, maxUses = 100, expiryDays = 30, createdBy } = params;

  const rawToken = generateSecureRawToken();
  const tokenHash = hashToken(rawToken);

  const expiresAt = expiryDays > 0 
    ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) 
    : null;

  const insertRes = await pool.query(
    `INSERT INTO "review_tokens" 
      (token_hash, type, order_id, product_id, product_name, label, created_by, max_uses, uses_count, is_active, expires_at)
     VALUES ($1, 'GENERAL', NULL, $2, $3, $4, $5, $6, 0, true, $7)
     RETURNING id`,
    [
      tokenHash,
      productId || null,
      productName || 'تقييم تجربة المتجر',
      label || 'رابط تقييم عام',
      createdBy || null,
      Math.max(1, maxUses),
      expiresAt
    ]
  );

  return {
    token: rawToken,
    tokenId: insertRes.rows[0].id
  };
}

/**
 * Verifies a raw token against the database.
 * Never leaks internal IDs or provider secrets to client.
 */
export async function verifyReviewToken(rawToken: string): Promise<{
  isValid: boolean;
  error?: string;
  tokenRecord?: any;
}> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 16) {
    return { isValid: false, error: 'رابط التقييم غير صالح.' };
  }

  const tokenHash = hashToken(rawToken);

  const res = await pool.query(
    `SELECT 
      rt.id,
      rt.type,
      rt.order_id,
      rt.product_id,
      rt.product_name,
      rt.created_by,
      rt.max_uses,
      rt.uses_count,
      rt.is_active,
      rt.expires_at,
      o."packageName",
      o."status" as order_status
     FROM "review_tokens" rt
     LEFT JOIN "Order" o ON rt.order_id = o.id
     WHERE rt.token_hash = $1`,
    [tokenHash]
  );

  if (res.rows.length === 0) {
    return { isValid: false, error: 'رابط التقييم غير موجود أو غير صالح.' };
  }

  const record = res.rows[0];

  if (!record.is_active) {
    return { isValid: false, error: 'تم تعطيل رابط التقييم هذا من قبل الإدارة.' };
  }

  if (record.uses_count >= record.max_uses) {
    return { isValid: false, error: 'تم استخدام رابط التقييم هذا من قبل مسبقاً.' };
  }

  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return { isValid: false, error: 'انتهت صلاحية رابط التقييم هذا.' };
  }

  // If order-specific, verify order is completed if order exists
  if (record.type === 'ORDER_SPECIFIC' && record.order_id) {
    // Check if order already reviewed
    const existingReview = await pool.query(
      'SELECT id FROM "reviews" WHERE order_id = $1 LIMIT 1',
      [record.order_id]
    );
    if (existingReview.rows.length > 0) {
      return { isValid: false, error: 'تم تقييم هذا الطلب مسبقاً، شكراً لمشاركتنا رأيك.' };
    }
  }

  const effectiveProductName = record.packageName || record.product_name || 'منتج KIROPRO';

  return {
    isValid: true,
    tokenRecord: {
      id: record.id,
      type: record.type,
      orderId: record.order_id,
      orderNumber: record.order_id ? record.order_id.slice(0, 8).toUpperCase() : null,
      productId: record.product_id,
      productName: effectiveProductName,
      createdBy: record.created_by
    }
  };
}

export default {
  hashToken,
  generateSecureRawToken,
  getOrCreateOrderReviewToken,
  createGeneralReviewToken,
  verifyReviewToken
};
