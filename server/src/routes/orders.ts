import { Router, Response, Request } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { randomUUID as uuidv4 } from 'crypto';
import { gamesDropProvider } from '../providers/gamesdrop';
import { gamesDropClient } from '../providers/gamesdrop/client';
import { validatePlayerAccount } from '../services/playerValidationService';
import { mapGamesDropStatus, mapGamesDropErrorMessage } from '../providers/gamesdrop/mapper';
import { awardOrderCashback, reverseOrderCashback } from '../services/cashbackService';
import { processReferralRewardOnOrder } from '../services/referralService';
import { grantBonusSpinForOrder } from '../services/wheelService';
import { sendOrderProcessingEmail, sendOrderCompletedEmail } from '../services/emailService';
import { getOrCreateOrderReviewToken } from '../services/reviewTokenService';
import { getGeneralSettings } from './admin';
import { decryptPassword } from '../utils/cryptoAccount';
import { decryptCardData, formatCardNumber, maskCardNumber } from '../utils/cryptoCard';
import { decryptVoucherCode, maskVoucherCode } from '../utils/cryptoVoucher';
import { providerRouter, ProductProviderResolution, isAmbiguousNetworkError } from '../providers/router';
import { sanitizeCustomerErrorMessage } from '../utils/providerErrorHandler';

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
  const { gameId, packageId, packageName, playerId, serverId, playerName, promoCode, quantity: reqQuantity } = req.body;
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

    // Absolute Security Guard: Reject any attempt to order Visa products
    if (localProduct.card_network === 'VISA' || localProduct.productName?.toLowerCase().includes('visa') || localProduct.arabicName?.toLowerCase().includes('فيزا')) {
      return res.status(400).json({ error: 'عذراً، بطاقات فيزا غير متاحة للبيع في المتجر.' });
    }

    const authoritativeCustomerPriceUsd = Number(localProduct.customerPriceUsd);
    if (!Number.isFinite(authoritativeCustomerPriceUsd) || authoritativeCustomerPriceUsd <= 0) {
      return res.status(400).json({ error: 'تسعير المنتج غير مهيأ حالياً. يرجى مراجعة إدارة المنصة.' });
    }

    const isVirtualCard = localProduct.productType === 'VIRTUAL_CARD' || localProduct.category === 'VIRTUAL_CARD' || localProduct.fulfillment_type === 'KIROPRO_CARD' || localProduct.gameCategoryId === 'kiropro-card';
    const isDigitalAccount = !isVirtualCard && (localProduct.productType === 'DIGITAL_ACCOUNT' || localProduct.category === 'DIGITAL_ACCOUNT' || localProduct.provider === 'INTERNAL');
    const isInternalFulfillment = isDigitalAccount || isVirtualCard;

    let quantity = 1;
    if (isDigitalAccount) {
      if (reqQuantity !== undefined && reqQuantity !== null) {
        const parsedQ = Number(reqQuantity);
        if (!Number.isInteger(parsedQ) || parsedQ < 1) {
          return res.status(400).json({ error: 'الكمية المطلوبة غير صالحة. يرجى اختيار كمية 1 أو أكثر.' });
        }
        if (parsedQ > 100) {
          return res.status(400).json({ error: 'الحد الأقصى للشراء في المرة الواحدة هو 100 حساب.' });
        }
        quantity = parsedQ;
      }
    }

    let providerOfferId = 0;
    let effectiveServerId: string | null = null;
    let routing: ProductProviderResolution | null = null;

    if (!isInternalFulfillment) {
      routing = await providerRouter.resolveProductProviders(localProduct.id);
      if (!routing.hasAnyOrderableProvider) {
        return res.status(400).json({ error: 'نعتذر، هذا المنتج غير متاح للشحن مؤقتاً. يرجى المحاولة لاحقاً.' });
      }
      providerOfferId = Number(routing.primaryProductId || localProduct.providerOfferId || 0);

      // Server ID validation strictly based on localProduct.requiresGameServerId
      if (localProduct.requiresGameServerId) {
        const cleanServerId = serverId ? String(serverId).trim() : '';
        if (!cleanServerId) {
          return res.status(400).json({ error: 'يرجى اختيار سيرفر اللعبة (Server ID) لإتمام الطلب.' });
        }

        // Validate that the server belongs to GamesDrop allowed list if primary is GamesDrop
        if (routing.primaryProviderName === 'GAMESDROP' && providerOfferId > 0) {
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
        }
        effectiveServerId = cleanServerId;
      } else {
        effectiveServerId = null;
      }
    }

    // Section 3: User Preferred Currency & Central Exchange Rate
    const userRowRes = await pool.query('SELECT "preferred_currency" FROM "User" WHERE id = $1', [user.id]);
    const userCurrency = (userRowRes.rows[0]?.preferred_currency || 'SDG').toUpperCase();

    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000 };
    const exchangeRate = Number(rateConfig.rate) || 5000;

    // Unit price in user's currency
    let unitPriceInUserCurrency = authoritativeCustomerPriceUsd;
    if (userCurrency === 'SDG') {
      unitPriceInUserCurrency = Math.round(authoritativeCustomerPriceUsd * exchangeRate);
    } else {
      unitPriceInUserCurrency = Math.round(authoritativeCustomerPriceUsd * 100) / 100;
    }

    // Base price for entire quantity in user's currency
    let basePriceInUserCurrency = unitPriceInUserCurrency * quantity;

    // Resolve Player / Game User ID (Special Handling for Telegram @username resolution)
    let deliveryGameUserId = (playerId || user.email || user.id || '').trim();
    let latestProviderPrice = 0;
    let providerCurrency = 'USD';

    if (!isInternalFulfillment && routing) {
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
        // Validate player account before order placement (Requirement 4 & 8)
        const valCheck = await validatePlayerAccount({
          productId: localProduct.id,
          gameUserId: deliveryGameUserId,
          gameServerId: effectiveServerId || undefined,
          userId: user.id
        });

        if (!valCheck.valid) {
          return res.status(400).json({
            error: valCheck.message || 'تعذر التحقق من معرّف اللاعب. يرجى التأكد من المعرّف والمحاولة لاحقاً.'
          });
        }
      }

      let gamesDropAvailable = false;
      const isGamesDropCircuitOpen = gamesDropClient.isCircuitBreakerOpen();

      if (routing.primaryProviderName === 'GAMESDROP' && providerOfferId > 0 && !isGamesDropCircuitOpen) {
        // Fetch latest authoritative provider price from GamesDrop before creating order (find-one)
        try {
          const latestOffer = await gamesDropProvider.findOffer(providerOfferId);
          latestProviderPrice = Number(latestOffer.price);
          providerCurrency = latestOffer.currency || 'USD';
          gamesDropAvailable = true;

          // Price Safety Check: Ensure latest provider price does not cause a financial discrepancy
          const previousCost = Number(localProduct.gamesDropCostUsd || localProduct.providerCostUsd || 0);
          if (previousCost > 0 && latestProviderPrice > previousCost * 1.05) {
            // Upstream cost increased by more than 5%: prevent under-pricing loss
            await pool.query(
              `UPDATE "Product" SET "gamesDropCostUsd" = $1, "providerCostUsd" = $1, "lastProviderSyncAt" = NOW() WHERE id = $2`,
              [latestProviderPrice, localProduct.id]
            );
            return res.status(409).json({
              error: 'تغير سعر المنتج. يرجى تحديث الصفحة والمحاولة بالسعر المحدث.'
            });
          }
        } catch (err: any) {
          console.warn(`[Orders] GamesDrop findOffer(${providerOfferId}) failed (${err.message}). Checking fallback...`);
          if (!routing.fallbackEnabled || !routing.fallbackOrdersEnabled) {
            const friendlyErr = mapGamesDropErrorMessage(err.errorCode || err.code || err.message);
            return res.status(502).json({ 
              error: friendlyErr || 'تعذر استكمال العملية حالياً. يرجى المحاولة لاحقاً.' 
            });
          }
        }
      }

      if (!gamesDropAvailable) {
        // Fallback to secondary provider (G2Bulk) authoritative routed cost
        latestProviderPrice = Number(routing.fallbackCostUsd || routing.primaryCostUsd || localProduct.providerCostUsd || 0);
        providerCurrency = 'USD';
      }
    }

    const effectivePackageName = packageName || localProduct.arabicName || localProduct.offerName || 'منتج رقمي';

    // Database Transaction: Validate Promo, Check & Lock Wallet, Insert Order, Debit Balance
    const client = await pool.connect();
    let orderId = uuidv4();
    let idempotencyKey = uuidv4();
    let finalChargeAmount = basePriceInUserCurrency;
    let discountApplied = 0;
    let promoRecord: any = null;
    let assignedInventoryAccounts: any[] = [];
    let assignedKiroproCard: any = null;

    try {
      await client.query('BEGIN');

      if (isVirtualCard) {
        // 1. Verify available stock count before locking (enforce Mastercard only)
        const stockCountRes = await client.query(
          `SELECT COUNT(*)::int as count 
           FROM kiropro_cards_inventory 
           WHERE product_id = $1 AND status = 'AVAILABLE' AND card_network = 'MASTERCARD'`,
          [localProduct.id]
        );
        const availableCount = stockCountRes.rows[0]?.count || 0;
        if (availableCount < 1) {
          throw new Error('نعتذر، بطاقة كيرو برو غير متوفرة حالياً في المخزون.');
        }

        // 2. Select & Lock 1 Card Atomically (FOR UPDATE SKIP LOCKED)
        const cardLockRes = await client.query(
          `SELECT id, card_last4, exp_date, balance 
           FROM kiropro_cards_inventory 
           WHERE product_id = $1 AND status = 'AVAILABLE' AND card_network = 'MASTERCARD'
           ORDER BY created_at ASC 
           LIMIT 1 
           FOR UPDATE SKIP LOCKED`,
          [localProduct.id]
        );
        if (cardLockRes.rows.length === 0) {
          throw new Error('تعذر حجز بطاقة من المخزون حالياً نظراً لضغط الطلب المتزامن. يرجى المحاولة بعد قليل.');
        }
        assignedKiroproCard = cardLockRes.rows[0];
      } else if (isDigitalAccount) {
        // 1. Verify available stock count before locking
        const stockCountRes = await client.query(
          `SELECT COUNT(*)::int as count 
           FROM digital_product_accounts 
           WHERE product_id = $1 AND status = 'AVAILABLE'`,
          [localProduct.id]
        );
        const availableCount = stockCountRes.rows[0]?.count || 0;
        if (availableCount < quantity) {
          throw new Error(`المخزون المتوفر غير كافٍ لتلبية الكمية المطلوبة (${quantity}). المتاح حالياً: ${availableCount} حساب فقط.`);
        }

        // 2. Select & Lock Inventory Accounts Atomically (FOR UPDATE SKIP LOCKED)
        const accLockRes = await client.query(
          `SELECT id, email, password_encrypted 
           FROM digital_product_accounts 
           WHERE product_id = $1 AND status = 'AVAILABLE' 
           ORDER BY created_at ASC 
           LIMIT $2 
           FOR UPDATE SKIP LOCKED`,
          [localProduct.id, quantity]
        );
        if (accLockRes.rows.length < quantity) {
          throw new Error(`تعذر حجز الكمية المطلوبة بالكامل (${quantity}). المتاح حالياً: ${accLockRes.rows.length} حساب.`);
        }
        assignedInventoryAccounts = accLockRes.rows;
      } else {
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

      if (isVirtualCard) {
        // Insert Completed Order directly for VIRTUAL_CARD
        await client.query(
          `INSERT INTO "Order" (
            id, "userId", "gameId", "packageId", "packageName", "playerId", 
            amount, "originalAmount", "discountAmount", "promoCode", 
            status, provider, "orderType",
            "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
            "chargedCurrency", "exchangeRateUsed", "cashbackAmount", "completedAt",
            quantity, "unitPrice", "unitPriceUsd"
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'COMPLETED', 'INTERNAL', 'VIRTUAL_CARD', $11, $12, $13, $14, $15, $16, 0.0, CURRENT_TIMESTAMP, 1, $17, $18)`,
          [
            orderId,
            user.id,
            localProduct.gameCategoryId || 'kiropro-card',
            localProduct.id,
            effectivePackageName,
            `${localProduct.arabicName || localProduct.productName} (•••• ${assignedKiroproCard.card_last4})`,
            finalChargeAmount,
            basePriceInUserCurrency,
            discountApplied,
            promoRecord ? promoRecord.code : null,
            authoritativeCustomerPriceUsd,
            finalChargeAmount,
            authoritativeCustomerPriceUsd,
            finalChargeAmount,
            userCurrency,
            exchangeRate,
            unitPriceInUserCurrency,
            authoritativeCustomerPriceUsd
          ]
        );

        // Mark card as CLAIMED and associate with order and user
        await client.query(
          `UPDATE kiropro_cards_inventory 
           SET status = 'CLAIMED', 
               order_id = $1, 
               assigned_to_user_id = $2, 
               assigned_at = CURRENT_TIMESTAMP, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3`,
          [orderId, user.id, assignedKiroproCard.id]
        );

        // Check remaining available stock for this product
        const remRes = await client.query(
          `SELECT COUNT(*)::int as count FROM kiropro_cards_inventory WHERE product_id = $1 AND status = 'AVAILABLE'`,
          [localProduct.id]
        );
        if (Number(remRes.rows[0]?.count || 0) === 0) {
          await client.query(`UPDATE "Product" SET "inStock" = false, "updatedAt" = NOW() WHERE id = $1`, [localProduct.id]);
        }
      } else if (isDigitalAccount) {
        const deliveryPlayerId = quantity > 1 
          ? `${quantity} حسابات (${assignedInventoryAccounts[0].email} ...)` 
          : assignedInventoryAccounts[0].email;

        // Insert Completed Order directly for DIGITAL_ACCOUNT with quantity & unit price
        await client.query(
          `INSERT INTO "Order" (
            id, "userId", "gameId", "packageId", "packageName", "playerId", 
            amount, "originalAmount", "discountAmount", "promoCode", 
            status, provider, "orderType",
            "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
            "chargedCurrency", "exchangeRateUsed", "cashbackAmount", "completedAt",
            quantity, "unitPrice", "unitPriceUsd"
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'COMPLETED', 'INTERNAL', 'DIGITAL_ACCOUNT', $11, $12, $13, $14, $15, $16, 0.0, CURRENT_TIMESTAMP, $17, $18, $19)`,
          [
            orderId,
            user.id,
            localProduct.gameCategoryId || 'google-play-points',
            localProduct.id,
            effectivePackageName,
            deliveryPlayerId,
            finalChargeAmount,
            basePriceInUserCurrency,
            discountApplied,
            promoRecord ? promoRecord.code : null,
            authoritativeCustomerPriceUsd,
            finalChargeAmount,
            authoritativeCustomerPriceUsd,
            finalChargeAmount,
            userCurrency,
            exchangeRate,
            quantity,
            unitPriceInUserCurrency,
            authoritativeCustomerPriceUsd
          ]
        );

        // Mark accounts as SOLD and associate with order and user
        const accountIds = assignedInventoryAccounts.map(a => a.id);
        await client.query(
          `UPDATE digital_product_accounts 
           SET status = 'SOLD', 
               order_id = $1, 
               assigned_to_user_id = $2, 
               assigned_at = CURRENT_TIMESTAMP, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ANY($3::uuid[])`,
          [orderId, user.id, accountIds]
        );

        // Record assignments in digital_account_assignments table (Atomic Duplicate Assignment Protection)
        for (const acc of assignedInventoryAccounts) {
          await client.query(
            `INSERT INTO digital_account_assignments (
               id, order_id, digital_account_id, user_id, created_at
             ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [uuidv4(), orderId, acc.id, user.id]
          );
        }
      } else {
        // Section 11: Create Initial Order record with authoritative pricing & locked exchange rate
        const effectiveProvider = routing?.primaryProviderName || 'GAMESDROP';
        const effectiveOfferId = effectiveProvider === 'GAMESDROP' ? providerOfferId : null;

        await client.query(
          `INSERT INTO "Order" (
            id, "userId", "gameId", "packageId", "packageName", "playerId", 
            "serverId", "playerName",
            amount, "originalAmount", "discountAmount", "promoCode", 
            status, provider, "providerOfferId", "providerPrice", "providerCurrency", 
            "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
            "chargedCurrency", "exchangeRateUsed", "cashbackAmount",
            "idempotencyKey", "providerCostUsd"
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PROCESSING', $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 0.0, $23, $24)`,
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
            effectiveProvider,
            effectiveOfferId,
            latestProviderPrice,
            providerCurrency,
            authoritativeCustomerPriceUsd,
            finalChargeAmount,
            authoritativeCustomerPriceUsd,
            finalChargeAmount,
            userCurrency,
            exchangeRate,
            idempotencyKey,
            latestProviderPrice
          ]
        );
      }

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

      // Check remaining stock for DIGITAL_ACCOUNT and mark out of stock if 0 available
      if (isDigitalAccount) {
        const remainingStock = await client.query(
          `SELECT COUNT(*)::int as count FROM digital_product_accounts WHERE product_id = $1 AND status = 'AVAILABLE'`,
          [localProduct.id]
        );
        if ((remainingStock.rows[0]?.count || 0) === 0) {
          await client.query(`UPDATE "Product" SET "inStock" = false WHERE id = $1`, [localProduct.id]);
        }
      }

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Immediate Delivery for VIRTUAL_CARD (No upstream GamesDrop dispatch needed)
    if (isVirtualCard) {
      let bonusSpinGranted = false;
      try { await awardOrderCashback(orderId); } catch (e) { console.error('[Orders] Virtual card cashback error:', e); }
      try { await processReferralRewardOnOrder(orderId); } catch (e) { console.error('[Orders] Virtual card referral error:', e); }
      try {
        const spinRes = await grantBonusSpinForOrder(orderId);
        bonusSpinGranted = spinRes.granted;
      } catch (e) {
        console.error('[Orders] Virtual card bonus spin error:', e);
      }

      return res.status(201).json({
        success: true,
        orderId,
        id: orderId,
        status: 'COMPLETED',
        isVirtualCard: true,
        bonusSpinGranted,
        packageName: effectivePackageName,
        quantity: 1,
        unitPrice: unitPriceInUserCurrency,
        chargedAmount: finalChargeAmount,
        currency: userCurrency,
        cardLast4: assignedKiroproCard?.card_last4,
        message: 'تم شراء وتخصيص بطاقة كيرو برو بنجاح 🎉'
      });
    }

    // Immediate Delivery for DIGITAL_ACCOUNT (No upstream GamesDrop dispatch needed)
    if (isDigitalAccount) {
      let bonusSpinGranted = false;
      try { await awardOrderCashback(orderId); } catch (e) { console.error('[Orders] Digital account cashback error:', e); }
      try { await processReferralRewardOnOrder(orderId); } catch (e) { console.error('[Orders] Digital account referral error:', e); }
      try {
        const spinRes = await grantBonusSpinForOrder(orderId);
        bonusSpinGranted = spinRes.granted;
      } catch (e) {
        console.error('[Orders] Digital account bonus spin error:', e);
      }

      const decryptedAccounts = assignedInventoryAccounts.map((acc, idx) => ({
        id: acc.id,
        accountNumber: idx + 1,
        email: acc.email,
        password: decryptPassword(acc.password_encrypted)
      }));

      return res.status(201).json({
        success: true,
        orderId,
        id: orderId,
        status: 'COMPLETED',
        isDigitalAccount: true,
        bonusSpinGranted,
        packageName: effectivePackageName,
        quantity,
        unitPrice: unitPriceInUserCurrency,
        chargedAmount: finalChargeAmount,
        currency: userCurrency,
        accounts: decryptedAccounts,
        credentials: decryptedAccounts,
        account: decryptedAccounts[0],
        message: 'تم تنفيذ طلبك بنجاح 🎉'
      });
    }

    // Section 8 & 9: Dispatch Order via ProviderRouter (GamesDrop & G2Bulk)
    let dispatchResult: any;
    try {
      dispatchResult = await providerRouter.executeTopupOrder({
        koaraOrderId: orderId,
        playerUserId: deliveryGameUserId,
        serverZoneId: effectiveServerId || undefined,
        customerEmail: playerId && playerId.includes('@') ? playerId : (user.email || 'customer@kiropro.store'),
        idempotencyKey: idempotencyKey,
        expectedPriceUsd: latestProviderPrice,
        gameCode: routing?.primaryMetadata?.gameCode || localProduct.gameCategoryId
      }, routing!);
    } catch (dispatchErr: any) {
      console.error('[Orders] Provider execution exception:', dispatchErr.message);
      const isAmbiguous = isAmbiguousNetworkError(dispatchErr);
      dispatchResult = {
        success: false,
        provider: routing?.primaryProviderName || 'UNKNOWN',
        providerOrderId: null,
        providerStatus: isAmbiguous ? 'UNKNOWN' : 'EXCEPTION',
        canonicalStatus: isAmbiguous ? 'UNKNOWN' : 'FAILED',
        isAmbiguous,
        message: dispatchErr.message
      };
    }

    const rawStatus = dispatchResult.providerStatus;
    const mappedStatus = dispatchResult.canonicalStatus;
    const providerOrderId = dispatchResult.providerOrderId || null;
    const fulfillmentKey = dispatchResult.fulfillmentKey || null;
    let bonusSpinGranted = false;

    if (dispatchResult.isAmbiguous) {
      // Ambiguous state (timeout / network disconnection after submit):
      // Transition strictly to PROVIDER_UNKNOWN to prevent double fulfillment!
      // Do NOT auto-refund customer wallet!
      await pool.query(
        `UPDATE "Order" 
         SET status = 'PROVIDER_UNKNOWN',
             "provider" = $1,
             "providerStatus" = $2,
             "failureReason" = $3,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [
          dispatchResult.provider,
          rawStatus || 'UNKNOWN',
          dispatchResult.message || 'حالة الطلب غير مؤكدة لدى مزود الخدمة (Timeout/Network). يرجى التحقق اليدوي لمنع التكرار.',
          orderId
        ]
      );

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

      return res.status(201).json({
        id: orderId,
        status: 'PROVIDER_UNKNOWN',
        message: 'تم استلام طلبك وجارٍ معالجته والتحقق من حالة التنفيذ تلقائياً.',
        chargedAmount: finalChargeAmount,
        discountApplied,
        promoCode: promoRecord ? promoRecord.code : null,
        key: null,
        bonusSpinGranted: false
      });
    }

    if (!dispatchResult.success) {
      // Definitive failure: Safe to auto-refund
      const refundClient = await pool.connect();
      try {
        await refundClient.query('BEGIN');
        const wRes = await refundClient.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [user.id]);
        const w = wRes.rows[0];
        if (w && finalChargeAmount > 0) {
          const balanceBefore = Number(w.balance);
          const restoredBalance = Math.round((balanceBefore + finalChargeAmount) * 100) / 100;
          await refundClient.query('UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [restoredBalance, w.id]);
          await refundClient.query(
            `INSERT INTO "WalletTransaction" 
              (id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "created_by_type") 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              uuidv4(), 
              w.id, 
              finalChargeAmount, 
              'REFUND', 
              `استرجاع تلقائي لتعذر استكمال الطلب (${packageName || localProduct.offerName})`, 
              w.currency || 'SDG',
              balanceBefore,
              restoredBalance,
              'ORDER',
              orderId,
              'SYSTEM'
            ]
          );
        }

        if (promoRecord) {
          await refundClient.query('DELETE FROM promo_code_redemptions WHERE order_id = $1', [orderId]);
          await refundClient.query('UPDATE promo_codes SET usage_count = GREATEST(0, usage_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = $1', [promoRecord.id]);
        }

        await refundClient.query(
          'UPDATE "Order" SET status = $1, "provider" = $2, "providerOrderId" = $3, "providerStatus" = $4, "failureReason" = $5, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $6',
          ['FAILED', dispatchResult.provider, providerOrderId, rawStatus, dispatchResult.message || 'Provider communication failed', orderId]
        );
        await refundClient.query('COMMIT');
      } catch (refundErr) {
        await refundClient.query('ROLLBACK');
        console.error('[Orders] Failed to refund wallet on provider error:', refundErr);
      } finally {
        refundClient.release();
      }

      const friendlyErrMsg = sanitizeCustomerErrorMessage(
        mapGamesDropErrorMessage(dispatchResult.message || 'Provider failed')
      );
      return res.status(400).json({ error: friendlyErrMsg || 'تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى.' });
    }

    // Handle Completed or Processing State
    const updateClient = await pool.connect();
    try {
      await updateClient.query('BEGIN');

      if (mappedStatus === 'COMPLETED') {
        await updateClient.query(
          `UPDATE "Order" 
           SET status = 'COMPLETED',
               "provider" = $1,
               "providerOrderId" = $2,
               "providerStatus" = $3,
               "fulfillmentKey" = $4,
               "completedAt" = CURRENT_TIMESTAMP,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [dispatchResult.provider, providerOrderId, rawStatus, fulfillmentKey, orderId]
        );
      } else {
        // PROCESSING / PENDING
        await updateClient.query(
          `UPDATE "Order" 
           SET status = 'PROCESSING',
               "provider" = $1,
               "providerOrderId" = $2,
               "providerStatus" = $3,
               "lastPolledAt" = CURRENT_TIMESTAMP,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [dispatchResult.provider, providerOrderId, rawStatus, orderId]
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

        try {
          const spinRes = await grantBonusSpinForOrder(orderId);
          bonusSpinGranted = spinRes.granted;
        } catch (spErr) {
          console.error('[Orders] Immediate bonus spin error:', spErr);
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
      key: fulfillmentKey,
      bonusSpinGranted
    });

  } catch (error: any) {
    if (error.message === 'الرصيد غير كافٍ' || 
        error.message?.includes('كود') || 
        error.message?.includes('لمنع التكرار') ||
        error.message?.includes('المخزون المتوفر غير كافٍ') ||
        error.message?.includes('تعذر حجز الكمية المطلوبة') ||
        error.message?.includes('نفد مخزون هذا المنتج') ||
        error.message === 'تم استخدام هذا الكود مسبقاً' ||
        error.code === '23505') {
      const userMsg = error.code === '23505'
        ? 'حدث تعارض مؤقت أثناء تخصيص الحسابات من المخزون، يرجى إعادة المحاولة.'
        : error.message;
      res.status(400).json({ error: userMsg });
    } else {
      console.error('Create order error:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء معالجة الطلب. يرجى المحاولة لاحقاً.' });
    }
  }
});

// Customer / Admin: Get credentials of assigned digital account (STRICT IDOR PROTECTION)
router.get('/:id/credentials', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orderId = String(req.params.id);

    // 1. Fetch order and verify ownership (STRICT IDOR CHECK)
    const orderRes = await pool.query(
      `SELECT id, "userId", status, "packageName" FROM "Order" WHERE id = $1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }

    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح لك بالوصول لبيانات هذا الطلب.' });
    }

    if (order.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'بيانات الحساب متاحة فقط للطلبات المكتملة.' });
    }

    // 2. Check if order is for a KiroPro Virtual Card
    const cardRes = await pool.query(
      `SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, assigned_at
       FROM kiropro_cards_inventory 
       WHERE order_id = $1`,
      [orderId]
    );

    if (cardRes.rows.length > 0) {
      const card = cardRes.rows[0];
      const fullCardNumber = decryptCardData(card.card_number_encrypted);
      const cvv = decryptCardData(card.cvv_encrypted);

      return res.json({
        success: true,
        orderId: order.id,
        packageName: order.packageName,
        isVirtualCard: true,
        card: {
          id: card.id,
          cardNumber: formatCardNumber(fullCardNumber),
          last4: card.card_last4,
          maskedNumber: maskCardNumber(card.card_last4),
          expDate: card.exp_date,
          cvv: cvv,
          balance: Number(card.balance),
          assignedAt: card.assigned_at
        }
      });
    }

    // 3. Fetch assigned digital accounts
    const accRes = await pool.query(
      `SELECT a.id, a.email, a.password_encrypted, a.assigned_at as "assignedAt" 
       FROM digital_product_accounts a 
       WHERE a.order_id = $1
       ORDER BY a.assigned_at ASC, a.created_at ASC`,
      [orderId]
    );
    const accounts = accRes.rows;
    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ error: 'لا توجد حسابات رقمية مرتبطة بهذا الطلب.' });
    }

    const decryptedList = accounts.map((acc, idx) => ({
      id: acc.id,
      accountNumber: idx + 1,
      email: acc.email,
      password: decryptPassword(acc.password_encrypted),
      assignedAt: acc.assignedAt
    }));

    res.json({
      success: true,
      orderId: order.id,
      packageName: order.packageName,
      quantity: decryptedList.length,
      credentials: decryptedList,
      accounts: decryptedList,
      email: decryptedList[0]?.email,
      password: decryptedList[0]?.password,
      assignedAt: decryptedList[0]?.assignedAt
    });
  } catch (err: any) {
    console.error('[Orders] Failed to fetch digital account credentials:', err.message);
    res.status(500).json({ error: 'فشل جلب بيانات الحساب.' });
  }
});

// Customer / Admin: Get decrypted digital voucher codes for a completed order
router.get('/:id/voucher-codes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const orderId = String(req.params.id);

    // 1. Verify order exists and belongs to requesting user (or user is admin)
    const orderRes = await pool.query(
      `SELECT id, "userId", "packageName", status, "orderType", "fulfillmentKey"
       FROM "Order"
       WHERE id = $1`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }

    const order = orderRes.rows[0];
    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح لك بعرض أكواد هذا الطلب.' });
    }

    if (order.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'الطلب لم يكتمل بعد. الأكواد غير جاهزة.' });
    }

    // 2. Fetch encrypted codes from order_voucher_codes
    const codesRes = await pool.query(
      `SELECT id, code_encrypted, code_masked, face_value as "faceValue", currency, created_at as "createdAt"
       FROM order_voucher_codes
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    if (codesRes.rows.length === 0) {
      // Fallback: If fulfillmentKey exists on Order (e.g. from direct delivery)
      const fallbackKey = order.fulfillmentKey;
      if (fallbackKey) {
        const rawCodes = String(fallbackKey).split('\n').filter(Boolean);
        return res.json({
          success: true,
          orderId: order.id,
          packageName: order.packageName,
          quantity: rawCodes.length,
          codes: rawCodes.map((code, idx) => ({
            id: `k-${idx}`,
            code,
            maskedCode: maskVoucherCode(code)
          }))
        });
      }
      return res.status(404).json({ error: 'لا توجد أكواد مسجلة لهذا الطلب.' });
    }

    // 3. Decrypt each code
    const decryptedCodes = codesRes.rows.map(row => {
      let plainCode = row.code_masked;
      try {
        plainCode = decryptVoucherCode(row.code_encrypted);
      } catch (decErr) {
        console.error('[Orders API] Error decrypting voucher code:', decErr);
      }
      return {
        id: row.id,
        code: plainCode,
        maskedCode: row.code_masked,
        faceValue: row.faceValue ? Number(row.faceValue) : null,
        currency: row.currency || 'USD'
      };
    });

    return res.json({
      success: true,
      orderId: order.id,
      packageName: order.packageName,
      quantity: decryptedCodes.length,
      codes: decryptedCodes
    });
  } catch (err: any) {
    console.error('[Orders API] Failed to fetch voucher codes:', err.message);
    return res.status(500).json({ error: 'فشل جلب الأكواد الرقمية.' });
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
        status, "fulfillmentKey", "createdAt", "completedAt",
        CASE 
          WHEN "orderType" = 'G2BULK_VOUCHER' THEN 'DIGITAL_VOUCHER' 
          WHEN "orderType" LIKE '%G2BULK%' OR "orderType" LIKE '%GAMESDROP%' THEN 'DIRECT_TOPUP'
          ELSE "orderType" 
        END as "orderType",
        quantity, "unitPrice", "unitPriceUsd"
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
        status, "fulfillmentKey", "createdAt", "completedAt",
        CASE 
          WHEN "orderType" = 'G2BULK_VOUCHER' THEN 'DIGITAL_VOUCHER' 
          WHEN "orderType" LIKE '%G2BULK%' OR "orderType" LIKE '%GAMESDROP%' THEN 'DIRECT_TOPUP'
          ELSE "orderType" 
        END as "orderType"
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

        try {
          await grantBonusSpinForOrder(orderId, client);
        } catch (spErr) {
          console.error('[Orders] Manual execution bonus spin error:', spErr);
        }
      }

      if (status === 'FAILED' || status === 'REFUNDED') {
        let unrecoveredCashback = 0;
        try {
          const rcRes = await reverseOrderCashback(orderId, client);
          unrecoveredCashback = rcRes?.unrecoveredAmount || 0;
        } catch (rcErr) {
          console.error('[Orders] Manual status reverse cashback error:', rcErr);
        }

        const walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [order.userId]);
        const wallet = walletRes.rows[0];
        
        if (wallet) {
          // Check against duplicate refund in ledger
          const existingRefund = await client.query(`
            SELECT id FROM "WalletTransaction"
            WHERE "walletId" = $1 AND "referenceType" = 'ORDER' AND "referenceId" = $2 AND "type" = 'REFUND'
            LIMIT 1
          `, [wallet.id, order.id]);

          if (existingRefund.rows.length === 0) {
            const grossRefundAmount = Number(order.chargedAmount || order.amount || 0);
            const refundAmount = Math.max(0, grossRefundAmount - unrecoveredCashback);

            if (Number.isFinite(refundAmount) && refundAmount > 0) {
              const balanceBefore = Number(wallet.balance);
              const newBalance = Math.round((balanceBefore + refundAmount) * 100) / 100;
              await client.query('UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [newBalance, wallet.id]);
              
              const refundDescription = unrecoveredCashback > 0
                ? `استرجاع يدوي من الإدارة للطلب: ${order.packageName || order.id} (مخصوم منه ${unrecoveredCashback} كاش باك تم استهلاكه)`
                : `استرجاع يدوي من الإدارة للطلب: ${order.packageName || order.id}`;

              await client.query(
                `INSERT INTO "WalletTransaction" 
                  (id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                  uuidv4(), 
                  wallet.id, 
                  refundAmount, 
                  'REFUND', 
                  refundDescription,
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
          } else {
            console.log(`[Orders] Refund already recorded in ledger for order ${order.id}. Skipping.`);
          }
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
