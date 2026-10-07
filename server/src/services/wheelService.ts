import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

export const WHEEL_TIMEZONE = 'Africa/Khartoum';

export interface WheelPrize {
  id: string;
  name: string;
  description?: string;
  type: 'NO_PRIZE' | 'DISCOUNT_FIXED' | 'DISCOUNT_PERCENT' | 'WALLET_CREDIT' | 'FREE_ATTEMPT';
  value: number;
  weight: number;
  color: string;
  icon: string;
  is_active: boolean;
  max_winners?: number | null;
  current_winners: number;
  max_total_cost?: number | null;
  current_total_cost: number;
  starts_at?: string | null;
  expires_at?: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface WheelSpinRecord {
  id: string;
  user_id: string;
  spin_date: string;
  prize_id?: string;
  reward_type: string;
  reward_value: number;
  reward_details: any;
  created_at: string;
  prize_name?: string;
  prize_color?: string;
  prize_icon?: string;
}

/**
 * Helper to get the authoritative current server date in Khartoum timezone (YYYY-MM-DD).
 */
export function getKhartoumTodayDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: WHEEL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Calculates the exact next midnight in Khartoum timezone (when the spin renews).
 */
export function getNextKhartoumSpinTime(): string {
  const now = new Date();
  // Get date parts in Khartoum
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WHEEL_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  }).formatToParts(now);

  const getPart = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  // Tomorrow 00:00:00 in Khartoum (UTC+2) -> Calculate ISO timestamp
  // Sudan is at UTC+2 (120 minutes ahead of UTC)
  const tomorrowMidnightLocal = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  // Adjust for UTC+2 offset (-2 hours in UTC)
  const nextSpinUtc = new Date(tomorrowMidnightLocal.getTime() - 2 * 60 * 60 * 1000);
  return nextSpinUtc.toISOString();
}

export function isUsdtOrder(order: any, product?: any): boolean {
  if (!order) return false;

  const orderType = String(order.orderType || '').toUpperCase();
  if (orderType === 'USDT_TRANSFER' || orderType === 'CRYPTO') return true;

  const gameId = String(order.gameId || '').toUpperCase();
  if (gameId === 'CRYPTO') return true;

  const packageId = String(order.packageId || '').toUpperCase();
  if (packageId === 'USDT_INSTANT' || packageId.includes('USDT')) return true;

  if (order.cryptoNetwork || order.walletAddress || order.usdtAmount) return true;

  const packageName = String(order.packageName || '').toLowerCase();
  if (packageName.includes('usdt')) return true;

  if (product) {
    const prodName = String(product.name || '').toLowerCase();
    const prodCat = String(product.category || product.gameCategoryId || '').toLowerCase();
    const prodType = String(product.productType || '').toLowerCase();
    const slug = String(product.slug || '').toLowerCase();
    if (
      prodName.includes('usdt') || 
      prodCat.includes('usdt') || 
      prodCat.includes('crypto') || 
      prodType.includes('crypto') || 
      slug.includes('usdt')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Grants exactly +1 Bonus Spin credit for a successfully completed eligible order (All except USDT).
 * Strictly Idempotent: protected by UNIQUE index on wheel_spin_credits(source_id) WHERE source_type = 'PURCHASE'.
 */
export async function grantBonusSpinForOrder(
  orderId: string, 
  externalClient?: import('pg').PoolClient
): Promise<{ granted: boolean; reason?: string; creditId?: string }> {
  const isInternalTx = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (isInternalTx) await client.query('BEGIN');

    // 1. Fetch Order and joined Product details
    const orderRes = await client.query(`
      SELECT o.id, o."userId", o.status, o."orderType", o."gameId", o."packageId", 
             o."packageName", o."cryptoNetwork", o."walletAddress", o."usdtAmount",
             p."productName", p.category AS product_category, p."productType"
      FROM "Order" o
      LEFT JOIN "Product" p ON o."packageId" = p.id::text
      WHERE o.id = $1
      FOR UPDATE OF o
    `, [orderId]);

    const order = orderRes.rows[0];
    if (!order) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { granted: false, reason: 'ORDER_NOT_FOUND' };
    }

    // 2. Only grant when order reaches COMPLETED terminal status
    if (order.status !== 'COMPLETED') {
      if (isInternalTx) await client.query('ROLLBACK');
      return { granted: false, reason: 'ORDER_NOT_COMPLETED' };
    }

    if (!order.userId) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { granted: false, reason: 'NO_USER_ASSIGNED' };
    }

    // 3. Strict Server-Side USDT Exclusion: All products eligible EXCEPT USDT
    const isCrypto = isUsdtOrder(order, {
      productName: order.productName,
      category: order.product_category,
      productType: order.productType
    });

    if (isCrypto) {
      if (isInternalTx) await client.query('COMMIT');
      return { granted: false, reason: 'USDT_EXCLUDED' };
    }

    // 4. Strict Idempotency Check: Has a bonus credit already been granted for this order?
    const existingCheck = await client.query(
      `SELECT id FROM wheel_spin_credits WHERE source_type = 'PURCHASE' AND source_id = $1 FOR UPDATE`,
      [order.id]
    );

    if (existingCheck.rows.length > 0) {
      if (isInternalTx) await client.query('COMMIT');
      return { granted: false, reason: 'ALREADY_GRANTED', creditId: existingCheck.rows[0].id };
    }

    // 5. Grant exactly 1 Bonus Spin credit
    const creditId = uuidv4();
    await client.query(`
      INSERT INTO wheel_spin_credits (
        id, user_id, source_type, source_id, status, created_at
      ) VALUES ($1, $2, 'PURCHASE', $3, 'AVAILABLE', NOW())
    `, [creditId, order.userId, order.id]);

    if (isInternalTx) await client.query('COMMIT');
    return { granted: true, creditId };
  } catch (err: any) {
    if (isInternalTx) await client.query('ROLLBACK');
    if (err.code === '23505' && (err.constraint === 'uq_wheel_credits_purchase_order' || err.message?.includes('uq_wheel_credits_purchase_order'))) {
      return { granted: false, reason: 'ALREADY_GRANTED' };
    }
    console.error('[WheelService] grantBonusSpinForOrder error:', err);
    throw err;
  } finally {
    if (isInternalTx) client.release();
  }
}

/**
 * 1. GET WHEEL STATUS FOR USER (Multi-Credit Support)
 */
export async function getWheelStatus(userId: string | null) {
  const todayDate = getKhartoumTodayDate();
  const nextSpinAt = getNextKhartoumSpinTime();
  const serverTime = new Date().toISOString();

  // Public prizes for rendering the wheel segments
  const prizesRes = await pool.query(
    `SELECT id, name, description, type, value, color, icon, display_order 
     FROM wheel_prizes 
     WHERE is_active = true 
     ORDER BY display_order ASC`
  );

  const publicPrizes = prizesRes.rows.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    value: Number(p.value),
    color: p.color,
    icon: p.icon,
    displayOrder: p.display_order
  }));

  if (!userId) {
    return {
      isAuthenticated: false,
      canSpin: false,
      availableSpins: 0,
      creditsSummary: {
        dailyAvailable: false,
        purchaseAvailable: 0,
        total: 0
      },
      todaySpin: null,
      nextSpinAt,
      serverTime,
      todayDate,
      history: [],
      prizes: publicPrizes
    };
  }

  // 1. Check Daily Credit status for today
  const dailyCreditRes = await pool.query(
    `SELECT * FROM wheel_spin_credits 
     WHERE user_id = $1 AND spin_date = $2 AND source_type = 'DAILY'
     LIMIT 1`,
    [userId, todayDate]
  );
  
  // If no record exists for today, or it's 'AVAILABLE', daily spin is available
  const dailyAvailable = dailyCreditRes.rows.length === 0 || dailyCreditRes.rows[0].status === 'AVAILABLE';

  // 2. Count Available Purchase Credits
  const purchaseCreditsRes = await pool.query(
    `SELECT COUNT(*)::int AS count 
     FROM wheel_spin_credits 
     WHERE user_id = $1 AND source_type = 'PURCHASE' AND status = 'AVAILABLE'`,
    [userId]
  );
  const purchaseAvailable = purchaseCreditsRes.rows[0]?.count || 0;

  const totalAvailableSpins = (dailyAvailable ? 1 : 0) + purchaseAvailable;

  // 3. Today's most recent spin record if any (for history / countdown)
  const spinRes = await pool.query(
    `SELECT s.*, p.name AS prize_name, p.color AS prize_color, p.icon AS prize_icon
     FROM wheel_spins s
     LEFT JOIN wheel_prizes p ON s.prize_id = p.id
     WHERE s.user_id = $1 AND s.spin_date = $2
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId, todayDate]
  );
  const todaySpin = spinRes.rows[0] || null;

  // 4. Fetch recent user spin history (last 15 records) with source_type
  const historyRes = await pool.query(
    `SELECT s.id, s.spin_date, s.reward_type, s.reward_value, s.reward_details, s.created_at,
            s.source_type, p.name AS prize_name, p.color AS prize_color, p.icon AS prize_icon
     FROM wheel_spins s
     LEFT JOIN wheel_prizes p ON s.prize_id = p.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT 15`,
    [userId]
  );

  return {
    isAuthenticated: true,
    canSpin: totalAvailableSpins > 0,
    availableSpins: totalAvailableSpins,
    creditsSummary: {
      dailyAvailable,
      purchaseAvailable,
      total: totalAvailableSpins
    },
    todaySpin,
    nextSpinAt,
    serverTime,
    todayDate,
    history: historyRes.rows,
    prizes: publicPrizes
  };
}

/**
 * Generates an 8-character random uppercase alphanumeric promo code suffix.
 */
function generateCodeSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = '';
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

/**
 * 2. EXECUTE WHEEL SPIN (ATOMIC & IDEMPOTENT MULTI-CREDIT)
 * Consumes Daily Credit first if available today, otherwise consumes oldest available Purchase Credit.
 */
export async function executeDailySpin(userId: string) {
  const todayDate = getKhartoumTodayDate();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Determine which credit to consume (Priority: DAILY -> PURCHASE)
    let usedCreditId: string | null = null;
    let usedSourceType: 'DAILY' | 'PURCHASE' = 'DAILY';
    let claimedDaily = false;

    // A) Atomically attempt to insert and claim today's DAILY credit
    const newDailyId = uuidv4();
    const tryInsertDaily = await client.query(
      `INSERT INTO wheel_spin_credits (
        id, user_id, source_type, source_id, spin_date, status, created_at, used_at
      ) VALUES ($1, $2, 'DAILY', $3, $4, 'USED', NOW(), NOW())
      ON CONFLICT (user_id, spin_date) WHERE source_type = 'DAILY' DO NOTHING
      RETURNING id`,
      [newDailyId, userId, todayDate, todayDate]
    );

    if (tryInsertDaily.rows.length > 0) {
      usedCreditId = newDailyId;
      usedSourceType = 'DAILY';
      claimedDaily = true;
    } else {
      // Row already exists: check if it was previously created as AVAILABLE
      const dailyCreditRes = await client.query(
        `SELECT * FROM wheel_spin_credits 
         WHERE user_id = $1 AND spin_date = $2 AND source_type = 'DAILY'
         FOR UPDATE`,
        [userId, todayDate]
      );

      if (dailyCreditRes.rows.length > 0 && dailyCreditRes.rows[0].status === 'AVAILABLE') {
        await client.query(
          `UPDATE wheel_spin_credits SET status = 'USED', used_at = NOW() WHERE id = $1`,
          [dailyCreditRes.rows[0].id]
        );
        usedCreditId = dailyCreditRes.rows[0].id;
        usedSourceType = 'DAILY';
        claimedDaily = true;
      }
    }

    if (!claimedDaily) {
      // Daily credit was already used today: check available purchase credits
      const purchaseCreditRes = await client.query(
        `SELECT * FROM wheel_spin_credits 
         WHERE user_id = $1 AND source_type = 'PURCHASE' AND status = 'AVAILABLE'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );

      if (purchaseCreditRes.rows.length > 0) {
        const credit = purchaseCreditRes.rows[0];
        await client.query(
          `UPDATE wheel_spin_credits SET status = 'USED', used_at = NOW() WHERE id = $1`,
          [credit.id]
        );
        usedCreditId = credit.id;
        usedSourceType = 'PURCHASE';
      } else {
        const lastSpinRes = await client.query(
          `SELECT s.*, p.name as prize_name, p.color as prize_color, p.icon as prize_icon 
           FROM wheel_spins s 
           LEFT JOIN wheel_prizes p ON s.prize_id = p.id 
           WHERE s.user_id = $1 
           ORDER BY s.created_at DESC LIMIT 1`,
          [userId]
        );
        await client.query('ROLLBACK');
        return {
          alreadySpun: true,
          canSpin: false,
          availableSpins: 0,
          creditsSummary: { dailyAvailable: false, purchaseAvailable: 0, total: 0 },
          spin: lastSpinRes.rows[0] || null,
          message: 'انتهت محاولاتك لهذا اليوم. يمكنك الحصول على محاولة إضافية (+1 Spin) فوراً مع كل عملية شراء ناجحة!',
          nextSpinAt: getNextKhartoumSpinTime()
        };
      }
    }

    // 2. Query eligible active prizes
    const prizesRes = await client.query(
      `SELECT * FROM wheel_prizes
       WHERE is_active = true
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (expires_at IS NULL OR expires_at >= NOW())
         AND (max_winners IS NULL OR current_winners < max_winners)
         AND (max_total_cost IS NULL OR (current_total_cost + value) <= max_total_cost)
         AND weight > 0
       ORDER BY display_order ASC
       FOR UPDATE`
    );

    let eligiblePrizes = prizesRes.rows;

    if (eligiblePrizes.length === 0) {
      const fallbackRes = await client.query(
        `SELECT * FROM wheel_prizes WHERE type = 'NO_PRIZE' LIMIT 1`
      );
      if (fallbackRes.rows.length > 0) {
        eligiblePrizes = fallbackRes.rows;
      } else {
        throw new Error('نظام عجلة الحظ غير مهيأ حالياً. يرجى مراجعة إدارة المنصة.');
      }
    }

    // 3. Server-Side Weighted Random Selection
    const totalWeight = eligiblePrizes.reduce((sum, p) => sum + Number(p.weight || 0), 0);
    if (totalWeight <= 0) {
      throw new Error('أوزان الجوائز غير مهيأة.');
    }

    const randomVal = Math.random() * totalWeight;
    let cumulative = 0;
    let selectedPrize = eligiblePrizes[0];

    for (const prize of eligiblePrizes) {
      cumulative += Number(prize.weight);
      if (randomVal <= cumulative) {
        selectedPrize = prize;
        break;
      }
    }

    const prizeValue = Number(selectedPrize.value || 0);
    const prizeType = selectedPrize.type;
    let rewardDetails: any = {
      prizeName: selectedPrize.name,
      description: selectedPrize.description
    };

    // 4. Reward Execution Integration
    if (prizeType === 'DISCOUNT_FIXED') {
      const promoCode = `SPIN-SDG${Math.round(prizeValue)}-${generateCodeSuffix()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO promo_codes (
          id, code, type, discount_type, discount_value, currency,
          usage_limit, usage_count, is_active, starts_at, expires_at
        ) VALUES (
          gen_random_uuid(), $1, 'DISCOUNT', 'FIXED', $2, 'SDG',
          1, 0, true, NOW(), $3
        )`,
        [promoCode, prizeValue, expiresAt]
      );

      rewardDetails = {
        ...rewardDetails,
        promoCode,
        discountType: 'FIXED',
        discountValue: prizeValue,
        currency: 'SDG',
        expiresAt: expiresAt.toISOString(),
        instructions: `استخدم الكود ${promoCode} عند الدفع للحصول على خصم ${prizeValue.toLocaleString()} ج.س فوراً.`
      };
    } else if (prizeType === 'DISCOUNT_PERCENT') {
      const promoCode = `SPIN-PCT${Math.round(prizeValue)}-${generateCodeSuffix()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO promo_codes (
          id, code, type, discount_type, discount_value, max_discount, currency,
          usage_limit, usage_count, is_active, starts_at, expires_at
        ) VALUES (
          gen_random_uuid(), $1, 'DISCOUNT', 'PERCENTAGE', $2, 5000, 'SDG',
          1, 0, true, NOW(), $3
        )`,
        [promoCode, prizeValue, expiresAt]
      );

      rewardDetails = {
        ...rewardDetails,
        promoCode,
        discountType: 'PERCENTAGE',
        discountValue: prizeValue,
        currency: 'SDG',
        expiresAt: expiresAt.toISOString(),
        instructions: `استخدم الكود ${promoCode} عند تأكيد الطلب للاستفادة من خصم ${prizeValue}% (بحد أقصى 5,000 ج.س).`
      };
    } else if (prizeType === 'WALLET_CREDIT') {
      const walletRes = await client.query(
        `SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`,
        [userId]
      );
      if (walletRes.rows.length > 0) {
        const wallet = walletRes.rows[0];
        const oldBalance = Number(wallet.balance || 0);
        const newBalance = oldBalance + prizeValue;

        await client.query(
          `UPDATE "Wallet" SET balance = $1 WHERE id = $2`,
          [newBalance, wallet.id]
        );

        await client.query(
          `INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description,
            "balanceBefore", "balanceAfter", "referenceType", "referenceId", currency
          ) VALUES (
            gen_random_uuid(), $1, $2, 'CREDIT', 'مكافأة عجلة الحظ',
            $3, $4, 'LUCKY_WHEEL', $5, 'SDG'
          )`,
          [wallet.id, prizeValue, oldBalance, newBalance, selectedPrize.id]
        );

        rewardDetails = {
          ...rewardDetails,
          creditedAmount: prizeValue,
          currency: 'SDG',
          newBalance
        };
      }
    } else if (prizeType === 'FREE_ATTEMPT') {
      const promoCode = `FREE-VN-${generateCodeSuffix()}`;
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO promo_codes (
          id, code, type, discount_type, discount_value, max_discount, currency,
          usage_limit, usage_count, is_active, starts_at, expires_at
        ) VALUES (
          gen_random_uuid(), $1, 'DISCOUNT', 'FIXED', 800.00, 800.00, 'SDG',
          1, 0, true, NOW(), $2
        )`,
        [promoCode, expiresAt]
      );

      rewardDetails = {
        ...rewardDetails,
        promoCode,
        freeType: 'VIRTUAL_NUMBER',
        value: 800,
        currency: 'SDG',
        expiresAt: expiresAt.toISOString(),
        instructions: `كود محاولة مجانية بقيمة 800 ج.س للأرقام الافتراضية: ${promoCode}`
      };
    } else {
      // NO_PRIZE
      rewardDetails = {
        ...rewardDetails,
        message: 'حظ أوفر في المرة القادمة! يمكنك الحصول على محاولة إضافية مع كل طلب شراء جديد.'
      };
    }

    // 5. Insert Spin Record with credit_id and source_type
    const insertRes = await client.query(
      `INSERT INTO wheel_spins (
        id, user_id, spin_date, prize_id, reward_type, reward_value, reward_details, credit_id, source_type
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
      ) RETURNING *`,
      [userId, todayDate, selectedPrize.id, prizeType, prizeValue, JSON.stringify(rewardDetails), usedCreditId, usedSourceType]
    );

    const spinRecord = insertRes.rows[0];

    // Link back to credit
    if (usedCreditId) {
      await client.query(
        `UPDATE wheel_spin_credits SET spin_id = $1 WHERE id = $2`,
        [spinRecord.id, usedCreditId]
      );
    }

    // 6. Update Prize counters (winners and total cost)
    await client.query(
      `UPDATE wheel_prizes 
       SET current_winners = current_winners + 1,
           current_total_cost = current_total_cost + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [prizeValue, selectedPrize.id]
    );

    // 7. Calculate remaining available spins after this spin
    const remainingDailyRes = await client.query(
      `SELECT status FROM wheel_spin_credits WHERE user_id = $1 AND spin_date = $2 AND source_type = 'DAILY'`,
      [userId, todayDate]
    );
    const remainingDaily = remainingDailyRes.rows.length === 0 || remainingDailyRes.rows[0].status === 'AVAILABLE';

    const remainingPurchaseRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM wheel_spin_credits WHERE user_id = $1 AND source_type = 'PURCHASE' AND status = 'AVAILABLE'`,
      [userId]
    );
    const remainingPurchase = remainingPurchaseRes.rows[0]?.count || 0;
    const remainingTotal = (remainingDaily ? 1 : 0) + remainingPurchase;

    await client.query('COMMIT');

    return {
      alreadySpun: false,
      canSpin: remainingTotal > 0,
      availableSpins: remainingTotal,
      creditsSummary: {
        dailyAvailable: remainingDaily,
        purchaseAvailable: remainingPurchase,
        total: remainingTotal
      },
      consumedSource: usedSourceType,
      prize: {
        id: selectedPrize.id,
        name: selectedPrize.name,
        description: selectedPrize.description,
        type: selectedPrize.type,
        value: prizeValue,
        color: selectedPrize.color,
        icon: selectedPrize.icon
      },
      rewardDetails,
      spin: {
        ...spinRecord,
        prize_name: selectedPrize.name,
        prize_color: selectedPrize.color,
        prize_icon: selectedPrize.icon
      },
      nextSpinAt: getNextKhartoumSpinTime()
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const lastSpinRes = await pool.query(
        `SELECT s.*, p.name as prize_name, p.color as prize_color, p.icon as prize_icon 
         FROM wheel_spins s 
         LEFT JOIN wheel_prizes p ON s.prize_id = p.id 
         WHERE s.user_id = $1 
         ORDER BY s.created_at DESC LIMIT 1`,
        [userId]
      );
      return {
        alreadySpun: true,
        canSpin: false,
        availableSpins: 0,
        creditsSummary: { dailyAvailable: false, purchaseAvailable: 0, total: 0 },
        spin: lastSpinRes.rows[0] || null,
        message: 'انتهت محاولاتك لهذا اليوم. يمكنك الحصول على محاولة إضافية (+1 Spin) فوراً مع كل عملية شراء ناجحة!',
        nextSpinAt: getNextKhartoumSpinTime()
      };
    }
    console.error('[WheelService] Spin Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 3. ADMIN: GET COMPREHENSIVE STATISTICS
 */
export async function getWheelAdminStats() {
  const [totalsRes, prizeStatsRes, recentSpinsRes] = await Promise.all([
    // Total spins, costs, and breakdown categories
    pool.query(`
      SELECT 
        COUNT(*)::int AS total_spins,
        COALESCE(SUM(reward_value), 0)::numeric AS total_reward_cost,
        COALESCE(AVG(reward_value), 0)::numeric AS average_reward_cost,
        COALESCE(MAX(reward_value), 0)::numeric AS highest_reward,
        COUNT(CASE WHEN reward_type = 'NO_PRIZE' THEN 1 END)::int AS no_prize_count,
        COUNT(CASE WHEN reward_type != 'NO_PRIZE' AND reward_value <= 500 THEN 1 END)::int AS small_rewards_count,
        COUNT(CASE WHEN reward_value > 500 THEN 1 END)::int AS high_rewards_count
      FROM wheel_spins
    `),

    // Per prize stats
    pool.query(`
      SELECT 
        p.id,
        p.name,
        p.type,
        p.value,
        p.weight,
        p.color,
        p.is_active,
        p.max_winners,
        p.max_total_cost,
        p.current_winners,
        p.current_total_cost,
        COUNT(s.id)::int AS actual_spin_wins,
        COALESCE(SUM(s.reward_value), 0)::numeric AS actual_spin_cost
      FROM wheel_prizes p
      LEFT JOIN wheel_spins s ON p.id = s.prize_id
      GROUP BY p.id
      ORDER BY p.display_order ASC
    `),

    // Recent 50 spins with user info
    pool.query(`
      SELECT 
        s.id,
        s.user_id,
        u.name AS user_name,
        u.email AS user_email,
        s.spin_date,
        s.reward_type,
        s.reward_value,
        s.reward_details,
        s.created_at,
        p.name AS prize_name,
        p.color AS prize_color
      FROM wheel_spins s
      JOIN "User" u ON s.user_id = u.id
      LEFT JOIN wheel_prizes p ON s.prize_id = p.id
      ORDER BY s.created_at DESC
      LIMIT 50
    `)
  ]);

  const totals = totalsRes.rows[0];
  const totalSpins = totals.total_spins || 0;

  const noPrizePercentage = totalSpins > 0 ? ((totals.no_prize_count / totalSpins) * 100).toFixed(1) : '0';
  const smallRewardsPercentage = totalSpins > 0 ? ((totals.small_rewards_count / totalSpins) * 100).toFixed(1) : '0';
  const highRewardsPercentage = totalSpins > 0 ? ((totals.high_rewards_count / totalSpins) * 100).toFixed(1) : '0';

  return {
    overview: {
      totalSpins,
      totalRewardCost: Number(totals.total_reward_cost || 0),
      averageRewardCost: Number(Number(totals.average_reward_cost || 0).toFixed(2)),
      highestReward: Number(totals.highest_reward || 0),
      noPrizeCount: totals.no_prize_count,
      noPrizePercentage: Number(noPrizePercentage),
      smallRewardsCount: totals.small_rewards_count,
      smallRewardsPercentage: Number(smallRewardsPercentage),
      highRewardsCount: totals.high_rewards_count,
      highRewardsPercentage: Number(highRewardsPercentage)
    },
    prizesBreakdown: prizeStatsRes.rows.map(r => ({
      ...r,
      value: Number(r.value),
      weight: Number(r.weight),
      current_winners: Number(r.current_winners),
      current_total_cost: Number(r.current_total_cost),
      actual_spin_wins: Number(r.actual_spin_wins),
      actual_spin_cost: Number(r.actual_spin_cost)
    })),
    recentSpins: recentSpinsRes.rows
  };
}

/**
 * 4. ADMIN PRIZE CRUD
 */
export async function getAllPrizesAdmin() {
  const res = await pool.query(
    `SELECT * FROM wheel_prizes ORDER BY display_order ASC, created_at ASC`
  );
  return res.rows.map(r => ({
    ...r,
    value: Number(r.value),
    weight: Number(r.weight),
    current_winners: Number(r.current_winners),
    current_total_cost: Number(r.current_total_cost),
    max_total_cost: r.max_total_cost ? Number(r.max_total_cost) : null
  }));
}

export async function createPrizeAdmin(data: {
  name: string;
  description?: string;
  type: string;
  value: number;
  weight: number;
  color?: string;
  icon?: string;
  is_active?: boolean;
  max_winners?: number | null;
  max_total_cost?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  display_order?: number;
}) {
  const id = uuidv4();
  const res = await pool.query(
    `INSERT INTO wheel_prizes (
      id, name, description, type, value, weight, color, icon,
      is_active, max_winners, max_total_cost, starts_at, expires_at, display_order
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14
    ) RETURNING *`,
    [
      id,
      data.name.trim(),
      data.description?.trim() || null,
      data.type,
      data.value,
      data.weight,
      data.color || '#F59E0B',
      data.icon || 'Gift',
      data.is_active !== false,
      data.max_winners ?? null,
      data.max_total_cost ?? null,
      data.starts_at || null,
      data.expires_at || null,
      data.display_order || 0
    ]
  );
  return res.rows[0];
}

export async function updatePrizeAdmin(id: string, data: Partial<WheelPrize>) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(data.name.trim());
  }
  if (data.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(data.description ? data.description.trim() : null);
  }
  if (data.type !== undefined) {
    fields.push(`type = $${idx++}`);
    values.push(data.type);
  }
  if (data.value !== undefined) {
    fields.push(`value = $${idx++}`);
    values.push(Number(data.value));
  }
  if (data.weight !== undefined) {
    fields.push(`weight = $${idx++}`);
    values.push(Number(data.weight));
  }
  if (data.color !== undefined) {
    fields.push(`color = $${idx++}`);
    values.push(data.color);
  }
  if (data.icon !== undefined) {
    fields.push(`icon = $${idx++}`);
    values.push(data.icon);
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(Boolean(data.is_active));
  }
  if (data.max_winners !== undefined) {
    fields.push(`max_winners = $${idx++}`);
    values.push(data.max_winners === null || data.max_winners === undefined ? null : Number(data.max_winners));
  }
  if (data.max_total_cost !== undefined) {
    fields.push(`max_total_cost = $${idx++}`);
    values.push(data.max_total_cost === null || data.max_total_cost === undefined ? null : Number(data.max_total_cost));
  }
  if (data.starts_at !== undefined) {
    fields.push(`starts_at = $${idx++}`);
    values.push(data.starts_at || null);
  }
  if (data.expires_at !== undefined) {
    fields.push(`expires_at = $${idx++}`);
    values.push(data.expires_at || null);
  }
  if (data.display_order !== undefined) {
    fields.push(`display_order = $${idx++}`);
    values.push(Number(data.display_order));
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const sql = `UPDATE wheel_prizes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
  const res = await pool.query(sql, values);
  return res.rows[0];
}

export async function togglePrizeActiveAdmin(id: string) {
  const res = await pool.query(
    `UPDATE wheel_prizes SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0];
}

export async function deletePrizeAdmin(id: string) {
  // Check if already won by any user
  const check = await pool.query(`SELECT COUNT(*)::int AS count FROM wheel_spins WHERE prize_id = $1`, [id]);
  if (check.rows[0]?.count > 0) {
    // Soft disable instead of deleting historical win reference
    await pool.query(`UPDATE wheel_prizes SET is_active = false, weight = 0, updated_at = NOW() WHERE id = $1`, [id]);
    return { deleted: false, deactivated: true, message: 'تم إيقاف الجائزة وتصفير وزنها لحماية سجل السحوبات السابقة.' };
  }
  await pool.query(`DELETE FROM wheel_prizes WHERE id = $1`, [id]);
  return { deleted: true, message: 'تم حذف الجائزة بنجاح.' };
}
