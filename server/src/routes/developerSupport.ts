import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { developerSupportService } from '../services/developerSupportService';

const router = Router();

/**
 * 1. GET /api/developer-support/ranks
 * Public ladder of all 10 military ranks and their requirements
 */
router.get('/ranks', async (_req, res: Response) => {
  try {
    const ranks = developerSupportService.getRanksLadder();
    res.json({ ranks });
  } catch (err: any) {
    console.error('[DeveloperSupportRoute] Error fetching ranks:', err.message);
    res.status(500).json({ error: 'تعذر جلب سلم الرتب العسكرية.' });
  }
});

/**
 * 2. GET /api/developer-support/leaderboard
 * Public Honor Board of top supporters
 */
router.get('/leaderboard', async (req, res: Response) => {
  try {
    const limit = req.query.limit ? Math.min(100, Math.max(5, Number(req.query.limit))) : 20;
    const leaderboard = await developerSupportService.getHonorBoard(limit);
    res.json({ leaderboard });
  } catch (err: any) {
    console.error('[DeveloperSupportRoute] Error fetching leaderboard:', err.message);
    res.status(500).json({ error: 'تعذر جلب لوحة الشرف.' });
  }
});

/**
 * 3. GET /api/developer-support/my-status
 * Authenticated user rank progress, cumulative donations, and wallet balance
 */
router.get('/my-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
    }

    const status = await developerSupportService.getUserSupportStatus(userId);
    res.json(status);
  } catch (err: any) {
    console.error('[DeveloperSupportRoute] Error fetching status:', err.message);
    res.status(500).json({ error: err.message || 'تعذر جلب بيانات الدعم والرتبة.' });
  }
});

/**
 * 4. POST /api/developer-support/donate
 * Authenticated user performs a support donation using their internal wallet
 */
router.post('/donate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً لإتمام الدعم.' });
    }

    const { amount } = req.body;
    const numAmount = Number(amount);

    if (!Number.isFinite(numAmount) || numAmount < 1) {
      return res.status(400).json({ error: 'يرجى إدخال مبلغ صحيح (1 جنيه أو أكثر).' });
    }

    const result = await developerSupportService.processDonation(userId, numAmount);
    res.json(result);
  } catch (err: any) {
    console.error('[DeveloperSupportRoute] Donation error:', err.message);
    if (err.code === 'DAILY_LIMIT_REACHED' || err.status === 429) {
      return res.status(429).json({
        error: 'DAILY_LIMIT_REACHED',
        code: 'DAILY_LIMIT_REACHED',
        status: 'DAILY_LIMIT_REACHED',
        message: err.message
      });
    }
    res.status(400).json({ error: err.message || 'فشلت عملية الدعم والخصم من المحفظة.' });
  }
});

export default router;
