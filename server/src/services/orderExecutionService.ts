import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { providerRouter } from '../providers/router';
import { awardOrderCashback } from './cashbackService';
import { grantBonusSpinForOrder } from './wheelService';
import { getOrCreateOrderReviewToken } from './reviewTokenService';
import { sendOrderProcessingEmail, sendOrderCompletedEmail } from './emailService';

export interface ExecuteOrderResult {
  success: boolean;
  message: string;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  provider?: string | null;
  providerOrderId?: number | string | null;
  providerStatus?: string | null;
  fallbackUsed?: boolean | undefined;
}

/**
 * Authoritative Order Execution with ProviderRouter (Multi-Provider: GamesDrop & G2Bulk)
 * Used by Customer order creation and Admin Manual Execution.
 * Strictly guarantees idempotency, locking, and zero duplicate executions.
 */
export async function executeOrderWithProvider(params: {
  orderId: string;
  adminId?: string | undefined;
}): Promise<ExecuteOrderResult> {
  const { orderId, adminId } = params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock order row for update
    const orderRes = await client.query(
      'SELECT * FROM "Order" WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error('الطلب غير موجود.');
    }

    const order = orderRes.rows[0];
    const previousStatus = order.status;

    // 2. Idempotency guards
    if (order.status === 'COMPLETED') {
      throw new Error('الطلب مكتمل بالفعل ولا يمكن إعادة تنفيذه.');
    }

    if (order.status === 'PROCESSING') {
      throw new Error('الطلب قيد المعالجة بالفعل لدى مزود الخدمة، جارٍ استلام التحديثات تلقائياً.');
    }

    // 3. Resolve authoritative Provider Routing for Product
    const routing = await providerRouter.resolveProductProviders(order.packageId);

    // Ensure persistent UUID idempotency key per order
    let idempotencyKey = order.idempotencyKey;
    if (!idempotencyKey) {
      idempotencyKey = uuidv4();
      await client.query(
        'UPDATE "Order" SET "idempotencyKey" = $1 WHERE id = $2',
        [idempotencyKey, orderId]
      );
    }

    // 4. Dispatch Top-up via ProviderRouter with Safe Fallback protection
    const dispatchResult = await providerRouter.executeTopupOrder({
      koaraOrderId: orderId,
      playerUserId: (order.playerId || order.userId || '').trim(),
      serverZoneId: order.serverId ? String(order.serverId).trim() : undefined,
      customerEmail: order.playerId && order.playerId.includes('@') ? order.playerId : 'customer@kiropro.store',
      idempotencyKey: idempotencyKey,
      expectedPriceUsd: Number(order.providerCostUsd || order.providerPrice || routing.primaryCostUsd || 0)
    }, routing);

    const providerName = dispatchResult.provider;
    const providerOrderId = dispatchResult.providerOrderId || null;
    const rawStatus = dispatchResult.providerStatus;
    const canonicalStatus = dispatchResult.canonicalStatus;
    const fulfillmentKey = dispatchResult.fulfillmentKey || null;
    const costSnapshot = dispatchResult.costUsd || routing.primaryCostUsd || 0;

    // 5. Update Order State based on Canonical Status
    let mappedStatus = 'PROCESSING';

    if (dispatchResult.isAmbiguous) {
      // Ambiguous state (timeout / network disconnection after submit):
      // Transition strictly to PROVIDER_UNKNOWN to prevent double fulfillment!
      mappedStatus = 'PROVIDER_UNKNOWN';
      await client.query(
        `UPDATE "Order" 
         SET status = 'PROVIDER_UNKNOWN',
             "provider" = $1,
             "providerStatus" = $2,
             "providerCostUsd" = COALESCE("providerCostUsd", $3),
             "failureReason" = $4,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          providerName,
          rawStatus || 'UNKNOWN',
          costSnapshot,
          dispatchResult.message || 'حالة الطلب غير مؤكدة لدى مزود الخدمة (Timeout/Network). يرجى التحقق اليدوي لمنع التكرار.',
          orderId
        ]
      );
    } else if (canonicalStatus === 'COMPLETED') {
      mappedStatus = 'COMPLETED';
      await client.query(
        `UPDATE "Order" 
         SET status = 'COMPLETED',
             "provider" = $1,
             "providerOrderId" = $2,
             "providerStatus" = $3,
             "providerCostUsd" = COALESCE("providerCostUsd", $4),
             "fulfillmentKey" = $5,
             "completedAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [providerName, providerOrderId, rawStatus, costSnapshot, fulfillmentKey, orderId]
      );
    } else if (canonicalStatus === 'PROCESSING' || canonicalStatus === 'PENDING') {
      mappedStatus = 'PROCESSING';
      await client.query(
        `UPDATE "Order" 
         SET status = 'PROCESSING',
             "provider" = $1,
             "providerOrderId" = $2,
             "providerStatus" = $3,
             "providerCostUsd" = COALESCE("providerCostUsd", $4),
             "lastPolledAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [providerName, providerOrderId, rawStatus, costSnapshot, orderId]
      );
    } else {
      // Definitive failure
      mappedStatus = 'FAILED';
      await client.query(
        `UPDATE "Order" 
         SET status = 'FAILED',
             "provider" = $1,
             "providerOrderId" = $2,
             "providerStatus" = $3,
             "providerCostUsd" = COALESCE("providerCostUsd", $4),
             "failureReason" = $5,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [providerName, providerOrderId, rawStatus, costSnapshot, dispatchResult.message || 'Provider execution failed', orderId]
      );
    }

    // 6. Audit Log for Admin Execution
    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          uuidv4(),
          adminId,
          'MANUAL_ORDER_EXECUTION',
          order.userId,
          `تنفيذ يدوي للطلب #${orderId.slice(0, 8)} عبر [${providerName}] (الحالة السابقة: ${previousStatus}، الحالة الجديدة: ${mappedStatus}، مزود: ${providerOrderId || 'N/A'}${dispatchResult.fallbackUsed ? ' [Fallback Used]' : ''})`
        ]
      );
    }

    await client.query('COMMIT');

    // 7. Trigger Post-Commit Cashback and Customer Notifications
    if (mappedStatus === 'COMPLETED' || mappedStatus === 'PROCESSING') {
      try {
        const uRes = await pool.query(
          'SELECT u.email, u.name, o."packageName", o."chargedAmount", o.amount, o."chargedCurrency", o."packageId", o."fulfillmentKey" FROM "Order" o JOIN "User" u ON o."userId" = u.id WHERE o.id = $1',
          [orderId]
        );
        const orderUser = uRes.rows[0];
        if (orderUser?.email) {
          if (mappedStatus === 'COMPLETED') {
            try {
              await awardOrderCashback(orderId);
            } catch (cbErr) {
              console.error('[OrderExecution] Cashback error:', cbErr);
            }

            try {
              await grantBonusSpinForOrder(orderId);
            } catch (spinErr) {
              console.error('[OrderExecution] Bonus spin error:', spinErr);
            }

            const rt = await getOrCreateOrderReviewToken(
              orderId,
              orderUser.packageId,
              orderUser.packageName,
              order.userId
            );

            await sendOrderCompletedEmail({
              to: orderUser.email,
              userId: order.userId,
              orderId: orderId,
              customerName: orderUser.name || undefined,
              productName: orderUser.packageName,
              orderNumber: orderId.slice(0, 8).toUpperCase(),
              amount: Number(orderUser.chargedAmount || orderUser.amount || 0),
              currency: orderUser.chargedCurrency || 'SDG',
              fulfillmentKey: fulfillmentKey || orderUser.fulfillmentKey,
              reviewToken: rt.token
            });
          } else if (mappedStatus === 'PROCESSING') {
            await sendOrderProcessingEmail({
              to: orderUser.email,
              userId: order.userId,
              orderId: orderId,
              customerName: orderUser.name || undefined,
              productName: orderUser.packageName,
              orderNumber: orderId.slice(0, 8).toUpperCase(),
              amount: Number(orderUser.chargedAmount || orderUser.amount || 0),
              currency: orderUser.chargedCurrency || 'SDG'
            });
          }
        }
      } catch (mailErr: any) {
        console.error('[OrderExecution] Email notification error:', mailErr.message);
      }
    }

    return {
      success: mappedStatus === 'COMPLETED' || mappedStatus === 'PROCESSING',
      message: mappedStatus === 'COMPLETED' 
        ? 'تم تنفيذ الطلب بنجاح واكتمل الشحن فوراً!' 
        : mappedStatus === 'PROVIDER_UNKNOWN'
          ? 'تم تعليق الطلب كـ PROVIDER_UNKNOWN لعدم استقرار اتصال المزود، لمنع الشحن المزدوج.'
          : mappedStatus === 'PROCESSING'
            ? 'تم إرسال الطلب بنجاح لمزود الخدمة وهو الآن قيد التنفيذ والمتابعة التلقائية.'
            : 'فشل تنفيذ الطلب لدى مزود الخدمة.',
      orderId,
      previousStatus,
      newStatus: mappedStatus,
      provider: providerName,
      providerOrderId,
      providerStatus: rawStatus,
      fallbackUsed: dispatchResult.fallbackUsed
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
