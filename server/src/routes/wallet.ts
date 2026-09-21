import { Router, Response } from 'express';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// Public endpoint to get current platform exchange rate
router.get('/rate', async (_req, res: Response) => {
  try {
    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000 };
    const exchangeRate = Number(rateConfig.rate) || 5000;
    res.json({ exchangeRate });
  } catch (err) {
    console.error(err);
    res.json({ exchangeRate: 5000 });
  }
});

// Get current wallet balance, currency & exchange rate
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const walletRes = await pool.query('SELECT balance, currency FROM "Wallet" WHERE "userId" = $1', [req.user.id]);
    const wallet = walletRes.rows[0];
    const balance = wallet ? Number(wallet.balance) : 0;
    const currency = wallet?.currency || 'SDG';
    
    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000 };
    const exchangeRate = Number(rateConfig.rate) || 5000;
    
    res.json({ balance, currency, exchangeRate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

// Get wallet transactions
router.get('/transactions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const walletRes = await pool.query('SELECT id, currency FROM "Wallet" WHERE "userId" = $1', [req.user.id]);
    const wallet = walletRes.rows[0];

    if (!wallet?.id) return res.json([]);

    const txRes = await pool.query(
      `SELECT 
        id, 
        amount, 
        type, 
        description, 
        currency, 
        source_amount_usd, 
        exchange_rate, 
        "balanceBefore", 
        "balanceAfter", 
        "referenceType", 
        "referenceId", 
        "createdAt" 
       FROM "WalletTransaction" 
       WHERE "walletId" = $1 
       ORDER BY "createdAt" DESC 
       LIMIT 100`,
      [wallet.id]
    );
    
    res.json(txRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Deprecated & Disabled: Demo auto-credit is completely disabled.
// All wallet top-ups must go through manual bank transfer with receipt verification (/api/topups).
router.post('/deposit', requireAuth, async (req: AuthRequest, res: Response) => {
  return res.status(403).json({
    error: 'تم إيقاف الشحن المباشر/التجريبي نهائياً. يرجى تقديم طلب شحن بنكي مع إرفاق الإيصال عبر /api/topups لمراجعته واعتماده من قبل الإدارة.'
  });
});

export default router;
