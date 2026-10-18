import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { randomUUID as uuidv4 } from 'crypto';
import { g2BulkVoucherService } from '../services/g2bulkVoucherService';
import { g2BulkVoucherPurchaseProvider } from '../providers/g2bulk/voucherPurchaseProvider';
import { encryptVoucherCode, maskVoucherCode, decryptVoucherCode } from '../utils/cryptoVoucher';
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
      const raw = res.rows[0].value;
      const val = typeof raw === 'object' && raw.rate !== undefined ? Number(raw.rate) : Number(raw);
      if (Number.isFinite(val) && val > 0) return val;
    }
  } catch {}
  return 9100; // Authoritative platform rate
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
      },
      {
        id: 'test-vouchers',
        name: '[اختبار مؤقت] بطاقات تجريبية',
        gameKey: 'test',
        badge: 'اختبار مؤقت',
        imageUrl: '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg',
        items: [] as any[]
      }
    ];

    const provOrdersCheck = await pool.query("SELECT orders_enabled FROM provider_settings WHERE UPPER(provider) = 'G2BULK'");
    const g2bulkOrdersEnabled = provOrdersCheck.rows[0]?.orders_enabled !== false;
    // Log overall provider status once with deduplication
    g2BulkVoucherPurchaseProvider.checkVoucherReadiness({ g2bulkOrdersEnabled });

    result.rows.forEach(row => {
      const priceUsd = Number(row.priceUsd);
      const priceSdg = Math.round(priceUsd * exchangeRate);

      const itemReadiness = g2BulkVoucherPurchaseProvider.checkVoucherReadiness({
        providerProductId: row.voucherId,
        isActive: true,
        inStock: Boolean(row.inStock && row.stock > 0),
        stock: Number(row.stock || 0),
        g2bulkOrdersEnabled,
        suppressLog: true
      });

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
        isPurchasable: itemReadiness.isAllowed,
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
 * 
 * STRICT ARCHITECTURAL CONSTRAINTS:
 * 1. ZERO SYNTHETIC CODES: Never generates fake or random codes as replacement for provider voucher codes.
 * 2. Idempotency enforced: Repeated request with same idempotencyKey returns existing result without charging twice.
 * 3. Atomic wallet debit & order record creation.
 * 4. G2Bulk integration: POST /v1/products/:id/purchase
 * 5. Saves strictly provider delivery_items (encrypted AES-256).
 * 6. Email status is decoupled from order success; truth in delivery status reported to client.
 */
router.post('/purchase', voucherPurchaseLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user;
  const {
    productId,
    voucherId,
    quantity: reqQty = 1,
    idempotencyKey: reqIdempKey,
    isSimulation = false,
    simulateMode = 'COMPLETED'
  } = req.body;

  try {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Maintenance check
    const genSettings = await getGeneralSettings();
    if (genSettings.maintenanceMode && user.role !== 'ADMIN') {
      return res.status(503).json({ error: 'المتجر قيد الصيانة حالياً. يرجى المحاولة لاحقاً.' });
    }

    const quantity = Math.max(1, Math.min(10, Math.floor(Number(reqQty) || 1)));

    // Validate or generate strictly 36-char UUID Idempotency Key
    let idempotencyKey = String(reqIdempKey || req.headers['x-idempotency-key'] || '').trim();
    if (idempotencyKey) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        return res.status(400).json({ error: 'مفتاح عدم التكرار (Idempotency Key) غير صالح. يجب أن يكون 36-character UUID.' });
      }
    } else {
      idempotencyKey = uuidv4();
    }

    // 1. IDEMPOTENCY REPLAY CHECK:
    // If an order already exists with this idempotency key for this user, replay result WITHOUT debiting wallet again
    const existingOrderRes = await pool.query(
      `SELECT o.*, v.arabic_title, v.title, v.game_key
       FROM "Order" o
       LEFT JOIN g2bulk_voucher_catalog v ON (v.id::text = o."packageId" OR v.provider_product_id::text = o."packageId")
       WHERE o."idempotencyKey" = $1 AND o."userId" = $2
       LIMIT 1`,
      [idempotencyKey, user.id]
    );

    if (existingOrderRes.rows.length > 0) {
      const existing = existingOrderRes.rows[0];
      if (existing.status === 'COMPLETED') {
        const codesRes = await pool.query(
          `SELECT code_encrypted, code_masked FROM order_voucher_codes WHERE order_id = $1 ORDER BY created_at ASC`,
          [existing.id]
        );
        const decryptedCodes = codesRes.rows.map(r => {
          try {
            return decryptVoucherCode(r.code_encrypted);
          } catch {
            return r.code_masked;
          }
        });

        return res.status(200).json({
          success: true,
          orderId: existing.id,
          status: 'COMPLETED',
          isDuplicateReplay: true,
          packageName: existing.packageName,
          quantity: existing.quantity,
          codes: decryptedCodes,
          maskedCodes: codesRes.rows.map(r => r.code_masked),
          message: 'تم استرجاع بيانات طلبك السابق بنجاح (دون خصم مكرر) ✓'
        });
      }

      if (existing.status === 'PROCESSING') {
        return res.status(202).json({
          success: true,
          orderId: existing.id,
          status: 'PROCESSING',
          isDuplicateReplay: true,
          message: 'طلبك قيد المعالجة بالفعل وسيتم تسليم الأكواد فور صدورها.'
        });
      }

      if (existing.status === 'FAILED') {
        return res.status(400).json({
          error: existing.failureReason || 'فشل هذا الطلب مسبقاً.'
        });
      }
    }

    // 2. Fetch Authoritative Voucher Record from Database
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
      return res.status(404).json({ error: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.' });
    }

    const customerPriceUsd = Number(voucher.customer_price_usd);
    if (!Number.isFinite(customerPriceUsd) || customerPriceUsd <= 0) {
      return res.status(400).json({ error: 'تسعير البطاقة غير مهيأ حالياً. يرجى مراجعة إدارة المنصة.' });
    }

    const provOrdersCheck = await pool.query("SELECT orders_enabled FROM provider_settings WHERE UPPER(provider) = 'G2BULK'");
    const g2bulkOrdersEnabled = provOrdersCheck.rows[0]?.orders_enabled !== false;

    // Unified readiness check covering:
    // PROVIDER_ORDERS_DISABLED, PROVIDER_API_KEY_MISSING, REAL_PURCHASES_LOCKED, PRODUCT_MAPPING_MISSING, PRODUCT_INACTIVE, PRODUCT_OUT_OF_STOCK
    const readiness = g2BulkVoucherPurchaseProvider.checkVoucherReadiness({
      providerProductId: voucher.provider_product_id,
      isActive: voucher.is_active,
      inStock: voucher.is_in_stock,
      stock: voucher.stock,
      isSimulation: Boolean(isSimulation),
      g2bulkOrdersEnabled
    });

    if (!readiness.isAllowed) {
      console.warn(`[Vouchers API] Purchase pre-check blocked: ${readiness.reason} (Voucher ${voucher.id})`);
      return res.status(400).json({
        error: readiness.customerMessage,
        code: readiness.reason === 'PRODUCT_OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'ITEM_UNAVAILABLE'
      });
    }

    // 3. Fresh Single-Product Price Verification from G2Bulk (Public Read-Only)
    let freshSupplierCost = Number(voucher.unit_price);
    try {
      const freshData = await g2BulkVoucherPurchaseProvider.getFreshProductPrice(voucher.provider_product_id);
      freshSupplierCost = freshData.unitPrice;

      const baselineCost = Number(voucher.unit_price);
      if (baselineCost > 0 && freshSupplierCost > baselineCost * 1.05) {
        await pool.query(
          `UPDATE g2bulk_voucher_catalog SET unit_price = $1, updated_at = NOW() WHERE id = $2`,
          [freshSupplierCost, voucher.id]
        );
        return res.status(409).json({
          error: 'تم تحديث سعر هذه البطاقة. يرجى تحديث الصفحة والمحاولة بالسعر المحدث.'
        });
      }

      if (freshSupplierCost > customerPriceUsd) {
        return res.status(409).json({
          error: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.'
        });
      }
    } catch (checkErr: any) {
      console.warn('[Vouchers API] Warning on single-product price check:', checkErr.message);
    }

    // 4. User Wallet & Currency Calculation
    const exchangeRate = await getExchangeRate();
    const userCurrency = ((user as any).currency || 'SDG').toUpperCase();
    const unitPriceInUserCurrency = userCurrency === 'SDG'
      ? Math.round(customerPriceUsd * exchangeRate)
      : Math.round(customerPriceUsd * 100) / 100;

    const totalChargeAmount = unitPriceInUserCurrency * quantity;

    // 5. PostgreSQL Atomic Transaction (Wallet Lock & Order Insertion)
    const client = await pool.connect();
    const orderId = uuidv4();

    let orderCreated = false;
    try {
      await client.query('BEGIN');

      // Accidental rapid double-click protection within 5 seconds for in-flight or completed orders
      if (!req.body.bypassRapidCheck && !isSimulation) {
        const dupCheck = await client.query(
          `SELECT id FROM "Order" 
           WHERE "userId" = $1 AND "packageId" = $2 
             AND status IN ('PROCESSING', 'COMPLETED')
             AND "createdAt" >= NOW() - INTERVAL '5 seconds'
           LIMIT 1`,
          [user.id, voucher.product_uuid || voucher.id]
        );
        if (dupCheck.rows.length > 0) {
          throw new Error('تم استلام طلب مطابق للتو. يرجى الانتظار بضع ثوانٍ لمنع التكرار.');
        }
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
          $7, $8, 0, 'PROCESSING', 'G2BULK',
          'G2BULK_VOUCHER', $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17, $18, $19
        )`,
        [
          orderId,
          user.id,
          voucher.game_key === 'freefire' ? 'freefire-vouchers' : (voucher.game_key === 'pubg' ? 'pubg-vouchers' : 'test-vouchers'),
          voucher.product_uuid || voucher.id,
          effectivePackageName,
          user.email,
          totalChargeAmount,
          totalChargeAmount,
          customerPriceUsd,
          totalChargeAmount,
          customerPriceUsd,
          totalChargeAmount,
          userCurrency,
          exchangeRate,
          freshSupplierCost * quantity,
          idempotencyKey,
          quantity,
          unitPriceInUserCurrency,
          customerPriceUsd
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

    // 6. Execute Provider Purchase
    let purchaseResult;
    try {
      purchaseResult = await g2BulkVoucherPurchaseProvider.purchaseVoucher({
        providerProductId: voucher.provider_product_id,
        quantity,
        idempotencyKey,
        productTitle: voucher.title,
        gameKey: voucher.game_key,
        isSimulation: Boolean(isSimulation),
        simulateMode: simulateMode as any
      });
    } catch (provErr: any) {
      console.error('[Vouchers API] Provider purchase error (Internal Diagnostic):', {
        error: provErr.message,
        providerProductId: voucher.provider_product_id,
        voucherTitle: voucher.title,
        stack: provErr.stack
      });
      purchaseResult = {
        success: false,
        orderId: 0,
        providerStatus: 'FAILED' as const,
        deliveryItems: [],
        message: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.',
        isMock: true
      };
    }

    // 7. HANDLE COMPLETED WITH PROVIDER CODES
    if (purchaseResult.success && purchaseResult.providerStatus === 'COMPLETED' && purchaseResult.deliveryItems.length > 0) {
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
             "providerOrderId" = $1,
             "fulfillmentKey" = $2,
             "completedAt" = NOW()
         WHERE id = $3`,
        [Number(purchaseResult.orderId) || null, deliveredCodes.join('\n'), orderId]
      );

      // Decrement local catalog stock
      await pool.query(
        `UPDATE g2bulk_voucher_catalog SET stock = GREATEST(0, stock - $1) WHERE id = $2`,
        [quantity, voucher.id]
      );

      // 8. Attempt Email Delivery with Strict Decoupling
      const currencyLabel = userCurrency === 'SDG' ? 'ج.س' : '$';
      const paidFormatted = `${totalChargeAmount.toLocaleString('en-US')} ${currencyLabel}`;

      let emailSent = false;
      let emailErrorMessage: string | null = null;
      try {
        const emailPromise = sendVoucherDeliveryEmail({
          to: user.email,
          orderId,
          productName: voucher.arabic_title || voucher.title,
          gameName: voucher.game_key === 'freefire' ? 'Free Fire' : 'PUBG Mobile',
          quantity,
          codes: deliveredCodes,
          totalPaid: paidFormatted
        });
        const timeoutPromise = new Promise<{ success: boolean; error?: string }>((_, reject) =>
          setTimeout(() => reject(new Error('Email dispatch timeout')), 3500)
        );
        const emailRes = await Promise.race([emailPromise, timeoutPromise]);
        emailSent = Boolean(emailRes.success);
        if (!emailSent) {
          emailErrorMessage = emailRes.error || 'فشل تسليم البريد الإلكتروني';
        }
      } catch (emErr: any) {
        emailSent = false;
        emailErrorMessage = emErr.message || 'تعذر إرسال البريد الإلكتروني';
      }

      return res.status(201).json({
        success: true,
        orderId,
        status: 'COMPLETED',
        packageName: voucher.arabic_title || voucher.title,
        gameKey: voucher.game_key,
        quantity,
        totalCharged: totalChargeAmount,
        currency: userCurrency,
        codes: deliveredCodes, // STRICTLY provider delivered codes only
        maskedCodes,
        emailSent,
        emailMessage: emailSent
          ? 'تم إرسال نسخة إلى بريدك الإلكتروني بنجاح ✓'
          : 'تعذر إرسال نسخة إلى البريد الإلكتروني حالياً (الكود محفوظ في حسابك أدناه)',
        message: 'تم شراء واستلام الأكواد الرقمية بنجاح 🎉'
      });
    }

    // 8. HANDLE PENDING / PROCESSING (Order accepted by provider, codes being generated)
    if (purchaseResult.success && purchaseResult.providerStatus === 'PENDING') {
      await pool.query(
        `UPDATE "Order" 
         SET "providerOrderId" = $1,
             "providerStatus" = 'PENDING',
             "failureReason" = $2,
             "lastPolledAt" = NOW()
         WHERE id = $3`,
        [Number(purchaseResult.orderId) || null, purchaseResult.pollUrl || null, orderId]
      );

      return res.status(202).json({
        success: true,
        orderId,
        status: 'PROCESSING',
        packageName: voucher.arabic_title || voucher.title,
        quantity,
        totalCharged: totalChargeAmount,
        currency: userCurrency,
        codes: [], // ZERO codes before provider delivers!
        message: 'طلبك قيد المعالجة وسيتم تسليم الأكواد الرقمية فور صدورها تلقائياً...'
      });
    }

    // 9. HANDLE TERMINAL FAILURE / AUTO-REFUND
    if (orderCreated && (!purchaseResult.success || purchaseResult.providerStatus === 'REFUNDED' || purchaseResult.providerStatus === 'FAILED')) {
      const refundClient = await pool.connect();
      try {
        await refundClient.query('BEGIN');
        await refundClient.query(
          `UPDATE "Order" SET status = 'FAILED', "failureReason" = $1, "canceledAt" = NOW() WHERE id = $2`,
          ['تعذر إصدار الأكواد وتم استرجاع المبلغ إلى المحفظة تلقائياً', orderId]
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
        error: 'تعذر إتمام عملية شراء البطاقة وتم استرجاع المبلغ كاملاً إلى محفظتك تلقائياً.'
      });
    }

    return res.status(202).json({
      success: true,
      orderId,
      status: 'PROCESSING',
      message: 'طلبك قيد التجهيز وسيتم تسليم الأكواد فور صدورها.'
    });
  } catch (err: any) {
    console.error('[Vouchers API] Purchase exception:', err.message);
    return res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع أثناء الشراء.' });
  }
});

/**
 * GET /api/vouchers/orders/:id/status
 * Polling endpoint for PENDING / PROCESSING voucher orders.
 * Verifies ownership and updates status when provider delivers codes.
 */
router.get('/orders/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const orderId = req.params.id;

  try {
    const orderRes = await pool.query(
      `SELECT * FROM "Order" WHERE id = $1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }
    if (order.userId !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح لك بمتابعة هذا الطلب.' });
    }

    if (order.status === 'COMPLETED') {
      const codesRes = await pool.query(
        `SELECT code_encrypted, code_masked FROM order_voucher_codes WHERE order_id = $1 ORDER BY created_at ASC`,
        [orderId]
      );
      const codes = codesRes.rows.map(r => {
        try {
          return decryptVoucherCode(r.code_encrypted);
        } catch {
          return r.code_masked;
        }
      });
      return res.json({
        success: true,
        orderId: order.id,
        status: 'COMPLETED',
        codes,
        maskedCodes: codesRes.rows.map(r => r.code_masked),
        packageName: order.packageName
      });
    }

    if (order.status === 'FAILED') {
      return res.json({
        success: false,
        orderId: order.id,
        status: 'FAILED',
        message: order.failureReason || 'فشلت معالجة الطلب.'
      });
    }

    // If PROCESSING, poll provider
    if (order.status === 'PROCESSING' && order.providerOrderId) {
      const pollUrl = order.failureReason || `/orders/${order.providerOrderId}/delivery`;
      const pollRes = await g2BulkVoucherPurchaseProvider.pollDeliveryUrl(pollUrl, order.providerOrderId);

      if (pollRes.status === 'COMPLETED' && pollRes.deliveryItems.length > 0) {
        const deliveredCodes = pollRes.deliveryItems;
        const maskedCodes: string[] = [];

        for (const rawCode of deliveredCodes) {
          const encrypted = encryptVoucherCode(rawCode);
          const masked = maskVoucherCode(rawCode);
          maskedCodes.push(masked);
          await pool.query(
            `INSERT INTO "order_voucher_codes" (
              order_id, user_id, product_id, provider_product_id,
              game_type, code_encrypted, code_masked, currency
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD')`,
            [order.id, user.id, order.packageId, String(order.providerOrderId), order.gameId, encrypted, masked]
          );
        }

        await pool.query(
          `UPDATE "Order" 
           SET status = 'COMPLETED', "providerStatus" = 'COMPLETED', "fulfillmentKey" = $1, "completedAt" = NOW()
           WHERE id = $2`,
          [deliveredCodes.join('\n'), order.id]
        );

        return res.json({
          success: true,
          orderId: order.id,
          status: 'COMPLETED',
          codes: deliveredCodes,
          maskedCodes,
          packageName: order.packageName
        });
      }

      if (pollRes.status === 'REFUNDED') {
        const refClient = await pool.connect();
        try {
          await refClient.query('BEGIN');
          await refClient.query(
            `UPDATE "Order" SET status = 'FAILED', "failureReason" = $1, "canceledAt" = NOW() WHERE id = $2`,
            ['تعذر تسليم الأكواد وتم استرجاع المبلغ كاملاً إلى محفظتك', order.id]
          );
          const wRes = await refClient.query(`SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`, [user.id]);
          const w = wRes.rows[0];
          const newBal = Number(w.balance) + Number(order.amount);
          await refClient.query(`UPDATE "Wallet" SET balance = $1 WHERE id = $2`, [newBal, w.id]);
          await refClient.query(
            `INSERT INTO "WalletTransaction" (
              id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
            ) VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7, 'ORDER', $8, NULL, 'SYSTEM')`,
            [uuidv4(), w.id, order.amount, `استرجاع قيمة طلب ملغي: ${order.packageName}`, order.chargedCurrency || 'SDG', w.balance, newBal, order.id]
          );
          await refClient.query('COMMIT');
        } catch {
          await refClient.query('ROLLBACK');
        } finally {
          refClient.release();
        }

        return res.json({
          success: false,
          orderId: order.id,
          status: 'FAILED',
          message: 'تعذر تسليم الأكواد وتم استرجاع المبلغ كاملاً إلى محفظتك.'
        });
      }
    }

    return res.json({
      success: true,
      orderId: order.id,
      status: 'PROCESSING',
      message: 'طلبك قيد التجهيز وسيتم تسليم الأكواد فور صدورها.'
    });
  } catch (err: any) {
    console.error('[Vouchers API] Status polling error:', err.message);
    return res.status(500).json({ error: 'تعذر التحقق من حالة الطلب.' });
  }
});

/**
 * POST /api/vouchers/orders/:id/resend-email
 * Retries delivery email safely without re-purchasing or touching balance.
 */
router.post('/orders/:id/resend-email', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const orderId = req.params.id;

  try {
    const orderRes = await pool.query(
      `SELECT * FROM "Order" WHERE id = $1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }
    if (order.userId !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية.' });
    }

    if (order.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'الطلب غير مكتمل بعد. لا توجد أكواد لإرسالها.' });
    }

    const codesRes = await pool.query(
      `SELECT code_encrypted FROM order_voucher_codes WHERE order_id = $1 ORDER BY created_at ASC`,
      [orderId]
    );
    if (codesRes.rows.length === 0) {
      return res.status(404).json({ error: 'لا توجد أكواد رقمية مسجلة لهذا الطلب.' });
    }

    const decryptedCodes = codesRes.rows.map(r => {
      try {
        return decryptVoucherCode(r.code_encrypted);
      } catch {
        return '';
      }
    }).filter(Boolean);

    const currencyLabel = (order.chargedCurrency || 'SDG') === 'SDG' ? 'ج.س' : '$';
    const paidFormatted = `${Number(order.amount || 0).toLocaleString('en-US')} ${currencyLabel}`;

    const emailResult = await sendVoucherDeliveryEmail({
      to: user.email,
      orderId: order.id,
      productName: order.packageName,
      gameName: order.gameId.includes('freefire') ? 'Free Fire' : 'PUBG Mobile',
      quantity: decryptedCodes.length,
      codes: decryptedCodes,
      totalPaid: paidFormatted
    });

    if (emailResult.success) {
      return res.json({
        success: true,
        message: `تم إرسال الأكواد إلى بريدك الإلكتروني (${user.email}) بنجاح ✓`
      });
    } else {
      return res.status(502).json({
        success: false,
        error: emailResult.error || 'تعذر إرسال البريد الإلكتروني حالياً. الأكواد متاحة دائماً في حسابك.'
      });
    }
  } catch (err: any) {
    console.error('[Vouchers API] Resend email error:', err.message);
    return res.status(500).json({ error: 'حدث خطأ أثناء محاولة إرسال البريد.' });
  }
});

export default router;
