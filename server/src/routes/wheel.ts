import { Router, Response, Request } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { JWT_SECRET } from '../config';
import { getWheelStatus, executeDailySpin } from '../services/wheelService';

const router = Router();

// Rate limiter for wheel spin: 10 spin requests / 1 minute per IP (prevents flooding / fast double-clicks)
const wheelSpinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم إرسال طلبات متعددة بسرعة. يرجى الانتظار بضع ثوانٍ.' }
});

// Helper to get user ID if present from token or cookie (for public/guest status queries)
function getOptionalUserId(req: Request): string | null {
  try {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    if (!token) return null;
    const decoded: any = jwt.verify(token, JWT_SECRET);
    return decoded?.id || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/wheel/status
 * Public/User status endpoint:
 * Returns canSpin, todaySpin, nextSpinAt, user history, and public prizes.
 * Sensitive data (weights, caps, budgets) are strictly omitted.
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = getOptionalUserId(req);
    const status = await getWheelStatus(userId);
    res.json(status);
  } catch (err: any) {
    console.error('[WheelAPI] Error getting status:', err.message);
    res.status(500).json({ error: 'تعذر جلب حالة عجلة الحظ حالياً.' });
  }
});

/**
 * GET /api/wheel (Alias for /status)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getOptionalUserId(req);
    const status = await getWheelStatus(userId);
    res.json(status);
  } catch (err: any) {
    console.error('[WheelAPI] Error getting status:', err.message);
    res.status(500).json({ error: 'تعذر جلب حالة عجلة الحظ حالياً.' });
  }
});

/**
 * POST /api/wheel/spin
 * Authenticated daily spin execution:
 * 1 Account = 1 Spin Per Day.
 * Client sends NO prizeId or reward values. Everything is computed server-side.
 */
router.post('/spin', wheelSpinLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول للمشاركة في السحب اليومي.' });
    }

    const result = await executeDailySpin(user.id);
    if (result.alreadySpun) {
      return res.status(200).json({
        success: false,
        alreadySpun: true,
        canSpin: false,
        availableSpins: 0,
        creditsSummary: result.creditsSummary,
        message: result.message,
        spin: result.spin,
        nextSpinAt: result.nextSpinAt
      });
    }

    return res.status(200).json({
      success: true,
      canSpin: result.canSpin,
      availableSpins: result.availableSpins,
      creditsSummary: result.creditsSummary,
      consumedSource: result.consumedSource,
      prize: result.prize,
      rewardDetails: result.rewardDetails,
      spin: result.spin,
      nextSpinAt: result.nextSpinAt
    });
  } catch (err: any) {
    console.error('[WheelAPI] Spin execution error:', err.message);
    return res.status(500).json({
      error: err.message || 'حدث خطأ أثناء تنفيذ السحب. يرجى المحاولة لاحقاً.'
    });
  }
});

export default router;
