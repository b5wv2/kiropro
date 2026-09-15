import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { gamesDropProvider } from '../providers/gamesdrop';
import { mapGamesDropStatus, mapGamesDropErrorMessage } from '../providers/gamesdrop/mapper';
import { awardOrderCashback } from './cashbackService';
import { getOrCreateOrderReviewToken } from './reviewTokenService';
import { sendOrderProcessingEmail, sendOrderCompletedEmail } from './emailService';

export interface ExecuteOrderResult {
  success: boolean;
  message: string;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  providerOrderId?: number | null;
  providerStatus?: string | null;
}

/**
 * Authoritative Order Execution with GamesDrop Provider
 * Used by both Customer order creation and Admin Manual Execution.
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

    // 3. Load authoritative Product from PostgreSQL
    const prodRes = await client.query(
      `SELECT id, "productName", "offerName", "providerOfferId", "customerPriceUsd" 
       FROM "Product" 
       WHERE (id::text = $1 OR "productId"::text = $1)
       LIMIT 1`,
      [order.packageId]
    );

    const product = prodRes.rows[0];
    const providerOfferId = Number(order.providerOfferId || product?.providerOfferId);

    if (!providerOfferId || isNaN(providerOfferId)) {
      throw new Error('معرّف مزود الخدمة للمنتج غير صالح.');
    }

    // 4. Fetch latest authoritative provider price from GamesDrop
    let latestOffer: any;
    try {
      latestOffer = await gamesDropProvider.findOffer(providerOfferId);
    } catch (offerErr: any) {
      console.error('[OrderExecution] Failed to fetch latest offer from GamesDrop:', offerErr.message);
      throw new Error('تعذر التواصل مع مزود الخدمة لتحديث أسعار العرض حالياً.');
    }

    const latestProviderPrice = Number(latestOffer?.price || order.providerPrice || 0);

    // 5. Dispatch Order to GamesDrop API
    const transactionId = `KIROPRO-${orderId}`;
    let gdResponse: any;

    try {
      gdResponse = await gamesDropProvider.createOrder({
        offerId: providerOfferId,
        price: latestProviderPrice,
        transactionId: transactionId,
        customer: {
          email: order.playerId && order.playerId.includes('@') ? order.playerId : 'customer@kiropro.store',
          gameUserId: order.playerId || order.userId,
          ...(order.serverId ? { gameServerId: order.serverId } : {})
        }
      });
    } catch (gdErr: any) {
      console.error('[OrderExecution] GamesDrop create-order call failed:', gdErr.message);
      const friendly = mapGamesDropErrorMessage(gdErr.errorCode || gdErr.message);

      await client.query(
        `UPDATE "Order" 
         SET "failureReason" = $1, "updatedAt" = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [gdErr.message || 'Provider execution failed', orderId]
      );
      await client.query('COMMIT');

      throw new Error(friendly || 'تعذر إرسال الطلب لمزود الخدمة. يرجى التحقق من تفاصيل الطلب والمحاولة لاحقاً.');
    }

    // 6. Handle GamesDrop Response
    const rawStatus = gdResponse.status;
    const mappedStatus = mapGamesDropStatus(rawStatus);
    const providerOrderId = gdResponse.order_id || gdResponse.orderId || null;
    const fulfillmentKey = gdResponse.key || null;

    if (mappedStatus === 'COMPLETED') {
      await client.query(
        `UPDATE "Order" 
         SET status = 'COMPLETED',
             "providerOrderId" = $1,
             "providerStatus" = $2,
             "fulfillmentKey" = $3,
             "completedAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [providerOrderId, rawStatus, fulfillmentKey, orderId]
      );
    } else if (mappedStatus === 'PROCESSING') {
      await client.query(
        `UPDATE "Order" 
         SET status = 'PROCESSING',
             "providerOrderId" = $1,
             "providerStatus" = $2,
             "lastPolledAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [providerOrderId, rawStatus, orderId]
      );
    } else {
      // FAILED / REFUNDED from provider
      await client.query(
        `UPDATE "Order" 
         SET status = $1,
             "providerOrderId" = $2,
             "providerStatus" = $3,
             "failureReason" = $4,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [mappedStatus, providerOrderId, rawStatus, gdResponse.message || `Provider status: ${rawStatus}`, orderId]
      );
    }

    // 7. Audit Log for Admin Execution
    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          uuidv4(),
          adminId,
          'MANUAL_ORDER_EXECUTION',
          order.userId,
          `تنفيذ يدوي للطلب #${orderId.slice(0, 8)} (الحالة السابقة: ${previousStatus}، الحالة الجديدة: ${mappedStatus}، مزود: ${providerOrderId})`
        ]
      );
    }

    await client.query('COMMIT');

    // 8. Trigger Post-Commit Cashback and Customer Notifications
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
              currency: orderUser.chargedCurrency || 'USD',
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
              currency: orderUser.chargedCurrency || 'USD'
            });
          }
        }
      } catch (mailErr: any) {
        console.error('[OrderExecution] Email notification error:', mailErr.message);
      }
    }

    return {
      success: true,
      message: mappedStatus === 'COMPLETED' 
        ? 'تم تنفيذ الطلب بنجاح واكتمل الشحن فوراً!' 
        : 'تم إرسال الطلب بنجاح لمزود الخدمة وهو الآن قيد التنفيذ والمتابعة التلقائية.',
      orderId,
      previousStatus,
      newStatus: mappedStatus,
      providerOrderId,
      providerStatus: rawStatus
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
