import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { randomUUID as uuidv4 } from 'crypto';
import { g2BulkVoucherService } from '../services/g2bulkVoucherService';
import { g2BulkVoucherPurchaseProvider } from '../providers/g2bulk/voucherPurchaseProvider';
import { encryptVoucherCode, maskVoucherCode } from '../utils/cryptoVoucher';
import { sendVoucherDeliveryEmail } from '../services/emailService';
import { getGeneralSettings } from './admin';

const router = Router();

// Purchase rate limiter: 15 purchases per minute per IP
const voucherPurchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح للشراء مؤقتاً. يرجى الانتظار دقيقة واحدة.' }
});

/**
 * Helper to fetch platform exchange rate safely
 */
async function getExchangeRate(): Promise<number> {
  try {
    const res = await pool.query("SELECT value FROM platform_settings WHERE key = 'exchange_rate' LIMIT 1");
    if (res.rows.length > 0 && res.rows[0].value) {
      const val = Number(res.rows[0].value);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}
  return 7600; // Default fallback SDG per USD
}

/**
 * GET /api/vouchers/catalog
 * Public store endpoint. Returns active vouchers from local catalog / DB.
 * NOTE: Strictly NEVER exposes provider name to the user!
 */
router.get('/catalog', async (_req, res: Response) => {
  try {
    const exchangeRate = await getExchangeRate();

    const result = await pool.query(`
      SELECT 
        v.id,
        v.provider_product_id as "voucherId",
        v.title,
        v.arabic_title as "arabicTitle",
        v.description,
        v.category_title as "categoryTitle",
        v.game_key as "gameKey",
        v.face_value as "faceValue",
        v.customer_price_usd as "priceUsd",
        v.stock,
        v.is_in_stock as "inStock",
        v.custom_image_url as "imageUrl",
        p.id as "productId"
      FROM g2bulk_voucher_catalog v
      LEFT JOIN "Product" p ON p.id = (
        -- Match deterministic ID
        SELECT p2.id FROM "Product" p2 
        WHERE p2.fulfillment_type = 'G2BULK_VOUCHER' 
          AND p2."productName" = v.title 
        LIMIT 1
      )
      WHERE v.is_active = true 
        AND v.customer_price_usd IS NOT NULL 
        AND v.customer_price_usd > 0
      ORDER BY v.game_key ASC, v.customer_price_usd ASC
    `);

    const categories = [
      {
        id: 'freefire-vouchers',
        name: 'قسائم فري فاير الرسمية',
        gameKey: 'freefire',
        badge: 'أكواد فورية',
        imageUrl: '/uploads/products/prod_1789435947312_54dc7dd7.webp',
        items: [] as any[]
      },
      {
        id: 'pubg-vouchers',
        name: 'بطاقات ببجي شدات (UC Vouchers)',
        gameKey: 'pubg',
        badge: 'أكواد Midasbuy معتمدة',
        imageUrl: '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg',
        items: [] as any[]
      }
    ];

    result.rows.forEach(row => {
      const priceUsd = Number(row.priceUsd);
      const priceSdg = Math.round(priceUsd * exchangeRate);

      const formattedItem = {
        id: row.productId || row.id,
        voucherId: row.voucherId,
        title: row.arabicTitle || row.title,
        originalTitle: row.title,
        description: row.description,
        gameKey: row.gameKey,
        faceValue: row.faceValue ? Number(row.faceValue) : null,
        priceUsd,
        priceSdg,
        inStock: Boolean(row.inStock && row.stock > 0),
        stock: row.stock,
        imageUrl: row.imageUrl || (row.gameKey === 'freefire' ? '/uploads/products/prod_1789435947312_54dc7dd7.webp' : '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg')
      };

      const targetCat = categories.find(c => c.gameKey === row.gameKey);
      if (targetCat) {
        targetCat.items.push(formattedItem);
      }
    });

    return res.json({
      success: true,
      exchangeRate,
      categories
    });
  } catch (err: any) {
    console.error('[Vouchers API] Error fetching catalog:', err.message);
    return res.status(500).json({ error: 'تعذر جلب كتالوج البطاقات الرقمية.' });
  }
});

/**
 * POST /api/vouchers/purchase
 * Customer buys a digital voucher code using their wallet balance.
 * Strictly uses Mock Provider for purchase execution to guarantee ZERO real spend.
 */
router.post('/purchase', voucherPurchaseLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const { productId, voucherId, quantity: reqQty = 1 } = req.body;

  try {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Maintenance check
    const genSettings = await getGeneralSettings();
    if (genSettings.maintenanceMode && user.role !== 'ADMIN') {
      return res.status(503).json({ error: 'المتجر قيد الصيانة حالياً. يرجى المحاولة لاحقاً.' });
    }

    const quantity = Math.max(1, Math.min(10, Math.floor(Number(reqQty) || 1)));

    // 1. Fetch Authoritative Voucher Record from Database
    const voucherQuery = await pool.query(
      `SELECT v.*, p.id as product_uuid, p."arabicName", p."productName"
       FROM g2bulk_voucher_catalog v
       LEFT JOIN "Product" p ON p.id = (
         SELECT p2.id FROM "Product" p2 
         WHERE p2.fulfillment_type = 'G2BULK_VOUCHER' 
           AND p2."productName" = v.title 
         LIMIT 1
       )
       WHERE (v.provider_product_id = $1 OR v.id::text = $2 OR p.id::text = $2)
         AND v.is_active = true`,
      [Number(voucherId) || 0, String(productId || voucherId || '')]
    );

    const voucher = voucherQuery.rows[0];
    if (!voucher) {
      return res.status(404).json({ error: 'البطاقة المطلوبة غير متوفرة أو تم إيقافها حالياً.' });
    }

    const customerPriceUsd = Number(voucher.customer_price_usd);
    if (!Number.isFinite(customerPriceUsd) || customerPriceUsd <= 0) {
      return res.status(400).json({ error: 'تسعير البطاقة غير مهيأ حالياً. يرجى مراجعة إدارة المنصة.' });
    }

    if (!voucher.is_in_stock || voucher.stock < quantity) {
      return res.status(400).json({ error: 'عذراً، الكمية المطلوبة غير متوفرة حالياً في المخزون.' });
    }

    // 2. Fresh Single-Product Price Verification from G2Bulk (Public Read-Only)
    let freshSupplierCost = Number(voucher.unit_price);
    try {
      const freshData = await g2BulkVoucherPurchaseProvider.getFreshProductPrice(voucher.provider_product_id);
      freshSupplierCost = freshData.unitPrice;

      // Price Safety Guard: If supplier cost jumped by >5% or exceeds customer selling price
      const baselineCost = Number(voucher.unit_price);
      if (baselineCost > 0 && freshSupplierCost > baselineCost * 1.05) {
        // Update database with latest supplier cost
        await pool.query(
          `UPDATE g2bulk_voucher_catalog SET unit_price = $1, updated_at = NOW() WHERE id = $2`,
          [freshSupplierCost, voucher.id]
        );
        return res.status(409).json({
          error: 'تغيرت تكلفة البطاقة لدى المزود. يرجى تحديث الصفحة والمحاولة بالسعر المحدث.'
        });
      }

      if (freshSupplierCost > customerPriceUsd) {
        return res.status(409).json({
          error: 'سعر البيع الحالي أقل من تكلفة البطاقة. يرجى مراجعة إدارة المنصة.'
        });
      }
    } catch (checkErr: any) {
      console.warn('[Vouchers API] Warning on single-product price check:', checkErr.message);
    }

    // 3. User Wallet & Currency Calculation
    const exchangeRate = await getExchangeRate();
    const userCurrency = ((user as any).currency || 'SDG').toUpperCase();
    const unitPriceInUserCurrency = userCurrency === 'SDG'
      ? Math.round(customerPriceUsd * exchangeRate)
      : Math.round(customerPriceUsd * 100) / 100;

    const totalChargeAmount = unitPriceInUserCurrency * quantity;

    // 4. PostgreSQL Atomic Transaction (Wallet Lock & Order Insertion)
    const client = await pool.connect();
    const orderId = uuidv4();
    const idempotencyKey = uuidv4(); // Strictly 36-char UUID

    let orderCreated = false;
    try {
      await client.query('BEGIN');

      // Duplicate order protection within 5 seconds
      const dupCheck = await client.query(
        `SELECT id FROM "Order" 
         WHERE "userId" = $1 AND "packageId" = $2 AND "createdAt" >= NOW() - INTERVAL '5 seconds'
         LIMIT 1`,
        [user.id, voucher.product_uuid || voucher.id]
      );
      if (dupCheck.rows.length > 0) {
        throw new Error('تم استلام طلب مطابق للتو. يرجى الانتظار بضع ثوانٍ لمنع التكرار.');
      }

      // Check & Lock Wallet
      const walletRes = await client.query(
        `SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`,
        [user.id]
      );
      const wallet = walletRes.rows[0];
      const balanceBefore = Number(wallet?.balance || 0);

      if (!wallet || balanceBefore < totalChargeAmount) {
        throw new Error('الرصيد في محفظتك غير كافٍ لإتمام عملية الشراء.');
      }

      const balanceAfter = Math.round((balanceBefore - totalChargeAmount) * 100) / 100;

      // Insert Initial Order Record with Idempotency Key
      const effectivePackageName = voucher.arabic_title || voucher.title;
      await client.query(
        `INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId",
          amount, "originalAmount", "discountAmount", status, provider,
          "orderType", "customerPrice", "finalPrice", "customerPriceUsd",
          "chargedAmount", "chargedCurrency", "exchangeRateUsed",
          "providerCostUsd", "idempotencyKey", quantity, "unitPrice", "unitPriceUsd"
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $7, 0, 'PROCESSING', 'G2BULK',
          'G2BULK_VOUCHER', $8, $7, $8,
          $7, $9, $10,
          $11, $12, $13, $14, $8
        )`,
        [
          orderId,
          user.id,
          voucher.game_key === 'freefire' ? 'freefire-vouchers' : 'pubg-vouchers',
          voucher.product_uuid || voucher.id,
          effectivePackageName,
          user.email,
          totalChargeAmount,
          customerPriceUsd,
          userCurrency,
          exchangeRate,
          freshSupplierCost * quantity,
          idempotencyKey,
          quantity,
          unitPriceInUserCurrency
        ]
      );

      // Debit Wallet
      await client.query(
        `UPDATE "Wallet" SET balance = $1, "updatedAt" = NOW() WHERE id = $2`,
        [balanceAfter, wallet.id]
      );

      // Record Wallet Transaction
      const currencyLabel = userCurrency === 'SDG' ? 'ج.س' : '$';
      await client.query(
        `INSERT INTO "WalletTransaction" (
          id, "walletId", amount, type, description, currency,
          source_amount_usd, exchange_rate, "balanceBefore", "balanceAfter",
          "referenceType", "referenceId", "createdBy", "created_by_type"
        ) VALUES (
          $1, $2, $3, 'PURCHASE', $4, $5,
          $6, $7, $8, $9,
          'ORDER', $10, NULL, 'SYSTEM'
        )`,
        [
          uuidv4(),
          wallet.id,
          totalChargeAmount,
          `شراء ${quantity} قسيمة: ${effectivePackageName} (${totalChargeAmount} ${currencyLabel})`,
          userCurrency,
          customerPriceUsd * quantity,
          exchangeRate,
          balanceBefore,
          balanceAfter,
          orderId
        ]
      );

      await client.query('COMMIT');
      orderCreated = true;
    } catch (txErr: any) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: txErr.message || 'فشلت عملية إنشاء الطلب.' });
    } finally {
      client.release();
    }

    // 5. Execute Purchase via Mock Provider (Strictly ZERO Real Spend)
    let purchaseResult;
    try {
      purchaseResult = await g2BulkVoucherPurchaseProvider.purchaseVoucher({
        providerProductId: voucher.provider_product_id,
        quantity,
        idempotencyKey,
        productTitle: voucher.title,
        gameKey: voucher.game_key,
        simulateMode: 'COMPLETED'
      });
    } catch (provErr: any) {
      console.error('[Vouchers API] Provider purchase error:', provErr.message);
      purchaseResult = {
        success: false,
        orderId: 0,
        providerStatus: 'FAILED' as const,
        deliveryItems: [],
        message: provErr.message,
        isMock: true
      };
    }

    // 6. Handle Completion and Deliver Codes
    if (purchaseResult.success && purchaseResult.deliveryItems.length > 0) {
      const deliveredCodes = purchaseResult.deliveryItems;
      const maskedCodes: string[] = [];

      // Save encrypted codes in order_voucher_codes
      for (const rawCode of deliveredCodes) {
        const encrypted = encryptVoucherCode(rawCode);
        const masked = maskVoucherCode(rawCode);
        maskedCodes.push(masked);

        await pool.query(
          `INSERT INTO "order_voucher_codes" (
            order_id, user_id, product_id, provider_product_id,
            game_type, code_encrypted, code_masked, face_value, currency
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD')`,
          [
            orderId,
            user.id,
            voucher.product_uuid || voucher.id,
            String(voucher.provider_product_id),
            voucher.game_key,
            encrypted,
            masked,
            voucher.face_value
          ]
        );
      }

      // Mark Order as COMPLETED
      await pool.query(
        `UPDATE "Order" 
         SET status = 'COMPLETED',
             "providerStatus" = 'COMPLETED',
             "fulfillmentKey" = $1,
             "completedAt" = NOW()
         WHERE id = $2`,
        [deliveredCodes.join('\n'), orderId]
      );

      // Decrement local catalog stock
      await pool.query(
        `UPDATE g2bulk_voucher_catalog SET stock = GREATEST(0, stock - $1) WHERE id = $2`,
        [quantity, voucher.id]
      );

      // 7. Dispatch Resend Email Asynchronously (Never blocks or fails order)
      const currencyLabel = userCurrency === 'SDG' ? 'ج.س' : '$';
      const paidFormatted = `${totalChargeAmount.toLocaleString('en-US')} ${currencyLabel}`;
      sendVoucherDeliveryEmail({
        to: user.email,
        orderId,
        productName: voucher.arabic_title || voucher.title,
        gameName: voucher.game_key === 'freefire' ? 'Free Fire' : 'PUBG Mobile',
        quantity,
        codes: deliveredCodes,
        totalPaid: paidFormatted
      }).catch(emailErr => {
        console.error('[Vouchers API] Warning sending voucher email:', emailErr.message);
      });

      return res.status(201).json({
        success: true,
        orderId,
        status: 'COMPLETED',
        packageName: voucher.arabic_title || voucher.title,
        gameKey: voucher.game_key,
        quantity,
        totalCharged: totalChargeAmount,
        currency: userCurrency,
        codes: deliveredCodes, // Returned directly to buyer on success screen
        maskedCodes,
        message: 'تم شراء واستلام الأكواد الرقمية بنجاح 🎉'
      });
    }

    // 7. Handle Provider Failure / Auto-Refund
    if (orderCreated && (!purchaseResult.success || purchaseResult.providerStatus === 'REFUNDED')) {
      const refundClient = await pool.connect();
      try {
        await refundClient.query('BEGIN');
        await refundClient.query(
          `UPDATE "Order" SET status = 'FAILED', "failureReason" = $1, "canceledAt" = NOW() WHERE id = $2`,
          [purchaseResult.message || 'تعذر إصدار الأكواد من المزود', orderId]
        );

        // Refund wallet
        const wRes = await refundClient.query(`SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`, [user.id]);
        const w = wRes.rows[0];
        const newBal = Number(w.balance) + totalChargeAmount;
        await refundClient.query(`UPDATE "Wallet" SET balance = $1 WHERE id = $2`, [newBal, w.id]);

        await refundClient.query(
          `INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
          ) VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7, 'ORDER', $8, NULL, 'SYSTEM')`,
          [
            uuidv4(),
            w.id,
            totalChargeAmount,
            `استرجاع قيمة طلب ملغي: ${voucher.title}`,
            userCurrency,
            w.balance,
            newBal,
            orderId
          ]
        );
        await refundClient.query('COMMIT');
      } catch (rErr) {
        await refundClient.query('ROLLBACK');
      } finally {
        refundClient.release();
      }

      return res.status(502).json({
        error: 'تعذر إصدار الأكواد حالياً. تم استرجاع كامل المبلغ تلقائياً إلى محفظتك.'
      });
    }

    return res.status(202).json({
      success: true,
      orderId,
      status: 'PROCESSING',
      message: 'طلبك قيد التجهيز. سيتم تحديث الحالة تلقائياً عند استلام الأكواد.'
    });
  } catch (err: any) {
    console.error('[Vouchers API] Purchase exception:', err.message);
    return res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع أثناء الشراء.' });
  }
});

export default router;
