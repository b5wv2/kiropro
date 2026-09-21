import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';

export interface CashbackResult {
  awarded: boolean;
  ruleName?: string;
  baseCashbackUsd?: number;
  creditedAmount?: number;
  creditedCurrency?: string;
  reason?: string;
}

/**
 * Evaluates and awards Cashback for an order that reached COMPLETED status.
 * Strictly Idempotent: Uses UNIQUE(order_id) in cashback_redemptions.
 */
export async function awardOrderCashback(orderId: string, externalClient?: PoolClient): Promise<CashbackResult> {
  const isInternalTx = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (isInternalTx) await client.query('BEGIN');

    // 1. Fetch Order details
    const orderRes = await client.query(`
      SELECT 
        o.id, 
        o."userId", 
        o."customerPriceUsd", 
        o."customerPrice",
        o."chargedAmount", 
        o."chargedCurrency", 
        o."exchangeRateUsed", 
        o."discountAmount", 
        o."promoCode", 
        o."packageId", 
        o."gameId", 
        o.status,
        p."gameCategoryId"
      FROM "Order" o
      LEFT JOIN "Product" p ON o."packageId" = p.id
      WHERE o.id = $1
      FOR UPDATE
    `, [orderId]);

    const order = orderRes.rows[0];
    if (!order) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ORDER_NOT_FOUND' };
    }

    if (order.status !== 'COMPLETED') {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ORDER_NOT_COMPLETED' };
    }

    // 2. Check Idempotency: Has cashback already been awarded for this order?
    const existingRes = await client.query(
      'SELECT id FROM cashback_redemptions WHERE order_id = $1 FOR UPDATE',
      [order.id]
    );
    if (existingRes.rows.length > 0) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ALREADY_AWARDED' };
    }

    // 3. Fetch active Cashback Rules
    const now = new Date();
    const rulesRes = await client.query(`
      SELECT * 
      FROM cashback_rules 
      WHERE is_active = true 
        AND (starts_at IS NULL OR starts_at <= $1) 
        AND (expires_at IS NULL OR expires_at >= $1)
      ORDER BY percentage DESC, created_at ASC
    `, [now]);

    const activeRules = rulesRes.rows;
    if (activeRules.length === 0) {
      if (isInternalTx) await client.query('COMMIT');
      return { awarded: false, reason: 'NO_ACTIVE_RULES' };
    }

    // Determine purchase amount in USD
    const customerPriceUsd = Number(order.customerPriceUsd || order.customerPrice) || 0;
    if (customerPriceUsd <= 0) {
      if (isInternalTx) await client.query('COMMIT');
      return { awarded: false, reason: 'ZERO_ORDER_PRICE' };
    }

    // Net USD purchase price (accounting for discount in USD if any)
    const discountAmount = Number(order.discountAmount) || 0;
    const exchangeRate = Number(order.exchangeRateUsed) || 5000;
    const userCurrency = (order.chargedCurrency || 'SDG').toUpperCase();

    // If discount was in SDG, convert discount to USD; if in USD, use directly
    const discountInUsd = userCurrency === 'SDG' && exchangeRate > 0 
      ? discountAmount / exchangeRate 
      : discountAmount;

    const netPurchaseUsd = Math.max(0, customerPriceUsd - discountInUsd);
    if (netPurchaseUsd <= 0) {
      if (isInternalTx) await client.query('COMMIT');
      return { awarded: false, reason: 'NET_PURCHASE_ZERO' };
    }

    // 4. Find the first eligible rule
    let matchedRule: any = null;
    let finalBaseCashbackUsd = 0;

    for (const rule of activeRules) {
      // A. Scope check
      const scopeType = rule.scope_type || 'ALL_PRODUCTS';
      const eligibleIds: string[] = Array.isArray(rule.eligible_ids) ? rule.eligible_ids : [];

      if (scopeType === 'CATEGORY') {
        const catId = order.gameCategoryId || order.gameId;
        if (!catId || !eligibleIds.includes(catId)) continue;
      } else if (scopeType === 'SELECTED_PRODUCTS') {
        if (!order.packageId || !eligibleIds.includes(order.packageId)) continue;
      }

      // B. Promo Stacking check
      const hasPromo = Boolean(order.promoCode && String(order.promoCode).trim());
      if (hasPromo && rule.allow_promo_stacking === false) {
        continue;
      }

      // C. Global Total Usage Limit
      if (rule.usage_limit_total !== null && rule.usage_limit_total > 0) {
        const totalRedemptionsRes = await client.query(
          'SELECT COUNT(*) as count FROM cashback_redemptions WHERE cashback_rule_id = $1',
          [rule.id]
        );
        if (Number(totalRedemptionsRes.rows[0]?.count || 0) >= rule.usage_limit_total) {
          continue;
        }
      }

      // D. Per-User Usage Limit
      const userRedemptionsRes = await client.query(
        'SELECT COUNT(*) as count, COALESCE(SUM(base_cashback_usd), 0) as total_usd FROM cashback_redemptions WHERE cashback_rule_id = $1 AND user_id = $2',
        [rule.id, order.userId]
      );
      const userUsageCount = Number(userRedemptionsRes.rows[0]?.count || 0);
      const userTotalCashbackUsd = Number(userRedemptionsRes.rows[0]?.total_usd || 0);

      const maxUsesPerUser = rule.usage_limit_per_user || 1;
      if (userUsageCount >= maxUsesPerUser) {
        continue;
      }

      // E. Maximum Cashback Per User Cap
      let allowedCashbackUsd = (netPurchaseUsd * Number(rule.percentage)) / 100;
      if (rule.max_cashback_usd !== null && Number(rule.max_cashback_usd) > 0) {
        allowedCashbackUsd = Math.min(allowedCashbackUsd, Number(rule.max_cashback_usd));
      }

      if (rule.max_cashback_per_user_usd !== null && Number(rule.max_cashback_per_user_usd) > 0) {
        const maxUserLimit = Number(rule.max_cashback_per_user_usd);
        const remainingForUser = Math.max(0, maxUserLimit - userTotalCashbackUsd);
        if (remainingForUser <= 0) continue;
        allowedCashbackUsd = Math.min(allowedCashbackUsd, remainingForUser);
      }

      if (allowedCashbackUsd > 0.001) {
        matchedRule = rule;
        finalBaseCashbackUsd = Math.round(allowedCashbackUsd * 100) / 100;
        break;
      }
    }

    if (!matchedRule || finalBaseCashbackUsd <= 0) {
      if (isInternalTx) await client.query('COMMIT');
      return { awarded: false, reason: 'NO_MATCHING_ELIGIBLE_RULE' };
    }

    // 5. Convert Cashback to SDG (operational customer currency)
    const creditedAmount = Math.round(finalBaseCashbackUsd * exchangeRate);

    // 6. Lock User's Wallet and Credit Balance
    const walletRes = await client.query(
      'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
      [order.userId]
    );
    let wallet = walletRes.rows[0];
    let walletId = wallet?.id;
    let balanceBefore = 0;
    let balanceAfter = creditedAmount;

    if (!wallet) {
      walletId = uuidv4();
      await client.query(
        'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
        [walletId, order.userId, balanceAfter, 'SDG']
      );
    } else {
      balanceBefore = Number(wallet.balance);
      balanceAfter = Math.round((balanceBefore + creditedAmount) * 100) / 100;
      await client.query(
        'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [balanceAfter, walletId]
      );
    }

    // 7. Insert into cashback_redemptions (order_id unique constraint guarantees idempotency)
    const redemptionId = uuidv4();
    await client.query(`
      INSERT INTO cashback_redemptions 
        (id, cashback_rule_id, user_id, order_id, base_cashback_usd, credited_amount, credited_currency, exchange_rate)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      redemptionId,
      matchedRule.id,
      order.userId,
      order.id,
      finalBaseCashbackUsd,
      creditedAmount,
      'SDG',
      exchangeRate
    ]);

    // 8. Create WalletTransaction with type = 'CASHBACK'
    const txId = uuidv4();
    const currencyLabel = 'ج.س';
    const txDescription = `كاش باك ${matchedRule.percentage}% (${creditedAmount} ${currencyLabel}) عن الطلب المكتمل #${order.id.slice(0, 8)}`;

    await client.query(`
      INSERT INTO "WalletTransaction" 
        (id, "walletId", amount, type, description, "referenceType", "referenceId", "balanceBefore", "balanceAfter", "createdBy", currency, source_amount_usd, exchange_rate, "created_by_type")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      txId,
      walletId,
      creditedAmount,
      'CASHBACK',
      txDescription,
      'ORDER',
      order.id,
      balanceBefore,
      balanceAfter,
      null,
      userCurrency,
      finalBaseCashbackUsd,
      exchangeRate,
      'SYSTEM'
    ]);

    // 9. Record cashbackAmount on the Order
    await client.query(
      'UPDATE "Order" SET "cashbackAmount" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
      [creditedAmount, order.id]
    );

    if (isInternalTx) await client.query('COMMIT');

    console.log(`[CashbackService] Awarded ${creditedAmount} ${userCurrency} ($${finalBaseCashbackUsd} USD base) to user ${order.userId} for order ${order.id}`);

    return {
      awarded: true,
      ruleName: matchedRule.name,
      baseCashbackUsd: finalBaseCashbackUsd,
      creditedAmount,
      creditedCurrency: userCurrency
    };

  } catch (err: any) {
    if (isInternalTx) await client.query('ROLLBACK');
    console.error(`[CashbackService] Error processing cashback for order ${orderId}:`, err);
    throw err;
  } finally {
    if (isInternalTx) client.release();
  }
}

/**
 * Reverses cashback in case an order is refunded/cancelled after completion.
 */
export async function reverseOrderCashback(orderId: string, externalClient?: PoolClient): Promise<boolean> {
  const isInternalTx = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (isInternalTx) await client.query('BEGIN');

    const redRes = await client.query(
      'SELECT * FROM cashback_redemptions WHERE order_id = $1 FOR UPDATE',
      [orderId]
    );
    const redemption = redRes.rows[0];
    if (!redemption) {
      if (isInternalTx) await client.query('COMMIT');
      return false; // No cashback was awarded
    }

    // Debit user wallet
    const walletRes = await client.query(
      'SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
      [redemption.user_id]
    );
    const wallet = walletRes.rows[0];

    if (wallet) {
      const balanceBefore = Number(wallet.balance);
      const balanceAfter = Math.max(0, balanceBefore - Number(redemption.credited_amount));

      await client.query(
        'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [balanceAfter, wallet.id]
      );

      // Record debit transaction
      await client.query(`
        INSERT INTO "WalletTransaction" 
          (id, "walletId", amount, type, description, "referenceType", "referenceId", "balanceBefore", "balanceAfter", "createdBy", currency, source_amount_usd, exchange_rate, "created_by_type")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        uuidv4(),
        wallet.id,
        redemption.credited_amount,
        'ADMIN_DEBIT',
        `عكس كاش باك لطلب ملغي/مسترجع #${orderId.slice(0, 8)}`,
        'ORDER',
        orderId,
        balanceBefore,
        balanceAfter,
        null,
        redemption.credited_currency,
        redemption.base_cashback_usd,
        redemption.exchange_rate,
        'SYSTEM'
      ]);
    }

    // Delete redemption record
    await client.query('DELETE FROM cashback_redemptions WHERE id = $1', [redemption.id]);
    await client.query('UPDATE "Order" SET "cashbackAmount" = 0, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1', [orderId]);

    if (isInternalTx) await client.query('COMMIT');
    console.log(`[CashbackService] Reverted cashback for order ${orderId}`);
    return true;
  } catch (err: any) {
    if (isInternalTx) await client.query('ROLLBACK');
    console.error(`[CashbackService] Error reversing cashback for order ${orderId}:`, err);
    throw err;
  } finally {
    if (isInternalTx) client.release();
  }
}
