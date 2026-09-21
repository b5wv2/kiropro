import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';

export interface ReferralSettings {
  enabled?: boolean | undefined;
  referrer_reward?: number | undefined;
  referee_reward?: number | undefined;
  currency?: string | undefined;
  min_order_amount?: number | undefined;
  total_reward?: number | undefined;
  updated_at?: string | undefined;
}

export interface FullReferralSettings {
  enabled: boolean;
  referrer_reward: number;
  referee_reward: number;
  currency: string;
  min_order_amount: number;
  total_reward: number;
  updated_at?: string | undefined;
}

const DEFAULT_SETTINGS: FullReferralSettings = {
  enabled: true,
  referrer_reward: 1000,
  referee_reward: 1000,
  currency: 'جنيه',
  min_order_amount: 0,
  total_reward: 2000
};

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

    return {
      enabled,
      referrer_reward,
      referee_reward,
      total_reward: referrer_reward + referee_reward,
      currency,
      min_order_amount,
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
  
  const updatedValue: FullReferralSettings = {
    enabled: newSettings.enabled !== undefined ? Boolean(newSettings.enabled) : current.enabled,
    referrer_reward: Number(newSettings.referrer_reward ?? current.referrer_reward),
    referee_reward: Number(newSettings.referee_reward ?? current.referee_reward),
    currency: String(newSettings.currency || current.currency).trim() || 'جنيه',
    min_order_amount: Number(newSettings.min_order_amount ?? current.min_order_amount),
    total_reward: Number(newSettings.referrer_reward ?? current.referrer_reward) + Number(newSettings.referee_reward ?? current.referee_reward)
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
      [uuidv4(), adminId, `Admin updated referral settings (Referrer: ${updatedValue.referrer_reward}, Referee: ${updatedValue.referee_reward} ${updatedValue.currency})`]
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
  const userRes = await pool.query('SELECT id, name, email, referral_code FROM "User" WHERE id = $1', [userId]);
  const user = userRes.rows[0];
  if (!user) throw new Error('المستخدم غير موجود');

  let code = user.referral_code;
  if (!code) {
    code = generateReferralCode();
    await pool.query('UPDATE "User" SET referral_code = $1 WHERE id = $2', [code, userId]);
  }

  // Get referral stats
  const statsRes = await pool.query(`
    SELECT 
      COUNT(*)::int AS total_referred,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS successful_referrals,
      COALESCE(SUM(referrer_reward_amount) FILTER (WHERE status = 'COMPLETED'), 0)::numeric AS total_earned
    FROM "referrals"
    WHERE referrer_id = $1
  `, [userId]);

  const stats = statsRes.rows[0] || { total_referred: 0, successful_referrals: 0, total_earned: 0 };

  // Get recent invited friends
  const friendsRes = await pool.query(`
    SELECT 
      r.id,
      r.status,
      r.referrer_reward_amount,
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
      status: f.status,
      name: f.referee_name || 'صديق جديد',
      email: maskedEmail,
      reward: Number(f.referrer_reward_amount || 0),
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
    stats: {
      totalReferred: stats.total_referred,
      successfulReferrals: stats.successful_referrals,
      totalEarned: Number(stats.total_earned)
    },
    friends
  };
}

/**
 * Link a new user to a referrer upon registration
 */
export async function linkReferralOnRegister(refereeId: string, referralCode: string): Promise<boolean> {
  if (!referralCode || !referralCode.trim()) return false;
  const cleanCode = referralCode.trim().toUpperCase();

  try {
    const referrerRes = await pool.query(
      'SELECT id FROM "User" WHERE UPPER(referral_code) = $1',
      [cleanCode]
    );

    const referrer = referrerRes.rows[0];
    if (!referrer || referrer.id === refereeId) {
      return false; // Invalid or self-referral
    }

    // Set referred_by_id on User
    await pool.query(
      'UPDATE "User" SET referred_by_id = $1 WHERE id = $2',
      [referrer.id, refereeId]
    );

    // Insert pending referral entry
    await pool.query(
      `INSERT INTO "referrals" (referrer_id, referee_id, status)
       VALUES ($1, $2, 'PENDING')
       ON CONFLICT (referee_id) DO NOTHING`,
      [referrer.id, refereeId]
    );

    return true;
  } catch (err: any) {
    console.error('[ReferralService] Error linking referral on register:', err.message);
    return false;
  }
}

/**
 * Process referral reward when an order reaches COMPLETED status.
 * Strictly idempotent: awarded only once per referred customer on their first eligible order.
 */
export async function processReferralRewardOnOrder(orderId: string, externalClient?: PoolClient): Promise<{ awarded: boolean; reason?: string }> {
  const isInternalTx = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (isInternalTx) await client.query('BEGIN');

    // 1. Fetch Order
    const orderRes = await client.query(`
      SELECT id, "userId", amount, "customerPriceUsd", status 
      FROM "Order" 
      WHERE id = $1 
      FOR UPDATE
    `, [orderId]);

    const order = orderRes.rows[0];
    if (!order || order.status !== 'COMPLETED') {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ORDER_NOT_COMPLETED' };
    }

    // 2. Check if this customer was referred and has a PENDING referral
    const referralRes = await client.query(`
      SELECT r.id, r.referrer_id, r.referee_id, r.status
      FROM "referrals" r
      WHERE r.referee_id = $1
      FOR UPDATE
    `, [order.userId]);

    const referral = referralRes.rows[0];
    if (!referral || referral.status !== 'PENDING') {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'NO_PENDING_REFERRAL' };
    }

    // 3. Load program settings
    const settings = await getReferralSettings();
    if (!settings.enabled) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'REFERRAL_PROGRAM_DISABLED' };
    }

    // Check min order amount if configured
    if (settings.min_order_amount > 0 && (order.amount || 0) < settings.min_order_amount) {
      if (isInternalTx) await client.query('ROLLBACK');
      return { awarded: false, reason: 'ORDER_AMOUNT_BELOW_MINIMUM' };
    }

    const referrerReward = settings.referrer_reward;
    const refereeReward = settings.referee_reward;
    const rewardCurrency = settings.currency || 'جنيه';

    // 4. Award Referrer (credit wallet and record transaction)
    if (referrerReward > 0) {
      const referrerWalletRes = await client.query(
        'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
        [referral.referrer_id]
      );
      const referrerWallet = referrerWalletRes.rows[0];
      if (referrerWallet) {
        const balBefore = Number(referrerWallet.balance);
        const balAfter = balBefore + referrerReward;

        await client.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [balAfter, referrerWallet.id]);

        await client.query(`
          INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, 
            currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          uuidv4(),
          referrerWallet.id,
          referrerReward,
          'REFERRAL_BONUS',
          `مكافأة دعوة صديق - إتمام أول طلب (#${order.id.slice(0, 8)})`,
          referrerWallet.currency || 'USD',
          balBefore,
          balAfter,
          'REFERRAL',
          referral.id,
          'REFERRAL_SYSTEM'
        ]);
      }
    }

    // 5. Award Referee (credit wallet and record transaction)
    if (refereeReward > 0) {
      const refereeWalletRes = await client.query(
        'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
        [referral.referee_id]
      );
      const refereeWallet = refereeWalletRes.rows[0];
      if (refereeWallet) {
        const balBefore = Number(refereeWallet.balance);
        const balAfter = balBefore + refereeReward;

        await client.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [balAfter, refereeWallet.id]);

        await client.query(`
          INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, 
            currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          uuidv4(),
          refereeWallet.id,
          refereeReward,
          'REFERRAL_BONUS',
          `مكافأة الصداقة الترحيبية - أول طلب (#${order.id.slice(0, 8)})`,
          refereeWallet.currency || 'USD',
          balBefore,
          balAfter,
          'REFERRAL',
          referral.id,
          'REFERRAL_SYSTEM'
        ]);
      }
    }

    // 6. Mark referral as COMPLETED
    await client.query(`
      UPDATE "referrals"
      SET 
        status = 'COMPLETED',
        qualifying_order_id = $1,
        referrer_reward_amount = $2,
        referee_reward_amount = $3,
        currency = $4,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [order.id, referrerReward, refereeReward, rewardCurrency, referral.id]);

    if (isInternalTx) await client.query('COMMIT');

    return { awarded: true };
  } catch (err: any) {
    if (isInternalTx) await client.query('ROLLBACK');
    console.error('[ReferralService] Error processing referral reward on order:', err.message);
    return { awarded: false, reason: err.message };
  } finally {
    if (isInternalTx) client.release();
  }
}
