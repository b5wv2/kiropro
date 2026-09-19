import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { getUsdtPublicConfig, createUsdtOrder } from '../services/cryptoService';

const router = Router();

// Rate limiter for USDT order creation: 10 requests per minute
const usdtOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لإنشاء طلبات التحويل مؤقتاً. يرجى الانتظار قليلاً.' }
});

/**
 * Public: Get USDT Transfer configuration (active networks, exchange rate, minimum, available)
 */
router.get('/config', async (_req, res: Response) => {
  try {
    const config = await getUsdtPublicConfig();
    return res.json(config);
  } catch (err: any) {
    console.error('[CryptoRoutes] Failed to fetch config:', err);
    return res.status(500).json({ error: 'تعذر جلب إعدادات تحويل USDT حالياً.' });
  }
});

/**
 * Customer: Create a new USDT Instant Transfer Order
 */
router.post('/order', usdtOrderLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' });
  }

  const { amount, network, walletAddress } = req.body;

  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: 'يرجى تحديد كمية USDT المطلوبة.' });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'الكمية المدخلة غير صالحة.' });
  }

  // Mandatory Backend Hard Floor Protection (>= 1.0)
  if (numAmount < 1.0) {
    return res.status(400).json({
      code: 'MINIMUM_USDT_AMOUNT_NOT_MET',
      error: 'الحد الأدنى لشراء USDT هو 1 دولار.'
    });
  }

  if (!network || typeof network !== 'string' || !network.trim()) {
    return res.status(400).json({ error: 'يرجى اختيار شبكة التحويل.' });
  }

  if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
    return res.status(400).json({ error: 'يرجى إدخال عنوان المحفظة.' });
  }

  try {
    const orderResult = await createUsdtOrder({
      userId: user.id,
      amount: numAmount,
      networkIdentifier: network.trim(),
      walletAddress: walletAddress.trim()
    });

    return res.status(201).json(orderResult);
  } catch (err: any) {
    console.error('[CryptoRoutes] Order creation error:', err.message);
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({
      error: err.message || 'فشل إنشاء طلب تحويل USDT.',
      code: err.code || undefined
    });
  }
});

/**
 * Customer: Get USDT Order status by ID
 */
router.get('/orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const { id } = req.params;

  try {
    const orderRes = await pool.query(
      `SELECT 
        o.id,
        o."usdtAmount",
        o."cryptoNetwork",
        o."walletAddress",
        o."chargedAmount",
        o."chargedCurrency",
        o."exchangeRateUsed",
        COALESCE(o."usdtExchangeRateUsed", o."exchangeRateUsed") as "usdtExchangeRateUsed",
        o.status,
        o."txHash",
        o."createdAt",
        o."completedAt",
        o."canceledAt",
        o."canceledReason"
       FROM "Order" o
       WHERE o.id = $1 AND o."userId" = $2 AND o."orderType" = 'USDT_TRANSFER'`,
      [id, user?.id]
    );

    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }

    return res.json(order);
  } catch (err: any) {
    console.error('[CryptoRoutes] Failed to fetch order:', err.message);
    return res.status(500).json({ error: 'تعذر جلب تفاصيل الطلب.' });
  }
});

export default router;
