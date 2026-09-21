import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import pool from '../db';
import {
  getReferralSettings,
  updateReferralSettings,
  getUserReferralDetails
} from '../services/referralService';

const router = Router();

/**
 * GET /api/referral/config
 * Public endpoint to fetch referral program configuration
 * (used to dynamically generate headings, descriptions, and badges on frontend)
 */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const settings = await getReferralSettings();
    res.json(settings);
  } catch (err: any) {
    console.error('[ReferralRoute] Failed to get config:', err.message);
    res.status(500).json({ error: 'تعذر جلب إعدادات برنامج الإحالة' });
  }
});

/**
 * GET /api/referral/my-details
 * Authenticated customer endpoint: retrieves user's referral code, link, stats, and friends
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
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_referrals,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_referrals,
        COALESCE(SUM(referrer_reward_amount) FILTER (WHERE status = 'COMPLETED'), 0)::numeric AS total_referrer_payout,
        COALESCE(SUM(referee_reward_amount) FILTER (WHERE status = 'COMPLETED'), 0)::numeric AS total_referee_payout
      FROM "referrals"
    `);

    const stats = statsRes.rows[0] || {};

    res.json({
      settings,
      stats: {
        totalInvitations: stats.total_invitations || 0,
        completedReferrals: stats.completed_referrals || 0,
        pendingReferrals: stats.pending_referrals || 0,
        totalReferrerPayout: Number(stats.total_referrer_payout || 0),
        totalRefereePayout: Number(stats.total_referee_payout || 0),
        totalPayoutCombined: Number(stats.total_referrer_payout || 0) + Number(stats.total_referee_payout || 0)
      }
    });
  } catch (err: any) {
    console.error('[ReferralRoute] Failed to get admin settings:', err.message);
    res.status(500).json({ error: 'تعذر جلب إعدادات الإحالة للمشرف' });
  }
});

/**
 * PATCH /api/referral/admin/settings
 * Admin endpoint: updates referral program settings
 */
router.patch('/admin/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { enabled, referrer_reward, referee_reward, currency, min_order_amount } = req.body;
    const adminId = req.user?.id;

    if (referrer_reward !== undefined && Number(referrer_reward) < 0) {
      return res.status(400).json({ error: 'مكافأة الداعي لا يمكن أن تكون سالبة' });
    }
    if (referee_reward !== undefined && Number(referee_reward) < 0) {
      return res.status(400).json({ error: 'مكافأة الصديق لا يمكن أن تكون سالبة' });
    }

    const updated = await updateReferralSettings({
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      referrer_reward: referrer_reward !== undefined ? Number(referrer_reward) : undefined,
      referee_reward: referee_reward !== undefined ? Number(referee_reward) : undefined,
      currency: currency !== undefined ? String(currency) : undefined,
      min_order_amount: min_order_amount !== undefined ? Number(min_order_amount) : undefined
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
