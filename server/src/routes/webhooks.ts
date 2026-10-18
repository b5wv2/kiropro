import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { awardOrderCashback, reverseOrderCashback } from '../services/cashbackService';
import { processReferralRewardOnOrder } from '../services/referralService';
import { grantBonusSpinForOrder } from '../services/wheelService';
import { sendOrderCompletedEmail } from '../services/emailService';
import { getOrCreateOrderReviewToken } from '../services/reviewTokenService';
import { randomUUID as uuidv4 } from 'crypto';

const router = Router();

/**
 * Standard Webhook signature verification
 * Complies strictly with G2Bulk & Standard Webhooks specification:
 * - Secret prefix: whsec_
 * - HMAC-SHA256 over: ${webhook-id}.${webhook-timestamp}.${rawBody}
 * - Timing-safe comparison against v1,<base64>
 * - 5-minute (300 seconds) timestamp window tolerance
 */
export function verifyStandardWebhookSignature(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string
): { valid: boolean; reason?: string } {
  if (!secret) {
    return { valid: false, reason: 'Webhook secret is not configured' };
  }

  const webhookId = Array.isArray(headers['webhook-id']) ? headers['webhook-id'][0] : headers['webhook-id'];
  const webhookTimestamp = Array.isArray(headers['webhook-timestamp']) ? headers['webhook-timestamp'][0] : headers['webhook-timestamp'];
  const webhookSignature = Array.isArray(headers['webhook-signature']) ? headers['webhook-signature'][0] : headers['webhook-signature'];

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { valid: false, reason: 'Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)' };
  }

  // 1. Timestamp tolerance verification (within 5 minutes = 300s)
  const ts = Number(webhookTimestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(nowSec - ts) > 300) {
    return { valid: false, reason: `Webhook timestamp outside 5-minute tolerance window (now: ${nowSec}, header: ${ts})` };
  }

  // 2. Decode signing key
  let key: Buffer;
  try {
    const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    key = Buffer.from(rawSecret, 'base64');
  } catch (err: any) {
    return { valid: false, reason: 'Invalid webhook secret base64 format' };
  }

  // 3. Compute expected signature
  const bodyContent = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const signedPayload = `${webhookId}.${webhookTimestamp}.${bodyContent}`;
  const computedHash = crypto.createHmac('sha256', key).update(signedPayload).digest('base64');
  const expectedSignature = `v1,${computedHash}`;

  // 4. Timing-safe comparison across signatures
  const signatures = webhookSignature.split(' ').map(s => s.trim()).filter(Boolean);
  let matched = false;

  for (const sig of signatures) {
    if (sig.length === expectedSignature.length) {
      if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))) {
        matched = true;
        break;
      }
    }
  }

  if (!matched) {
    return { valid: false, reason: 'Webhook signature verification failed' };
  }

  return { valid: true };
}

/**
 * G2Bulk Webhook Event Handler for Top-Up and Purchases
 * Mounted on: /webhook/prvidr and /webhook/providr (without redirect)
 */
export async function handleG2BulkWebhook(req: Request, res: Response) {
  const webhookId = String(req.headers['webhook-id'] || '');
  const webhookTimestamp = String(req.headers['webhook-timestamp'] || '');
  const eventHeader = String(req.headers['x-g2bulk-event'] || '');
  const secret = (process.env.G2BULK_WEBHOOK_SECRET || process.env.WHSEC_G2BULK || '').trim();

  const rawBody = (req as any).rawBody 
    ? (req as any).rawBody 
    : Buffer.from(JSON.stringify(req.body || {}), 'utf8');

  // 1. Signature Verification
  if (!secret) {
    console.error('[G2Bulk Webhook] Error: G2BULK_WEBHOOK_SECRET is not configured in environment variables.');
    return res.status(500).json({ error: 'Webhook secret is not configured on server' });
  }

  const verification = verifyStandardWebhookSignature(rawBody, req.headers as any, secret);
  if (!verification.valid) {
    console.warn(`[G2Bulk Webhook] Verification rejected: ${verification.reason} (IP: ${req.ip})`);
    return res.status(401).json({ error: verification.reason || 'Invalid signature' });
  }

  const payload = req.body || {};
  const eventId = payload.event_id || webhookId;
  const eventType = payload.event || eventHeader || 'unknown';
  const providerOrderId = payload.order_id !== undefined ? String(payload.order_id) : null;
  const rawStatus = String(payload.status || '').toUpperCase();

  console.log(`[G2Bulk Webhook] Received valid event: "${eventType}" (ID: ${eventId}, Order: ${providerOrderId}, Status: ${rawStatus})`);

  // 2. Persistent Replay Protection (Deduplication via PostgreSQL)
  try {
    const dedupRes = await pool.query(`
      INSERT INTO "webhook_events" (
        "event_id", "provider", "event_type", "payload", "provider_order_id", "created_at"
      ) VALUES ($1, 'G2BULK', $2, $3, $4, NOW())
      ON CONFLICT ("event_id") DO NOTHING
      RETURNING "event_id"
    `, [eventId, eventType, JSON.stringify(payload), providerOrderId]);

    if (dedupRes.rows.length === 0) {
      console.log(`[G2Bulk Webhook] Event ${eventId} already recorded/processed. Acknowledging with 200 OK.`);
      return res.status(200).json({ success: true, duplicate: true, message: 'Event already received' });
    }
  } catch (dbErr: any) {
    console.error('[G2Bulk Webhook] Deduplication table query error:', dbErr.message);
  }

  // 3. Find matching Order in database
  if (!providerOrderId) {
    return res.status(200).json({ success: true, message: 'No provider order_id in event payload' });
  }

  const remarkStr = payload.remark ? String(payload.remark).trim() : '';
  const cleanRemarkId = remarkStr.replace(/^KIROPRO-/i, '').trim();

  let orderRes = await pool.query(`
    SELECT id, "userId", status, amount, "chargedAmount", "chargedCurrency", "packageName", "packageId",
           "provider", "providerOrderId", "fulfillmentKey"
    FROM "Order"
    WHERE "provider" = 'G2BULK' AND "providerOrderId"::text = $1
    LIMIT 1
  `, [providerOrderId]);

  if (orderRes.rows.length === 0 && cleanRemarkId) {
    orderRes = await pool.query(`
      SELECT id, "userId", status, amount, "chargedAmount", "chargedCurrency", "packageName", "packageId",
             "provider", "providerOrderId", "fulfillmentKey"
      FROM "Order"
      WHERE id::text = $1 OR "idempotencyKey"::text = $1
      LIMIT 1
    `, [cleanRemarkId]);
  }

  if (orderRes.rows.length === 0) {
    console.warn(`[G2Bulk Webhook] Warning: Order not found for G2Bulk order_id ${providerOrderId} (Remark: ${remarkStr}).`);
    return res.status(200).json({ success: true, message: 'Order not found in KIROPRO system, event recorded' });
  }

  const order = orderRes.rows[0];

  // 4. Handle Terminal COMPLETED State
  if (eventType === 'topup.completed' || rawStatus === 'COMPLETED') {
    if (order.status === 'COMPLETED') {
      console.log(`[G2Bulk Webhook] Order ${order.id} is already COMPLETED. No-op.`);
      return res.status(200).json({ success: true, status: 'COMPLETED', noop: true });
    }

    console.log(`[G2Bulk Webhook] Marking Order ${order.id} as COMPLETED.`);
    const fulfillmentData = payload.player_name 
      ? `تم الشحن بنجاح للاعب: ${payload.player_name}` 
      : (payload.message || 'Order completed');

    await pool.query(`
      UPDATE "Order"
      SET 
        status = 'COMPLETED',
        "providerStatus" = 'COMPLETED',
        "providerOrderId" = COALESCE("providerOrderId", $1),
        "fulfillmentKey" = COALESCE($2, "fulfillmentKey"),
        "completedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = $3
    `, [providerOrderId, fulfillmentData, order.id]);

    // Mark event processed
    await pool.query(
      `UPDATE "webhook_events" SET processed = true, processed_at = NOW(), order_id = $1 WHERE event_id = $2`,
      [order.id, eventId]
    );

    // Award cashback and referral safely once
    try { await awardOrderCashback(order.id); } catch (e: any) { console.error('[Webhook] Cashback award error:', e.message); }
    try { await processReferralRewardOnOrder(order.id); } catch (e: any) { console.error('[Webhook] Referral reward error:', e.message); }
    try { await grantBonusSpinForOrder(order.id); } catch (e: any) { console.error('[Webhook] Bonus spin error:', e.message); }

    // Customer email notification
    try {
      const uRes = await pool.query(
        'SELECT u.email, u.name FROM "User" u WHERE u.id = $1',
        [order.userId]
      );
      const user = uRes.rows[0];
      if (user?.email) {
        const rt = await getOrCreateOrderReviewToken(order.id, order.packageId, order.packageName, order.userId);
        await sendOrderCompletedEmail({
          to: user.email,
          userId: order.userId,
          orderId: order.id,
          customerName: user.name || undefined,
          productName: order.packageName,
          orderNumber: order.id.slice(0, 8).toUpperCase(),
          amount: Number(order.chargedAmount || order.amount || 0),
          currency: order.chargedCurrency || 'SDG',
          fulfillmentKey: fulfillmentData,
          reviewToken: rt.token
        });
      }
    } catch (mailErr: any) {
      console.error('[Webhook] Order completed email error:', mailErr.message);
    }

    return res.status(200).json({ success: true, status: 'COMPLETED', orderId: order.id });
  }

  // 5. Handle Terminal FAILED State with Single Atomic Refund
  if (eventType === 'topup.failed' || rawStatus === 'FAILED' || rawStatus === 'CANCELLED') {
    if (order.status === 'FAILED') {
      console.log(`[G2Bulk Webhook] Order ${order.id} is already FAILED/refunded. No-op.`);
      return res.status(200).json({ success: true, status: 'FAILED', noop: true });
    }

    console.log(`[G2Bulk Webhook] Order ${order.id} failed upstream. Executing single refund for user ${order.userId}...`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Revert any awarded cashback
      try {
        await reverseOrderCashback(order.id, client);
      } catch (rcErr: any) {
        console.warn('[Webhook] Cashback reversal error:', rcErr.message);
      }

      // Lock user's wallet FOR UPDATE
      const walletRes = await client.query(
        'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
        [order.userId]
      );
      const wallet = walletRes.rows[0];

      if (wallet) {
        const refundAmount = Number(order.chargedAmount || order.amount || 0);
        const userCurrency = wallet.currency || 'SDG';
        const balanceBefore = Number(wallet.balance);
        const newBalance = Math.round((balanceBefore + refundAmount) * 100) / 100;

        await client.query(
          'UPDATE "Wallet" SET balance = $1, "updatedAt" = NOW() WHERE id = $2',
          [newBalance, wallet.id]
        );

        await client.query(
          `INSERT INTO "WalletTransaction" 
            (id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            uuidv4(),
            wallet.id,
            refundAmount,
            'REFUND',
            `استرجاع رصيد لطلب شحن فاشل: ${order.packageName}`,
            userCurrency,
            balanceBefore,
            newBalance,
            'ORDER',
            order.id,
            null,
            'SYSTEM'
          ]
        );
      }

      // Revert promo code redemption if applied
      const promoRedemption = await client.query(
        'SELECT id, promo_code_id FROM promo_code_redemptions WHERE order_id = $1',
        [order.id]
      );
      for (const r of promoRedemption.rows) {
        await client.query('DELETE FROM promo_code_redemptions WHERE id = $1', [r.id]);
        await client.query(
          'UPDATE promo_codes SET usage_count = GREATEST(0, usage_count - 1), updated_at = NOW() WHERE id = $1',
          [r.promo_code_id]
        );
      }

      // Update Order to FAILED
      await client.query(`
        UPDATE "Order"
        SET 
          status = 'FAILED',
          "providerStatus" = 'FAILED',
          "failureReason" = $1,
          "updatedAt" = NOW()
        WHERE id = $2
      `, [payload.message || 'فشل تنفيذ الطلب لدى مزود الخدمة G2Bulk', order.id]);

      // Mark webhook event processed
      await client.query(
        `UPDATE "webhook_events" SET processed = true, processed_at = NOW(), order_id = $1 WHERE event_id = $2`,
        [order.id, eventId]
      );

      await client.query('COMMIT');
      console.log(`[G2Bulk Webhook] Refund completed successfully for Order ${order.id}.`);

      return res.status(200).json({ success: true, status: 'FAILED', refunded: true, orderId: order.id });
    } catch (refundErr: any) {
      await client.query('ROLLBACK');
      console.error(`[G2Bulk Webhook] Transaction error while refunding order ${order.id}:`, refundErr);
      return res.status(500).json({ error: 'Failed to process order failure transaction' });
    } finally {
      client.release();
    }
  }

  return res.status(200).json({ success: true, status: rawStatus, message: 'Event acknowledged' });
}

// Mount handler on the router
router.post('/', handleG2BulkWebhook);

export default router;
