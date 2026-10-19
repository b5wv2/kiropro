import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { awardOrderCashback, reverseOrderCashback } from '../services/cashbackService';
import { processReferralRewardOnOrder } from '../services/referralService';
import { grantBonusSpinForOrder } from '../services/wheelService';
import { sendOrderCompletedEmail } from '../services/emailService';
import { getOrCreateOrderReviewToken } from '../services/reviewTokenService';
import { g2BulkClient } from '../providers/g2bulk/client';
import { encryptVoucherCode, maskVoucherCode } from '../utils/cryptoVoucher';
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

  const getHeaderStr = (name: string): string => {
    const val = headers[name.toLowerCase()] || headers[name];
    if (Array.isArray(val)) return String(val[0] || '').trim();
    return typeof val === 'string' ? val.trim() : '';
  };

  const webhookId = getHeaderStr('webhook-id');
  const webhookTimestamp = getHeaderStr('webhook-timestamp');
  const webhookSignature = getHeaderStr('webhook-signature');

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
    if (key.length === 0) {
      return { valid: false, reason: 'Invalid empty webhook secret key' };
    }
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
 * Mounted on: /webhook/provider, /webhook/prvidr, /webhook/providr (without redirect)
 */
export async function handleG2BulkWebhook(req: Request, res: Response) {
  const webhookId = String(req.headers['webhook-id'] || req.headers['Webhook-Id'] || '');
  const webhookTimestamp = String(req.headers['webhook-timestamp'] || req.headers['Webhook-Timestamp'] || '');
  const eventHeader = String(req.headers['x-g2bulk-event'] || req.headers['X-G2Bulk-Event'] || '');
  const secret = (process.env.G2BULK_WEBHOOK_SECRET || process.env.WHSEC_G2BULK || '').trim();

  // Enforce Raw Body from express.json verify
  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    console.warn('[G2Bulk Webhook] Rejected: rawBody is missing on request object');
    return res.status(400).json({ error: 'Missing raw request body for signature verification' });
  }

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
  const eventType = (payload.event || eventHeader || 'unknown').toLowerCase();
  const providerOrderId = payload.order_id !== undefined && payload.order_id !== null ? String(payload.order_id) : null;
  const rawStatus = String(payload.status || '').toUpperCase();

  // 2. Consistency check: event_id vs webhook-id
  if (payload.event_id && webhookId && payload.event_id !== webhookId) {
    console.warn(`[G2Bulk Webhook] Mismatch: payload.event_id (${payload.event_id}) does not match webhook-id header (${webhookId})`);
    return res.status(400).json({ error: 'event_id does not match webhook-id header' });
  }

  console.log(`[G2Bulk Webhook] Received valid event: "${eventType}" (ID: ${eventId}, Order: ${providerOrderId}, Status: ${rawStatus})`);

  // 3. Test / Ping Event Handling (Allows testing in G2Bulk dashboard with 200 OK delivery)
  const isTestEvent = eventType === 'test' || eventType === 'ping' || eventType === 'webhook.test' || !providerOrderId;
  if (isTestEvent) {
    console.log(`[G2Bulk Webhook] Acknowledging test/ping event: "${eventType}" (ID: ${eventId})`);
    try {
      await pool.query(`
        INSERT INTO "webhook_events" (
          "event_id", "provider", "event_type", "payload", "provider_order_id", "processed", "processed_at", "created_at"
        ) VALUES ($1, 'G2BULK', $2, $3, $4, true, NOW(), NOW())
        ON CONFLICT ("event_id") DO NOTHING
      `, [eventId, eventType, JSON.stringify(payload), providerOrderId]);
    } catch {}
    return res.status(200).json({ success: true, isTest: true, message: 'Test webhook event verified and received successfully' });
  }

  // 4. Persistent Replay Protection (Deduplication via PostgreSQL)
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
      return res.status(200).json({ success: true, duplicate: true, message: 'Event already received and processed' });
    }
  } catch (dbErr: any) {
    console.error('[G2Bulk Webhook] Deduplication table query error:', dbErr.message);
  }

  // 5. Find matching Order in database
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

  // 6. Handle Terminal COMPLETED State
  const isCompletedEvent = eventType === 'topup.completed' || eventType === 'order.completed' || rawStatus === 'COMPLETED';
  if (isCompletedEvent) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(`
        SELECT id, "userId", status, amount, "chargedAmount", "chargedCurrency", "packageName", "packageId", "fulfillmentKey"
        FROM "Order"
        WHERE id = $1
        FOR UPDATE
      `, [order.id]);
      const lockedOrder = lockRes.rows[0];

      if (!lockedOrder) {
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, message: 'Order not found' });
      }

      if (lockedOrder.status === 'COMPLETED') {
        console.log(`[G2Bulk Webhook] Order ${order.id} is already COMPLETED. No-op.`);
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, status: 'COMPLETED', noop: true });
      }

      if (lockedOrder.status === 'FAILED' || lockedOrder.status === 'REFUNDED') {
        console.warn(`[G2Bulk Webhook] SECURITY ALERT: Order ${order.id} was already finalized as ${lockedOrder.status}. Ignoring delayed COMPLETED webhook.`);
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, status: lockedOrder.status, noop: true, message: 'Order already finalized' });
      }

      console.log(`[G2Bulk Webhook] Marking Order ${order.id} as COMPLETED.`);
      let fulfillmentData = payload.player_name 
        ? `تم الشحن بنجاح للاعب: ${payload.player_name}` 
        : (payload.message || 'Order completed');

      // Check for delivered codes in payload (or fetch from G2Bulk if gift card/voucher order)
      let deliveredCodes: string[] = [];
      if (Array.isArray(payload.delivery_items)) {
        deliveredCodes = payload.delivery_items
          .map((item: any) => typeof item === 'string' ? item.trim() : (item.code || item.pin || ''))
          .filter(Boolean);
      }

      if (deliveredCodes.length === 0 && (eventType === 'order.completed' || !lockedOrder.fulfillmentKey)) {
        try {
          const delRes = await g2BulkClient.getDelivery(providerOrderId);
          const rawItems = delRes?.delivery_items || delRes?.items || [];
          if (Array.isArray(rawItems)) {
            deliveredCodes = rawItems
              .map((item: any) => typeof item === 'string' ? item.trim() : (item.code || item.pin || ''))
              .filter(Boolean);
          }
        } catch (delErr: any) {
          console.warn(`[G2Bulk Webhook] Notice: getDelivery for voucher order ${providerOrderId} was deferred:`, delErr.message);
        }
      }

      if (deliveredCodes.length > 0) {
        fulfillmentData = deliveredCodes.join('\n');

        // Store encrypted codes in order_voucher_codes if not already saved
        try {
          const existingCodes = await client.query(
            'SELECT id FROM "order_voucher_codes" WHERE order_id = $1 LIMIT 1',
            [order.id]
          );
          if (existingCodes.rows.length === 0) {
            for (const rawCode of deliveredCodes) {
              const encrypted = encryptVoucherCode(rawCode);
              const masked = maskVoucherCode(rawCode);
              await client.query(`
                INSERT INTO "order_voucher_codes" (
                  order_id, user_id, product_id, provider_product_id,
                  game_type, code_encrypted, code_masked, face_value, currency
                ) VALUES ($1, $2, $3, $4, 'voucher', $5, $6, 0, 'USD')
              `, [order.id, lockedOrder.userId, lockedOrder.packageId || order.id, providerOrderId, encrypted, masked]);
            }
          }
        } catch (codeErr: any) {
          console.error('[G2Bulk Webhook] Error persisting encrypted voucher codes:', codeErr.message);
        }
      }

      const updateRes = await client.query(`
        UPDATE "Order"
        SET 
          status = 'COMPLETED',
          "providerStatus" = 'COMPLETED',
          "providerOrderId" = COALESCE("providerOrderId", $1),
          "fulfillmentKey" = COALESCE($2, "fulfillmentKey"),
          "completedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE id = $3 AND status IN ('PENDING', 'PROCESSING')
        RETURNING id
      `, [providerOrderId, fulfillmentData, order.id]);

      if (updateRes.rows.length === 0) {
        console.log(`[G2Bulk Webhook] Order ${order.id} was already transitioned concurrently. Rolling back.`);
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, status: 'COMPLETED', noop: true });
      }

      // Mark event processed
      await client.query(
        `UPDATE "webhook_events" SET processed = true, processed_at = NOW(), order_id = $1 WHERE event_id = $2`,
        [order.id, eventId]
      );

      await client.query('COMMIT');

      // Award cashback and referral safely once outside transaction
      try { await awardOrderCashback(order.id); } catch (e: any) { console.error('[Webhook] Cashback award error:', e.message); }
      try { await processReferralRewardOnOrder(order.id); } catch (e: any) { console.error('[Webhook] Referral reward error:', e.message); }
      try { await grantBonusSpinForOrder(order.id); } catch (e: any) { console.error('[Webhook] Bonus spin error:', e.message); }

      // Customer email notification
      try {
        const uRes = await pool.query(
          'SELECT u.email, u.name FROM "User" u WHERE u.id = $1',
          [lockedOrder.userId]
        );
        const user = uRes.rows[0];
        if (user?.email) {
          const rt = await getOrCreateOrderReviewToken(order.id, lockedOrder.packageId, lockedOrder.packageName, lockedOrder.userId);
          await sendOrderCompletedEmail({
            to: user.email,
            userId: lockedOrder.userId,
            orderId: order.id,
            customerName: user.name || undefined,
            productName: lockedOrder.packageName,
            orderNumber: order.id.slice(0, 8).toUpperCase(),
            amount: Number(lockedOrder.chargedAmount || lockedOrder.amount || 0),
            currency: lockedOrder.chargedCurrency || 'SDG',
            fulfillmentKey: fulfillmentData,
            reviewToken: rt.token
          });
        }
      } catch (mailErr: any) {
        console.error('[Webhook] Order completed email error:', mailErr.message);
      }

      return res.status(200).json({ success: true, status: 'COMPLETED', orderId: order.id });
    } catch (compErr: any) {
      await client.query('ROLLBACK');
      console.error(`[G2Bulk Webhook] Error completing order ${order.id}:`, compErr);
      return res.status(500).json({ error: 'Failed to complete order' });
    } finally {
      client.release();
    }
  }

  // 7. Handle Terminal FAILED State with Single Atomic Refund
  const isFailedEvent = eventType === 'topup.failed' || eventType === 'order.failed' || eventType === 'order.refunded' || eventType === 'order.cancelled' || rawStatus === 'FAILED' || rawStatus === 'CANCELLED' || rawStatus === 'REFUNDED';
  if (isFailedEvent) {
    console.log(`[G2Bulk Webhook] Order ${order.id} failed upstream. Executing single atomic refund check...`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock Order row FOR UPDATE inside transaction
      const lockRes = await client.query(`
        SELECT id, "userId", status, amount, "chargedAmount", "chargedCurrency", "packageName", "packageId"
        FROM "Order"
        WHERE id = $1
        FOR UPDATE
      `, [order.id]);
      const lockedOrder = lockRes.rows[0];

      if (!lockedOrder) {
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, message: 'Order not found' });
      }

      // 2. Strict terminal state guards: completed orders CANNOT be refunded!
      if (lockedOrder.status === 'COMPLETED') {
        console.warn(`[G2Bulk Webhook] SECURITY ALERT: Order ${order.id} is already COMPLETED. Refusing to mark as FAILED or refund!`);
        await client.query('ROLLBACK');
        return res.status(200).json({ 
          success: true, 
          status: 'COMPLETED', 
          refunded: false, 
          message: 'Completed orders cannot be refunded' 
        });
      }

      if (lockedOrder.status === 'FAILED' || lockedOrder.status === 'REFUNDED') {
        console.log(`[G2Bulk Webhook] Order ${order.id} is already FAILED/refunded. No-op.`);
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, status: 'FAILED', noop: true });
      }

      if (lockedOrder.status !== 'PENDING' && lockedOrder.status !== 'PROCESSING') {
        console.warn(`[G2Bulk Webhook] Order ${order.id} is in non-refundable state (${lockedOrder.status}). Aborting.`);
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, status: lockedOrder.status, noop: true });
      }

      // 3. Lock user's wallet FOR UPDATE
      const walletRes = await client.query(
        'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
        [lockedOrder.userId]
      );
      const wallet = walletRes.rows[0];

      if (!wallet) {
        throw new Error(`Wallet not found for user ${lockedOrder.userId}`);
      }

      // 4. Atomic check against duplicate refund in ledger
      const existingRefund = await client.query(`
        SELECT id FROM "WalletTransaction"
        WHERE "walletId" = $1 AND "referenceType" = 'ORDER' AND "referenceId" = $2 AND "type" = 'REFUND'
        LIMIT 1
      `, [wallet.id, order.id]);

      if (existingRefund.rows.length > 0) {
        console.warn(`[G2Bulk Webhook] Duplicate refund detected in ledger for order ${order.id}. Skipping.`);
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, status: 'FAILED', duplicateRefund: true, noop: true });
      }

      // 5. Revert any awarded cashback (SEC-FIN-10: tracks spent cashback to deduct from refund)
      let unrecoveredCashback = 0;
      try {
        const rcRes = await reverseOrderCashback(order.id, client);
        unrecoveredCashback = rcRes?.unrecoveredAmount || 0;
      } catch (rcErr: any) {
        console.warn('[Webhook] Cashback reversal error:', rcErr.message);
      }

      // 6. Update Order status to FAILED atomically
      const updateOrderRes = await client.query(`
        UPDATE "Order"
        SET 
          status = 'FAILED',
          "providerStatus" = 'FAILED',
          "failureReason" = $1,
          "updatedAt" = NOW()
        WHERE id = $2 AND status IN ('PENDING', 'PROCESSING')
        RETURNING id
      `, [payload.message || 'فشل تنفيذ الطلب لدى مزود الخدمة G2Bulk', order.id]);

      if (updateOrderRes.rows.length === 0) {
        console.warn(`[G2Bulk Webhook] Order ${order.id} state changed concurrently. Aborting refund.`);
        await client.query('ROLLBACK');
        return res.status(200).json({ success: true, status: 'FAILED', noop: true });
      }

      // 7. Credit wallet net of unrecovered cashback
      const grossRefundAmount = Number(lockedOrder.chargedAmount || lockedOrder.amount || 0);
      const refundAmount = Math.max(0, grossRefundAmount - unrecoveredCashback);
      const userCurrency = wallet.currency || 'SDG';
      const balanceBefore = Number(wallet.balance);
      const newBalance = Math.round((balanceBefore + refundAmount) * 100) / 100;

      if (refundAmount > 0) {
        await client.query(
          'UPDATE "Wallet" SET balance = $1, "updatedAt" = NOW() WHERE id = $2',
          [newBalance, wallet.id]
        );
      }

      const refundDesc = unrecoveredCashback > 0
        ? `استرجاع رصيد لطلب شحن فاشل: ${lockedOrder.packageName} (مخصوماً منه كاش باك منصرف بقيمة ${unrecoveredCashback})`
        : `استرجاع رصيد لطلب شحن فاشل: ${lockedOrder.packageName}`;

      // 8. Insert refund transaction into ledger (enforced by DB index uq_wallet_tx_order_refund)
      await client.query(
        `INSERT INTO "WalletTransaction" 
          (id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          uuidv4(),
          wallet.id,
          refundAmount,
          'REFUND',
          refundDesc,
          userCurrency,
          balanceBefore,
          newBalance,
          'ORDER',
          order.id,
          null,
          'SYSTEM'
        ]
      );

      // 9. Revert promo code redemption if applied
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

      // 10. Mark webhook event processed
      await client.query(
        `UPDATE "webhook_events" SET processed = true, processed_at = NOW(), order_id = $1 WHERE event_id = $2`,
        [order.id, eventId]
      );

      await client.query('COMMIT');
      console.log(`[G2Bulk Webhook] Atomic refund completed successfully for Order ${order.id}.`);

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
