import pool from '../db';
import { gamesDropProvider, mapGamesDropStatus } from '../providers/gamesdrop';
import { v4 as uuidv4 } from 'uuid';
import { awardOrderCashback, reverseOrderCashback } from './cashbackService';
import { processReferralRewardOnOrder } from './referralService';
import { sendOrderCompletedEmail } from './emailService';
import { getOrCreateOrderReviewToken } from './reviewTokenService';

/**
 * Background Order Polling Service for GamesDrop
 * Polls active non-terminal orders every 7 seconds independently.
 * Uses PostgreSQL row-level locks (SKIP LOCKED) to prevent duplicate workers.
 */
class OrderPollingService {
  private timer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private readonly INTERVAL_MS = 7000; // Strictly 7 seconds as requested

  public start(): void {
    if (this.timer) return;
    console.log('[OrderPollingService] Started GamesDrop order polling worker (Interval: 7s)');
    this.timer = setInterval(() => this.pollActiveOrders(), this.INTERVAL_MS);
    // Initial run
    this.pollActiveOrders();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[OrderPollingService] Stopped order polling worker');
    }
  }

  public async pollActiveOrders(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Claim up to 5 orders that are in 'PROCESSING' and haven't been polled in the last 7 seconds
        const ordersRes = await client.query(`
          SELECT 
            o.id, 
            o."userId", 
            o."providerOrderId", 
            o."providerOfferId", 
            o.amount, 
            o."chargedAmount",
            o."chargedCurrency",
            o."packageName",
            o.status
          FROM "Order" o
          WHERE o.status = 'PROCESSING'
            AND o."providerOrderId" IS NOT NULL
            AND (o."lastPolledAt" IS NULL OR o."lastPolledAt" <= NOW() - INTERVAL '7 seconds')
          ORDER BY o."createdAt" ASC
          LIMIT 5
          FOR UPDATE SKIP LOCKED
        `);

        const claimedOrders = ordersRes.rows;

        // Mark lastPolledAt right away
        if (claimedOrders.length > 0) {
          const ids = claimedOrders.map(o => o.id);
          await client.query(`
            UPDATE "Order" 
            SET "lastPolledAt" = NOW() 
            WHERE id = ANY($1::uuid[])
          `, [ids]);
        }

        await client.query('COMMIT');

        // Process each claimed order independently
        for (const order of claimedOrders) {
          await this.pollSingleOrder(order);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[OrderPollingService] Error claiming orders:', err);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[OrderPollingService] Worker cycle exception:', err);
    } finally {
      this.isPolling = false;
    }
  }

  private async pollSingleOrder(order: any): Promise<void> {
    const providerOrderId = Number(order.providerOrderId);
    if (!providerOrderId || isNaN(providerOrderId)) return;

    try {
      console.log(`[OrderPollingService] Checking status for GamesDrop orderId: ${providerOrderId} (KIRO order: ${order.id})`);
      const statusRes = await gamesDropProvider.getOrderStatus(providerOrderId);
      
      const rawStatus = statusRes.status;
      const mappedStatus = mapGamesDropStatus(rawStatus);

      console.log(`[OrderPollingService] Order ${order.id} -> GamesDrop status: ${rawStatus} (Mapped: ${mappedStatus})`);

      // 1. Terminal COMPLETED State
      if (mappedStatus === 'COMPLETED') {
        const key = statusRes.key || null;
        // Never log key!
        console.log(`[OrderPollingService] Order ${order.id} COMPLETED successfully. Key present: ${!!key}`);

        await pool.query(`
          UPDATE "Order"
          SET 
            status = 'COMPLETED',
            "providerStatus" = $1,
            "fulfillmentKey" = COALESCE($2, "fulfillmentKey"),
            "completedAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = $3
        `, [rawStatus, key, order.id]);

        // Trigger Cashback Awarding (Idempotent & Safe)
        try {
          await awardOrderCashback(order.id);
        } catch (cbErr) {
          console.error(`[OrderPollingService] Cashback award error for order ${order.id}:`, cbErr);
        }

        // Trigger Referral Reward Awarding (Idempotent & Safe)
        try {
          await processReferralRewardOnOrder(order.id);
        } catch (refErr) {
          console.error(`[OrderPollingService] Referral reward error for order ${order.id}:`, refErr);
        }

        // Trigger Order Completed Email Safely (Non-blocking & Idempotent)
        try {
          const uRes = await pool.query(
            'SELECT u.email, u.name, o."packageName", o."chargedAmount", o.amount, o."chargedCurrency", o."packageId", o."fulfillmentKey" FROM "Order" o JOIN "User" u ON o."userId" = u.id WHERE o.id = $1',
            [order.id]
          );
          const orderUser = uRes.rows[0];
          if (orderUser?.email) {
            const rt = await getOrCreateOrderReviewToken(
              order.id, 
              orderUser.packageId, 
              orderUser.packageName, 
              order.userId
            );
            await sendOrderCompletedEmail({
              to: orderUser.email,
              userId: order.userId,
              orderId: order.id,
              customerName: orderUser.name || undefined,
              productName: orderUser.packageName,
              orderNumber: order.id.slice(0, 8).toUpperCase(),
              amount: Number(orderUser.chargedAmount || orderUser.amount || 0),
              currency: orderUser.chargedCurrency || 'USD',
              fulfillmentKey: key || orderUser.fulfillmentKey,
              reviewToken: rt.token
            });
          }
        } catch (mailErr) {
          console.error(`[OrderPollingService] Order completed email error for ${order.id}:`, mailErr);
        }

        return;
      }

      // 2. Terminal FAILED / CANCELED / REFUND State -> Refund customer balance
      if (mappedStatus === 'FAILED' || mappedStatus === 'REFUNDED') {
        console.log(`[OrderPollingService] Order ${order.id} ended in ${mappedStatus}. Refunding user ${order.userId}...`);
        
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Revert any awarded cashback first
          try {
            await reverseOrderCashback(order.id, client);
          } catch (rcErr) {
            console.error(`[OrderPollingService] Cashback reverse error for order ${order.id}:`, rcErr);
          }

          // Fetch user's wallet
          const walletRes = await client.query(
            'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
            [order.userId]
          );
          const wallet = walletRes.rows[0];

          if (wallet) {
            const refundAmount = Number(order.chargedAmount || order.amount || 0);
            const userCurrency = wallet.currency || 'USD';
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
                `استرجاع رصيد لطلب ملغي/فاشل: ${order.packageName}`,
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

          // Revert promo redemption if any
          const promoRedemption = await client.query('SELECT id, promo_code_id FROM promo_code_redemptions WHERE order_id = $1', [order.id]);
          for (const r of promoRedemption.rows) {
            await client.query('DELETE FROM promo_code_redemptions WHERE id = $1', [r.id]);
            await client.query('UPDATE promo_codes SET usage_count = GREATEST(0, usage_count - 1), updated_at = NOW() WHERE id = $1', [r.promo_code_id]);
          }

          await client.query(`
            UPDATE "Order"
            SET 
              status = $1,
              "providerStatus" = $2,
              "failureReason" = $3,
              "updatedAt" = NOW()
            WHERE id = $4
          `, [mappedStatus, rawStatus, statusRes.message || 'تم إلغاء الطلب من قبل مزود الخدمة', order.id]);

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[OrderPollingService] Error processing refund for order ${order.id}:`, err);
        } finally {
          client.release();
        }
        return;
      }

      // 3. Still in progress (SUBMITTED / PROCESSING)
      await pool.query(`
        UPDATE "Order"
        SET 
          "providerStatus" = $1,
          "updatedAt" = NOW()
        WHERE id = $2
      `, [rawStatus, order.id]);

    } catch (err: any) {
      console.error(`[OrderPollingService] Error polling order ${order.id}:`, err?.message || err);
    }
  }
}

export const orderPollingService = new OrderPollingService();
