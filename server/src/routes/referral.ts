import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import pool from '../db';
import {
  getReferralSettings,
  updateReferralSettings,
  getUserReferralDetails,
  bindReferralCode,
  getReferralCopy
} from '../services/referralService';

const router = Router();

/**
 * GET /api/referral/config
 * Public endpoint to fetch referral program configuration and dynamic copy
 * (used to dynamically generate headings, descriptions, and badges on frontend)
 */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const settings = await getReferralSettings();
    const copy = getReferralCopy(settings);
    res.json({
      ...settings,
      copy
    });
  } catch (err: any) {
    console.error('[ReferralRoute] Failed to get config:', err.message);
    res.status(500).json({ error: 'تعذر جلب إعدادات برنامج الإحالة' });
  }
});

/**
 * GET /api/referral/my-details
 * Authenticated customer endpoint: retrieves user's referral code, link, stats, friends, and dynamic copy
 */
router.get('/my-details', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Determine host url from request headers
    const host = req.get('origin') || req.get('referer');
    const details = await getUserReferralDetails(userId, host);
    const config = await getReferralSettings();

    res.json({
      ...details,
      config
    });
  } catch (err: any) {
    console.error('[ReferralRoute] Failed to get user referral details:', err.message);
    res.status(500).json({ error: 'تعذر جلب بيانات الإحالة الخاصة بك' });
  }
});

/**
 * POST /api/referral/bind-code
 * Authenticated customer endpoint: allows an existing or newly logged in user to bind a friend's referral code
 * Immediately pays welcome referee reward to user's wallet.
 */
router.post('/bind-code', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً' });
    }

    const { referralCode } = req.body;
    if (!referralCode || typeof referralCode !== 'string' || !referralCode.trim()) {
      return res.status(400).json({ error: 'يرجى إدخال كود الإحالة' });
    }

    const result = await bindReferralCode(userId, referralCode.trim(), undefined, true);
    res.status(200).json(result);
  } catch (err: any) {
    console.warn('[ReferralRoute] Failed to bind code:', err.message);
    res.status(400).json({ error: err.message || 'فشل ربط كود الإحالة' });
  }
});

/**
 * GET /api/referral/admin/settings
 * Admin endpoint: retrieves referral settings and overall platform stats
 */
router.get('/admin/settings', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getReferralSettings();

    // Get platform-wide referral stats
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*)::int AS total_invitations,
        COUNT(*) FILTER (WHERE referrer_reward_paid = true)::int AS completed_referrals,
        COUNT(*) FILTER (WHERE referrer_reward_paid = false)::int AS pending_referrals,
        COALESCE(SUM(referrer_reward_amount) FILTER (WHERE referrer_reward_paid = true), 0)::numeric AS total_referrer_payout,
        COALESCE(SUM(referee_reward_amount) FILTER (WHERE referee_reward_paid = true), 0)::numeric AS total_referee_payout
      FROM "referrals"
    `);

    const stats = statsRes.rows[0] || {};
    const totalReferrer = Number(stats.total_referrer_payout || 0);
    const totalReferee = Number(stats.total_referee_payout || 0);

    res.json({
      settings,
      stats: {
        totalInvitations: stats.total_invitations || 0,
        completedReferrals: stats.completed_referrals || 0,
        pendingReferrals: stats.pending_referrals || 0,
        totalReferrerPayout: totalReferrer,
        totalRefereePayout: totalReferee,
        totalPayoutCombined: totalReferrer + totalReferee
      }
    });
  } catch (err: any) {
    console.error('[ReferralRoute] Failed to get admin settings:', err.message);
    res.status(500).json({ error: 'تعذر جلب إعدادات الإحالة للمشرف' });
  }
});

/**
 * PATCH /api/referral/admin/settings
 * Admin endpoint: updates referral program settings (all 10 controls)
 */
router.patch('/admin/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      enabled,
      referrer_reward,
      referee_reward,
      currency,
      min_order_amount,
      max_referrer_earnings,
      allow_existing_users_binding,
      first_order_only,
      allow_crypto_orders,
      allow_game_orders,
      allow_cards_orders
    } = req.body;
    const adminId = req.user?.id;

    if (referrer_reward !== undefined && Number(referrer_reward) < 0) {
      return res.status(400).json({ error: 'مكافأة الداعي لا يمكن أن تكون سالبة' });
    }
    if (referee_reward !== undefined && Number(referee_reward) < 0) {
      return res.status(400).json({ error: 'مكافأة الصديق لا يمكن أن تكون سالبة' });
    }
    if (min_order_amount !== undefined && Number(min_order_amount) < 0) {
      return res.status(400).json({ error: 'الحد الأدنى للطلب لا يمكن أن يكون سالباً' });
    }
    if (max_referrer_earnings !== undefined && Number(max_referrer_earnings) < 0) {
      return res.status(400).json({ error: 'سقف أرباح الداعي لا يمكن أن يكون سالباً' });
    }

    const updated = await updateReferralSettings({
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      referrer_reward: referrer_reward !== undefined ? Number(referrer_reward) : undefined,
      referee_reward: referee_reward !== undefined ? Number(referee_reward) : undefined,
      currency: currency !== undefined ? String(currency) : undefined,
      min_order_amount: min_order_amount !== undefined ? Number(min_order_amount) : undefined,
      max_referrer_earnings: max_referrer_earnings !== undefined ? Number(max_referrer_earnings) : undefined,
      allow_existing_users_binding: allow_existing_users_binding !== undefined ? Boolean(allow_existing_users_binding) : undefined,
      first_order_only: first_order_only !== undefined ? Boolean(first_order_only) : undefined,
      allow_crypto_orders: allow_crypto_orders !== undefined ? Boolean(allow_crypto_orders) : undefined,
      allow_game_orders: allow_game_orders !== undefined ? Boolean(allow_game_orders) : undefined,
      allow_cards_orders: allow_cards_orders !== undefined ? Boolean(allow_cards_orders) : undefined
    }, adminId);

    res.json({
      message: 'تم تحديث إعدادات برنامج الإحالة بنجاح',
      settings: updated
    });
  } catch (err: any) {
    console.error('[ReferralRoute] Failed to update admin settings:', err.message);
    res.status(500).json({ error: 'فشل حفظ إعدادات برنامج الإحالة' });
  }
});

export default router;
