import { Router, Request, Response, NextFunction } from 'express';
import {
  getPendingTelegramOrders,
  ackTelegramOrder,
  completeUsdtOrder,
  cancelUsdtOrder
} from '../services/cryptoService';

const router = Router();

/**
 * Strict Security Middleware for Standalone Telegram Bot API.
 * Uses timing-safe verification or environment secret to authenticate the decoupled bot service.
 */
function requireBotSecret(req: Request, res: Response, next: NextFunction) {
  const configuredSecret = process.env.BOT_API_SECRET?.trim();

  if (!configuredSecret) {
    console.error('[Internal Telegram API] BOT_API_SECRET is not configured on the backend.');
    return res.status(500).json({ error: 'خدمة البوت غير مهيأة على السيرفر (BOT_API_SECRET missing).' });
  }

  const providedSecret = (
    req.headers['x-bot-secret'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    ''
  ).toString().trim();

  if (!providedSecret || providedSecret !== configuredSecret) {
    return res.status(401).json({ error: 'غير مصرح للوصول إلى واجهة البوت الداخلية (Invalid Bot Secret).' });
  }

  next();
}

router.use(requireBotSecret);

/**
 * Get all active pending orders that require 10-second reminders
 */
router.get('/pending', async (_req: Request, res: Response) => {
  try {
    const orders = await getPendingTelegramOrders();
    return res.json({ orders });
  } catch (err: any) {
    console.error('[Internal Telegram API] Failed to fetch pending orders:', err);
    return res.status(500).json({ error: 'تعذر جلب الطلبات المعلقة.' });
  }
});

/**
 * Acknowledge reminder delivery by bot
 */
router.post('/orders/:id/ack', async (req: Request, res: Response) => {
  const id: string = String(req.params.id || '');

  try {
    const result = await ackTelegramOrder(id);
    return res.json(result);
  } catch (err: any) {
    console.error('[Internal Telegram API] Failed to ack order:', err);
    return res.status(500).json({ error: 'تعذر تسجيل استلام التنبيه.' });
  }
});

/**
 * Bot completes the transfer on admin confirmation
 */
router.post('/orders/:id/complete', async (req: Request, res: Response) => {
  const id: string = String(req.params.id || '');
  const { txHash, adminTelegramId, adminName } = req.body;

  try {
    const result = await completeUsdtOrder({
      orderId: id,
      adminId: undefined, // Performed via Telegram bot
      txHash: txHash ? String(txHash).trim() : undefined
    });

    console.log(`[Internal Telegram API] Order ${id} completed by Telegram Admin: ${adminName || adminTelegramId}`);
    return res.json(result);
  } catch (err: any) {
    console.error('[Internal Telegram API] Failed to complete order:', err);
    return res.status(400).json({ error: err.message || 'فشل إكمال الطلب.' });
  }
});

/**
 * Bot cancels the transfer on admin rejection
 */
router.post('/orders/:id/cancel', async (req: Request, res: Response) => {
  const id: string = String(req.params.id || '');
  const { reason, adminTelegramId, adminName } = req.body;

  try {
    const result = await cancelUsdtOrder({
      orderId: id,
      adminId: undefined,
      reason: reason || `إلغاء عبر بوت التيليجرام بواسطة ${adminName || adminTelegramId || 'الأدمن'}`
    });

    console.log(`[Internal Telegram API] Order ${id} canceled by Telegram Admin: ${adminName || adminTelegramId}`);
    return res.json(result);
  } catch (err: any) {
    console.error('[Internal Telegram API] Failed to cancel order:', err);
    return res.status(400).json({ error: err.message || 'فشل إلغاء الطلب.' });
  }
});

export default router;
