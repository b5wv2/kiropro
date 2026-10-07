import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { decryptCardData, formatCardNumber, maskCardNumber } from '../utils/cryptoCard';

const router = Router();

// Rate limiter for voucher redemption: 5 attempts per 10 minutes per IP
const cardVoucherLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لمحاولات استرداد الأكواد. يرجى الانتظار 10 دقائق.' }
});

// ==============================================================
// 1. PUBLIC PRODUCT INFO & STOCK STATUS (No exact counts exposed)
// ==============================================================
router.get('/product-info', async (_req, res: Response) => {
  try {
    const prodRes = await pool.query(
      `SELECT id, "productName", "arabicName", "customerPriceUsd", "inStock", "isActive", description 
       FROM "Product" 
       WHERE "productType" = 'VIRTUAL_CARD' OR id = 'b0000000-0000-0000-0000-000000000001'
       LIMIT 1`
    );

    const product = prodRes.rows[0];
    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود.' });
    }

    // Check actual stock in kiropro_cards_inventory
    const stockRes = await pool.query(
      `SELECT COUNT(*)::int as count 
       FROM kiropro_cards_inventory 
       WHERE product_id = $1 AND status = 'AVAILABLE'`,
      [product.id]
    );

    const availableCount = stockRes.rows[0]?.count || 0;
    const isAvailable = availableCount > 0 && product.isActive && product.inStock;

    // Get compliance notice from platform_settings
    const settingsRes = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'kiropro_card_settings'`
    );
    const settings = settingsRes.rows[0]?.value || {};

    res.json({
      success: true,
      productId: product.id,
      productName: product.arabicName || product.productName,
      priceUsd: Number(product.customerPriceUsd),
      isAvailable,
      inStockText: isAvailable ? 'متوفر حالياً للتسليم الفوري' : 'غير متوفر حالياً',
      description: product.description,
      complianceNotice: settings.complianceNotice || 'بطاقة افتراضية للاستخدام في الخدمات والمواقع المدعومة حسب شروط KIROPRO.',
      defaultBalance: Number(settings.defaultBalance || 1.00)
    });
  } catch (err: any) {
    console.error('[KiroProCards] Failed to fetch product info:', err.message);
    res.status(500).json({ error: 'فشل جلب تفاصيل المنتج.' });
  }
});

// ==============================================================
// 2. REVEAL CARD CREDENTIALS FOR COMPLETED ORDER (Strict IDOR)
// ==============================================================
router.get('/order/:orderId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;
  const user = req.user;

  try {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // 1. Verify Order Ownership & Status
    const orderRes = await pool.query(
      `SELECT id, "userId", status, "packageName" 
       FROM "Order" 
       WHERE id = $1`,
      [orderId]
    );

    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }

    if (order.userId !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح لك بالوصول لبيانات هذا الطلب.' });
    }

    if (order.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'بيانات البطاقة متاحة فقط للطلبات المكتملة.' });
    }

    // 2. Fetch assigned card
    const cardRes = await pool.query(
      `SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status, assigned_at
       FROM kiropro_cards_inventory 
       WHERE order_id = $1
       LIMIT 1`,
      [orderId]
    );

    const card = cardRes.rows[0];
    if (!card) {
      return res.status(404).json({ error: 'لا توجد بطاقة مرتبطة بهذا الطلب.' });
    }

    // 3. Decrypt credentials for delivery
    const fullCardNumber = decryptCardData(card.card_number_encrypted);
    const cvv = decryptCardData(card.cvv_encrypted);

    res.json({
      success: true,
      card: {
        id: card.id,
        cardNumber: formatCardNumber(fullCardNumber),
        last4: card.card_last4,
        maskedNumber: maskCardNumber(card.card_last4),
        expDate: card.exp_date,
        cvv: cvv,
        balance: Number(card.balance),
        status: card.status,
        assignedAt: card.assigned_at
      }
    });
  } catch (err: any) {
    console.error('[KiroProCards] Failed to reveal card credentials:', err.message);
    res.status(500).json({ error: 'فشل كشف بيانات البطاقة.' });
  }
});

// ==============================================================
// 3. VALIDATE ISSUANCE CODE (Pre-Check)
// ==============================================================
router.post('/validate-code', requireAuth, async (req: AuthRequest, res: Response) => {
  const code = (req.body.code || req.body.issuanceCode || req.body.voucherCode || '').trim().toUpperCase();

  try {
    if (!code) {
      return res.status(400).json({ valid: false, error: 'يرجى إدخال كود الإصدار.' });
    }

    const vRes = await pool.query(
      `SELECT id, product_id, value, status, is_redeemed, is_active, expires_at 
       FROM kiropro_card_vouchers 
       WHERE UPPER(code) = $1`,
      [code]
    );

    const voucher = vRes.rows[0];
    if (!voucher) {
      return res.status(404).json({ valid: false, error: 'كود الإصدار غير موجود أو غير صالح.' });
    }

    if (voucher.is_redeemed || voucher.status === 'REDEEMED') {
      return res.status(400).json({ valid: false, error: 'كود الإصدار مستخدم بالفعل مسبقاً.' });
    }

    if (!voucher.is_active || voucher.status === 'DISABLED') {
      return res.status(400).json({ valid: false, error: 'كود الإصدار معطل حالياً من قبل الإدارة.' });
    }

    if ((voucher.expires_at && new Date() > new Date(voucher.expires_at)) || voucher.status === 'EXPIRED') {
      return res.status(400).json({ valid: false, error: 'انتهت صلاحية كود الإصدار.' });
    }

    // Check stock
    const stockRes = await pool.query(
      `SELECT COUNT(*)::int as count 
       FROM kiropro_cards_inventory 
       WHERE product_id = $1 AND status = 'AVAILABLE'`,
      [voucher.product_id]
    );
    const inStock = (stockRes.rows[0]?.count || 0) > 0;

    res.json({
      valid: true,
      value: Number(voucher.value || 2.00),
      inStock,
      message: inStock 
        ? 'الكود صالح — يمكنك الآن إصدار KiroPro Card فورياً بقيمة $2.00.' 
        : 'الكود صالح، ولكن مخزون البطاقات نافد حالياً. يرجى مراجعة الدعم أو المحاولة لاحقاً.'
    });
  } catch (err: any) {
    console.error('[KiroProCards] Validate code error:', err.message);
    res.status(500).json({ valid: false, error: 'فشل التحقق من كود الإصدار.' });
  }
});

// ==============================================================
// 4. ZERO-RACE-CONDITION ISSUANCE CODE REDEMPTION & CARD CLAIM
// ==============================================================
const handleRedemption = async (req: AuthRequest, res: Response) => {
  const rawCode = req.body.code || req.body.issuanceCode || req.body.voucherCode;
  const user = req.user;

  try {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'يرجى إدخال كود الإصدار.' });
    }

    const cleanCode = rawCode.trim().toUpperCase();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock voucher row with SELECT ... FOR UPDATE (Zero-Race-Condition on Voucher)
      const voucherRes = await client.query(
        `SELECT id, product_id, value, status, is_redeemed, is_active, expires_at 
         FROM kiropro_card_vouchers 
         WHERE UPPER(code) = $1 
         FOR UPDATE`,
        [cleanCode]
      );

      const voucher = voucherRes.rows[0];
      if (!voucher || voucher.is_redeemed || voucher.status === 'REDEEMED') {
        throw new Error('كود الإصدار مستخدم بالفعل أو غير صالح.');
      }

      if (!voucher.is_active || voucher.status === 'DISABLED') {
        throw new Error('كود الإصدار معطل حالياً من قبل الإدارة.');
      }

      if ((voucher.expires_at && new Date() > new Date(voucher.expires_at)) || voucher.status === 'EXPIRED') {
        throw new Error('انتهت صلاحية كود الإصدار.');
      }

      // 2. Lock ONE available card with SELECT ... FOR UPDATE SKIP LOCKED
      const cardRes = await client.query(
        `SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance 
         FROM kiropro_cards_inventory 
         WHERE product_id = $1 AND status = 'AVAILABLE' 
         ORDER BY created_at ASC 
         LIMIT 1 
         FOR UPDATE SKIP LOCKED`,
        [voucher.product_id]
      );

      const card = cardRes.rows[0];
      if (!card) {
        throw new Error('نعتذر، نفد مخزون البطاقات حالياً. يرجى المحاولة لاحقاً.');
      }

      // 3. Create Official Completed Order for Customer
      const orderId = uuidv4();
      await client.query(
        `INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId", 
          amount, "originalAmount", "discountAmount", "promoCode", 
          status, provider, "orderType",
          "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
          "chargedCurrency", "exchangeRateUsed", "cashbackAmount", "completedAt",
          quantity, "unitPrice", "unitPriceUsd"
        ) 
        VALUES ($1, $2, 'kiropro-card', $3, 'بطاقة كيرو برو الافتراضية ($1.00)', $4, 0.0, 2.00, 2.00, $5, 'COMPLETED', 'INTERNAL', 'VIRTUAL_CARD', 2.00, 0.0, 2.00, 0.0, 'USD', 1.0, 0.0, CURRENT_TIMESTAMP, 1, 2.00, 2.00)`,
        [
          orderId,
          user.id,
          voucher.product_id,
          `بطاقة كيرو برو (•••• ${card.card_last4})`,
          `ISSUANCE-CODE:${cleanCode.slice(0, 4)}...`
        ]
      );

      // 4. Mark card claimed and associate with user, order, and voucher
      await client.query(
        `UPDATE kiropro_cards_inventory 
         SET status = 'CLAIMED', 
             order_id = $1,
             assigned_to_user_id = $2, 
             assigned_at = CURRENT_TIMESTAMP, 
             claimed_by_voucher_id = $3, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4`,
        [orderId, user.id, voucher.id, card.id]
      );

      // 5. Mark voucher redeemed with status REDEEMED
      await client.query(
        `UPDATE kiropro_card_vouchers 
         SET is_redeemed = true, 
             status = 'REDEEMED',
             card_id = $1, 
             redeemed_by_user_id = $2, 
             redeemed_at = CURRENT_TIMESTAMP,
             redeemed_order_id = $3
         WHERE id = $4`,
        [card.id, user.id, orderId, voucher.id]
      );

      await client.query('COMMIT');

      // 6. Decrypt and return credentials
      const fullCardNumber = decryptCardData(card.card_number_encrypted);
      const cvv = decryptCardData(card.cvv_encrypted);

      res.json({
        success: true,
        message: 'تم إصدار وتخصيص البطاقة بنجاح عبر كود الإصدار 🎉',
        orderId,
        card: {
          id: card.id,
          cardNumber: formatCardNumber(fullCardNumber),
          last4: card.card_last4,
          maskedNumber: maskCardNumber(card.card_last4),
          expDate: card.exp_date,
          cvv: cvv,
          balance: Number(card.balance || 1.00)
        }
      });
    } catch (txErr: any) {
      await client.query('ROLLBACK');
      console.warn('[KiroProCards] Issuance code redemption aborted:', txErr.message);
      return res.status(409).json({ error: txErr.message || 'فشل استرداد كود الإصدار.' });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[KiroProCards] Unhandled redemption error:', err.message);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة كود الإصدار.' });
  }
};

router.post('/redeem-voucher', cardVoucherLimiter, requireAuth, handleRedemption);
router.post('/redeem-issuance-code', cardVoucherLimiter, requireAuth, handleRedemption);

export default router;
