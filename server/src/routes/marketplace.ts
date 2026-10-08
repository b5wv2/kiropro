import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { banCheckMiddleware } from '../middlewares/banCheckMiddleware';
import { getContactChannels } from './admin';

const router = Router();

// =========================================================================
// 1. STORAGE & DIRECTORY INITIALIZATION
// =========================================================================
const UPLOADS_MARKETPLACE_DIR = path.resolve(__dirname, '../../uploads/marketplace');
if (!fs.existsSync(UPLOADS_MARKETPLACE_DIR)) {
  fs.mkdirSync(UPLOADS_MARKETPLACE_DIR, { recursive: true });
}

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per image
const MAX_IMAGES_COUNT = 10;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_MARKETPLACE_DIR);
  },
  filename: (_req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `mkt_${Date.now()}_${randomHex}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES, // 10 MB per image
    files: MAX_IMAGES_COUNT
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('صيغة الصورة غير مدعومة. يسمح فقط بصيغ JPG, JPEG, PNG, WEBP.'));
    }
  }
});

// Helper: Magic byte signature validation
function isValidImageSignature(filePath: string, ext: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return false;

    const cleanExt = ext.toLowerCase();
    if (cleanExt === '.jpg' || cleanExt === '.jpeg') {
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    if (cleanExt === '.png') {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    }
    if (cleanExt === '.webp') {
      return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    }
    return false;
  } catch {
    return false;
  }
}

// Multer error handling wrapper
function uploadImagesMiddleware(req: Request, res: Response, next: NextFunction) {
  upload.array('images', MAX_IMAGES_COUNT)(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الصورة يجب ألا يتجاوز 10 MB.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'الحد الأقصى للصور هو 10 صور فقط لكل إعلان.' });
      }
      return res.status(400).json({ error: `خطأ في رفع الملفات: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'فشل رفع الصور.' });
    }
    next();
  });
}

// =========================================================================
// 2. CONFIG & METADATA HELPERS
// =========================================================================
export interface MarketplaceSettings {
  fee_15_days: number;
  fee_30_days: number;
  currency: string;
  max_images: number;
  max_image_size_mb: number;
  enabled: boolean;
}

export const DEFAULT_MARKETPLACE_SETTINGS: MarketplaceSettings = {
  fee_15_days: 1500,
  fee_30_days: 2500,
  currency: 'SDG',
  max_images: 10,
  max_image_size_mb: 10,
  enabled: true
};

export async function getMarketplaceSettings(): Promise<MarketplaceSettings> {
  try {
    const res = await pool.query(
      "SELECT value FROM platform_settings WHERE key = 'account_marketplace_settings' LIMIT 1"
    );
    if (res.rows.length > 0 && res.rows[0].value) {
      return {
        ...DEFAULT_MARKETPLACE_SETTINGS,
        ...res.rows[0].value
      };
    }
  } catch (err: any) {
    console.warn('[Marketplace] Settings load warning:', err.message);
  }
  return DEFAULT_MARKETPLACE_SETTINGS;
}

export const VALID_GAMES = ['PUBG_MOBILE', 'FREE_FIRE'] as const;
export type ValidGame = typeof VALID_GAMES[number];

export const VALID_LEVELS = ['1-20', '21-40', '41-60', '61-80', '81-100', '100+'] as const;

export const GAME_BINDINGS: Record<ValidGame, string[]> = {
  PUBG_MOBILE: ['Google', 'Facebook', 'Apple', 'Twitter/X', 'VK', 'أخرى'],
  FREE_FIRE: ['Google', 'Facebook', 'VK', 'Apple', 'Garena', 'أخرى']
};

export const GAME_LABELS: Record<ValidGame, string> = {
  PUBG_MOBILE: 'ببجي موبايل (PUBG Mobile)',
  FREE_FIRE: 'فري فاير (Free Fire)'
};

// Helper to generate unique public code
async function generateUniquePublicCode(game: ValidGame, client: any = pool): Promise<string> {
  const prefix = game === 'PUBG_MOBILE' ? 'KPR-PUB' : 'KPR-FF';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous 0,O,1,I

  for (let attempt = 0; attempt < 10; attempt++) {
    let rand = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      const byteVal = bytes[i] ?? 0;
      rand += chars.charAt(byteVal % chars.length);
    }
    const code = `${prefix}-${rand}`;
    const check = await client.query('SELECT id FROM account_listings WHERE public_code = $1 LIMIT 1', [code]);
    if (check.rows.length === 0) {
      return code;
    }
  }
  return `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

// Background auto-expire helper
async function autoExpireListings() {
  try {
    await pool.query(
      `UPDATE account_listings
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE status = 'PUBLISHED' AND expires_at <= NOW()`
    );
  } catch (err: any) {
    console.warn('[Marketplace] Auto-expire error:', err.message);
  }
}

// =========================================================================
// 3. PUBLIC ENDPOINTS
// =========================================================================

/**
 * GET /api/marketplace/settings
 * Public marketplace configuration and game categories
 */
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getMarketplaceSettings();
    const contactChannels = await getContactChannels();
    const primaryWhatsapp = contactChannels.find(c => c.id === 'whatsapp' && c.enabled) || null;

    res.json({
      settings,
      games: [
        {
          id: 'PUBG_MOBILE',
          name: 'PUBG Mobile',
          titleArabic: 'ببجي موبايل',
          bindings: GAME_BINDINGS.PUBG_MOBILE,
          levels: VALID_LEVELS
        },
        {
          id: 'FREE_FIRE',
          name: 'Free Fire',
          titleArabic: 'فري فاير',
          bindings: GAME_BINDINGS.FREE_FIRE,
          levels: VALID_LEVELS
        }
      ],
      primaryWhatsapp: primaryWhatsapp ? {
        url: primaryWhatsapp.url,
        title: primaryWhatsapp.title
      } : null,
      disclaimer: 'رسوم النشر هي رسوم لإتاحة عرض الإعلان لفترة محددة، ولا تعني ضمان بيع الحساب. يتم التواصل والاستفسار عبر إدارة المنصة.'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إعدادات سوق الحسابات.' });
  }
});

/**
 * GET /api/marketplace/listings
 * Public listings feed with filtering & pagination
 */
router.get('/listings', async (req: Request, res: Response) => {
  try {
    await autoExpireListings();

    const {
      game,
      level,
      binding,
      minPrice,
      maxPrice,
      negotiable,
      sort = 'LATEST',
      page = 1,
      limit = 20,
      search
    } = req.query;

    const conditions: string[] = ["al.status = 'PUBLISHED'", "al.expires_at > NOW()"];
    const values: any[] = [];
    let pIdx = 1;

    if (game && typeof game === 'string' && VALID_GAMES.includes(game.toUpperCase() as ValidGame)) {
      conditions.push(`al.game = $${pIdx++}`);
      values.push(game.toUpperCase());
    }

    if (level && typeof level === 'string' && VALID_LEVELS.includes(level as any)) {
      conditions.push(`al.account_level = $${pIdx++}`);
      values.push(level);
    }

    if (binding && typeof binding === 'string' && binding.trim()) {
      conditions.push(`al.binding_type = $${pIdx++}`);
      values.push(binding.trim());
    }

    if (negotiable !== undefined && negotiable !== '') {
      conditions.push(`al.is_negotiable = $${pIdx++}`);
      values.push(negotiable === 'true' || negotiable === '1');
    }

    const parsedMinPrice = parseFloat(String(minPrice));
    if (!isNaN(parsedMinPrice) && parsedMinPrice > 0) {
      conditions.push(`al.price >= $${pIdx++}`);
      values.push(parsedMinPrice);
    }

    const parsedMaxPrice = parseFloat(String(maxPrice));
    if (!isNaN(parsedMaxPrice) && parsedMaxPrice > 0) {
      conditions.push(`al.price <= $${pIdx++}`);
      values.push(parsedMaxPrice);
    }

    if (search && typeof search === 'string' && search.trim()) {
      conditions.push(`(al.title ILIKE $${pIdx} OR al.public_code ILIKE $${pIdx})`);
      values.push(`%${search.trim()}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'al.published_at DESC';
    switch (sort) {
      case 'PRICE_ASC':
        orderBy = 'al.price ASC, al.published_at DESC';
        break;
      case 'PRICE_DESC':
        orderBy = 'al.price DESC, al.published_at DESC';
        break;
      case 'LEVEL_DESC':
        orderBy = 'al.account_level DESC, al.published_at DESC';
        break;
      case 'LATEST':
      default:
        orderBy = 'al.published_at DESC';
        break;
    }

    const pageNum = Math.max(1, parseInt(String(page)) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit)) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Total count query
    const countQuery = `SELECT COUNT(*) as total FROM account_listings al ${whereClause}`;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].total || '0', 10);

    // Items query - STRICT PRIVACY: NEVER SELECT seller_whatsapp!
    const itemsQuery = `
      SELECT 
        al.id,
        al.public_code,
        al.slug,
        al.game,
        al.title,
        al.price,
        al.price_currency,
        al.is_negotiable,
        al.account_level,
        al.binding_type,
        al.starts_at,
        al.expires_at,
        al.published_at,
        al.created_at,
        (
          SELECT img.image_url 
          FROM account_listing_images img 
          WHERE img.listing_id = al.id 
          ORDER BY img.is_primary DESC, img.sort_order ASC 
          LIMIT 1
        ) as primary_image,
        (
          SELECT COUNT(*) 
          FROM account_listing_images img 
          WHERE img.listing_id = al.id
        )::int as total_images
      FROM account_listings al
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    values.push(limitNum, offset);
    const itemsRes = await pool.query(itemsQuery, values);

    res.json({
      listings: itemsRes.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err: any) {
    console.error('[Marketplace] Listings fetch error:', err.message);
    res.status(500).json({ error: 'فشل تحميل قائمة الإعلانات.' });
  }
});

/**
 * GET /api/marketplace/listings/:code
 * Public single listing details by public_code or slug
 */
router.get('/listings/:code', async (req: Request, res: Response) => {
  try {
    await autoExpireListings();
    const { code } = req.params;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'كود الإعلان غير صالح.' });
    }

    // STRICT PRIVACY: NEVER SELECT seller_whatsapp!
    const listingRes = await pool.query(
      `SELECT 
        al.id,
        al.public_code,
        al.slug,
        al.game,
        al.title,
        al.price,
        al.price_currency,
        al.is_negotiable,
        al.account_level,
        al.binding_type,
        al.description,
        al.notes,
        al.status,
        al.duration_days,
        al.starts_at,
        al.expires_at,
        al.published_at,
        al.created_at
      FROM account_listings al
      WHERE (al.public_code = $1 OR al.slug = $1)
      LIMIT 1`,
      [code.toUpperCase()]
    );

    if (listingRes.rows.length === 0) {
      return res.status(404).json({ error: 'الإعلان غير موجود.' });
    }

    const listing = listingRes.rows[0];

    // Only allow public viewing if published and not expired
    if (listing.status !== 'PUBLISHED' || (listing.expires_at && new Date(listing.expires_at) <= new Date())) {
      return res.status(404).json({ error: 'هذا الإعلان غير متاح حالياً أو انتهت فترة عرضه.' });
    }

    // Fetch images ordered by sort_order
    const imagesRes = await pool.query(
      `SELECT id, image_url, is_primary, sort_order 
       FROM account_listing_images 
       WHERE listing_id = $1 
       ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
      [listing.id]
    );

    // Fetch platform admin WhatsApp to format official contact message
    const contactChannels = await getContactChannels();
    const primaryWhatsapp = contactChannels.find(c => c.id === 'whatsapp' && c.enabled) || contactChannels.find(c => c.id === 'whatsapp') || null;

    let whatsappContactUrl = '';
    const rawUrl = primaryWhatsapp?.url || 'https://wa.me/249900000000';
    const simpleGame = listing.game === 'PUBG_MOBILE' ? 'PUBG Mobile' : 'Free Fire';
    const negotiableText = listing.is_negotiable ? 'نعم' : 'لا';
    const priceText = `${Number(listing.price).toLocaleString()} SDG`;

    const prefilledMessage =
      `السلام عليكم، أرغب في شراء الحساب رقم ${listing.public_code}.\n` +
      `اللعبة: ${simpleGame}\n` +
      `السعر: ${priceText}\n` +
      `السعر قابل للتفاوض: ${negotiableText}`;

    const firstPart = rawUrl.split('?')[0] || '';
    const cleanBaseUrl = firstPart.replace(/\/+$/, '');
    if (cleanBaseUrl) {
      whatsappContactUrl = `${cleanBaseUrl}?text=${encodeURIComponent(prefilledMessage)}`;
    }

    res.json({
      listing: {
        ...listing,
        images: imagesRes.rows,
        whatsappContactUrl
      }
    });
  } catch (err: any) {
    console.error('[Marketplace] Listing detail error:', err.message);
    res.status(500).json({ error: 'فشل جلب تفاصيل الإعلان.' });
  }
});

// =========================================================================
// 4. AUTHENTICATED SELLER ACTIONS
// =========================================================================

/**
 * POST /api/marketplace/pay-fee
 * Atomically deducts listing fee from user wallet and generates an unconsumed payment record.
 * Required BEFORE listing creation or form access.
 */
router.post('/pay-fee', requireAuth, banCheckMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { durationDays } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  }

  const duration = parseInt(String(durationDays), 10);
  if (duration !== 15 && duration !== 30) {
    return res.status(400).json({ error: 'مدة الإعلان يجب أن تكون 15 أو 30 يوماً فقط.' });
  }

  const settings = await getMarketplaceSettings();
  if (!settings.enabled) {
    return res.status(400).json({ error: 'خدمة سوق الحسابات معطلة حالياً للصيانة.' });
  }

  // Authoritative fee from backend settings - NEVER trust frontend price!
  const requiredFee = duration === 15 ? settings.fee_15_days : settings.fee_30_days;
  const currency = settings.currency || 'SDG';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock user's wallet FOR UPDATE
    const walletRes = await client.query(
      'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
      [userId]
    );

    if (walletRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'المحفظة غير موجودة.' });
    }

    const wallet = walletRes.rows[0];
    const currentBalance = Number(wallet.balance || 0);

    if (currentBalance < requiredFee) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `رصيدك الحالي (${currentBalance.toLocaleString()} ${currency}) غير كافٍ لدفع رسوم الإعلان (${requiredFee.toLocaleString()} ${currency}). يرجى شحن المحفظة أولاً.`,
        requiredFee,
        currentBalance
      });
    }

    const newBalance = currentBalance - requiredFee;

    // 2. Update wallet balance
    await client.query(
      'UPDATE "Wallet" SET balance = $1, "updatedAt" = NOW() WHERE id = $2',
      [newBalance, wallet.id]
    );

    // 3. Create unconsumed payment record
    const paymentRes = await client.query(
      `INSERT INTO account_listing_payments (
        user_id, wallet_id, duration_days, amount, currency,
        payment_method, status, payment_type, is_consumed
      ) VALUES ($1, $2, $3, $4, $5, 'WALLET', 'PAID', 'NEW_LISTING', false)
      RETURNING id, duration_days, amount, currency, paid_at`,
      [userId, wallet.id, duration, requiredFee, currency]
    );
    const payment = paymentRes.rows[0];

    // 4. Record WalletTransaction
    const txDescription = `رسوم نشر إعلان حساب في سوق الحسابات (${duration} يوم)`;
    await client.query(
      `INSERT INTO "WalletTransaction" (
        "walletId", amount, type, description, currency,
        "balanceBefore", "balanceAfter", "referenceType", "referenceId",
        "createdBy", "created_by_type"
      ) VALUES ($1, $2, 'PURCHASE', $3, $4, $5, $6, 'ACCOUNT_MARKETPLACE', $7, $8, 'USER')`,
      [
        wallet.id,
        requiredFee,
        txDescription,
        currency,
        currentBalance,
        newBalance,
        payment.id,
        userId
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'تم دفع رسوم نشر الإعلان بنجاح. يمكنك الآن تعبئة بيانات الحساب.',
      paymentId: payment.id,
      durationDays: payment.duration_days,
      amount: payment.amount,
      currency: payment.currency,
      paidAt: payment.paid_at,
      newBalance
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Marketplace] Fee payment error:', err.message);
    res.status(500).json({ error: 'فشل إتمام عملية الدفع. يرجى المحاولة لاحقاً.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/marketplace/upload-images
 * Uploads 1 to 10 images with strict validation (10 MB per image).
 * Saves to disk and permanently persists to UploadedAsset table.
 */
router.post('/upload-images', requireAuth, banCheckMiddleware, uploadImagesMiddleware, async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'لم يتم إرفاق أي صور.' });
  }

  const uploadedResults: Array<{
    storageKey: string;
    imageUrl: string;
    fileSize: number;
    mimeType: string;
  }> = [];

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!isValidImageSignature(file.path, ext)) {
      try { fs.unlinkSync(file.path); } catch { }
      return res.status(400).json({ error: `الملف ${file.originalname} تالف أو ليس صورة صالحة.` });
    }

    const storageKey = file.filename;
    const imageUrl = `/uploads/marketplace/${storageKey}`;

    // Persist permanently into UploadedAsset PostgreSQL table
    try {
      const fileBuffer = fs.readFileSync(file.path);
      const base64 = fileBuffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';
      await pool.query(
        `INSERT INTO "UploadedAsset" ("id", "filename", "mimeType", "dataBase64", "fileSize", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT ("filename") DO UPDATE SET
           "dataBase64" = EXCLUDED."dataBase64",
           "fileSize" = EXCLUDED."fileSize",
           "mimeType" = EXCLUDED."mimeType",
           "updatedAt" = NOW()`,
        [storageKey, storageKey, mimeType, base64, file.size]
      );
    } catch (assetErr: any) {
      console.warn('[Marketplace] Asset DB persistence warning:', assetErr.message);
    }

    uploadedResults.push({
      storageKey,
      imageUrl,
      fileSize: file.size,
      mimeType: file.mimetype
    });
  }

  res.json({
    success: true,
    images: uploadedResults
  });
});

/**
 * POST /api/marketplace/listings
 * Creates listing after verifying paymentId.
 * Validates fields, sets PENDING_REVIEW, consumes paymentId idempotently.
 */
router.post('/listings', requireAuth, banCheckMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const {
    paymentId,
    game,
    title,
    price,
    isNegotiable = false,
    accountLevel,
    bindingType,
    description,
    notes,
    sellerWhatsapp,
    images
  } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  }

  // 1. Basic validation
  if (!paymentId || typeof paymentId !== 'string') {
    return res.status(400).json({ error: 'معرّف الدفع مطلوب. لا يمكن نشر إعلان بدون دفع الرسوم أولاً.' });
  }

  if (!game || !VALID_GAMES.includes(game.toUpperCase())) {
    return res.status(400).json({ error: 'يرجى اختيار لعبة صحيحة (ببجي موبايل أو فري فاير).' });
  }
  const cleanGame = game.toUpperCase() as ValidGame;

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return res.status(400).json({ error: 'عنوان الإعلان يجب أن يكون 3 أحرف على الأقل.' });
  }

  const parsedPrice = parseFloat(String(price));
  if (isNaN(parsedPrice) || !isFinite(parsedPrice) || parsedPrice <= 0) {
    return res.status(400).json({ error: 'يرجى إدخال سعر صالح وأكبر من الصفر.' });
  }

  if (!accountLevel || !VALID_LEVELS.includes(accountLevel)) {
    return res.status(400).json({ error: 'يرجى اختيار مستوى حساب صالح من القائمة.' });
  }

  const validBindings = GAME_BINDINGS[cleanGame];
  if (!bindingType || typeof bindingType !== 'string' || !validBindings.includes(bindingType.trim())) {
    return res.status(400).json({ error: 'يرجى اختيار نوع ربط صالح للعبة المختارة.' });
  }

  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    return res.status(400).json({ error: 'يرجى كتابة وصف تفصيلي للحساب (10 أحرف على الأقل).' });
  }

  // Seller WhatsApp: Required and internal-only
  if (!sellerWhatsapp || typeof sellerWhatsapp !== 'string' || sellerWhatsapp.trim().replace(/\D/g, '').length < 8) {
    return res.status(400).json({ error: 'يرجى إدخال رقم واتساب صحيح للبائع (للتواصل الإداري الداخلي فقط).' });
  }

  if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES_COUNT) {
    return res.status(400).json({ error: `يجب إرفاق صورة واحدة على الأقل وبحد أقصى ${MAX_IMAGES_COUNT} صور.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Lock & Verify paymentId
    const payRes = await client.query(
      `SELECT * FROM account_listing_payments 
       WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [paymentId, userId]
    );

    if (payRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'عملية الدفع غير موجودة أو لا تخص هذا الحساب.' });
    }

    const payment = payRes.rows[0];

    if (payment.status !== 'PAID') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'حالة الدفع غير مكتملة. لا يمكن إنشاء الإعلان.' });
    }

    if (payment.is_consumed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'تم استخدام عملية الدفع هذه مسبقاً لإنشاء إعلان آخر.' });
    }

    // 3. Generate Unique Public Code & Slug
    const publicCode = await generateUniquePublicCode(cleanGame, client);
    const slug = `${cleanGame.toLowerCase()}-${publicCode.toLowerCase()}`;

    // 4. Insert into account_listings
    const listingRes = await client.query(
      `INSERT INTO account_listings (
        public_code, slug, seller_user_id, game, title,
        price, price_currency, is_negotiable, account_level,
        binding_type, description, notes, seller_whatsapp,
        status, duration_days, listing_fee
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        'PENDING_REVIEW', $14, $15
      ) RETURNING id, public_code, slug, status, created_at`,
      [
        publicCode,
        slug,
        userId,
        cleanGame,
        title.trim(),
        parsedPrice,
        payment.currency,
        Boolean(isNegotiable),
        accountLevel,
        bindingType.trim(),
        description.trim(),
        notes ? String(notes).trim() : null,
        sellerWhatsapp.trim(),
        payment.duration_days,
        payment.amount
      ]
    );

    const newListing = listingRes.rows[0];

    // 5. Insert images
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const isPrimary = i === 0 || Boolean(img.isPrimary);
      const sortOrder = Number(img.sortOrder) || i;
      const storageKey = String(img.storageKey || path.basename(img.imageUrl));
      const imageUrl = String(img.imageUrl || `/uploads/marketplace/${storageKey}`);
      const fileSize = Number(img.fileSize) || 0;
      const mimeType = String(img.mimeType || 'image/jpeg');

      await client.query(
        `INSERT INTO account_listing_images (
          listing_id, image_url, storage_key, is_primary, sort_order, file_size, mime_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newListing.id, imageUrl, storageKey, isPrimary, sortOrder, fileSize, mimeType]
      );
    }

    // 6. Mark payment as consumed and link to listing
    await client.query(
      `UPDATE account_listing_payments 
       SET is_consumed = true, listing_id = $1, updated_at = NOW() 
       WHERE id = $2`,
      [newListing.id, payment.id]
    );

    // 7. Log lifecycle event
    await client.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, metadata, notes
      ) VALUES ($1, $2, 'USER', 'CREATED', NULL, 'PENDING_REVIEW', $3, 'تم إنشاء الإعلان وإرساله للمراجعة')`,
      [
        newListing.id,
        userId,
        JSON.stringify({ paymentId: payment.id, fee: payment.amount, duration: payment.duration_days })
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'تم إرسال إعلانك بنجاح للمراجعة! سيظهر في السوق فور موافقة الإدارة.',
      listing: {
        id: newListing.id,
        publicCode: newListing.public_code,
        slug: newListing.slug,
        status: newListing.status,
        createdAt: newListing.created_at
      }
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Marketplace] Listing creation error:', err.message);
    res.status(500).json({ error: 'فشل حفظ الإعلان. يرجى المحاولة لاحقاً.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/marketplace/my-listings
 * Returns seller's own listings with lifecycle stats
 */
router.get('/my-listings', requireAuth, banCheckMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  }

  try {
    await autoExpireListings();

    const result = await pool.query(
      `SELECT 
        al.id,
        al.public_code,
        al.slug,
        al.game,
        al.title,
        al.price,
        al.price_currency,
        al.is_negotiable,
        al.account_level,
        al.binding_type,
        al.status,
        al.duration_days,
        al.listing_fee,
        al.starts_at,
        al.expires_at,
        al.published_at,
        al.sold_at,
        al.rejection_reason,
        al.rejection_notes,
        al.cancellation_reason,
        al.created_at,
        CASE 
          WHEN al.status = 'PUBLISHED' AND al.expires_at > NOW() 
          THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (al.expires_at - NOW())) / 86400))::int
          ELSE 0
        END as days_remaining,
        (
          SELECT img.image_url 
          FROM account_listing_images img 
          WHERE img.listing_id = al.id 
          ORDER BY img.is_primary DESC, img.sort_order ASC 
          LIMIT 1
        ) as primary_image
       FROM account_listings al
       WHERE al.seller_user_id = $1
       ORDER BY al.created_at DESC`,
      [userId]
    );

    res.json({
      listings: result.rows
    });
  } catch (err: any) {
    console.error('[Marketplace] My listings error:', err.message);
    res.status(500).json({ error: 'فشل تحميل إعلاناتك.' });
  }
});

/**
 * POST /api/marketplace/listings/:id/mark-sold
 * Seller marks their listing as SOLD.
 * Immediately removed from public browsing.
 */
router.post('/listings/:id/mark-sold', requireAuth, banCheckMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  }

  try {
    const checkRes = await pool.query(
      'SELECT id, status, public_code FROM account_listings WHERE id = $1 AND seller_user_id = $2',
      [id, userId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'الإعلان غير موجود أو لا تملك صلاحية تعديله.' });
    }

    const listing = checkRes.rows[0];
    if (listing.status === 'SOLD') {
      return res.json({ success: true, message: 'الإعلان معلم كمباع بالفعل.' });
    }

    if (!['PUBLISHED', 'PENDING_REVIEW', 'EXPIRED'].includes(listing.status)) {
      return res.status(400).json({ error: `لا يمكن تعليم الإعلان كمباع وهو بالحالة: ${listing.status}` });
    }

    await pool.query(
      `UPDATE account_listings 
       SET status = 'SOLD', sold_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    await pool.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, notes
      ) VALUES ($1, $2, 'USER', 'STATUS_CHANGE', $3, 'SOLD', 'تم تعليم الحساب كمباع بواسطة البائع')`,
      [id, userId, listing.status]
    );

    res.json({
      success: true,
      message: 'تم تحديث حالة الإعلان إلى "تم البيع" بنجاح.'
    });
  } catch (err: any) {
    console.error('[Marketplace] Mark sold error:', err.message);
    res.status(500).json({ error: 'فشل تحديث حالة الإعلان.' });
  }
});

/**
 * POST /api/marketplace/listings/:id/renew
 * Seller renews an expired listing by paying renewal fee from wallet.
 * Extends the existing listing without duplication.
 */
router.post('/listings/:id/renew', requireAuth, banCheckMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  const { durationDays } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  }

  const duration = parseInt(String(durationDays), 10);
  if (duration !== 15 && duration !== 30) {
    return res.status(400).json({ error: 'مدة التجديد يجب أن تكون 15 أو 30 يوماً.' });
  }

  const settings = await getMarketplaceSettings();
  const fee = duration === 15 ? settings.fee_15_days : settings.fee_30_days;
  const currency = settings.currency || 'SDG';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock listing FOR UPDATE
    const listRes = await client.query(
      'SELECT * FROM account_listings WHERE id = $1 AND seller_user_id = $2 FOR UPDATE',
      [id, userId]
    );

    if (listRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الإعلان غير موجود أو لا تملك صلاحية تجديده.' });
    }

    const listing = listRes.rows[0];

    // 2. Lock user wallet FOR UPDATE
    const walletRes = await client.query(
      'SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
      [userId]
    );

    if (walletRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'المحفظة غير موجودة.' });
    }

    const wallet = walletRes.rows[0];
    const balanceBefore = Number(wallet.balance || 0);

    if (balanceBefore < fee) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `رصيدك الحالي (${balanceBefore.toLocaleString()} ${currency}) غير كافٍ لتجديد الإعلان (${fee.toLocaleString()} ${currency}).`,
        requiredFee: fee,
        balanceBefore
      });
    }

    const newBalance = balanceBefore - fee;

    // Deduct wallet
    await client.query(
      'UPDATE "Wallet" SET balance = $1, "updatedAt" = NOW() WHERE id = $2',
      [newBalance, wallet.id]
    );

    // Record payment
    const payRes = await client.query(
      `INSERT INTO account_listing_payments (
        listing_id, user_id, wallet_id, duration_days, amount, currency,
        payment_method, status, payment_type, is_consumed
      ) VALUES ($1, $2, $3, $4, $5, 'WALLET', 'PAID', 'RENEWAL', true)
      RETURNING id`,
      [listing.id, userId, wallet.id, duration, fee, currency]
    );
    const payment = payRes.rows[0];

    // Record WalletTransaction
    const txDescription = `تجديد إعلان حساب (${listing.public_code}) لمدة ${duration} يوم`;
    await client.query(
      `INSERT INTO "WalletTransaction" (
        "walletId", amount, type, description, currency,
        "balanceBefore", "balanceAfter", "referenceType", "referenceId",
        "createdBy", "created_by_type"
      ) VALUES ($1, $2, 'PURCHASE', $3, $4, $5, $6, 'ACCOUNT_MARKETPLACE', $7, $8, 'USER')`,
      [
        wallet.id,
        fee,
        txDescription,
        currency,
        balanceBefore,
        newBalance,
        payment.id,
        userId
      ]
    );

    // Update listing: extend from NOW() or from existing expires_at if still active
    const now = new Date();
    const currentExpiry = listing.expires_at ? new Date(listing.expires_at) : null;
    const baseDate = (currentExpiry && currentExpiry > now) ? currentExpiry : now;
    const newExpiry = new Date(baseDate.getTime() + duration * 24 * 60 * 60 * 1000);

    await client.query(
      `UPDATE account_listings 
       SET status = 'PUBLISHED',
           duration_days = $1,
           starts_at = COALESCE(starts_at, NOW()),
           expires_at = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [duration, newExpiry, listing.id]
    );

    // Log event
    await client.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, metadata, notes
      ) VALUES ($1, $2, 'USER', 'RENEWED', $3, 'PUBLISHED', $4, 'تم تجديد الإعلان بنجاح')`,
      [
        listing.id,
        userId,
        listing.status,
        JSON.stringify({ paymentId: payment.id, fee, duration, newExpiry })
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `تم تجديد الإعلان بنجاح لمدة ${duration} يوماً!`,
      expiresAt: newExpiry,
      newBalance
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Marketplace] Renewal error:', err.message);
    res.status(500).json({ error: 'فشل تجديد الإعلان.' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/marketplace/listings/:id
 * Seller edits allowed fields of their listing.
 * Sensitive edits return status to PENDING_REVIEW.
 */
router.put('/listings/:id', requireAuth, banCheckMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  const {
    title,
    price,
    isNegotiable,
    accountLevel,
    bindingType,
    description,
    notes,
    sellerWhatsapp,
    images
  } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT * FROM account_listings WHERE id = $1 AND seller_user_id = $2 FOR UPDATE',
      [id, userId]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الإعلان غير موجود أو لا تملك صلاحية تعديله.' });
    }

    const listing = checkRes.rows[0];

    if (['SOLD', 'CANCELLED', 'REFUNDED'].includes(listing.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `لا يمكن تعديل الإعلان وهو بالحالة: ${listing.status}` });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [id];
    let pIdx = 2;

    if (title && typeof title === 'string' && title.trim().length >= 3) {
      updates.push(`title = $${pIdx++}`);
      values.push(title.trim());
    }

    if (price !== undefined) {
      const parsedPrice = parseFloat(String(price));
      if (!isNaN(parsedPrice) && isFinite(parsedPrice) && parsedPrice > 0) {
        updates.push(`price = $${pIdx++}`);
        values.push(parsedPrice);
      }
    }

    if (isNegotiable !== undefined) {
      updates.push(`is_negotiable = $${pIdx++}`);
      values.push(Boolean(isNegotiable));
    }

    if (accountLevel && VALID_LEVELS.includes(accountLevel)) {
      updates.push(`account_level = $${pIdx++}`);
      values.push(accountLevel);
    }

    if (bindingType && typeof bindingType === 'string') {
      updates.push(`binding_type = $${pIdx++}`);
      values.push(bindingType.trim());
    }

    if (description && typeof description === 'string' && description.trim().length >= 10) {
      updates.push(`description = $${pIdx++}`);
      values.push(description.trim());
    }

    if (notes !== undefined) {
      updates.push(`notes = $${pIdx++}`);
      values.push(notes ? String(notes).trim() : null);
    }

    if (sellerWhatsapp && typeof sellerWhatsapp === 'string' && sellerWhatsapp.trim().replace(/\D/g, '').length >= 8) {
      updates.push(`seller_whatsapp = $${pIdx++}`);
      values.push(sellerWhatsapp.trim());
    }

    // Sensitive change sends published ad back to PENDING_REVIEW
    let newStatus = listing.status;
    if (listing.status === 'PUBLISHED') {
      newStatus = 'PENDING_REVIEW';
      updates.push(`status = 'PENDING_REVIEW'`);
    }

    await client.query(
      `UPDATE account_listings SET ${updates.join(', ')} WHERE id = $1`,
      values
    );

    // Update images if provided
    if (Array.isArray(images) && images.length > 0 && images.length <= MAX_IMAGES_COUNT) {
      await client.query('DELETE FROM account_listing_images WHERE listing_id = $1', [id]);
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const isPrimary = i === 0 || Boolean(img.isPrimary);
        const sortOrder = Number(img.sortOrder) || i;
        const storageKey = String(img.storageKey || path.basename(img.imageUrl));
        const imageUrl = String(img.imageUrl || `/uploads/marketplace/${storageKey}`);
        const fileSize = Number(img.fileSize) || 0;
        const mimeType = String(img.mimeType || 'image/jpeg');

        await client.query(
          `INSERT INTO account_listing_images (
            listing_id, image_url, storage_key, is_primary, sort_order, file_size, mime_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, imageUrl, storageKey, isPrimary, sortOrder, fileSize, mimeType]
        );
      }
    }

    await client.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, notes
      ) VALUES ($1, $2, 'USER', 'EDITED', $3, $4, 'تم تعديل بيانات الإعلان')`,
      [id, userId, listing.status, newStatus]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: newStatus === 'PENDING_REVIEW' && listing.status === 'PUBLISHED'
        ? 'تم تحديث الإعلان وإعادته للمراجعة الإدارية لتأكيد التعديلات.'
        : 'تم حفظ التعديلات بنجاح.',
      status: newStatus
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Marketplace] Edit error:', err.message);
    res.status(500).json({ error: 'فشل حفظ تعديلات الإعلان.' });
  } finally {
    client.release();
  }
});

export default router;
