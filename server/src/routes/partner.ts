import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requirePartner, PartnerAuthRequest } from '../middlewares/authMiddleware';
import { JWT_SECRET, getAuthCookieOptions } from '../config';
import { extractClientInfo, extractClientIp } from '../services/clientInfoService';
import { createSession, closeSession } from '../services/sessionService';
import { checkBan, formatBanResponse } from '../services/banService';
import { logSecurityEvent } from '../services/securityEventService';
import { partnerService } from '../services/partnerService';
import { partnerLedgerService } from '../services/partnerLedgerService';
import { gamesDropProvider } from '../providers/gamesdrop';
import { mapGamesDropStatus, mapGamesDropErrorMessage } from '../providers/gamesdrop/mapper';

const router = Router();

// Memory storage for receipts: stored permanently in PostgreSQL as Base64
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  }
});

function isValidBufferSignature(buffer: Buffer, mimetype: string): boolean {
  if (!buffer || buffer.length < 4) return false;
  const mt = mimetype.toLowerCase();

  // JPEG: FF D8 FF
  if (mt === 'image/jpeg' || mt === 'image/jpg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  // PNG: 89 50 4E 47
  if (mt === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  // WebP: RIFF ... WEBP
  if (mt === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  // PDF: %PDF
  if (mt === 'application/pdf') {
    return buffer.toString('ascii', 0, 4) === '%PDF';
  }
  return true;
}

// Rate limiters
const partnerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => extractClientIp(req),
  message: { error: 'تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. يرجى المحاولة بعد 15 دقيقة.' }
});

const quickBuyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 orders/minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لإنشاء طلبات الشحن السريع. يرجى الانتظار لحظات.' }
});

// Helper to set auth cookies
const setPartnerAuthCookies = (res: Response, token: string) => {
  const cookieOptions = {
    ...getAuthCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
  res.cookie('token', token, cookieOptions);
  res.cookie('partner_token', token, cookieOptions);
};

// ==========================================
// 1. PARTNER LOGIN
// ==========================================
router.post('/login', partnerLoginLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const clientInfo = extractClientInfo(req, res);

  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور حقول مطلوبة.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const userRes = await pool.query(
      `SELECT 
        u.id, u.email, u.name, u.role, u."passwordHash",
        p.id as partner_id, p.business_name, p.status as partner_status,
        p.must_change_password
       FROM "User" u
       LEFT JOIN partner_profiles p ON p.user_id = u.id
       WHERE u.email = $1`,
      [normalizedEmail]
    );

    const user = userRes.rows[0];

    // Ban check
    const banCheck = await checkBan({
      userId: user?.id,
      ip: clientInfo.ip,
      deviceId: clientInfo.deviceId
    });

    if (banCheck.isBanned) {
      return res.status(403).json(formatBanResponse(banCheck, 'login'));
    }

    if (!user || (user.role !== 'PARTNER' && user.role !== 'ADMIN')) {
      await logSecurityEvent({
        eventType: 'LOGIN_FAILED',
        ipAddress: clientInfo.ip,
        deviceId: clientInfo.deviceId,
        userAgent: clientInfo.userAgent,
        metadata: { email: normalizedEmail, reason: 'NOT_A_PARTNER' }
      });
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      await logSecurityEvent({
        userId: user.id,
        eventType: 'LOGIN_FAILED',
        ipAddress: clientInfo.ip,
        deviceId: clientInfo.deviceId,
        userAgent: clientInfo.userAgent,
        metadata: { email: normalizedEmail, reason: 'BAD_PASSWORD' }
      });
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }

    if (user.partner_status === 'SUSPENDED') {
      return res.status(403).json({ error: 'تم إيقاف حسابك التجاري مؤقتاً من قبل الإدارة. يرجى التواصل مع الدعم.' });
    }

    const sessionId = await createSession({
      userId: user.id,
      clientInfo,
      loginMethod: 'PASSWORD'
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        sessionId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setPartnerAuthCookies(res, token);

    // Fetch partner wallet balance
    const walletRes = await pool.query(
      'SELECT balance, currency FROM partner_wallets WHERE partner_id = $1',
      [user.partner_id]
    );

    const details = await partnerService.getPartnerDetails(user.partner_id);

    const partnerData = details ? {
      id: details.partnerId,
      userId: details.userId,
      name: details.name,
      email: details.email,
      phone: details.phone,
      businessName: details.businessName,
      status: details.status,
      mustChangePassword: details.mustChangePassword,
      levelId: details.levelId,
      levelName: details.levelName,
      levelArabicName: details.levelArabicName,
      badgeColor: details.badgeColor,
      discountPercent: details.discountPercent,
      totalPoints: details.totalPoints,
      ordersCount: details.totalOrders,
      totalPurchasesUsd: Number(details.totalSpentUsd || 0)
    } : {
      id: user.partner_id,
      userId: user.id,
      name: user.name,
      email: user.email,
      businessName: user.business_name,
      status: user.partner_status || 'ACTIVE',
      mustChangePassword: !!user.must_change_password,
      totalPoints: 0
    };

    const walletData = {
      balance: Number(walletRes.rows[0]?.balance || 0),
      currency: walletRes.rows[0]?.currency || 'USD'
    };

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        partnerId: user.partner_id,
        email: user.email,
        name: user.name,
        businessName: user.business_name,
        role: user.role,
        balance: walletData.balance,
        currency: walletData.currency,
        mustChangePassword: !!user.must_change_password
      },
      partner: partnerData,
      wallet: walletData
    });
  } catch (err: any) {
    console.error('[PartnerLogin] Error:', err);
    res.status(500).json({ error: 'حدث خطأ غير متوقع أثناء تسجيل الدخول.' });
  }
});

// ==========================================
// 2. SETUP PASSWORD (ONE-TIME TOKEN)
// ==========================================
router.post('/setup-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  const clientInfo = extractClientInfo(req, res);

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'الرمز وكلمة المرور الجديدة حقول مطلوبة.' });
  }

  try {
    const result = await partnerService.verifyAndConsumeSetupToken(String(token), String(newPassword));

    const sessionId = await createSession({
      userId: result.userId,
      clientInfo,
      loginMethod: 'TOKEN_SETUP'
    });

    const jwtToken = jwt.sign(
      {
        id: result.userId,
        email: result.email,
        role: 'PARTNER',
        sessionId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setPartnerAuthCookies(res, jwtToken);

    res.json({
      success: true,
      message: 'تم تعيين كلمة المرور بنجاح! تم تسجيل دخولك إلى المنصة.',
      token: jwtToken,
      user: {
        id: result.userId,
        partnerId: result.partnerId,
        email: result.email,
        name: result.name
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'فشل إعداد كلمة المرور.' });
  }
});

// ==========================================
// 3. CHANGE PASSWORD (AUTHENTICATED)
// ==========================================
router.post('/change-password', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user?.id;
  const partnerId = req.partner?.id;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.' });
  }

  try {
    const userRes = await pool.query('SELECT "passwordHash" FROM "User" WHERE id = $1', [userId]);
    const currentHash = userRes.rows[0]?.passwordHash;

    // If partner is not setting it for first time, require currentPassword
    if (!req.partner?.mustChangePassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية.' });
      }
      const isMatch = await bcrypt.compare(currentPassword, currentHash);
      if (!isMatch) {
        return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE "User" 
       SET "passwordHash" = $1, "passwordChangedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [newHash, userId]
    );

    if (partnerId) {
      await pool.query(
        `UPDATE partner_profiles SET must_change_password = false WHERE id = $1`,
        [partnerId]
      );
    }

    res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح.' });
  } catch (err: any) {
    console.error('[ChangePassword] Error:', err);
    res.status(500).json({ error: 'فشل تغيير كلمة المرور.' });
  }
});

// ==========================================
// 4. GET PARTNER DETAILS & STATS (/me)
// ==========================================
router.get('/me', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  try {
    const partnerId = req.partner?.id;
    if (!partnerId) return res.status(404).json({ error: 'ملف الشريك غير موجود.' });

    const details = await partnerService.getPartnerDetails(partnerId);
    if (!details) return res.status(404).json({ error: 'بيانات الشريك غير متوفرة.' });

    const partner = {
      id: details.partnerId,
      userId: details.userId,
      name: details.name,
      email: details.email,
      phone: details.phone,
      businessName: details.businessName,
      status: details.status,
      mustChangePassword: details.mustChangePassword,
      levelId: details.levelId,
      levelName: details.levelName,
      levelArabicName: details.levelArabicName,
      badgeColor: details.badgeColor,
      discountPercent: details.discountPercent,
      totalPoints: details.totalPoints,
      ordersCount: details.totalOrders,
      totalPurchasesUsd: Number(details.totalSpentUsd || 0)
    };

    const wallet = {
      balance: Number(details.balance || 0),
      currency: details.currency || 'USD'
    };

    res.json({
      success: true,
      ...details,
      partner,
      wallet,
      nextLevel: details.nextLevel
    });
  } catch (err: any) {
    console.error('[Partner/me] Error:', err);
    res.status(500).json({ error: 'فشل جلب بيانات الشريك.' });
  }
});

// ==========================================
// 5. GET PARTNER CATALOG & PRICING
// ==========================================
router.get('/products', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  try {
    const partnerId = req.partner?.id;
    if (!partnerId) return res.status(400).json({ error: 'معرّف الشريك غير صالح.' });

    const settings = await partnerService.getPricingSettings();
    const defaultMarkup = Math.min(settings.maxMarkupUsd, Math.max(settings.minMarkupUsd, settings.defaultMarkupUsd));

    // Fetch active products with partner customized pricing or default partner price
    const query = `
      SELECT 
        p.id, p."providerOfferId", p."productName", p."offerName", p.category, p."productType",
        p."arabicName", p.description, p."platformCode", p."regionCode",
        p."customerPriceUsd" as "retailPriceUsd",
        COALESCE(p."supplierCostUsd", p."gamesDropCostUsd", 0) as "supplierCostUsd",
        p."defaultPartnerPriceUsd",
        p.fulfillment_type,
        p.requires_player_id,
        p.requires_server_id,
        p.requires_quantity,
        p.requires_inventory,
        (CASE 
          WHEN p.fulfillment_type = 'KIROPRO_CARD' OR p."productType" = 'VIRTUAL_CARD' THEN 
            (SELECT COUNT(*)::int FROM kiropro_cards_inventory WHERE status = 'AVAILABLE')
          WHEN p.fulfillment_type = 'DIGITAL_ACCOUNT' OR p."productType" = 'DIGITAL_ACCOUNT' THEN 
            (SELECT COUNT(*)::int FROM digital_product_accounts WHERE product_id = p.id AND status = 'AVAILABLE')
          ELSE NULL 
        END) as "availableStock",
        ppp.partner_price_usd as "customPartnerPriceUsd",
        ppp.markup_usd as "customMarkupUsd",
        ppp.is_available as "customIsAvailable",
        p."inStock", p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
        p."gameCategoryId",
        c."imageUrl" as "categoryImageUrl",
        c."name" as "categoryName",
        c."arabicName" as "categoryArabicName",
        c."idFieldLabel" as "categoryIdFieldLabel",
        c."idPlaceholder" as "categoryIdPlaceholder"
      FROM "Product" p
      LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
      LEFT JOIN partner_product_pricing ppp ON ppp.partner_id = $1 AND ppp.product_id = p.id
      WHERE p."isActive" = true
        AND (ppp.is_available IS NULL OR ppp.is_available = true)
      ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
    `;

    const result = await pool.query(query, [partnerId]);

    // Calculate authoritative Partner Price = Supplier Cost + Small Markup ($0.01 - $0.05)
    const products = result.rows.map(row => {
      const supplierCost = Number(row.supplierCostUsd || 0);
      let finalPrice: number;
      let hasCustomPrice = false;

      if (row.customPartnerPriceUsd !== null && row.customPartnerPriceUsd !== undefined) {
        finalPrice = Number(row.customPartnerPriceUsd);
        hasCustomPrice = true;
      } else if (row.customMarkupUsd !== null && row.customMarkupUsd !== undefined) {
        finalPrice = Math.round((supplierCost + Number(row.customMarkupUsd)) * 100) / 100;
        hasCustomPrice = true;
      } else if (row.defaultPartnerPriceUsd !== null && row.defaultPartnerPriceUsd !== undefined) {
        finalPrice = Number(row.defaultPartnerPriceUsd);
      } else {
        finalPrice = Math.round((supplierCost + defaultMarkup) * 100) / 100;
      }

      // Anti-loss guard
      if (finalPrice < supplierCost + settings.minMarkupUsd) {
        finalPrice = Math.round((supplierCost + settings.minMarkupUsd) * 100) / 100;
      }
      finalPrice = Math.max(0.01, finalPrice);

      const retailPrice = Number(row.retailPriceUsd || 0);
      const savings = retailPrice > finalPrice ? Math.round(((retailPrice - finalPrice) / retailPrice) * 100) : 0;

      const fulfillmentType = row.fulfillment_type || (
        row.productType === 'VIRTUAL_CARD' ? 'KIROPRO_CARD' :
        row.productType === 'DIGITAL_ACCOUNT' ? 'DIGITAL_ACCOUNT' :
        'DIRECT_TOPUP'
      );
      const isCardOrDigital = fulfillmentType === 'KIROPRO_CARD' || fulfillmentType === 'DIGITAL_ACCOUNT';
      const requiresPlayerId = !isCardOrDigital && (row.requires_player_id !== false && row.requiresGameUserId !== false);
      const availableStock = row.availableStock !== null ? Number(row.availableStock) : undefined;
      const inStock = isCardOrDigital ? (availableStock !== undefined ? availableStock > 0 : row.inStock) : row.inStock;

      return {
        id: row.id,
        providerOfferId: row.providerOfferId,
        name: row.arabicName || row.offerName || row.productName,
        nameEn: row.productName,
        productName: row.productName,
        offerName: row.offerName,
        arabicName: row.arabicName || row.offerName,
        category: row.categoryName || row.category || 'العاب',
        gameCategoryId: row.gameCategoryId,
        categoryName: row.categoryName,
        categoryArabicName: row.categoryArabicName || row.categoryName,
        categoryImageUrl: row.categoryImageUrl,
        idFieldLabel: row.categoryIdFieldLabel || 'معرّف اللاعب (Player ID)',
        idPlaceholder: row.categoryIdPlaceholder || 'أدخل معرّف اللاعب (Player ID)',
        fulfillmentType,
        requiresPlayerId,
        requiresServerId: Boolean(row.requires_server_id || row.requiresGameServerId),
        requiresQuantity: Boolean(row.requires_quantity || fulfillmentType === 'DIGITAL_ACCOUNT'),
        requiresInventory: Boolean(row.requires_inventory || isCardOrDigital),
        availableStock,
        inStock,
        requiresGameUserId: requiresPlayerId,
        requiresGameServerId: Boolean(row.requires_server_id || row.requiresGameServerId),
        price: retailPrice,
        retailPriceUsd: retailPrice,
        effectivePartnerPriceUsd: finalPrice,
        partnerPriceUsd: finalPrice,
        hasCustomPrice,
        savingsPercent: savings
      };
    });

    res.json({
      success: true,
      products
    });
  } catch (err: any) {
    console.error('[Partner/products] Error:', err);
    res.status(500).json({ error: 'فشل تحميل قائمة منتجات الشركاء.' });
  }
});

// ==========================================
// 6. QUICK BUY (INSTANT 1-CLICK TOP-UP)
// ==========================================
router.post('/quick-buy', quickBuyLimiter, requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const { productId, playerId, serverId, playerName, quantity = 1, idempotencyKey } = req.body;
  const partner = req.partner;

  if (!partner) return res.status(401).json({ error: 'غير مصرح.' });

  if (partner.mustChangePassword) {
    return res.status(403).json({
      error: 'يرجى تغيير كلمة المرور الأولية الخاصة بحسابك أولاً لتتمكن من الشحن.',
      mustChangePassword: true
    });
  }

  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: 'يرجى اختيار باقة الشحن.' });
  }

  try {
    // 1. Fetch authoritative product info
    const prodRes = await pool.query(
      `SELECT p.*, c.name as "categoryName", c."arabicName" as "categoryArabicName" 
       FROM "Product" p 
       LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
       WHERE p.id = $1`,
      [productId]
    );

    const product = prodRes.rows[0];
    if (!product) return res.status(400).json({ error: 'المنتج غير موجود.' });

    const fulfillmentType = product.fulfillment_type || (
      product.productType === 'VIRTUAL_CARD' ? 'KIROPRO_CARD' :
      product.productType === 'DIGITAL_ACCOUNT' ? 'DIGITAL_ACCOUNT' :
      'DIRECT_TOPUP'
    );

    // 2. Route KIROPRO_CARD (Virtual Mastercard)
    if (fulfillmentType === 'KIROPRO_CARD') {
      try {
        const cardResult = await partnerService.issueKiroProCard({
          partnerId: partner.id,
          partnerUserId: req.user?.id || partner.userId,
          idempotencyKey
        });

        const updatedWallet = await pool.query(
          'SELECT balance FROM partner_wallets WHERE partner_id = $1',
          [partner.id]
        );

        return res.json({
          success: true,
          orderId: cardResult.order.id,
          order: {
            id: cardResult.order.id,
            orderNumber: cardResult.order.id.slice(0, 8).toUpperCase(),
            productName: product.arabicName || product.productName,
            amountUsd: cardResult.order.partnerPriceUsd,
            status: cardResult.order.status,
            cardLast4: cardResult.order.cardLast4,
            cardId: cardResult.order.cardId
          },
          newBalance: Number(updatedWallet.rows[0]?.balance || 0),
          message: 'تم إصدار بطاقة ماستركارد بنجاح!'
        });
      } catch (err: any) {
        return res.status(400).json({ error: err.message || 'فشل إصدار البطاقة.' });
      }
    }

    // 3. Route DIGITAL_ACCOUNT (Google Play Accounts, etc.)
    if (fulfillmentType === 'DIGITAL_ACCOUNT') {
      const parsedQty = Math.max(1, Math.min(100, Number(quantity) || 1));
      try {
        const digitalResult = await partnerService.issueDigitalAccounts({
          partnerId: partner.id,
          partnerUserId: req.user?.id || partner.userId,
          productId,
          quantity: parsedQty,
          idempotencyKey
        });

        const updatedWallet = await pool.query(
          'SELECT balance FROM partner_wallets WHERE partner_id = $1',
          [partner.id]
        );

        return res.json({
          success: true,
          orderId: digitalResult.order.id,
          order: {
            id: digitalResult.order.id,
            orderNumber: digitalResult.order.id.slice(0, 8).toUpperCase(),
            productName: digitalResult.order.productName,
            amountUsd: digitalResult.order.totalAmountUsd,
            quantity: digitalResult.order.quantity,
            status: digitalResult.order.status
          },
          accounts: digitalResult.accounts,
          newBalance: Number(updatedWallet.rows[0]?.balance || 0),
          message: `تم تسليم ${parsedQty} حساب بنجاح!`
        });
      } catch (err: any) {
        return res.status(400).json({ error: err.message || 'فشل شراء الحسابات الرقمية.' });
      }
    }

    // 4. Route DIRECT_TOPUP (Games with Player ID)
    const requiresPlayerId = product.requires_player_id !== false && product.requiresGameUserId !== false;
    if (requiresPlayerId) {
      if (!playerId || typeof playerId !== 'string' || !playerId.trim()) {
        return res.status(400).json({ error: 'معرّف اللاعب (Player ID) مطلوب.' });
      }
    }
    const cleanPlayerId = (playerId && typeof playerId === 'string') ? playerId.trim() : 'N/A';

    const providerOfferId = Number(product.providerOfferId);
    if (!providerOfferId || isNaN(providerOfferId)) {
      return res.status(400).json({ error: 'معرّف مزود الخدمة غير صالح.' });
    }

    // Server ID check if required
    let effectiveServerId: string | null = null;
    if (product.requires_server_id || product.requiresGameServerId) {
      if (!serverId || !String(serverId).trim()) {
        return res.status(400).json({ error: 'يرجى تحديد خادم اللعبة (Server ID) لإتمام الشحن.' });
      }
      effectiveServerId = String(serverId).trim();
    }

    // Authoritative price resolution
    const pricing = await partnerService.getEffectivePartnerPrice(partner.id, productId);
    const chargeAmountUsd = pricing.finalPartnerPriceUsd;

    // Idempotency Check: reject identical request within 5 seconds
    const duplicateCheck = await pool.query(
      `SELECT id FROM partner_orders 
       WHERE partner_id = $1 AND product_id = $2 AND player_id = $3 
         AND created_at >= NOW() - INTERVAL '5 seconds'
       LIMIT 1`,
      [partner.id, productId, cleanPlayerId]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        error: 'تم استلام طلب شحن مطابق للتو. يرجى الانتظار بضع ثوانٍ لمنع الشحن المزدوج.'
      });
    }

    // 5. Debit Wallet under Database Transaction & Insert Order
    const client = await pool.connect();
    let orderId = uuidv4();

    try {
      await client.query('BEGIN');

      // Safe debit via partnerLedgerService (checks balance under row lock)
      await partnerLedgerService.debit({
        partnerId: partner.id,
        type: 'PURCHASE',
        amount: chargeAmountUsd,
        currency: 'USD',
        referenceId: orderId,
        referenceType: 'ORDER',
        actorId: partner.userId,
        actorType: 'PARTNER',
        description: `شراء سريع: ${product.arabicName || product.productName} للاعب ${cleanPlayerId}`
      }, client);

      // Insert order in partner_orders
      await client.query(
        `INSERT INTO partner_orders (
          id, partner_id, product_id, provider_offer_id, game_id,
          package_name, player_id, server_id, player_name,
          cost_price_usd, partner_price_usd, markup_usd, points_awarded, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PROCESSING')`,
        [
          orderId,
          partner.id,
          product.id,
          providerOfferId,
          product.gameCategoryId || 'game',
          product.arabicName || product.productName,
          cleanPlayerId,
          effectiveServerId,
          playerName ? String(playerName).trim() : null,
          pricing.supplierCostUsd,
          chargeAmountUsd,
          pricing.markupUsd,
          chargeAmountUsd // 1 USD = 1 Point
        ]
      );

      await client.query('COMMIT');
    } catch (debitErr: any) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: debitErr.message || 'فشل خصم الرصيد.' });
    } finally {
      client.release();
    }

    // 6. Dispatch to GamesDrop Provider
    const transactionId = `PARTNER-${orderId}`;
    let gdResponse: any;

    try {
      gdResponse = await gamesDropProvider.createOrder({
        offerId: providerOfferId,
        price: pricing.supplierCostUsd,
        transactionId,
        customer: {
          email: 'partner@kiropro.store',
          gameUserId: cleanPlayerId,
          ...(effectiveServerId ? { gameServerId: effectiveServerId } : {})
        }
      });
    } catch (gdErr: any) {
      console.error('[QuickBuy Execution] GamesDrop order failed:', gdErr.message);
      const friendlyError = mapGamesDropErrorMessage(gdErr.errorCode || gdErr.message);

      // Automatic immediate refund on synchronous failure
      await partnerLedgerService.executeSafeOrderRefund({
        orderId,
        partnerId: partner.id,
        refundAmountUsd: chargeAmountUsd,
        reason: friendlyError || 'فشل إرسال الطلب لمزود الخدمة وتم رد الرصيد تلقائياً.',
        actorId: partner.userId,
        actorType: 'SYSTEM'
      });

      return res.status(502).json({
        error: friendlyError || 'تعذر استكمال الشحن من المزود، وتمت إعادة الرصيد إلى محفظتك بالكامل.',
        refunded: true
      });
    }

    // 7. Update order with provider response
    const rawStatus = gdResponse.status;
    const mappedStatus = mapGamesDropStatus(rawStatus);
    const providerOrderId = gdResponse.order_id || gdResponse.orderId || null;
    const fulfillmentKey = gdResponse.key || null;

    if (mappedStatus === 'COMPLETED') {
      await pool.query(
        `UPDATE partner_orders 
         SET status = 'COMPLETED',
             provider_order_id = $1,
             provider_status = $2,
             fulfillment_key = $3,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [providerOrderId, rawStatus, fulfillmentKey, orderId]
      );

      // Award points and check promotion
      partnerService.awardPointsAndCheckPromotion(partner.id, chargeAmountUsd).catch(() => {});
    } else if (mappedStatus === 'PROCESSING') {
      await pool.query(
        `UPDATE partner_orders 
         SET status = 'PROCESSING',
             provider_order_id = $1,
             provider_status = $2
         WHERE id = $3`,
        [providerOrderId, rawStatus, orderId]
      );
    } else {
      // Failed upstream
      await partnerLedgerService.executeSafeOrderRefund({
        orderId,
        partnerId: partner.id,
        refundAmountUsd: chargeAmountUsd,
        reason: gdResponse.message || `Provider returned status: ${rawStatus}`,
        actorId: partner.userId,
        actorType: 'SYSTEM'
      });

      return res.status(502).json({
        error: 'فشل الشحن لدى المزود وتمت إعادة الرصيد فورياً إلى محفظتك.',
        refunded: true
      });
    }

    // Fetch updated balance
    const updatedWallet = await pool.query(
      'SELECT balance FROM partner_wallets WHERE partner_id = $1',
      [partner.id]
    );

    res.json({
      success: true,
      message: mappedStatus === 'COMPLETED' 
        ? 'تم الشحن بنجاح واكتمل الطلب فوراً! 🎉' 
        : 'تم إرسال الطلب بنجاح وهو قيد التنفيذ التلقائي.',
      orderId,
      order: {
        id: orderId,
        orderNumber: orderId.slice(0, 8).toUpperCase(),
        productName: product.arabicName || product.productName,
        amountUsd: chargeAmountUsd,
        status: mappedStatus
      },
      status: mappedStatus,
      fulfillmentKey,
      newBalance: Number(updatedWallet.rows[0]?.balance || 0)
    });
  } catch (err: any) {
    console.error('[QuickBuy] Fatal error:', err);
    res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع أثناء معالجة الشحن.' });
  }
});

// ==========================================
// 7. GET PARTNER ORDERS
// ==========================================
router.get('/orders', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = req.query.status as string;

  try {
    const values: any[] = [partnerId, limit, offset];
    let statusFilter = '';
    if (status && status !== 'ALL') {
      statusFilter = 'AND o.status = $4';
      values.push(status);
    }

    const query = `
      SELECT 
        o.id, o.game_id as "gameId", o.package_name as "packageName",
        o.player_id as "playerId", o.server_id as "serverId",
        o.partner_price_usd as "amountUsd",
        o.points_awarded as "pointsAwarded",
        o.status, o.fulfillment_key as "fulfillmentKey",
        o.failure_reason as "failureReason",
        o.created_at as "createdAt",
        o.completed_at as "completedAt"
      FROM partner_orders o
      WHERE o.partner_id = $1
      ${statusFilter}
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as count 
      FROM partner_orders o 
      WHERE o.partner_id = $1 
      ${statusFilter}
    `;

    const countValues = status && status !== 'ALL' ? [partnerId, status] : [partnerId];

    const [ordersRes, countRes] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, countValues)
    ]);

    res.json({
      total: parseInt(countRes.rows[0].count, 10),
      items: ordersRes.rows
    });
  } catch (err: any) {
    console.error('[Partner/orders] Error:', err);
    res.status(500).json({ error: 'فشل جلب سجل الطلبات.' });
  }
});

// ==========================================
// 8. GET PARTNER LEDGER
// ==========================================
router.get('/ledger', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  if (!partnerId) return res.status(401).json({ error: 'غير مصرح.' });

  try {
    const history = await partnerLedgerService.getHistory({
      partnerId,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
      type: req.query.type as string
    });

    res.json(history);
  } catch (err: any) {
    console.error('[Partner/ledger] Error:', err);
    res.status(500).json({ error: 'فشل جلب سجل العمليات المالية.' });
  }
});

// ==========================================
// 9. GET EXCHANGE RATE & PAYMENT METHODS
// ==========================================
router.get('/exchange-rate', async (_req: Request, res: Response) => {
  try {
    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 3500, base_currency: 'USD', quote_currency: 'SDG' };
    res.json({
      rate: Number(rateConfig.rate) || 3500,
      baseCurrency: rateConfig.base_currency || 'USD',
      quoteCurrency: rateConfig.quote_currency || 'SDG',
      minDepositUsd: Number(rateConfig.min_topup) || 1,
      maxDepositUsd: Number(rateConfig.max_topup) || 1000
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب سعر الصرف.' });
  }
});

router.get('/payment-methods', async (_req: Request, res: Response) => {
  try {
    const methodsRes = await pool.query(
      `SELECT id, name, type, currency, account_name, account_number, bank_name, instructions
       FROM payment_methods 
       WHERE enabled = true 
       ORDER BY display_order ASC`
    );
    res.json(methodsRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طرق الدفع.' });
  }
});

// ==========================================
// 10. SUBMIT DEPOSIT REQUEST (PERMANENT DB RECEIPT STORAGE)
// ==========================================
router.post('/deposits', requirePartner, (req: PartnerAuthRequest, res: Response) => {
  upload.single('receipt')(req, res, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الملف كبير جداً، الحد الأقصى المسموح به هو 5 ميغابايت.' });
      }
      return res.status(400).json({ error: 'نوع الملف غير مدعوم. الصيغ المقبولة هي JPG, PNG, WEBP, PDF فقط.' });
    }

    const partnerId = req.partner?.id;
    if (!partnerId) return res.status(401).json({ error: 'غير مصرح.' });

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'يرجى رفع صورة إشعار التحويل المالي (Receipt).' });
    }

    // Verify magic bytes
    if (!isValidBufferSignature(file.buffer, file.mimetype)) {
      return res.status(400).json({ error: 'محتوى الملف غير صالح أو تالف.' });
    }

    const { amountUsd, paymentMethodId, notes } = req.body;
    const numAmountUsd = Number(amountUsd);

    if (!numAmountUsd || isNaN(numAmountUsd) || numAmountUsd <= 0) {
      return res.status(400).json({ error: 'يرجى إدخال مبلغ إيداع صحيح بالدولار.' });
    }

    try {
      // 1. Fetch current exchange rate
      const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
      const rateConfig = rateSettingRes.rows[0]?.value || { rate: 3500 };
      const exchangeRate = Number(rateConfig.rate) || 3500;

      const amountLocal = Math.round(numAmountUsd * exchangeRate);
      const receiptBase64 = file.buffer.toString('base64');
      const depositId = uuidv4();

      // 2. Insert into partner_deposits with permanent DB receipt storage
      await pool.query(
        `INSERT INTO partner_deposits (
          id, partner_id, amount_usd, exchange_rate, amount_local,
          currency_local, payment_method_id, receipt_filename,
          receipt_mime_type, receipt_data_base64, receipt_file_size,
          status, partner_notes
        ) VALUES ($1, $2, $3, $4, $5, 'SDG', $6, $7, $8, $9, $10, 'PENDING', $11)`,
        [
          depositId,
          partnerId,
          numAmountUsd,
          exchangeRate,
          amountLocal,
          paymentMethodId || null,
          file.originalname || `receipt-${depositId}.jpg`,
          file.mimetype,
          receiptBase64,
          file.size,
          notes ? String(notes).trim() : null
        ]
      );

      res.json({
        success: true,
        message: 'تم إرسال طلب الإيداع بنجاح، وستتم مراجعته وإضافة الرصيد فوراً.',
        depositId,
        amountUsd: numAmountUsd,
        amountLocal,
        exchangeRate
      });
    } catch (dbErr: any) {
      console.error('[Partner/deposits] Error:', dbErr);
      res.status(500).json({ error: 'فشل حفظ طلب الإيداع.' });
    }
  });
});

// ==========================================
// 11. GET PARTNER DEPOSITS HISTORY
// ==========================================
router.get('/deposits', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  try {
    const depositsRes = await pool.query(
      `SELECT 
        d.id, d.amount_usd as "amountUsd", d.exchange_rate as "exchangeRate",
        d.amount_local as "amountLocal", d.currency_local as "currencyLocal",
        d.status, d.rejection_reason as "rejectionReason",
        d.created_at as "createdAt", d.reviewed_at as "reviewedAt",
        pm.name as "paymentMethodName"
       FROM partner_deposits d
       LEFT JOIN payment_methods pm ON d.payment_method_id = pm.id
       WHERE d.partner_id = $1
       ORDER BY d.created_at DESC`,
      [partnerId]
    );
    res.json(depositsRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب سجل الإيداعات.' });
  }
});

// ==========================================
// 12. VIEW DEPOSIT RECEIPT (PERMANENT DB STREAMING)
// ==========================================
router.get('/deposits/:id/receipt', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const { id } = req.params;
  const partnerId = req.partner?.id;
  const isAdmin = req.user?.role === 'ADMIN';

  try {
    const query = isAdmin
      ? 'SELECT receipt_mime_type, receipt_data_base64, receipt_filename FROM partner_deposits WHERE id = $1'
      : 'SELECT receipt_mime_type, receipt_data_base64, receipt_filename FROM partner_deposits WHERE id = $1 AND partner_id = $2';

    const params = isAdmin ? [id] : [id, partnerId];
    const receiptRes = await pool.query(query, params);

    if (receiptRes.rows.length === 0) {
      return res.status(404).json({ error: 'الإيصال غير موجود أو غير مصرح بعرضه.' });
    }

    const { receipt_mime_type, receipt_data_base64 } = receiptRes.rows[0];
    const buffer = Buffer.from(receipt_data_base64, 'base64');

    res.setHeader('Content-Type', receipt_mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل استرجاع صورة الإيصال.' });
  }
});

// ==========================================
// 13. LOGOUT
// ==========================================
router.post('/logout', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  try {
    if (req.user?.sessionId) {
      await closeSession(req.user.sessionId);
    }
  } catch {}

  res.clearCookie('token', getAuthCookieOptions());
  res.clearCookie('partner_token', getAuthCookieOptions());
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح.' });
});

// ==========================================
// 14. KIROPRO CARD (MASTERCARD VIRTUAL) FOR PARTNERS
// ==========================================

const cardIssueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لطلبات إصدار البطاقات. يرجى الانتظار قليلاً.' }
});

// 14.1 GET Card Summary, Stock & Partner Price
router.get('/kiropro-cards/info', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  if (!partnerId) {
    return res.status(403).json({ error: 'حساب الشريك غير متوفر.' });
  }

  try {
    const info = await partnerService.getPartnerCardInfo(partnerId);
    res.json(info);
  } catch (err: any) {
    console.error('[Partner] Error fetching card info:', err.message);
    res.status(500).json({ error: err.message || 'فشل جلب بيانات بطاقة KiroPro Card.' });
  }
});

// 14.2 POST Issue KiroPro Card (Atomic with SELECT FOR UPDATE SKIP LOCKED & Idempotency)
router.post('/kiropro-cards/issue', requirePartner, cardIssueLimiter, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  const partnerUserId = req.user?.id;

  if (!partnerId || !partnerUserId) {
    return res.status(403).json({ error: 'غير مصرح: حساب الشريك غير معتمد.' });
  }

  // Idempotency key from header or body
  const headerKey = req.headers['x-idempotency-key'] as string | undefined;
  const idempotencyKey = (headerKey || req.body?.idempotencyKey || '').trim() || undefined;

  try {
    const result = await partnerService.issueKiroProCard({
      partnerId,
      partnerUserId,
      idempotencyKey
    });

    res.status(200).json({
      success: true,
      message: result.message || 'تم إصدار بطاقة KiroPro Card بنجاح.',
      order: result.order,
      isDuplicate: result.isDuplicate || false
    });
  } catch (err: any) {
    // Note: Do not log sensitive user or card data
    console.error('[Partner] Card issuance failed:', err.message);
    res.status(400).json({ error: err.message || 'فشل إصدار البطاقة.' });
  }
});

// 14.3 GET My Issued Cards List
router.get('/kiropro-cards/my-cards', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  if (!partnerId) {
    return res.status(403).json({ error: 'حساب الشريك غير متوفر.' });
  }

  try {
    const cards = await partnerService.getPartnerIssuedCards(partnerId);
    res.json(cards);
  } catch (err: any) {
    console.error('[Partner] Error fetching partner cards:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة البطاقات المصدرة.' });
  }
});

// 14.4 GET Card Credentials (Strict Ownership & IDOR Protection - NEVER LOGS PAN/CVV)
router.get('/kiropro-cards/:cardId/credentials', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  const partnerUserId = req.user?.id;
  const cardId = typeof req.params.cardId === 'string' ? req.params.cardId : '';

  if (!partnerId || !partnerUserId || !cardId) {
    return res.status(403).json({ error: 'غير مصرح بعرض البطاقة.' });
  }

  try {
    const credentials = await partnerService.getPartnerCardCredentials(partnerId, partnerUserId, cardId);
    res.json(credentials);
  } catch (err: any) {
    console.error('[Partner] Card credentials fetch failed:', err.message);
    res.status(403).json({ error: err.message || 'غير مصرح لك بعرض بيانات هذه البطاقة.' });
  }
});

// 14.5 GET Order Credentials (For Digital Accounts or KiroPro Card - Strict IDOR Protection)
router.get('/orders/:orderId/credentials', requirePartner, async (req: PartnerAuthRequest, res: Response) => {
  const partnerId = req.partner?.id;
  const partnerUserId = req.user?.id;
  const orderId = String(req.params.orderId);

  if (!partnerId || !orderId) {
    return res.status(403).json({ error: 'غير مصرح.' });
  }

  try {
    const orderRes = await pool.query(
      `SELECT id, partner_id, game_id as "gameId", product_id as "productId", package_name as "packageName"
       FROM partner_orders 
       WHERE id = $1 AND partner_id = $2`,
      [orderId, partnerId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'الطلب غير موجود أو غير مصرح لك بعرض بياناته.' });
    }

    const order = orderRes.rows[0];

    // If KiroPro Card
    if (order.gameId === 'KIROPRO_CARD') {
      const cardRes = await pool.query(
        `SELECT id FROM kiropro_cards_inventory WHERE partner_order_id = $1 LIMIT 1`,
        [orderId]
      );
      if (cardRes.rows.length === 0) {
        return res.status(404).json({ error: 'لا توجد بطاقة مرتبطة بهذا الطلب.' });
      }
      const creds = await partnerService.getPartnerCardCredentials(partnerId, partnerUserId || '', cardRes.rows[0].id);
      return res.json({
        success: true,
        type: 'KIROPRO_CARD',
        card: creds
      });
    }

    // If Digital Account
    if (order.gameId === 'DIGITAL_ACCOUNT') {
      const data = await partnerService.getPartnerOrderDigitalAccounts(partnerId, orderId);
      return res.json({
        success: true,
        type: 'DIGITAL_ACCOUNT',
        accounts: data.accounts
      });
    }

    res.json({
      success: true,
      type: 'STANDARD',
      message: 'هذا الطلب شحن مباشر ولا يحتوي على حسابات أو بطاقات قابلة للكشف.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'فشل جلب بيانات الاعتماد للطلب.' });
  }
});

export default router;
