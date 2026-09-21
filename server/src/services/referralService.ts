import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';

export interface ReferralSettings {
  enabled?: boolean | undefined;
  referrer_reward?: number | undefined;
  referee_reward?: number | undefined;
  currency?: string | undefined;
  min_order_amount?: number | undefined;
  max_referrer_earnings?: number | undefined;
  allow_existing_users_binding?: boolean | undefined;
  first_order_only?: boolean | undefined;
  allow_crypto_orders?: boolean | undefined;
  allow_game_orders?: boolean | undefined;
  allow_cards_orders?: boolean | undefined;
  total_reward?: number | undefined;
  updated_at?: string | undefined;
}

export interface FullReferralSettings {
  enabled: boolean;
  referrer_reward: number;
  referee_reward: number;
  currency: string;
  min_order_amount: number;
  max_referrer_earnings: number;
  allow_existing_users_binding: boolean;
  first_order_only: boolean;
  allow_crypto_orders: boolean;
  allow_game_orders: boolean;
  allow_cards_orders: boolean;
  total_reward: number;
  updated_at?: string | undefined;
}

export const DEFAULT_SETTINGS: FullReferralSettings = {
  enabled: true,
  referrer_reward: 1000,
  referee_reward: 1000,
  currency: 'SDG',
  min_order_amount: 5000,
  max_referrer_earnings: 10000,
  allow_existing_users_binding: true,
  first_order_only: true,
  allow_crypto_orders: true,
  allow_game_orders: true,
  allow_cards_orders: true,
  total_reward: 2000
};

/**
 * Generate user-facing dynamic titles and descriptions from current referral settings
 */
export function getReferralCopy(settings: FullReferralSettings) {
  const total = settings.referrer_reward + settings.referee_reward;
  const currency = settings.currency || 'جنيه';
  const formattedTotal = Number(total || 0).toLocaleString('en-US');
  const formattedReferrer = Number(settings.referrer_reward || 0).toLocaleString('en-US');
  const formattedReferee = Number(settings.referee_reward || 0).toLocaleString('en-US');

  return {
    heroTitle: `نادي صاحبك وتعال واكسب ${formattedTotal} ${currency} 🎁🔥`,
    heroSubtitle: 'أنت وصاحبك تكسبوا مع بعض!',
    description: `شارك كود الإحالة الخاص بيك مع صاحبك، ولما يسجل ويكمل أول طلب مؤهل، أنت تحصل على ${formattedReferrer} ${currency} وهو يحصل على ${formattedReferee} ${currency}.`,
    refereeBenefit: `احصل على ${formattedReferee} ${currency} رصيد في محفظتك فور ربط الكود!`,
    referrerBenefit: `احصل على ${formattedReferrer} ${currency} بعد أول طلب مؤهل يكمله صاحبك!`
  };
}

/**
 * Get current referral program settings
 */
export async function getReferralSettings(): Promise<FullReferralSettings> {
  try {
    const res = await pool.query('SELECT value, updated_at FROM "platform_settings" WHERE key = $1', ['referral_settings']);
    const val = res.rows[0]?.value || DEFAULT_SETTINGS;
    const referrer_reward = Number(val.referrer_reward ?? DEFAULT_SETTINGS.referrer_reward);
    const referee_reward = Number(val.referee_reward ?? DEFAULT_SETTINGS.referee_reward);
    const enabled = Boolean(val.enabled ?? DEFAULT_SETTINGS.enabled);
    const currency = String(val.currency || DEFAULT_SETTINGS.currency);
    const min_order_amount = Number(val.min_order_amount ?? DEFAULT_SETTINGS.min_order_amount);
    const max_referrer_earnings = Number(val.max_referrer_earnings ?? DEFAULT_SETTINGS.max_referrer_earnings);
    const allow_existing_users_binding = Boolean(val.allow_existing_users_binding ?? DEFAULT_SETTINGS.allow_existing_users_binding);
    const first_order_only = Boolean(val.first_order_only ?? DEFAULT_SETTINGS.first_order_only);
    const allow_crypto_orders = Boolean(val.allow_crypto_orders ?? DEFAULT_SETTINGS.allow_crypto_orders);
    const allow_game_orders = Boolean(val.allow_game_orders ?? DEFAULT_SETTINGS.allow_game_orders);
    const allow_cards_orders = Boolean(val.allow_cards_orders ?? DEFAULT_SETTINGS.allow_cards_orders);

    return {
      enabled,
      referrer_reward,
      referee_reward,
      total_reward: referrer_reward + referee_reward,
      currency,
      min_order_amount,
      max_referrer_earnings,
      allow_existing_users_binding,
      first_order_only,
      allow_crypto_orders,
      allow_game_orders,
      allow_cards_orders,
      updated_at: res.rows[0]?.updated_at
    };
  } catch (err: any) {
    console.error('[ReferralService] Error loading settings:', err.message);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Admin updates referral program settings
 */
export async function updateReferralSettings(
  newSettings: ReferralSettings, 
  adminId?: string
): Promise<FullReferralSettings> {
  const current = await getReferralSettings();
  
  const referrer_reward = newSettings.referrer_reward !== undefined ? Number(newSettings.referrer_reward) : current.referrer_reward;
  const referee_reward = newSettings.referee_reward !== undefined ? Number(newSettings.referee_reward) : current.referee_reward;

  const updatedValue: FullReferralSettings = {
    enabled: newSettings.enabled !== undefined ? Boolean(newSettings.enabled) : current.enabled,
    referrer_reward,
    referee_reward,
    currency: 'SDG',
    min_order_amount: newSettings.min_order_amount !== undefined ? Number(newSettings.min_order_amount) : current.min_order_amount,
    max_referrer_earnings: newSettings.max_referrer_earnings !== undefined ? Number(newSettings.max_referrer_earnings) : current.max_referrer_earnings,
    allow_existing_users_binding: newSettings.allow_existing_users_binding !== undefined ? Boolean(newSettings.allow_existing_users_binding) : current.allow_existing_users_binding,
    first_order_only: newSettings.first_order_only !== undefined ? Boolean(newSettings.first_order_only) : current.first_order_only,
    allow_crypto_orders: newSettings.allow_crypto_orders !== undefined ? Boolean(newSettings.allow_crypto_orders) : current.allow_crypto_orders,
    allow_game_orders: newSettings.allow_game_orders !== undefined ? Boolean(newSettings.allow_game_orders) : current.allow_game_orders,
    allow_cards_orders: newSettings.allow_cards_orders !== undefined ? Boolean(newSettings.allow_cards_orders) : current.allow_cards_orders,
    total_reward: referrer_reward + referee_reward
  };

  await pool.query(
    `INSERT INTO "platform_settings" ("key", "value", "updated_at", "updated_by")
     VALUES ('referral_settings', $1, CURRENT_TIMESTAMP, $2)
     ON CONFLICT ("key") DO UPDATE 
     SET "value" = $1, "updated_at" = CURRENT_TIMESTAMP, "updated_by" = $2`,
    [JSON.stringify(updatedValue), adminId || null]
  );

  // Log admin audit
  if (adminId) {
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason) 
       VALUES ($1, $2, 'SETTINGS_UPDATE', $3)`,
      [uuidv4(), adminId, `Admin updated referral settings (Referrer: ${updatedValue.referrer_reward}, Referee: ${updatedValue.referee_reward}, MinOrder: ${updatedValue.min_order_amount}, MaxEarn: ${updatedValue.max_referrer_earnings} ${updatedValue.currency})`]
    ).catch(err => console.warn('[AuditLog] Failed to log referral update:', err.message));
  }

  return {
    ...updatedValue,
    total_reward: updatedValue.referrer_reward + updatedValue.referee_reward
  };
}

/**
 * Generate a unique random referral code (e.g. KP948271)
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'KP';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get or create referral code and statistics for a specific user
 */
export async function getUserReferralDetails(userId: string, baseUrl?: string) {
  const userRes = await pool.query('SELECT id, name, email, referral_code, referred_by_id FROM "User" WHERE id = $1', [userId]);
  const user = userRes.rows[0];
  if (!user) throw new Error('المستخدم غير موجود');

  let code = user.referral_code;
  if (!code) {
    code = generateReferralCode();
    await pool.query('UPDATE "User" SET referral_code = $1 WHERE id = $2', [code, userId]);
  }

  // Check referrer details if user was referred
  let referrerName: string | null = null;
  if (user.referred_by_id) {
    const referrerRes = await pool.query('SELECT name FROM "User" WHERE id = $1', [user.referred_by_id]);
    referrerName = referrerRes.rows[0]?.name || 'صديق';
  }

  // Load settings for caps and copy
  const settings = await getReferralSettings();

  // Get referral stats
  const statsRes = await pool.query(`
    SELECT 
      COUNT(*)::int AS total_referred,
      COUNT(*) FILTER (WHERE referrer_reward_paid = true)::int AS successful_referrals,
      COUNT(*) FILTER (WHERE referrer_reward_paid = false)::int AS pending_referrals,
      COALESCE(SUM(referrer_reward_amount) FILTER (WHERE referrer_reward_paid = true), 0)::numeric AS total_earned
    FROM "referrals"
    WHERE referrer_id = $1
  `, [userId]);

  const stats = statsRes.rows[0] || { total_referred: 0, successful_referrals: 0, pending_referrals: 0, total_earned: 0 };
  const totalEarned = Number(stats.total_earned);
  const maxEarnings = settings.max_referrer_earnings;
  const isCapped = maxEarnings > 0 && totalEarned >= maxEarnings;

  // Get recent invited friends
  const friendsRes = await pool.query(`
    SELECT 
      r.id,
      r.status,
      r.referrer_reward_amount,
      r.referee_reward_amount,
      r.referee_reward_paid,
      r.referrer_reward_paid,
      r.currency,
      r.completed_at,
      r.created_at,
      u.name as referee_name,
      u.email as referee_email
    FROM "referrals" r
    JOIN "User" u ON r.referee_id = u.id
    WHERE r.referrer_id = $1
    ORDER BY r.created_at DESC
    LIMIT 20
  `, [userId]);

  // Mask friend email for privacy (e.g. a***d@gmail.com)
  const friends = friendsRes.rows.map(f => {
    let maskedEmail = f.referee_email;
    if (f.referee_email && f.referee_email.includes('@')) {
      const [namePart, domain] = f.referee_email.split('@');
      maskedEmail = `${namePart.slice(0, 2)}***@${domain}`;
    }
    return {
      id: f.id,
      status: f.referrer_reward_paid ? 'COMPLETED' : 'PENDING',
      name: f.referee_name || 'صديق جديد',
      email: maskedEmail,
      reward: Number(f.referrer_reward_amount || 0),
      refereeReward: Number(f.referee_reward_amount || 0),
      refereeRewardPaid: Boolean(f.referee_reward_paid),
      referrerRewardPaid: Boolean(f.referrer_reward_paid),
      currency: f.currency,
      completedAt: f.completed_at,
      createdAt: f.created_at
    };
  });

  const envFrontend = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0] || 'http://localhost:5173';
  const domain = baseUrl || envFrontend.trim();
  const shareUrl = `${domain}/register?ref=${code}`;

  return {
    referralCode: code,
    shareUrl,
    hasReferrer: Boolean(user.referred_by_id),
    referrerName,
    stats: {
      totalReferred: stats.total_referred,
      successfulReferrals: stats.successful_referrals,
      pendingReferrals: stats.pending_referrals,
      totalEarned,
      maxEarnings,
      isCapped
    },
    friends,
    copy: getReferralCopy(settings)
  };
}

/**
 * Bind a referral code to a user (Referee).
 *
 * Rules:
 * 1. Referral program must be enabled.
 * 2. User cannot refer themselves.
 * 3. User cannot bind a code if they are already referred (referred_by_id is set or referrals record exists).
 * 4. If called by an existing user, allow_existing_users_binding must be enabled.
 * 5. Strictly Idempotent:
 *    - Immediately awards referee_reward to referee wallet.
 *    - Creates WalletTransaction with referenceType = 'REFERRAL'.
 *    - Sets referee_reward_paid = true.
 */
export async function bindReferralCode(
  refereeId: string, 
  referralCode: string, 
  externalClient?: PoolClient,
  isExistingUser: boolean = false
): Promise<{ success: boolean; reward: number; currency: string; referrerName?: string; message?: string }> {
  if (!referralCode || !referralCode.trim()) {
    throw new Error('يرجى إدخال كود الإحالة');
  }

  const cleanCode = referralCode.trim().toUpperCase();
  const settings = await getReferralSettings();

  if (!settings.enabled) {
    throw new Error('برنامج الإحالة غير مفعّل حالياً');
  }

  if (isExistingUser && !settings.allow_existing_users_binding) {
    throw new Error('ربط كود الإحالة متاح فقط للمستخدمين الجدد');
  }

  const isInternalTx = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (isInternalTx) await client.query('BEGIN');

    // 1. Fetch Referee & lock
    const refereeRes = await client.query(
      'SELECT id, name, "referred_by_id" FROM "User" WHERE id = $1 FOR UPDATE',
      [refereeId]
    );
    const referee = refereeRes.rows[0];
    if (!referee) {
      throw new Error('المستخدم غير موجود');
    }

    if (referee.referred_by_id) {
      throw new Error('تم ربط حسابك بكود إحالة مسبقاً');
    }

    // Check if referral row already exists for this referee
    const existingRefRes = await client.query(
      'SELECT id FROM "referrals" WHERE referee_id = $1 FOR UPDATE',
      [refereeId]
    );
    if (existingRefRes.rows.length > 0) {
      throw new Error('تم تسجيل إحالة لهذا الحساب مسبقاً');
    }

    // 2. Find Referrer by code
    const referrerRes = await client.query(
      'SELECT id, name, email FROM "User" WHERE UPPER(referral_code) = $1',
      [cleanCode]
    );
    const referrer = referrerRes.rows[0];
    if (!referrer) {
      throw new Error('كود الإحالة غير صحيح أو غير موجود');
    }

    if (referrer.id === refereeId) {
      throw new Error('لا يمكنك استخدام كود الإحالة الخاص بك');
    }

    // 3. Link referrer to referee on User table
    await client.query(
      'UPDATE "User" SET referred_by_id = $1 WHERE id = $2',
      [referrer.id, refereeId]
    );

    const refereeReward = settings.referee_reward;
    const referrerReward = settings.referrer_reward;
    const rewardCurrency = 'SDG';
    const referralId = uuidv4();
    const shouldPayRefereeNow = refereeReward > 0;

    // 4. Create row in referrals table
    await client.query(`
      INSERT INTO "referrals" (
        id, referrer_id, referee_id, status,
        referee_reward_amount, referee_reward_paid, referee_reward_paid_at,
        referrer_reward_amount, referrer_reward_paid, currency
      ) VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, false, $8)
      ON CONFLICT (referee_id) DO NOTHING
    `, [
      referralId,
      referrer.id,
      refereeId,
      refereeReward,
      shouldPayRefereeNow,
      shouldPayRefereeNow ? new Date() : null,
      referrerReward,
      rewardCurrency
    ]);

    // 5. Pay Referee immediate welcome reward to their wallet (Idempotent)
    if (shouldPayRefereeNow) {
      const walletRes = await client.query(
        'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
        [refereeId]
      );
      const wallet = walletRes.rows[0];

      if (wallet) {
        const balBefore = Number(wallet.balance || 0);
        const balAfter = balBefore + refereeReward;

        await client.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [balAfter, wallet.id]);

        await client.query(`
          INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, 
            currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null, 'SYSTEM')
        `, [
          uuidv4(),
          wallet.id,
          refereeReward,
          'REFERRAL_BONUS',
          `مكافأة الترحيب بربط كود الصداقة (${cleanCode})`,
          'SDG',
          balBefore,
          balAfter,
          'REFERRAL',
          referralId
        ]);
      }
    }

    if (isInternalTx) await client.query('COMMIT');

    return {
      success: true,
      reward: refereeReward,
      currency: rewardCurrency,
      referrerName: referrer.name || 'صديقك',
      message: `تم ربط كود الإحالة بنجاح! تم إضافة ${refereeReward.toLocaleString('ar-EG')} ${rewardCurrency} إلى محفظتك كهدية ترحيبية فورية.`
    };
  } catch (err: any) {
    if (isInternalTx) await client.query('ROLLBACK');
    console.error('[ReferralService] bindReferralCode error:', err.message);
    throw err;
  } finally {
    if (isInternalTx) client.release();
  }
}

/**
 * Backward compatibility wrapper for registration flow
 */
export async function linkReferralOnRegister(refereeId: string, referralCode: string, client?: PoolClient): Promise<boolean> {
  try {
    const res = await bindReferralCode(refereeId, referralCode, client, false);
    return res.success;
  } catch (err: any) {
    console.warn('[ReferralService] linkReferralOnRegister skipped:', err.message);
    return false;
  }
}

/**
 * Determine if an order qualifies based on admin category rules (crypto, games, cards)
 */
export function isOrderEligibleCategory(order: any, settings: FullReferralSettings): boolean {
  const isCrypto = order.orderType === 'USDT_TRANSFER';
  if (isCrypto) {
    return Boolean(settings.allow_crypto_orders);
  }

  // Check if cards vs games
  const name = String(order.packageName || order.gameId || '').toLowerCase();
  const isCard = name.includes('card') || name.includes('gift') || name.includes('بطاق') || name.includes('كارت');

  if (isCard) {
    return Boolean(settings.allow_cards_orders);
  }

  return Boolean(settings.allow_game_orders);
}

/**
 * Process referral reward for Referrer when an order reaches COMPLETED status.
 *
 * Rules:
 * 1. Referral program must be enabled.
 * 2. Order must be COMPLETED.
 * 3. Customer must be referred with a pending referrer reward (referrer_reward_paid = false).
 * 4. Order must match category allowance (crypto, games, cards).
 * 5. Order amount must be >= min_order_amount.
 * 6. If first_order_only is enabled, this must be the customer's first completed order.
 * 7. Referrer total earnings must not exceed max_referrer_earnings cap.
 * 8. Strictly idempotent.
 */
export async function processReferralRewardOnOrder(
  orderId: string, 
  externalClient?: PoolClient
): Promise<{ awarded: boolean; reason?: string; reward?: number }> {
  const isInternalTx = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (isInternalTx) await client.query('BEGIN');

    // 1. Fetch Order with lock
    const orderRes = await client.query(`
      SELECT id, "userId", amount, "customerPriceUsd", "orderType", "gameId", "packageName", status, "createdAt"
      FROM "Order" 
      WHERE id = $1 
      FOR UPDATE
    `, [orderId]);

    const order = orderRes.rows[0];
    if (!order || order.status !== 'COMPLETED') {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ORDER_NOT_COMPLETED' };
    }

    // 2. Check if customer was referred and has pending referrer payout
    const referralRes = await client.query(`
      SELECT r.id, r.referrer_id, r.referee_id, r.status, r.referrer_reward_paid, r.referee_reward_paid
      FROM "referrals" r
      WHERE r.referee_id = $1
      FOR UPDATE
    `, [order.userId]);

    const referral = referralRes.rows[0];
    if (!referral) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'NO_REFERRAL_RECORD' };
    }

    if (referral.referrer_reward_paid) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'REFERRER_REWARD_ALREADY_PAID' };
    }

    // 3. Load program settings
    const settings = await getReferralSettings();
    if (!settings.enabled) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'REFERRAL_PROGRAM_DISABLED' };
    }

    // Check category allowance
    if (!isOrderEligibleCategory(order, settings)) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ORDER_CATEGORY_NOT_ALLOWED' };
    }

    // Check min order amount
    if (settings.min_order_amount > 0 && (Number(order.amount) || 0) < settings.min_order_amount) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ORDER_AMOUNT_BELOW_MINIMUM' };
    }

    // Check first_order_only restriction: only prior orders that met the qualifying threshold count
    if (settings.first_order_only && settings.min_order_amount > 0) {
      const prevOrdersRes = await client.query(`
        SELECT id FROM "Order"
        WHERE "userId" = $1 AND status = 'COMPLETED' AND id != $2 AND "createdAt" < $3 AND amount >= $4
        LIMIT 1
      `, [order.userId, order.id, order.createdAt, settings.min_order_amount]);

      if (prevOrdersRes.rows.length > 0) {
        if (isInternalTx) await client.query('ROLLBACK');
        return { awarded: false, reason: 'NOT_FIRST_ORDER' };
      }
    }

    // Check max referrer earnings cap
    const totalEarnedRes = await client.query(`
      SELECT COALESCE(SUM(referrer_reward_amount), 0)::numeric AS total_earned
      FROM "referrals"
      WHERE referrer_id = $1 AND referrer_reward_paid = true
    `, [referral.referrer_id]);

    const totalEarned = Number(totalEarnedRes.rows[0]?.total_earned || 0);
    const maxEarnings = settings.max_referrer_earnings;

    let payableReward = settings.referrer_reward;
    if (maxEarnings > 0) {
      if (totalEarned >= maxEarnings) {
        // Cap reached: complete referral with 0 reward
        await client.query(`
          UPDATE "referrals"
          SET 
            status = 'COMPLETED',
            qualifying_order_id = $1,
            referrer_reward_amount = 0,
            referrer_reward_paid = true,
            referrer_reward_paid_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [order.id, referral.id]);

        if (isInternalTx) await client.query('COMMIT');
        return { awarded: false, reason: 'MAX_REFERRER_EARNINGS_CAP_REACHED' };
      }

      // If award would exceed cap, award remaining difference
      const remainingAllowance = maxEarnings - totalEarned;
      payableReward = Math.min(settings.referrer_reward, remainingAllowance);
    }

    const rewardCurrency = settings.currency || 'جنيه';

    // 4. Award Referrer (credit wallet and log transaction)
    if (payableReward > 0) {
      const referrerWalletRes = await client.query(
        'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
        [referral.referrer_id]
      );
      const referrerWallet = referrerWalletRes.rows[0];
      if (referrerWallet) {
        const balBefore = Number(referrerWallet.balance || 0);
        const balAfter = balBefore + payableReward;

        await client.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [balAfter, referrerWallet.id]);

        await client.query(`
          INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, 
            currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null, 'SYSTEM')
        `, [
          uuidv4(),
          referrerWallet.id,
          payableReward,
          'REFERRAL_BONUS',
          `مكافأة دعوة صديق - إتمام طلب مؤهل (#${order.id.slice(0, 8)})`,
          'SDG',
          balBefore,
          balAfter,
          'REFERRAL',
          referral.id
        ]);
      }
    }

    // 5. Mark referral as COMPLETED and referrer_reward_paid = true
    await client.query(`
      UPDATE "referrals"
      SET 
        status = 'COMPLETED',
        qualifying_order_id = $1,
        referrer_reward_amount = $2,
        referrer_reward_paid = true,
        referrer_reward_paid_at = CURRENT_TIMESTAMP,
        currency = $3,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [order.id, payableReward, rewardCurrency, referral.id]);

    if (isInternalTx) await client.query('COMMIT');

    return { awarded: true, reward: payableReward };
  } catch (err: any) {
    if (isInternalTx) await client.query('ROLLBACK');
    console.error('[ReferralService] Error processing referral reward on order:', err.message);
    return { awarded: false, reason: err.message };
  } finally {
    if (isInternalTx) client.release();
  }
}
