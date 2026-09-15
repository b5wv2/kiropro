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
 * Body: { code: string, cartTotal?: number, currency?: string, purpose?: 'CHECKOUT_DISCOUNT' | 'WALLET_REDEEM' }
 */
router.post('/validate', promoValidateLimiter, async (req: Request, res: Response) => {
  const { code, cartTotal, currency, purpose = 'CHECKOUT_DISCOUNT' } = req.body;

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

    // RULE 1: If WALLET_CREDIT is used in CHECKOUT_DISCOUNT field => Strict Rejection
    if (promo.type === 'WALLET_CREDIT') {
      if (purpose === 'CHECKOUT_DISCOUNT') {
        return res.status(400).json({
          valid: false,
          code: 'GIFT_CODE_USED_IN_DISCOUNT_FIELD',
          error: 'عذرًا، هذا كود رصيد هدايا وليس كود خصم. يرجى استبداله من المكان المخصص لإضافة الرصيد.'
        });
      }

      // Valid for WALLET_REDEEM
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

    // RULE 2: If DISCOUNT is used in WALLET_REDEEM field => Strict Rejection
    if (promo.type === 'DISCOUNT' && purpose === 'WALLET_REDEEM') {
      return res.status(400).json({
        valid: false,
        code: 'DISCOUNT_CODE_USED_IN_WALLET_FIELD',
        error: 'هذا الكود مخصص لخصم مشتريات الباقات، وليس كود رصيد هدية. يمكنك استخدامه عند تأكيد طلب الشراء.'
      });
    }

    // TYPE 2: DISCOUNT CALCULATION WITH CURRENCY AWARENESS
    // Fetch Central Exchange Rate
    const rateRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateRes.rows[0]?.value || { rate: 5000 };
    const exchangeRate = Number(rateConfig.rate) || 5000;

    // Resolve customer's active currency
    let effectiveCurrency = String(currency || '').trim().toUpperCase();
    if (effectiveCurrency !== 'SDG' && effectiveCurrency !== 'USD') {
      if (userId) {
        const userRow = await pool.query('SELECT "preferred_currency" FROM "User" WHERE id = $1', [userId]);
        effectiveCurrency = (userRow.rows[0]?.preferred_currency || 'USD').toUpperCase();
      } else {
        effectiveCurrency = 'USD';
      }
    }

    const total = typeof cartTotal === 'number' && Number.isFinite(cartTotal) && cartTotal > 0 ? Number(cartTotal) : 0;
    const discountVal = Number(promo.discount_value) || 0;
    const promoCurrency = (promo.currency || 'USD').toUpperCase();

    let calculatedDiscount = 0;
    if (promo.discount_type === 'PERCENTAGE') {
      calculatedDiscount = total > 0 ? (total * discountVal) / 100 : 0;

      // Cap at max_discount (converting currency if max_discount currency differs from user's currency)
      if (promo.max_discount) {
        let maxCap = Number(promo.max_discount);
        if (promoCurrency !== effectiveCurrency) {
          if (effectiveCurrency === 'SDG') {
            maxCap = Math.round(maxCap * exchangeRate);
          } else {
            maxCap = Math.round((maxCap / exchangeRate) * 100) / 100;
          }
        }
        calculatedDiscount = Math.min(calculatedDiscount, maxCap);
      }
    } else {
      // FIXED DISCOUNT: Currency-aware conversion via central exchange rate
      let fixedVal = discountVal;
      if (promoCurrency !== effectiveCurrency) {
        if (effectiveCurrency === 'SDG') {
          fixedVal = Math.round(fixedVal * exchangeRate);
        } else {
          fixedVal = Math.round((fixedVal / exchangeRate) * 100) / 100;
        }
      }
      calculatedDiscount = fixedVal;
    }

    // Ensure discount never exceeds total and total never drops below 0
    const actualDiscount = total > 0 ? Math.min(calculatedDiscount, total) : calculatedDiscount;
    const finalTotal = total > 0 ? Math.max(0, total - actualDiscount) : 0;

    const roundedDiscount = effectiveCurrency === 'SDG' ? Math.round(actualDiscount) : Math.round(actualDiscount * 100) / 100;
    const roundedFinalTotal = effectiveCurrency === 'SDG' ? Math.round(finalTotal) : Math.round(finalTotal * 100) / 100;

    const discountLabel = effectiveCurrency === 'SDG'
      ? `${roundedDiscount.toLocaleString()} ج.س`
      : `$${roundedDiscount.toFixed(2)}`;

    let displayRule = '';
    if (promo.discount_type === 'PERCENTAGE') {
      displayRule = promo.max_discount 
        ? `خصم ${discountVal}% بحد أقصى ${promoCurrency === 'SDG' ? `${Number(promo.max_discount).toLocaleString()} ج.س` : `$${promo.max_discount}`}` 
        : `خصم ${discountVal}%`;
    } else {
      displayRule = `خصم بقيمة ${promoCurrency === 'SDG' ? `${discountVal.toLocaleString()} ج.س` : `$${discountVal}`}`;
    }

    return res.json({
      valid: true,
      type: 'DISCOUNT',
      code: promo.code,
      discountType: promo.discount_type,
      discountValue: discountVal,
      discountCurrency: promoCurrency,
      appliedCurrency: effectiveCurrency,
      maxDiscount: promo.max_discount ? Number(promo.max_discount) : null,
      calculatedDiscount: roundedDiscount,
      discount: roundedDiscount,
      discountAmount: roundedDiscount,
      cartTotal: total,
      finalTotal: roundedFinalTotal,
      exchangeRateUsed: exchangeRate,
      discountLabel,
      message: `تم تطبيق كود الخصم ${promo.code} (${displayRule})`
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
        code: 'DISCOUNT_CODE_USED_IN_WALLET_FIELD',
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
