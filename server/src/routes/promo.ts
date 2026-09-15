import { Router, Response, Request } from 'express';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { JWT_SECRET } from '../config';

const router = Router();

// Strict Rate Limiter for Promo Validation (15 checks / 5 minutes per IP to prevent dictionary/brute-force)
const promoValidateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { valid: false, error: 'تم تجاوز الحد المسموح من محاولات فحص الأكواد. يرجى الانتظار 5 دقائق.' }
});

// Strict Rate Limiter for Credit Redemption (5 attempts / 5 minutes per IP)
const promoRedeemLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد الأقصى لمحاولات استبدال الأكواد. يرجى الانتظار 5 دقائق.' }
});

// Optional auth helper to check if a user is logged in (from header or cookie)
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
 * 1. VALIDATE PROMO CODE (DOES NOT CONSUME CODE)
 * POST /api/promo-codes/validate
 * Body: { code: string, cartTotal?: number }
 */
router.post('/validate', promoValidateLimiter, async (req: Request, res: Response) => {
  const { code, cartTotal } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, error: 'يرجى إدخال رمز الكود.' });
  }

  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 4) {
    return res.status(400).json({ valid: false, error: 'رمز الكود غير مكتمل أو غير صحيح.' });
  }

  const userId = getOptionalUserId(req);

  try {
    const result = await pool.query(
      'SELECT * FROM promo_codes WHERE code = $1',
      [cleanCode]
    );

    const promo = result.rows[0];
    if (!promo) {
      return res.status(404).json({ valid: false, error: 'الكود المدخل غير صحيح، يرجى التأكد من الرمز.' });
    }

    // Check active
    if (!promo.is_active) {
      return res.status(400).json({ valid: false, error: 'هذا الكود غير متاح حالياً.' });
    }

    // Check start date
    const now = new Date();
    if (promo.starts_at && now < new Date(promo.starts_at)) {
      return res.status(400).json({ valid: false, error: 'هذا الكود لم يبدأ العمل به بعد.' });
    }

    // Check expiry
    if (promo.expires_at && now > new Date(promo.expires_at)) {
      return res.status(400).json({ valid: false, error: 'انتهت صلاحية هذا الكود.' });
    }

    // Check store-wide usage limit
    if (promo.usage_limit !== null && promo.usage_count >= promo.usage_limit) {
      return res.status(400).json({ valid: false, error: 'تم استنفاد الحد الأقصى لاستخدام هذا الكود.' });
    }

    // Check per-user limit if user is authenticated
    if (userId) {
      const redemptionRes = await pool.query(
        'SELECT id FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2',
        [promo.id, userId]
      );
      if (redemptionRes.rows.length > 0) {
        return res.status(400).json({ valid: false, error: 'تم استخدام هذا الكود مسبقاً.' });
      }
    }

    // TYPE 1: WALLET_CREDIT
    if (promo.type === 'WALLET_CREDIT') {
      const credit = Number(promo.credit_amount) || 0;
      const promoCurrency = (promo.currency || 'USD').toUpperCase();
      return res.json({
        valid: true,
        type: 'WALLET_CREDIT',
        code: promo.code,
        creditAmount: credit,
        currency: promoCurrency,
        message: promoCurrency === 'SDG'
          ? `كود هدية صالح بقيمة ${credit.toLocaleString()} ج.س! يمكنك استبداله لإضافته إلى رصيدك.`
          : `كود هدية صالح بقيمة $${credit}! يمكنك استبداله لإضافته إلى رصيدك.`
      });
    }

    // TYPE 2: DISCOUNT
    const total = typeof cartTotal === 'number' && Number.isFinite(cartTotal) && cartTotal > 0 ? Number(cartTotal) : 0;
    const discountVal = Number(promo.discount_value) || 0;
    const maxDiscount = promo.max_discount ? Number(promo.max_discount) : null;

    let calculatedDiscount = 0;
    if (promo.discount_type === 'PERCENTAGE') {
      calculatedDiscount = total > 0 ? (total * discountVal) / 100 : 0;
    } else {
      calculatedDiscount = discountVal;
    }

    // Cap at max_discount
    const cappedDiscount = maxDiscount ? Math.min(calculatedDiscount, maxDiscount) : calculatedDiscount;
    const actualDiscount = total > 0 ? Math.min(cappedDiscount, total) : cappedDiscount;
    const finalTotal = total > 0 ? Math.max(0, total - actualDiscount) : 0;

    let displayMessage = '';
    if (promo.discount_type === 'PERCENTAGE') {
      displayMessage = maxDiscount 
        ? `خصم ${discountVal}% بحد أقصى ${maxDiscount}` 
        : `خصم ${discountVal}%`;
    } else {
      displayMessage = `خصم بقيمة ${discountVal}`;
    }

    return res.json({
      valid: true,
      type: 'DISCOUNT',
      code: promo.code,
      discountType: promo.discount_type,
      discountValue: discountVal,
      maxDiscount: maxDiscount,
      calculatedDiscount: Math.round(actualDiscount * 100) / 100,
      discount: Math.round(actualDiscount * 100) / 100,
      cartTotal: total,
      finalTotal: Math.round(finalTotal * 100) / 100,
      message: `تم تطبيق كود الخصم ${promo.code} (${displayMessage})`
    });
  } catch (err) {
    console.error('Validate promo code error:', err);
    return res.status(500).json({ valid: false, error: 'حدث خطأ أثناء التحقق من الكود.' });
  }
});

/**
 * 2. REDEEM WALLET CREDIT CODE (ATOMICALLY ADDS BALANCE WITH MULTI-CURRENCY SUPPORT)
 * POST /api/promo-codes/redeem-credit
 * Body: { code: string }
 */
router.post('/redeem-credit', promoRedeemLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'يرجى إدخال رمز الكود.' });
  }

  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 4) {
    return res.status(400).json({ error: 'رمز الكود غير مكتمل أو غير صحيح.' });
  }
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock and fetch promo code
    const promoRes = await client.query(
      'SELECT * FROM promo_codes WHERE code = $1 FOR UPDATE',
      [cleanCode]
    );
    const promo = promoRes.rows[0];

    if (!promo) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الكود المدخل غير صحيح، يرجى التأكد من الرمز.' });
    }

    if (!promo.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'هذا الكود غير متاح حالياً.' });
    }

    if (promo.type !== 'WALLET_CREDIT') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'هذا الكود مخصص لخصم مشتريات الباقات، وليس كود رصيد هدية. يمكنك استخدامه عند تأكيد طلب الشراء.' 
      });
    }

    const now = new Date();
    if (promo.starts_at && now < new Date(promo.starts_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'هذا الكود لم يبدأ العمل به بعد.' });
    }

    if (promo.expires_at && now > new Date(promo.expires_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'انتهت صلاحية هذا الكود.' });
    }

    if (promo.usage_limit !== null && promo.usage_count >= promo.usage_limit) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'تم استنفاد الحد الأقصى لاستخدام هذا الكود.' });
    }

    // 2. Check if user already redeemed this code
    const redemptionRes = await client.query(
      'SELECT id FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2 FOR UPDATE',
      [promo.id, user.id]
    );

    if (redemptionRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'تم استخدام هذا الكود مسبقاً.' });
    }

    const rawCreditAmount = Number(promo.credit_amount);
    if (!Number.isFinite(rawCreditAmount) || rawCreditAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'قيمة كود الهدية غير صالحة.' });
    }

    // 3. Lock user wallet
    const walletRes = await client.query(
      'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
      [user.id]
    );
    const wallet = walletRes.rows[0];

    if (!wallet) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'المحفظة غير موجودة.' });
    }

    const promoCurrency = (promo.currency || 'USD').toUpperCase();
    const walletCurrency = (wallet.currency || 'USD').toUpperCase();

    // 4. Multi-Currency Conversion with Central Exchange Rate
    const rateRes = await client.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateRes.rows[0]?.value || { rate: 5000 };
    const exchangeRate = Number(rateConfig.rate) || 5000;

    let creditedAmount = rawCreditAmount;
    let sourceAmountUsd = rawCreditAmount;

    if (promoCurrency === 'USD') {
      sourceAmountUsd = rawCreditAmount;
      if (walletCurrency === 'SDG') {
        creditedAmount = Math.round(rawCreditAmount * exchangeRate);
      }
    } else if (promoCurrency === 'SDG') {
      sourceAmountUsd = exchangeRate > 0 ? Math.round((rawCreditAmount / exchangeRate) * 100) / 100 : rawCreditAmount;
      if (walletCurrency === 'USD') {
        creditedAmount = sourceAmountUsd;
      }
    }

    const balanceBefore = Number(wallet.balance);
    const newBalance = Math.round((balanceBefore + creditedAmount) * 100) / 100;

    // 5. Update Wallet Balance
    await client.query(
      'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
      [newBalance, wallet.id]
    );

    // 6. Insert Wallet Transaction with locked rate details
    const txId = uuidv4();
    const sourceLabel = promoCurrency === 'SDG' ? `${rawCreditAmount.toLocaleString()} ج.س` : `$${rawCreditAmount}`;
    const creditedLabel = walletCurrency === 'SDG' ? `${creditedAmount.toLocaleString()} ج.س` : `$${creditedAmount.toFixed(2)}`;
    const txDescription = promoCurrency === walletCurrency
      ? `استبدال كود هدية: ${promo.code} (${creditedLabel})`
      : `استبدال كود هدية: ${promo.code} (${sourceLabel} -> ${creditedLabel} بسعر صرف ${exchangeRate})`;

    await client.query(`
      INSERT INTO "WalletTransaction" 
        (id, "walletId", amount, type, description, currency, source_amount_usd, exchange_rate, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      txId,
      wallet.id,
      creditedAmount,
      'PROMO_CREDIT',
      txDescription,
      walletCurrency,
      sourceAmountUsd,
      exchangeRate,
      balanceBefore,
      newBalance,
      'PROMO_CODE',
      promo.id,
      null,
      'SYSTEM'
    ]);

    // 7. Record Redemption to prevent re-use
    await client.query(
      'INSERT INTO promo_code_redemptions (id, promo_code_id, user_id, credit_amount) VALUES ($1, $2, $3, $4)',
      [uuidv4(), promo.id, user.id, creditedAmount]
    );

    // 8. Increment Promo Code usage count
    await client.query(
      'UPDATE promo_codes SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [promo.id]
    );

    await client.query('COMMIT');

    const successMessage = promoCurrency === walletCurrency
      ? `✓ تم استبدال كود الهدية بنجاح! تمت إضافة ${creditedLabel} إلى محفظتك.`
      : `✓ تم استبدال كود الهدية (${sourceLabel}) بنجاح! تمت إضافة ${creditedLabel} إلى محفظتك بسعر صرف ${exchangeRate}.`;

    return res.json({
      success: true,
      newBalance,
      creditedAmount,
      creditedCurrency: walletCurrency,
      exchangeRateUsed: exchangeRate,
      message: successMessage
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Redeem credit code error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء استبدال الكود، يرجى المحاولة لاحقاً.' });
  } finally {
    client.release();
  }
});

export default router;
