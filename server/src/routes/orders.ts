import { Router, Response, Request } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';
import { gamesDropProvider } from '../providers/gamesdrop';
import { mapGamesDropStatus, mapGamesDropErrorMessage } from '../providers/gamesdrop/mapper';
import { awardOrderCashback, reverseOrderCashback } from '../services/cashbackService';
import { processReferralRewardOnOrder } from '../services/referralService';
import { sendOrderProcessingEmail, sendOrderCompletedEmail } from '../services/emailService';
import { getOrCreateOrderReviewToken } from '../services/reviewTokenService';
import { getGeneralSettings } from './admin';

const router = Router();

// Order Placement Limiter: 15 orders / 1 minute per IP (prevents automated burst drain)
const orderCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لإنشاء الطلبات مؤقتاً. يرجى الانتظار دقيقة واحدة.' }
});

// Customer: Create Order (Direct GamesDrop Integration)
router.post('/', orderCreateLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const { gameId, packageId, packageName, playerId, serverId, playerName, promoCode } = req.body;
  const user = req.user;

  try {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Maintenance Mode Check: Prevent non-admin orders during maintenance
    const genSettings = await getGeneralSettings();
    if (genSettings.maintenanceMode && user.role !== 'ADMIN') {
      return res.status(503).json({
        error: 'المتجر قيد الصيانة حالياً. لا يمكن استقبال طلبات جديدة مؤقتاً.',
        maintenance: true
      });
    }

    // Section 1 & 2: Absolute Price Authority & Product Must Exist
    // Client-supplied amount is NEVER accepted or trusted.
    if (!packageId || typeof packageId !== 'string' || !packageId.trim()) {
      return res.status(400).json({ error: 'المنتج غير متاح.' });
    }

    const cleanPackageId = packageId.trim();

    // Query trusted product from PostgreSQL
    const prodRes = await pool.query(
      'SELECT * FROM "Product" WHERE id = $1 AND "isActive" = true',
      [cleanPackageId]
    );
    const localProduct = prodRes.rows[0];

    if (!localProduct) {
      return res.status(400).json({ error: 'المنتج غير متوفر أو تم إيقافه.' });
    }

    const authoritativeCustomerPriceUsd = Number(localProduct.customerPriceUsd);
    if (!Number.isFinite(authoritativeCustomerPriceUsd) || authoritativeCustomerPriceUsd <= 0) {
      return res.status(400).json({ error: 'تسعير المنتج غير مهيأ حالياً. يرجى مراجعة إدارة المنصة.' });
    }

    const providerOfferId = Number(localProduct.offerId || localProduct.providerOfferId);
    if (!providerOfferId || isNaN(providerOfferId)) {
      return res.status(400).json({ error: 'معرف مزود الخدمة للمنتج غير صالح.' });
    }

    // Server ID validation strictly based on localProduct.requiresGameServerId
    let effectiveServerId: string | null = null;
    if (localProduct.requiresGameServerId) {
      const cleanServerId = serverId ? String(serverId).trim() : '';
      if (!cleanServerId) {
        return res.status(400).json({ error: 'يرجى اختيار سيرفر اللعبة (Server ID) لإتمام الطلب.' });
      }

      // Validate that the server belongs to GamesDrop allowed list
      try {
        const serversRecord = await gamesDropProvider.getServers(providerOfferId);
        if (serversRecord && typeof serversRecord === 'object') {
          const allowedKeys = Object.keys(serversRecord);
          const allowedValues = Object.values(serversRecord);
          const isValidServer = allowedKeys.includes(cleanServerId) || allowedValues.includes(cleanServerId);
          if (!isValidServer && allowedKeys.length > 0) {
            return res.status(400).json({ error: 'خادم اللعبة المحدد غير صالح.' });
          }
        }
      } catch (serverErr: any) {
        console.warn('[Orders] Could not verify server list upstream:', serverErr.message);
      }
      effectiveServerId = cleanServerId;
    } else {
      // Product does NOT require game server: ignore any submitted serverId completely!
      effectiveServerId = null;
    }

    // Section 3: User Preferred Currency & Central Exchange Rate
    const userRowRes = await pool.query('SELECT "preferred_currency" FROM "User" WHERE id = $1', [user.id]);
    const userCurrency = (userRowRes.rows[0]?.preferred_currency || 'SDG').toUpperCase();

    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000 };
    const exchangeRate = Number(rateConfig.rate) || 5000;

    // Base price in user's currency
    let basePriceInUserCurrency = authoritativeCustomerPriceUsd;
    if (userCurrency === 'SDG') {
      basePriceInUserCurrency = Math.round(authoritativeCustomerPriceUsd * exchangeRate);
    } else {
      basePriceInUserCurrency = Math.round(authoritativeCustomerPriceUsd * 100) / 100;
    }

    // Resolve Player / Game User ID (Special Handling for Telegram @username resolution)
    let deliveryGameUserId = (playerId || user.id || '').trim();
    if (localProduct.requiresGameUserId) {
      if (!playerId || !playerId.trim()) {
        return res.status(400).json({ error: 'معرّف الحساب مطلوب لإتمام هذا الطلب.' });
      }

      const isTelegramProduct = 
        (localProduct.productName || '').toLowerCase().includes('telegram') ||
        (localProduct.gameCategoryId || '').toLowerCase().includes('telegram');

      if (isTelegramProduct) {
        if (/^\d+$/.test(playerId.trim())) {
          deliveryGameUserId = playerId.trim();
        } else {
          // Resolve @username via GamesDrop aggregator
          const resolved = await gamesDropProvider.resolveTelegramUser(playerId.trim());
          if (!resolved.valid || !resolved.userId) {
            return res.status(400).json({
              error: resolved.message || 'تعذر التحقق من معرّف تيليجرام. يرجى إدخال المعرف الرقمي (User ID) مباشرة.'
            });
          }
          deliveryGameUserId = String(resolved.userId);
        }
      } else {
        deliveryGameUserId = playerId.trim();
      }
    }

    // Fetch latest authoritative provider price from GamesDrop before creating order (find-one)
    let latestOffer: any;
    try {
      latestOffer = await gamesDropProvider.findOffer(providerOfferId);
    } catch (err: any) {
      console.error(`[Internal Provider Error] Failed to query upstream find-one(${providerOfferId}):`, err.message);
      const friendlyErr = mapGamesDropErrorMessage(err.errorCode || err.code || err.message);
      return res.status(502).json({ 
        error: friendlyErr || 'تعذر استكمال العملية حالياً. يرجى المحاولة لاحقاً.' 
      });
    }

    const latestProviderPrice = Number(latestOffer.price);
    if (!Number.isFinite(latestProviderPrice) || latestProviderPrice <= 0) {
      return res.status(502).json({ 
        error: 'تعذر استكمال العملية حالياً. يرجى المحاولة لاحقاً.' 
      });
    }

    // Price Safety Check: Ensure latest provider price does not cause a financial discrepancy
    const previousCost = Number(localProduct.gamesDropCostUsd || localProduct.providerCostUsd || 0);
    if (previousCost > 0 && latestProviderPrice > previousCost * 1.05) {
      // Upstream cost increased by more than 5%: prevent under-pricing loss
      await pool.query(
        `UPDATE "Product" SET "gamesDropCostUsd" = $1, "providerCostUsd" = $1, "lastProviderSyncAt" = NOW() WHERE id = $2`,
        [latestProviderPrice, localProduct.id]
      );
      return res.status(409).json({
        error: 'تغير سعر المنتج لدى المزود. يرجى تحديث الصفحة والمحاولة بالسعر المحدث.'
      });
    }

    const providerCurrency = latestOffer.currency || 'USD';
    const effectivePackageName = packageName || localProduct.arabicName || localProduct.offerName || 'منتج رقمي';

    // Database Transaction: Validate Promo, Check & Lock Wallet, Insert Order, Debit Balance
    const client = await pool.connect();
    let orderId = uuidv4();
    let finalChargeAmount = basePriceInUserCurrency;
    let discountApplied = 0;
    let promoRecord: any = null;

    try {
      await client.query('BEGIN');

      // Duplicate Order Protection: Reject identical purchases made within 5 seconds
      const duplicateCheck = await client.query(
        `SELECT id FROM "Order" 
         WHERE "userId" = $1 
           AND "packageId" = $2 
           AND "playerId" = $3 
           AND "createdAt" >= NOW() - INTERVAL '5 seconds'
         LIMIT 1`,
        [user.id, localProduct.id, playerId || user.email]
      );
      if (duplicateCheck.rows.length > 0) {
        throw new Error('تم استلام طلب مطابق للتو. يرجى الانتظار بضع ثوانٍ قبل تقديم طلب جديد لمنع التكرار.');
      }

      // Section 4 & 5: Promo Code Validation & Authoritative Server Discount Calculation
      if (promoCode && typeof promoCode === 'string' && promoCode.trim()) {
        const cleanCode = promoCode.trim().toUpperCase();
        const promoRes = await client.query(
          'SELECT * FROM promo_codes WHERE code = $1 FOR UPDATE',
          [cleanCode]
        );
        promoRecord = promoRes.rows[0];

        if (!promoRecord) throw new Error('كود الخصم غير صحيح');
        if (!promoRecord.is_active) throw new Error('هذا الكود غير متاح حالياً');
        if (promoRecord.type !== 'DISCOUNT') throw new Error('عذرًا، هذا كود رصيد هدايا وليس كود خصم. يرجى استبداله من المكان المخصص لإضافة الرصيد.');

        const now = new Date();
        if (promoRecord.starts_at && now < new Date(promoRecord.starts_at)) throw new Error('هذا الكود لم يبدأ العمل به بعد');
        if (promoRecord.expires_at && now > new Date(promoRecord.expires_at)) throw new Error('انتهت صلاحية كود الخصم');
        if (promoRecord.usage_limit !== null && promoRecord.usage_count >= promoRecord.usage_limit) throw new Error('تم استنفاد الحد الأقصى لاستخدام كود الخصم');

        const redemptionCheck = await client.query(
          'SELECT id FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2 FOR UPDATE',
          [promoRecord.id, user.id]
        );
        if (redemptionCheck.rows.length > 0) throw new Error('تم استخدام هذا الكود مسبقاً');

        // Calculate discount in user's currency
        let calcDiscount = 0;
        if (promoRecord.discount_type === 'PERCENTAGE') {
          calcDiscount = (basePriceInUserCurrency * Number(promoRecord.discount_value)) / 100;
        } else {
          // Fixed discount
          const promoCurrency = (promoRecord.currency || 'USD').toUpperCase();
          let fixedVal = Number(promoRecord.discount_value);
          if (promoCurrency !== userCurrency) {
            if (userCurrency === 'SDG') {
              fixedVal = Math.round(fixedVal * exchangeRate);
            } else {
              fixedVal = Math.round((fixedVal / exchangeRate) * 100) / 100;
            }
          }
          calcDiscount = fixedVal;
        }

        // Cap with max_discount (convert to user currency if needed)
        if (promoRecord.max_discount) {
          let maxCap = Number(promoRecord.max_discount);
          const promoCurrency = (promoRecord.currency || 'USD').toUpperCase();
          if (promoCurrency !== userCurrency) {
            if (userCurrency === 'SDG') {
              maxCap = Math.round(maxCap * exchangeRate);
            } else {
              maxCap = Math.round((maxCap / exchangeRate) * 100) / 100;
            }
          }
          calcDiscount = Math.min(calcDiscount, maxCap);
        }

        discountApplied = Math.min(Math.max(0, calcDiscount), basePriceInUserCurrency);
        if (userCurrency === 'SDG') {
          discountApplied = Math.round(discountApplied);
          finalChargeAmount = Math.max(0, basePriceInUserCurrency - discountApplied);
        } else {
          discountApplied = Math.round(discountApplied * 100) / 100;
          finalChargeAmount = Math.round(Math.max(0, basePriceInUserCurrency - discountApplied) * 100) / 100;
        }
      }

      // Section 7: Lock user wallet & verify balance against authoritative finalChargeAmount
      const walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [user.id]);
      const currentWallet = walletRes.rows[0];
      const balanceBefore = Number(currentWallet?.balance || 0);

      if (!currentWallet || balanceBefore < finalChargeAmount) {
        throw new Error('الرصيد غير كافٍ');
      }

      // Section 11: Create Initial Order record with authoritative pricing & locked exchange rate
      await client.query(
        `INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId", 
          "serverId", "playerName",
          amount, "originalAmount", "discountAmount", "promoCode", 
          status, provider, "providerOfferId", "providerPrice", "providerCurrency", 
          "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
          "chargedCurrency", "exchangeRateUsed", "cashbackAmount"
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PROCESSING', 'GAMESDROP', $13, $14, $15, $16, $17, $18, $19, $20, $21, 0.0)`,
        [
          orderId, 
          user.id, 
          gameId || localProduct.gameCategoryId || 'game', 
          localProduct.id, 
          effectivePackageName, 
          playerId || user.email,
          effectiveServerId,
          playerName ? String(playerName).trim() : null,
          finalChargeAmount, 
          basePriceInUserCurrency, 
          discountApplied, 
          promoRecord ? promoRecord.code : null,
          providerOfferId,
          latestProviderPrice,
          providerCurrency,
          authoritativeCustomerPriceUsd,
          finalChargeAmount,
          authoritativeCustomerPriceUsd,
          finalChargeAmount,
          userCurrency,
          exchangeRate
        ]
      );

      // Section 7: Debit wallet and create WalletTransaction
      const txId = uuidv4();
      const currencyLabel = userCurrency === 'SDG' ? 'ج.س' : '$';
      const txDescription = discountApplied > 0 
        ? `شراء باقة: ${effectivePackageName} (خصم ${discountApplied} ${currencyLabel} بكود ${promoRecord.code})`
        : `شراء باقة: ${effectivePackageName}`;

      const newBalance = Math.round((balanceBefore - finalChargeAmount) * 100) / 100;
      await client.query(
        'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [newBalance, currentWallet.id]
      );

      await client.query(
        `INSERT INTO "WalletTransaction" 
          (id, "walletId", amount, type, description, currency, source_amount_usd, exchange_rate, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          txId, 
          currentWallet.id, 
          finalChargeAmount, 
          'PURCHASE', 
          txDescription,
          userCurrency,
          authoritativeCustomerPriceUsd,
          exchangeRate,
          balanceBefore,
          newBalance,
          'ORDER',
          orderId,
          null, // UUID NULL for automated SYSTEM action
          'SYSTEM'
        ]
      );

      // Section 6: Record Promo Redemption if applied
      if (promoRecord) {
        await client.query(
          'INSERT INTO promo_code_redemptions (id, promo_code_id, user_id, order_id, discount_amount) VALUES ($1, $2, $3, $4, $5)',
          [uuidv4(), promoRecord.id, user.id, orderId, discountApplied]
        );
        await client.query(
          'UPDATE promo_codes SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [promoRecord.id]
        );
      }

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Section 8 & 9: Dispatch Order to GamesDrop API with provider's price
    const transactionId = `KIROPRO-${orderId}`;
    let gdResponse: any;
    try {
      gdResponse = await gamesDropProvider.createOrder({
        offerId: providerOfferId,
        price: latestProviderPrice, // Upstream GamesDrop price ONLY, never customerPriceUsd
        transactionId: transactionId,
        useBalance: true, // Prepaid balance settlement
        customer: {
          email: playerId && playerId.includes('@') ? playerId : (user.email || 'customer@kiropro.store'),
          gameUserId: deliveryGameUserId,
          ...(effectiveServerId ? { gameServerId: effectiveServerId } : {})
        }
      });
    } catch (gdErr: any) {
      console.error('[Orders] GamesDrop create-order call failed:', gdErr.message, gdErr.stack);

      // Section 10: Auto-Refund user wallet and revert promo redemption on provider error
      const refundClient = await pool.connect();
      try {
        await refundClient.query('BEGIN');
        const wRes = await refundClient.query('SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [user.id]);
        const w = wRes.rows[0];
        if (w && finalChargeAmount > 0) {
          const restoredBalance = Math.round((Number(w.balance) + finalChargeAmount) * 100) / 100;
          await refundClient.query('UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [restoredBalance, w.id]);
          await refundClient.query(
            'INSERT INTO "WalletTransaction" (id, "walletId", amount, type, description, "created_by_type") VALUES ($1, $2, $3, $4, $5, $6)',
            [uuidv4(), w.id, finalChargeAmount, 'REFUND', `استرجاع تلقائي لفشل تنفيذ الطلب لدى المزود (${packageName || localProduct.offerName})`, 'SYSTEM']
          );
        }

        // Section 6: Revert promo code consumption
        if (promoRecord) {
          await refundClient.query('DELETE FROM promo_code_redemptions WHERE order_id = $1', [orderId]);
          await refundClient.query('UPDATE promo_codes SET usage_count = GREATEST(0, usage_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = $1', [promoRecord.id]);
        }

        await refundClient.query(
          'UPDATE "Order" SET status = $1, "failureReason" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3',
          ['FAILED', gdErr.message || 'Provider communication failed', orderId]
        );
        await refundClient.query('COMMIT');
      } catch (refundErr) {
        await refundClient.query('ROLLBACK');
        console.error('[Orders] Failed to refund wallet on provider error:', refundErr);
      } finally {
        refundClient.release();
      }

      const friendlyErrMsg = mapGamesDropErrorMessage(gdErr.code || gdErr.errorCode || gdErr.message);
      return res.status(400).json({ error: friendlyErrMsg || 'تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى.' });
    }

    // Handle GamesDrop Response
    const rawStatus = gdResponse.status;
    const mappedStatus = mapGamesDropStatus(rawStatus);
    const providerOrderId = gdResponse.order_id || gdResponse.orderId;
    const fulfillmentKey = gdResponse.key || null;

    const updateClient = await pool.connect();
    try {
      await updateClient.query('BEGIN');

      if (mappedStatus === 'COMPLETED') {
        await updateClient.query(
          `UPDATE "Order" 
           SET status = 'COMPLETED',
               "providerOrderId" = $1,
               "providerStatus" = $2,
               "fulfillmentKey" = $3,
               "completedAt" = CURRENT_TIMESTAMP,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [providerOrderId, rawStatus, fulfillmentKey, orderId]
        );
      } else if (mappedStatus === 'PROCESSING') {
        await updateClient.query(
          `UPDATE "Order" 
           SET status = 'PROCESSING',
               "providerOrderId" = $1,
               "providerStatus" = $2,
               "lastPolledAt" = CURRENT_TIMESTAMP,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [providerOrderId, rawStatus, orderId]
        );
      } else if (mappedStatus === 'FAILED' || mappedStatus === 'REFUNDED') {
        // Refund user immediately and revert promo code
        const wRes = await updateClient.query('SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [user.id]);
        const w = wRes.rows[0];
        if (w && finalChargeAmount > 0) {
          const restoredBalance = Math.round((Number(w.balance) + finalChargeAmount) * 100) / 100;
          await updateClient.query('UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [restoredBalance, w.id]);
          await updateClient.query(
            'INSERT INTO "WalletTransaction" (id, "walletId", amount, type, description, "created_by_type") VALUES ($1, $2, $3, $4, $5, $6)',
            [uuidv4(), w.id, finalChargeAmount, 'REFUND', `استرجاع تلقائي: تعذر استكمال الطلب (${rawStatus})`, 'SYSTEM']
          );
        }

        if (promoRecord) {
          await updateClient.query('DELETE FROM promo_code_redemptions WHERE order_id = $1', [orderId]);
          await updateClient.query('UPDATE promo_codes SET usage_count = GREATEST(0, usage_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = $1', [promoRecord.id]);
        }

        await updateClient.query(
          `UPDATE "Order" 
           SET status = $1,
               "providerOrderId" = $2,
               "providerStatus" = $3,
               "failureReason" = $4,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [mappedStatus, providerOrderId, rawStatus, gdResponse.message || `Provider status: ${rawStatus}`, orderId]
        );
      }

      await updateClient.query('COMMIT');

      if (mappedStatus === 'COMPLETED') {
        try {
          await awardOrderCashback(orderId);
        } catch (cbErr) {
          console.error('[Orders] Immediate cashback error:', cbErr);
        }

        try {
          await processReferralRewardOnOrder(orderId);
        } catch (refErr) {
          console.error('[Orders] Immediate referral reward error:', refErr);
        }

        // Trigger Order Completed Email with One-Click Review Token
        getOrCreateOrderReviewToken(orderId, localProduct.id, effectivePackageName, user.id)
          .then(rt => {
            sendOrderCompletedEmail({
              to: user.email,
              userId: user.id,
              orderId: orderId,
              customerName: (user as any)?.name || undefined,
              productName: effectivePackageName,
              orderNumber: orderId.slice(0, 8).toUpperCase(),
              amount: finalChargeAmount,
              currency: userCurrency,
              fulfillmentKey: fulfillmentKey,
              reviewToken: rt.token
            }).catch(mailErr => console.error('[Orders] Completed email error:', mailErr));
          })
          .catch(tokErr => console.error('[Orders] Review token generation error:', tokErr));

      } else if (mappedStatus === 'PROCESSING') {
        // Trigger Order Processing Email
        sendOrderProcessingEmail({
          to: user.email,
          userId: user.id,
          orderId: orderId,
          customerName: (user as any)?.name || undefined,
          productName: effectivePackageName,
          orderNumber: orderId.slice(0, 8).toUpperCase(),
          amount: finalChargeAmount,
          currency: userCurrency
        }).catch(mailErr => console.error('[Orders] Processing email error:', mailErr));
      }
    } catch (updateErr) {
      await updateClient.query('ROLLBACK');
      console.error('[Orders] Failed to update order status after provider response:', updateErr);
    } finally {
      updateClient.release();
    }

    // Return sanitized customer response (Never expose upstream provider IDs or names)
    res.status(201).json({
      id: orderId,
      status: mappedStatus,
      message: mappedStatus === 'COMPLETED' ? 'تم تنفيذ الطلب وتسليم الكود بنجاح' : 'تم استلام طلبك وجاري التنفيذ التلقائي',
      chargedAmount: finalChargeAmount,
      discountApplied,
      promoCode: promoRecord ? promoRecord.code : null,
      key: fulfillmentKey
    });

  } catch (error: any) {
    if (error.message === 'الرصيد غير كافٍ' || 
        error.message?.includes('كود') || 
        error.message?.includes('لمنع التكرار') ||
        error.message === 'تم استخدام هذا الكود مسبقاً') {
      res.status(400).json({ error: error.message });
    } else {
      console.error('Create order error:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء معالجة الطلب. يرجى المحاولة لاحقاً.' });
    }
  }
});

// Customer: Get my orders (Sanitized Customer DTO)
router.get('/my-orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const ordersRes = await pool.query(
      `SELECT 
        id, "gameId", "packageId", "packageName", "playerId", 
        amount, "originalAmount", "discountAmount", "promoCode", 
        status, "fulfillmentKey", "createdAt", "completedAt"
       FROM "Order" 
       WHERE "userId" = $1 
       ORDER BY "createdAt" DESC`,
      [req.user.id]
    );
    
    res.json(ordersRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Customer: Get specific order by ID (Sanitized Customer DTO)
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orderId = String(req.params.id);

    const orderRes = await pool.query(
      `SELECT 
        id, "gameId", "packageId", "packageName", "playerId", 
        amount, "originalAmount", "discountAmount", "promoCode", 
        status, "fulfillmentKey", "createdAt", "completedAt"
       FROM "Order" 
       WHERE id = $1 AND "userId" = $2
       LIMIT 1`,
      [orderId, req.user.id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }

    res.json(orderRes.rows[0]);
  } catch (err: any) {
    console.error('Fetch order by id error:', err);
    res.status(500).json({ error: 'فشل جلب تفاصيل الطلب.' });
  }
});

// Admin: Get all orders
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const ordersRes = await pool.query(`
      SELECT o.*, u.name as "userName", u.email as "userEmail" 
      FROM "Order" o 
      LEFT JOIN "User" u ON o."userId" = u.id 
      ORDER BY o."createdAt" DESC
    `);
    
    res.json(ordersRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Admin: Update order status manually
router.put('/:id/status', requireAdmin, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const { status } = req.body;
  const adminId = req.user?.id;

  if (!orderId || !['COMPLETED', 'FAILED', 'REFUNDED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status or order ID' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1 FOR UPDATE', [orderId]);
      const order = orderRes.rows[0];

      if (!order) {
        throw new Error('Order not found');
      }
      
      if (['COMPLETED', 'FAILED', 'REFUNDED'].includes(order.status)) {
        throw new Error('Order is already in a terminal state');
      }

      await client.query('UPDATE "Order" SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [status, orderId]);

      if (status === 'COMPLETED') {
        try {
          await awardOrderCashback(orderId, client);
        } catch (cbErr) {
          console.error('[Orders] Manual execution cashback error:', cbErr);
        }

        try {
          await processReferralRewardOnOrder(orderId, client);
        } catch (refErr) {
          console.error('[Orders] Manual execution referral reward error:', refErr);
        }
      }

      if (status === 'FAILED' || status === 'REFUNDED') {
        try {
          await reverseOrderCashback(orderId, client);
        } catch (rcErr) {
          console.error('[Orders] Manual status reverse cashback error:', rcErr);
        }

        const refundAmount = Number(order.chargedAmount || order.amount);
        const walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [order.userId]);
        const wallet = walletRes.rows[0];
        
        if (wallet && Number.isFinite(refundAmount) && refundAmount > 0) {
          const balanceBefore = Number(wallet.balance);
          const newBalance = Math.round((balanceBefore + refundAmount) * 100) / 100;
          await client.query('UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [newBalance, wallet.id]);
          
          await client.query(
            `INSERT INTO "WalletTransaction" 
              (id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              uuidv4(), 
              wallet.id, 
              refundAmount, 
              'REFUND', 
              `استرجاع يدوي من الإدارة للطلب: ${order.packageName}`,
              wallet.currency || 'SDG',
              balanceBefore,
              newBalance,
              'ORDER',
              order.id,
              adminId || null,
              'ADMIN'
            ]
          );
        }

        // Revert promo code redemption if applicable
        const promoRedemption = await client.query('SELECT id, promo_code_id FROM promo_code_redemptions WHERE order_id = $1', [order.id]);
        for (const r of promoRedemption.rows) {
          await client.query('DELETE FROM promo_code_redemptions WHERE id = $1', [r.id]);
          await client.query('UPDATE promo_codes SET usage_count = GREATEST(0, usage_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = $1', [r.promo_code_id]);
        }
      }

      await client.query(
        'INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", "targetOrderId", amount, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          uuidv4(), 
          adminId, 
          status === 'COMPLETED' ? 'ORDER_MANUAL_EXECUTION' : 'ORDER_FAILED_REFUND',
          order.userId,
          order.id,
          order.amount,
          `Admin changed status to ${status}`
        ]
      );

      await client.query('COMMIT');
      res.json({ message: 'Order status updated successfully' });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === 'Order not found' || err.message?.includes('terminal state')) {
      res.status(400).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }
});

export default router;
