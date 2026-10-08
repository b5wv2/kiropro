import { Router, Request, Response } from 'express';
import pool from '../db';
import { requireAdmin, optionalAuth, AuthRequest } from '../middlewares/authMiddleware';
import { gamesDropProvider } from '../providers/gamesdrop';
import { validatePlayerAccount } from '../services/playerValidationService';
import { mapGamesDropErrorMessage } from '../providers/gamesdrop/mapper';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Configure local object storage upload for admin product images
const uploadsDir = path.resolve(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `prod_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('صيغة الصورة غير مدعومة. يسمح فقط بصيغ JPG, PNG, WEBP, SVG.'));
    }
  }
});

/**
 * Validates actual binary signature (magic bytes) to ensure file authenticity
 */
function isValidImageFileSignature(filePath: string, ext: string): boolean {
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
    if (cleanExt === '.svg') {
      const sample = fs.readFileSync(filePath, 'utf8').slice(0, 500).toLowerCase();
      return sample.includes('<svg') && !sample.includes('<script');
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * CUSTOMER ENDPOINT: GET /api/products
 * Reads strictly from local PostgreSQL database.
 * NEVER contacts GamesDrop during customer visits, login, or browsing.
 * Only returns products where isActive = true.
 * Completely sanitizes any upstream provider details.
 */
export const DEFAULT_PLACEHOLDER = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';

export function normalizeProductImageUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  let url = rawUrl.trim();

  const backendUrl = (process.env.BACKEND_URL || process.env.API_URL || '').trim().replace(/\/+$/, '');

  // Requirement 15: If database mistakenly stores kiropro.store/uploads/
  if (url.includes('kiropro.store/uploads/')) {
    url = url.replace(/https?:\/\/(www\.)?kiropro\.store/i, backendUrl || '');
  }

  // Requirement 6 & 14: Relative /uploads/ path expanded to BACKEND_URL if set
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    if (backendUrl) {
      return `${backendUrl}${cleanPath}`;
    }
    return cleanPath;
  }

  return url;
}

export const resolveImageUrl = (productImg?: string | null, categoryImg?: string | null): string => {
  const normProduct = normalizeProductImageUrl(productImg);
  if (normProduct) return normProduct;

  const normCategory = normalizeProductImageUrl(categoryImg);
  if (normCategory) return normCategory;

  return DEFAULT_PLACEHOLDER;
};

/**
 * CUSTOMER ENDPOINT: GET /api/products
 * Reads strictly from local PostgreSQL database.
 * NEVER contacts GamesDrop during customer visits, login, or browsing.
 * Only returns products where isActive = true.
 * Resolves images according to strict hierarchy: Product Image -> Category Image -> Default Placeholder.
 * Completely sanitizes any upstream provider details.
 */
async function getProviderOrdersEnabledMap(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try {
    const res = await pool.query('SELECT provider, orders_enabled FROM provider_settings');
    for (const r of res.rows) {
      map.set(r.provider.toUpperCase(), Boolean(r.orders_enabled));
    }
  } catch {
    // If provider_settings table is not yet migrated, all providers default to enabled
  }
  return map;
}

router.get('/', async (req: Request, res: Response) => {
  // Public cache header: browser and proxies can cache for 15s, avoiding redundant requests
  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

  try {
    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 7600 };
    const exchangeRate = Number(rateConfig.rate) || 7600;

    let result;
    try {
      result = await pool.query(`
        SELECT 
          p.id, p."providerOfferId", p."productName", p."offerName", p.category,
          p."arabicName", p.description, p."subCategory", p."productType", p.fulfillment_type,
          p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
          p."primaryProvider", p."fallbackProvider", p."fallbackEnabled",
          p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
          p."gameCategoryId",
          c."imageUrl" as "categoryImageUrl",
          c."name" as "categoryName",
          c."arabicName" as "categoryArabicName",
          c.platform as "categoryPlatform",
          c.badge as "categoryBadge",
          c."deliveryTime" as "categoryDeliveryTime",
          c."idFieldLabel" as "categoryIdFieldLabel",
          c."idPlaceholder" as "categoryIdPlaceholder",
          COALESCE(dpa.available_count, kci.available_count, 0)::int as "availableStock"
        FROM "Product" p
        LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM digital_product_accounts
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) dpa ON p.id = dpa.product_id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM kiropro_cards_inventory
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) kci ON p.id = kci.product_id
        WHERE p."isActive" = true
        ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
      `);
    } catch {
      // Fallback query if migration 036 provider columns are not yet present in production DB
      result = await pool.query(`
        SELECT 
          p.id, p."providerOfferId", p."productName", p."offerName", p.category,
          p."arabicName", p.description, p."subCategory", p."productType", p.fulfillment_type,
          p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
          'GAMESDROP' as "primaryProvider", NULL as "fallbackProvider", false as "fallbackEnabled",
          p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
          p."gameCategoryId",
          c."imageUrl" as "categoryImageUrl",
          c."name" as "categoryName",
          c."arabicName" as "categoryArabicName",
          c.platform as "categoryPlatform",
          c.badge as "categoryBadge",
          c."deliveryTime" as "categoryDeliveryTime",
          c."idFieldLabel" as "categoryIdFieldLabel",
          c."idPlaceholder" as "categoryIdPlaceholder",
          COALESCE(dpa.available_count, kci.available_count, 0)::int as "availableStock"
        FROM "Product" p
        LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM digital_product_accounts
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) dpa ON p.id = dpa.product_id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM kiropro_cards_inventory
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) kci ON p.id = kci.product_id
        WHERE p."isActive" = true
        ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
      `);
    }

    // Fetch provider settings safely to calculate accurate real-time inStock
    const provOrdersEnabledMap = await getProviderOrdersEnabledMap();

    // Group items by curated game / category
    const groupedMap = new Map<string, any>();

    // Strict category resolver with 100% isolation for Free Fire
    const resolveCardCategory = (row: any): string | null => {
      const explicitCat = (row.gameCategoryId || '').trim();
      const text = `${row.productName || ''} ${row.offerName || ''}`.toLowerCase();

      // Telegram isolation: NEVER allow Telegram products into Free Fire or PUBG
      if (text.includes('telegram') || text.includes('stars') || text.includes('نجوم') || explicitCat.startsWith('telegram')) {
        if (text.includes('premium') || text.includes('بريميوم') || explicitCat === 'telegram-premium') {
          return 'telegram-premium';
        }
        return 'telegram-stars';
      }

      if (text.includes('likee') || explicitCat === 'likee') {
        return 'likee';
      }

      if (text.includes('blood strike') || text.includes('bloodstrike') || explicitCat.startsWith('blood-strike')) {
        if (text.includes('global') || text.includes('عالمي') || explicitCat === 'blood-strike-global') {
          return 'blood-strike-global';
        }
        return 'blood-strike-me';
      }

      if (text.includes('pubg') || explicitCat === 'pubg-mobile') {
        return 'pubg-mobile';
      }

      // Free Fire: ONLY match if explicitly marked as freefire-me or text explicitly contains freefire/free fire
      if (explicitCat === 'freefire-me' || text.includes('freefire') || text.includes('free fire')) {
        return 'freefire-me';
      }

      // If DB has another explicit category, use it
      if (explicitCat) {
        return explicitCat;
      }

      // Uncategorized / orphan product: NEVER dump into Free Fire!
      return null;
    };

    const defaultCovers: Record<string, string> = {
      'pubg-mobile': '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg',
      'freefire-me': '/uploads/products/prod_1789435947312_54dc7dd7.webp',
      'likee': '/uploads/products/prod_1790076515614_23d0ac5a.jpg',
      'telegram-stars': '/uploads/products/prod_1790076568074_2b5df6d4.jpg',
      'telegram-premium': '/uploads/products/prod_1790076822152_f1f36553.webp',
      'blood-strike-global': '/uploads/products/prod_1790076798846_db25c3b2.png',
      'blood-strike-me': '/uploads/products/prod_1790076811295_aea21c2a.png',
      'google-play-points': 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80'
    };

    const defaultNames: Record<string, string> = {
      'pubg-mobile': 'PUBG Mobile',
      'freefire-me': 'Free Fire (الشرق الأوسط)',
      'likee': 'لايكي (Likee)',
      'telegram-stars': 'نجوم تيليجرام (Telegram Stars)',
      'telegram-premium': 'اشتراكات تيليجرام بريميوم (Telegram Premium)',
      'blood-strike-global': 'Blood Strike — السيرفر العالمي',
      'blood-strike-me': 'Blood Strike — الشرق الأوسط',
      'google-play-points': 'حساب نقاط تشغيل / Google'
    };

    const defaultLabels: Record<string, { label: string; placeholder: string }> = {
      'pubg-mobile': { label: 'معرّف اللاعب (Player ID)', placeholder: 'أدخل معرّف اللاعب الخاص بك (Player ID)' },
      'freefire-me': { label: 'معرّف اللاعب (Player ID)', placeholder: 'أدخل معرّف اللاعب الخاص بك (Player ID)' },
      'likee': { label: 'معرف حساب Likee (Likee ID)', placeholder: 'أدخل معرّف حساب Likee الخاص بك' },
      'telegram-stars': { label: 'معرف تيليجرام أو اسم المستخدم (@username / User ID)', placeholder: 'أدخل @username أو معرّف تيليجرام الرقمي' },
      'telegram-premium': { label: 'معرف تيليجرام أو اسم المستخدم (@username)', placeholder: 'أدخل @username أو معرّف تيليجرام' },
      'blood-strike-global': { label: 'معرّف اللاعب (User ID)', placeholder: 'أدخل معرّف اللاعب الخاص بك (User ID)' },
      'blood-strike-me': { label: 'معرّف اللاعب (User ID)', placeholder: 'أدخل معرّف اللاعب الخاص بك (User ID)' },
      'google-play-points': { label: 'تسليم فوري ومباشر', placeholder: 'لا يلزم إدخال معرف - تسليم فوري' }
    };

    for (const row of result.rows) {
      const groupKey = resolveCardCategory(row);
      if (!groupKey) {
        // Skip uncategorized orphan products to protect store integrity
        continue;
      }

      // Hard Defense-In-Depth: Absolutely block non-FreeFire products from ever entering Free Fire
      if (groupKey === 'freefire-me') {
        const checkText = `${row.productName || ''} ${row.offerName || ''}`.toLowerCase();
        if (checkText.includes('telegram') || checkText.includes('star') || checkText.includes('likee') || checkText.includes('pubg') || checkText.includes('strike')) {
          console.warn(`[Products Route] Blocked contaminated product from Free Fire: ${row.id} - ${row.productName} / ${row.offerName}`);
          continue;
        }
      }

      const gameDisplayName = row.categoryArabicName || row.categoryName || defaultNames[groupKey] || row.productName;
      const gameCover = resolveImageUrl(row.categoryImageUrl || row.productImageUrl, defaultCovers[groupKey] || DEFAULT_PLACEHOLDER);

      const pkgPrice = Number(row.price || 0);
      const pkgPriceSdg = Math.round(pkgPrice * exchangeRate);

      let itemType = 'شحن ألعاب مباشر (Direct Top-Up)';
      let itemCategory = row.categoryPlatform || 'games';

      if (groupKey === 'likee') {
        itemType = 'شحن ماسات لايكي فوري (Likee Diamonds)';
        itemCategory = 'apps';
      } else if (groupKey === 'telegram-stars') {
        itemType = 'نجوم تيليجرام الرقمية (Telegram Stars)';
        itemCategory = 'digital';
      } else if (groupKey === 'telegram-premium') {
        itemType = 'اشتراك تيليجرام بريميوم الرسمي (Telegram Premium)';
        itemCategory = 'subscriptions';
      } else if (groupKey.startsWith('blood-strike')) {
        itemType = 'شحن ذهب بلود سترايك فوري (Blood Strike Gold)';
        itemCategory = 'games';
      } else if (groupKey === 'pubg-mobile') {
        itemType = 'شحن شدات ببجي مباشر (PUBG Mobile UC)';
        itemCategory = 'games';
      } else if (groupKey === 'freefire-me') {
        itemType = 'شحن جواهر فري فاير مباشر (Free Fire Diamonds)';
        itemCategory = 'games';
      } else if (groupKey === 'kiropro-card' || row.productType === 'VIRTUAL_CARD' || row.fulfillment_type === 'KIROPRO_CARD') {
        itemType = 'بطاقة ماستركارد افتراضية (KiroPro Virtual Card)';
        itemCategory = 'cards';
      } else if (groupKey === 'google-play-points' || row.productType === 'DIGITAL_ACCOUNT') {
        itemType = 'حساب نقاط تشغيل فوري (Google Account)';
        itemCategory = 'digital';
      }

      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          id: groupKey,
          name: gameDisplayName,
          category: itemCategory,
          badge: row.categoryBadge || 'تسليم فوري',
          deliveryTime: row.categoryDeliveryTime || 'تسليم فوري وتلقائي',
          minPrice: pkgPrice,
          minPriceSdg: pkgPriceSdg,
          currency: 'SDG',
          exchangeRate: exchangeRate,
          type: itemType,
          image: gameCover,
          popular: true,
          packages: [],
          idFieldLabel: row.categoryIdFieldLabel || defaultLabels[groupKey]?.label || 'معرّف اللاعب (Player ID)',
          idPlaceholder: row.categoryIdPlaceholder || defaultLabels[groupKey]?.placeholder || 'أدخل معرّف اللاعب الخاص بك (Player ID)'
        });
      }

      const card = groupedMap.get(groupKey);
      const resolvedPackageImage = resolveImageUrl(row.productImageUrl, row.categoryImageUrl);

      const isInventoryTracked = row.productType === 'DIGITAL_ACCOUNT' || row.productType === 'VIRTUAL_CARD' || row.fulfillment_type === 'KIROPRO_CARD';
      const availableStockCount = isInventoryTracked ? Number(row.availableStock || 0) : undefined;

      let hasOrderableProv = true;
      if (!isInventoryTracked) {
        const primName = (row.primaryProvider || 'GAMESDROP').toUpperCase();
        const primEnabled = provOrdersEnabledMap.get(primName) !== false;
        const fallName = row.fallbackProvider ? String(row.fallbackProvider).toUpperCase() : null;
        const fallEnabled = Boolean(row.fallbackEnabled && fallName && provOrdersEnabledMap.get(fallName) === true);
        hasOrderableProv = primEnabled || fallEnabled;
      }

      const inStockFlag = isInventoryTracked ? (Number(row.availableStock || 0) > 0) : (Boolean(row.inStock) && hasOrderableProv);

      card.packages.push({
        id: row.id,
        name: row.arabicName || row.offerName,
        englishName: row.offerName,
        arabicName: row.arabicName,
        description: row.description,
        subCategory: row.subCategory,
        productType: row.productType,
        imageUrl: resolvedPackageImage,
        price: pkgPrice,
        priceSdg: pkgPriceSdg,
        originalPrice: Math.round(pkgPrice * 1.2 * 100) / 100,
        originalPriceSdg: Math.round(pkgPriceSdg * 1.2),
        bestValue: card.packages.length === 0,
        requiresGameServerId: Boolean(row.requiresGameServerId),
        isRequiredGameServerId: Boolean(row.requiresGameServerId),
        availableStock: availableStockCount,
        inStock: inStockFlag
      });

      if (pkgPrice > 0 && (card.minPrice === 0 || pkgPrice < card.minPrice)) {
        card.minPrice = pkgPrice;
        card.minPriceSdg = pkgPriceSdg;
      }
    }

    res.json(Array.from(groupedMap.values()));
  } catch (err: any) {
    console.error('[Products Route] Failed to fetch customer products from local DB:', err.message);
    res.status(500).json({ error: 'تعذر جلب قائمة المنتجات حالياً. يرجى المحاولة لاحقاً.' });
  }
});

/**
 * CUSTOMER ENDPOINT: GET /api/products/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
  const { id } = req.params;

  try {
    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 7600 };
    const exchangeRate = Number(rateConfig.rate) || 7600;

    // Check if queried by category/game id
    const catCheck = await pool.query(
      `SELECT * FROM "GameCategory" WHERE "id" = $1 LIMIT 1`,
      [id]
    );

    if (catCheck.rows.length > 0) {
      const category = catCheck.rows[0];
      const targetCatId = category.id;

      let result;
      try {
        result = await pool.query(`
          SELECT 
            p.id, p."providerOfferId", p."productName", p."offerName", p.category,
            p."arabicName", p.description, p."subCategory", p."productType", p.fulfillment_type,
            p."platformCode", p."platformName", p."regionCode", p."regionName",
            p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
            p."primaryProvider", p."fallbackProvider", p."fallbackEnabled",
            p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
            c."imageUrl" as "categoryImageUrl",
            COALESCE(dpa.available_count, kci.available_count, 0)::int as "availableStock"
          FROM "Product" p
          LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
          LEFT JOIN (
            SELECT product_id, COUNT(*)::int as available_count
            FROM digital_product_accounts
            WHERE status = 'AVAILABLE'
            GROUP BY product_id
          ) dpa ON p.id = dpa.product_id
          LEFT JOIN (
            SELECT product_id, COUNT(*)::int as available_count
            FROM kiropro_cards_inventory
            WHERE status = 'AVAILABLE'
            GROUP BY product_id
          ) kci ON p.id = kci.product_id
          WHERE p."isActive" = true AND p."gameCategoryId" = $1
          ORDER BY p."displayOrder" ASC, p."productName" ASC
        `, [targetCatId]);
      } catch {
        result = await pool.query(`
          SELECT 
            p.id, p."providerOfferId", p."productName", p."offerName", p.category,
            p."arabicName", p.description, p."subCategory", p."productType", p.fulfillment_type,
            p."platformCode", p."platformName", p."regionCode", p."regionName",
            p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
            'GAMESDROP' as "primaryProvider", NULL as "fallbackProvider", false as "fallbackEnabled",
            p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
            c."imageUrl" as "categoryImageUrl",
            COALESCE(dpa.available_count, kci.available_count, 0)::int as "availableStock"
          FROM "Product" p
          LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
          LEFT JOIN (
            SELECT product_id, COUNT(*)::int as available_count
            FROM digital_product_accounts
            WHERE status = 'AVAILABLE'
            GROUP BY product_id
          ) dpa ON p.id = dpa.product_id
          LEFT JOIN (
            SELECT product_id, COUNT(*)::int as available_count
            FROM kiropro_cards_inventory
            WHERE status = 'AVAILABLE'
            GROUP BY product_id
          ) kci ON p.id = kci.product_id
          WHERE p."isActive" = true AND p."gameCategoryId" = $1
          ORDER BY p."displayOrder" ASC, p."productName" ASC
        `, [targetCatId]);
      }

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'اللعبة غير متاحة حالياً أو لا توجد باقات مفعلة.' });
      }

      const provOrdersEnabledMap = await getProviderOrdersEnabledMap();

      const categoryImageUrl = resolveImageUrl(category.imageUrl, DEFAULT_PLACEHOLDER);

      const packages = result.rows.map((row, idx) => {
        const pkgPrice = Number(row.price || 0);
        const pkgPriceSdg = Math.round(pkgPrice * exchangeRate);
        const isInventoryTracked = row.productType === 'DIGITAL_ACCOUNT' || row.productType === 'VIRTUAL_CARD' || row.fulfillment_type === 'KIROPRO_CARD';
        const availableStockCount = isInventoryTracked ? Number(row.availableStock || 0) : undefined;

        let hasOrderableProv = true;
        if (!isInventoryTracked) {
          const primName = (row.primaryProvider || 'GAMESDROP').toUpperCase();
          const primEnabled = provOrdersEnabledMap.get(primName) !== false;
          const fallName = row.fallbackProvider ? String(row.fallbackProvider).toUpperCase() : null;
          const fallEnabled = Boolean(row.fallbackEnabled && fallName && provOrdersEnabledMap.get(fallName) === true);
          hasOrderableProv = primEnabled || fallEnabled;
        }

        const inStockFlag = isInventoryTracked ? (Number(row.availableStock || 0) > 0) : (Boolean(row.inStock) && hasOrderableProv);

        return {
          id: row.id,
          name: row.arabicName || row.offerName,
          englishName: row.offerName,
          arabicName: row.arabicName,
          description: row.description,
          subCategory: row.subCategory,
          productType: row.productType,
          imageUrl: resolveImageUrl(row.productImageUrl, row.categoryImageUrl || categoryImageUrl),
          price: pkgPrice,
          priceSdg: pkgPriceSdg,
          originalPrice: Math.round(pkgPrice * 1.2 * 100) / 100,
          originalPriceSdg: Math.round(pkgPriceSdg * 1.2),
          bestValue: idx === 0,
          requiresGameServerId: Boolean(row.requiresGameServerId),
          isRequiredGameServerId: Boolean(row.requiresGameServerId),
          availableStock: availableStockCount,
          inStock: inStockFlag
        };
      });

      const validPrices = packages.map(p => p.price).filter(p => p > 0);
      const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
      const minPriceSdg = Math.round(minPrice * exchangeRate);

      return res.json({
        id: targetCatId,
        name: category.arabicName || category.name,
        category: category.platform || 'mobile',
        badge: category.badge || 'تسليم فوري',
        deliveryTime: category.deliveryTime || 'تسليم فوري وتلقائي',
        minPrice,
        minPriceSdg,
        currency: 'SDG',
        exchangeRate,
        type: 'شحن ألعاب مباشر (Direct Top-Up)',
        image: categoryImageUrl,
        popular: true,
        packages,
        idFieldLabel: category.idFieldLabel || 'معرّف اللاعب (User ID)',
        idPlaceholder: category.idPlaceholder || 'أدخل معرّف اللاعب الخاص بك (User ID)'
      });
    }

    // Otherwise query individual package by UUID or providerOfferId
    let singleRes;
    try {
      singleRes = await pool.query(`
        SELECT 
          p.id, p."providerOfferId", p."productName", p."offerName", p.category,
          p."arabicName", p.description, p."subCategory", p."productType",
          p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
          p."primaryProvider", p."fallbackProvider", p."fallbackEnabled",
          p."requiresGameUserId", p."requiresGameServerId",
          c."imageUrl" as "categoryImageUrl"
        FROM "Product" p
        LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
        WHERE (p."id"::text = $1 OR p."providerOfferId"::text = $1) AND p."isActive" = true
        LIMIT 1
      `, [id]);
    } catch {
      singleRes = await pool.query(`
        SELECT 
          p.id, p."providerOfferId", p."productName", p."offerName", p.category,
          p."arabicName", p.description, p."subCategory", p."productType",
          p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
          'GAMESDROP' as "primaryProvider", NULL as "fallbackProvider", false as "fallbackEnabled",
          p."requiresGameUserId", p."requiresGameServerId",
          c."imageUrl" as "categoryImageUrl"
        FROM "Product" p
        LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
        WHERE (p."id"::text = $1 OR p."providerOfferId"::text = $1) AND p."isActive" = true
        LIMIT 1
      `, [id]);
    }

    if (singleRes.rows.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود أو غير متاح حالياً.' });
    }

    const row = singleRes.rows[0];

    const provOrdersEnabledMap = await getProviderOrdersEnabledMap();

    const primName = (row.primaryProvider || 'GAMESDROP').toUpperCase();
    const primEnabled = provOrdersEnabledMap.get(primName) !== false;
    const fallName = row.fallbackProvider ? String(row.fallbackProvider).toUpperCase() : null;
    const fallEnabled = Boolean(row.fallbackEnabled && fallName && provOrdersEnabledMap.get(fallName) === true);
    const hasOrderableProv = primEnabled || fallEnabled;
    const finalInStock = Boolean(row.inStock) && hasOrderableProv;

    res.json({
      id: row.id,
      name: row.arabicName || row.offerName,
      englishName: row.offerName,
      arabicName: row.arabicName,
      description: row.description,
      subCategory: row.subCategory,
      productType: row.productType,
      imageUrl: resolveImageUrl(row.productImageUrl, row.categoryImageUrl),
      price: Number(row.price || 0),
      inStock: finalInStock,
      requiresGameUserId: row.requiresGameUserId,
      requiresGameServerId: row.requiresGameServerId,
      isRequiredGameServerId: row.requiresGameServerId
    });
  } catch (err: any) {
    console.error('[Products Route] Failed to fetch product details:', err.message);
    res.status(500).json({ error: 'حدث خطأ أثناء تحميل بيانات المنتج.' });
  }
});

/**
 * CUSTOMER ENDPOINT: POST /api/products/:id/validate-player
 * Real GamesDrop check-game-data integration.
 * Strictly rate-limited to 5 requests per 10 minutes per user/IP.
 * Never leaks provider credentials, IDs, or raw responses.
 */
router.post('/:id/validate-player', optionalAuth, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '');
  const { gameUserId, gameServerId } = req.body;

  if (!gameUserId || typeof gameUserId !== 'string' || !gameUserId.trim()) {
    return res.status(400).json({ valid: false, message: 'معرّف اللاعب مطلوب للتحقق.' });
  }

  // Client IP resolution (handling proxies/headers)
  const rawFwd = req.headers['x-forwarded-for'];
  const fwdIp = typeof rawFwd === 'string' ? rawFwd.split(',')[0]?.trim() : (Array.isArray(rawFwd) ? rawFwd[0]?.trim() : '');
  const clientIp: string = fwdIp || req.ip || '127.0.0.1';

  try {
    const result = await validatePlayerAccount({
      productId: id,
      gameUserId: gameUserId.trim(),
      gameServerId: gameServerId ? String(gameServerId).trim() : undefined,
      userId: req.user?.id,
      ip: clientIp
    });

    if (!result.valid && result.message?.includes('تم تجاوز الحد المسموح')) {
      return res.status(429).json({
        valid: false,
        error: result.message,
        message: result.message
      });
    }

    // Sanitized response for customer
    return res.json({
      valid: result.valid,
      playerName: result.playerName,
      telegramUserId: result.telegramUserId,
      message: result.message
    });
  } catch (err: any) {
    console.error('[Products Route] validate-player exception:', err.message);
    return res.status(500).json({
      valid: false,
      message: 'خدمة التحقق غير متاحة مؤقتًا. يرجى المحاولة لاحقاً.'
    });
  }
});

/**
 * CUSTOMER ENDPOINT: GET /api/products/:id/servers
 * Discovers available game servers for products requiring server selection.
 * STRICT SECURITY & PROVIDER GUARD:
 * ONLY calls GamesDrop /servers when requiresGameServerId === true.
 * If false, returns empty list immediately without contacting GamesDrop.
 */
router.get('/:id/servers', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const prodRes = await pool.query(
      `SELECT "providerOfferId", "requiresGameServerId" FROM "Product" WHERE (id::text = $1 OR "productId"::text = $1) LIMIT 1`,
      [id]
    );

    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود.' });
    }

    const prod = prodRes.rows[0];

    // CRITICAL: If product does not require game server ID, NEVER call GamesDrop /servers
    if (!prod.requiresGameServerId) {
      return res.json({ servers: [] });
    }

    const numericOfferId = Number(prod.providerOfferId);
    if (!numericOfferId || isNaN(numericOfferId)) {
      return res.json({ servers: [] });
    }

    const serversRecord = await gamesDropProvider.getServers(numericOfferId);

    // Map Record<string, string> to structured list
    const serversList = Object.entries(serversRecord || {}).map(([key, name]) => ({
      id: key,
      name: String(name)
    }));

    return res.json({ servers: serversList });
  } catch (err: any) {
    console.error('[Products Route] get servers error:', err.message);
    return res.json({ servers: [] });
  }
});

/**
 * =========================================================================
 * ADMIN CATEGORY ENDPOINTS (Category / Game Images Management)
 * =========================================================================
 */

/**
 * ADMIN: GET /api/products/admin/categories
 * Returns all game categories with counts of active products and category image URLs.
 */
router.get('/admin/categories', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c."arabicName", 
        c."imageUrl", 
        c.platform, 
        c.badge, 
        c."deliveryTime", 
        c."displayOrder", 
        c."isActive", 
        c."createdAt", 
        c."updatedAt",
        COUNT(p.id) FILTER (WHERE p."isActive" = true)::int as "activeProductCount",
        COUNT(p.id)::int as "totalProductCount"
      FROM "GameCategory" c
      LEFT JOIN "Product" p ON p."gameCategoryId" = c.id
      GROUP BY c.id
      ORDER BY c."displayOrder" ASC, c.name ASC
    `);
    const resolvedCategories = result.rows.map(cat => ({
      ...cat,
      imageUrl: cat.imageUrl ? resolveImageUrl(cat.imageUrl, null) : null
    }));
    res.json(resolvedCategories);
  } catch (err: any) {
    console.error('[Admin Categories] Failed to fetch categories:', err.message);
    res.status(500).json({ error: 'تعذر جلب قائمة الفئات والألعاب.' });
  }
});

/**
 * ADMIN: PATCH /api/products/admin/categories/:id
 * Updates category metadata, image URL, display order, or active status.
 */
router.patch('/admin/categories/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, arabicName, imageUrl, displayOrder, isActive } = req.body;

  try {
    const updates: string[] = ['"updatedAt" = NOW()'];
    const values: any[] = [id];
    let paramIdx = 2;

    if (name !== undefined) {
      updates.push(`"name" = $${paramIdx++}`);
      values.push(name);
    }
    if (arabicName !== undefined) {
      updates.push(`"arabicName" = $${paramIdx++}`);
      values.push(arabicName);
    }
    if (imageUrl !== undefined) {
      updates.push(`"imageUrl" = $${paramIdx++}`);
      values.push(imageUrl && imageUrl.trim() !== '' ? imageUrl.trim() : null);
    }
    if (displayOrder !== undefined) {
      updates.push(`"displayOrder" = $${paramIdx++}`);
      values.push(Number(displayOrder));
    }
    if (isActive !== undefined) {
      updates.push(`"isActive" = $${paramIdx++}`);
      values.push(Boolean(isActive));
    }

    const result = await pool.query(`
      UPDATE "GameCategory"
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'الفئة غير موجودة.' });
    }

    res.json({ success: true, category: result.rows[0], message: 'تم تحديث بيانات الفئة بنجاح.' });
  } catch (err: any) {
    console.error('[Admin Categories] Failed to update category:', err.message);
    res.status(500).json({ error: 'فشل تحديث بيانات الفئة.' });
  }
});

/**
 * ADMIN: POST /api/products/admin/categories/:id/upload-image
 * Uploads and sets category image, applying it instantly to all child products without specific images.
 */
router.post('/admin/categories/:id/upload-image', requireAdmin, upload.single('image'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم إرفاق أي صورة.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!isValidImageFileSignature(req.file.path, ext)) {
    try { fs.unlinkSync(req.file.path); } catch { }
    return res.status(400).json({ error: 'بصمة الصورة غير صالحة أو الملف تالف.' });
  }

  const relativeUrl = `/uploads/products/${req.file.filename}`;
  const backendUrl = (process.env.BACKEND_URL || process.env.API_URL || '').trim().replace(/\/+$/, '');
  const finalUrl = backendUrl ? `${backendUrl}${relativeUrl}` : relativeUrl;

  try {
    // 1. Permanently persist image file into PostgreSQL UploadedAsset table
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const base64 = fileBuffer.toString('base64');
      const mimeType = req.file.mimetype || 'image/jpeg';
      await pool.query(`
        INSERT INTO "UploadedAsset" ("id", "filename", "mimeType", "dataBase64", "fileSize", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT ("filename") DO UPDATE SET
          "dataBase64" = EXCLUDED."dataBase64",
          "fileSize" = EXCLUDED."fileSize",
          "mimeType" = EXCLUDED."mimeType",
          "updatedAt" = NOW()
      `, [req.file.filename, req.file.filename, mimeType, base64, req.file.size]);
    } catch (assetErr: any) {
      console.warn('[AssetPersistence] Failed to persist category image to DB:', assetErr.message);
    }

    const result = await pool.query(`
      UPDATE "GameCategory"
      SET "imageUrl" = $1, "updatedAt" = NOW()
      WHERE id = $2
      RETURNING *
    `, [relativeUrl, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'الفئة غير موجودة.' });
    }

    res.json({
      success: true,
      imageUrl: finalUrl,
      url: finalUrl,
      category: result.rows[0],
      message: 'تم رفع صورة الفئة بنجاح وتطبيقها على كافة باقات اللعبة.'
    });
  } catch (err: any) {
    console.error('[Admin Categories] Failed to upload category image:', err.message);
    res.status(500).json({ error: 'فشل حفظ صورة الفئة.' });
  }
});

/**
 * ADMIN: DELETE /api/products/admin/categories/:id/image
 * Removes category image (reverts to default placeholder).
 */
router.delete('/admin/categories/:id/image', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      UPDATE "GameCategory"
      SET "imageUrl" = NULL, "updatedAt" = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'الفئة غير موجودة.' });
    }

    res.json({
      success: true,
      category: result.rows[0],
      message: 'تمت إزالة صورة الفئة بنجاح، وسيتم استخدام الصورة الافتراضية.'
    });
  } catch (err: any) {
    console.error('[Admin Categories] Failed to delete category image:', err.message);
    res.status(500).json({ error: 'فشل حذف صورة الفئة.' });
  }
});

/**
 * =========================================================================
 * ADMIN ENDPOINTS (Product Management, Manual Price Sync & Image Upload)
 * =========================================================================
 */

/**
 * ADMIN: GET /api/admin/products
 * Lists all imported products with operational state, provider cost, and sale price.
 */
router.get('/admin/catalog', requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const search = (req.query.search as string || '').trim();
  const filterActive = req.query.active as string; // 'true' | 'false' | undefined
  const filterStatus = req.query.status as string; // 'all' | 'active' | 'inactive'
  const filterGameCategory = req.query.gameCategory as string; // 'pubg-mobile' | 'freefire-me' | ... | 'all'
  const providerFilter = (req.query.providerFilter as string || 'all').toLowerCase();
  const stockFilter = (req.query.stockFilter as string || 'all').toLowerCase();

  const offset = (page - 1) * limit;
  const whereClauses: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (search) {
    whereClauses.push(`(p."productName" ILIKE $${paramIdx} OR p."offerName" ILIKE $${paramIdx} OR p."providerOfferId"::text ILIKE $${paramIdx} OR p."platformName" ILIKE $${paramIdx} OR p."regionName" ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (filterActive === 'true' || filterStatus === 'active') {
    whereClauses.push(`p."isActive" = true`);
  } else if (filterActive === 'false' || filterStatus === 'inactive') {
    whereClauses.push(`p."isActive" = false`);
  }

  if (filterGameCategory && filterGameCategory !== 'all') {
    whereClauses.push(`p."gameCategoryId" = $${paramIdx}`);
    params.push(filterGameCategory);
    paramIdx++;
  }

  // Stock Filter
  if (stockFilter === 'in_stock') {
    whereClauses.push(`p."inStock" = true`);
  } else if (stockFilter === 'out_of_stock') {
    whereClauses.push(`p."inStock" = false`);
  }

  // Multi-Provider Filter (Rule #23)
  if (providerFilter === 'has_gamesdrop') {
    whereClauses.push(`EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true)`);
  } else if (providerFilter === 'has_g2bulk') {
    whereClauses.push(`EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true)`);
  } else if (providerFilter === 'both') {
    whereClauses.push(`EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true) AND EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true)`);
  } else if (providerFilter === 'gamesdrop_only') {
    whereClauses.push(`EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true) AND NOT EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true)`);
  } else if (providerFilter === 'g2bulk_only') {
    whereClauses.push(`EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true) AND NOT EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true)`);
  } else if (providerFilter === 'missing_provider') {
    whereClauses.push(`NOT EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm."isActive" = true)`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    const [countRes, statsRes, itemsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM "Product" p ${whereSql}`, params),
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "isActive" = true) as active,
          COUNT(*) FILTER (WHERE "isActive" = false) as inactive,
          COUNT(*) FILTER (WHERE "inStock" = false) as out_of_stock,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true)) as has_gamesdrop,
          COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true)) as has_g2bulk,
          COUNT(*) FILTER (WHERE 
            EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true)
            AND EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true)
          ) as both_providers,
          COUNT(*) FILTER (WHERE 
            EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true)
            AND NOT EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true)
          ) as gamesdrop_only,
          COUNT(*) FILTER (WHERE 
            EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'G2BULK' AND ppm."isActive" = true)
            AND NOT EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm.provider = 'GAMESDROP' AND ppm."isActive" = true)
          ) as g2bulk_only,
          COUNT(*) FILTER (WHERE 
            NOT EXISTS (SELECT 1 FROM product_provider_mappings ppm WHERE ppm."productId" = p.id AND ppm."isActive" = true)
          ) as missing_provider
        FROM "Product" p
      `),
      pool.query(`
        SELECT 
          p.id, p."provider", p."providerOfferId", p."productId", p."productName", p."offerName",
          p."category", p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."supplierCostUsd", p."gamesDropCostUsd", p."gamesDropAddedPercent", p."gamesDropFxRate",
          p."providerCostUsd", p."providerCurrency", p."customerPriceUsd", p."isActive",
          p."inStock", p."imageUrl", p."displayOrder", p."isFeatured", p."gameCategoryId",
          p."requiresGameUserId", p."requiresGameServerId", p."lastProviderSyncAt",
          p."primaryProvider", p."fallbackProvider", p."fallbackEnabled",
          p."createdAt", p."updatedAt"
        FROM "Product" p
        ${whereSql}
        ORDER BY p."isActive" DESC, p."displayOrder" ASC, p."productName" ASC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `, [...params, limit, offset])
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    const globalStats = statsRes.rows[0];

    // Batch query ALL provider mappings for the current page products (including active and inactive mappings)
    const pageProductIds = itemsRes.rows.map(p => p.id);
    const mappingsByProduct: Record<string, any[]> = {};
    if (pageProductIds.length > 0) {
      try {
        const mapRes = await pool.query(
          `SELECT id, "productId", "provider", "providerProductId", "providerCostUsd", "isPrimary", "isFallback", "isActive"
           FROM product_provider_mappings
           WHERE "productId" = ANY($1::uuid[])
           ORDER BY "isPrimary" DESC, "isFallback" ASC, "provider" ASC`,
          [pageProductIds]
        );
        for (const m of mapRes.rows) {
          const list = mappingsByProduct[m.productId] || [];
          list.push({
            id: m.id,
            provider: m.provider,
            providerProductId: m.providerProductId,
            costUsd: Number(m.providerCostUsd || 0),
            isPrimary: Boolean(m.isPrimary),
            isFallback: Boolean(m.isFallback),
            isActive: Boolean(m.isActive)
          });
          mappingsByProduct[m.productId] = list;
        }
      } catch (mErr: any) {
        console.warn('[Admin Catalog] Mappings lookup warning:', mErr.message);
      }
    }

    // Fetch provider settings to inform admin UI of orders_enabled state per provider
    let provSettingsMap: Record<string, boolean> = { GAMESDROP: true, G2BULK: false };
    try {
      const provSettingsRes = await pool.query('SELECT provider, orders_enabled FROM provider_settings');
      for (const r of provSettingsRes.rows) {
        provSettingsMap[r.provider.toUpperCase()] = Boolean(r.orders_enabled);
      }
    } catch {}

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      providerOrdersEnabled: provSettingsMap,
      stats: {
        totalCatalog: parseInt(globalStats.total, 10) || 0,
        activeCount: parseInt(globalStats.active, 10) || 0,
        inactiveCount: parseInt(globalStats.inactive, 10) || 0,
        outOfStockCount: parseInt(globalStats.out_of_stock, 10) || 0,
        hasGamesDropCount: parseInt(globalStats.has_gamesdrop, 10) || 0,
        hasG2BulkCount: parseInt(globalStats.has_g2bulk, 10) || 0,
        bothProvidersCount: parseInt(globalStats.both_providers, 10) || 0,
        gamesDropOnlyCount: parseInt(globalStats.gamesdrop_only, 10) || 0,
        g2BulkOnlyCount: parseInt(globalStats.g2bulk_only, 10) || 0,
        missingProviderCount: parseInt(globalStats.missing_provider, 10) || 0,
      },
      products: itemsRes.rows.map(p => {
        const prodMappings = mappingsByProduct[p.id] || [];
        const gdMapping = prodMappings.find(m => m.provider === 'GAMESDROP');
        const g2Mapping = prodMappings.find(m => m.provider === 'G2BULK');

        const gdCost: number | null = gdMapping
          ? gdMapping.costUsd
          : (p.gamesDropCostUsd !== null && p.gamesDropCostUsd !== undefined ? Number(p.gamesDropCostUsd) : (p.providerCostUsd !== null && p.providerCostUsd !== undefined ? Number(p.providerCostUsd) : null));

        const g2Cost: number | null = g2Mapping ? g2Mapping.costUsd : null;
        const customerPrice: number | null = p.customerPriceUsd !== null && p.customerPriceUsd !== undefined ? Number(p.customerPriceUsd) : null;

        const gdMargin: number | null = customerPrice !== null && gdCost !== null
          ? Number((customerPrice - gdCost).toFixed(2))
          : null;

        const g2Margin: number | null = customerPrice !== null && g2Cost !== null
          ? Number((customerPrice - g2Cost).toFixed(2))
          : null;

        let lowestProvider: 'GAMESDROP' | 'G2BULK' | 'SAME' | null = null;
        let lowestCostUsd: number | null = null;

        if (gdCost !== null && g2Cost !== null) {
          if (gdCost < g2Cost) {
            lowestProvider = 'GAMESDROP';
            lowestCostUsd = gdCost;
          } else if (g2Cost < gdCost) {
            lowestProvider = 'G2BULK';
            lowestCostUsd = g2Cost;
          } else {
            lowestProvider = 'SAME';
            lowestCostUsd = gdCost;
          }
        } else if (gdCost !== null) {
          lowestProvider = 'GAMESDROP';
          lowestCostUsd = gdCost;
        } else if (g2Cost !== null) {
          lowestProvider = 'G2BULK';
          lowestCostUsd = g2Cost;
        }

        return {
          ...p,
          primaryProvider: p.primaryProvider || (gdMapping?.isPrimary ? 'GAMESDROP' : (g2Mapping?.isPrimary ? 'G2BULK' : 'GAMESDROP')),
          fallbackProvider: p.fallbackProvider || (gdMapping?.isFallback ? 'GAMESDROP' : (g2Mapping?.isFallback ? 'G2BULK' : null)),
          fallbackEnabled: Boolean(p.fallbackEnabled),
          providerMappings: prodMappings,
          hasGamesDrop: Boolean(gdMapping && gdMapping.isActive),
          hasG2Bulk: Boolean(g2Mapping && g2Mapping.isActive),
          gamesDropCostUsd: gdCost,
          g2BulkCostUsd: g2Cost,
          customerPriceUsd: customerPrice,
          gamesDropMarginUsd: gdMargin,
          g2BulkMarginUsd: g2Margin,
          lowestProvider,
          lowestCostUsd,
          imageUrl: p.imageUrl ? resolveImageUrl(p.imageUrl, null) : null
        };
      })
    });
  } catch (err: any) {
    console.error('[Admin Catalog] Error:', err);
    res.status(500).json({ error: 'Failed to fetch admin catalog' });
  }
});

/**
 * ADMIN: PATCH /api/admin/products/:id
 * Updates operational fields: customer sale price, active status, image, display name, routing, and provider mappings.
 */
router.patch('/admin/products/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    customerPriceUsd,
    isActive,
    imageUrl,
    productName,
    offerName,
    displayOrder,
    isFeatured,
    arabicName,
    description,
    subCategory,
    productType,
    primaryProvider,
    fallbackProvider,
    fallbackEnabled,
    inStock,
    providerMappings
  } = req.body;

  try {
    // REQUIREMENT 4: Prevent selecting a provider as primary or fallback if its global orders_enabled is false
    if (primaryProvider) {
      const normPrimary = String(primaryProvider).toUpperCase();
      const provCheck = await pool.query('SELECT orders_enabled FROM provider_settings WHERE UPPER(provider) = $1', [normPrimary]);
      if (provCheck.rows.length > 0 && !provCheck.rows[0].orders_enabled) {
        return res.status(400).json({
          error: `لا يمكن تعيين المزود (${normPrimary}) كمزود أساسي لأن استقبال الطلبات معطل له حالياً من صفحة المزودين.`
        });
      }
    }

    if (fallbackEnabled && fallbackProvider) {
      const normFallback = String(fallbackProvider).toUpperCase();
      const provCheck = await pool.query('SELECT orders_enabled FROM provider_settings WHERE UPPER(provider) = $1', [normFallback]);
      if (provCheck.rows.length > 0 && !provCheck.rows[0].orders_enabled) {
        return res.status(400).json({
          error: `لا يمكن تعيين المزود (${normFallback}) كمزود احتياطي لأن استقبال الطلبات معطل له حالياً من صفحة المزودين.`
        });
      }
    }

    const updates: string[] = ['"updatedAt" = NOW()'];
    const values: any[] = [id];
    let paramIdx = 2;

    if (customerPriceUsd !== undefined) {
      updates.push(`"customerPriceUsd" = $${paramIdx++}`);
      values.push(customerPriceUsd !== null && customerPriceUsd !== '' ? Number(customerPriceUsd) : null);
    }
    if (isActive !== undefined) {
      updates.push(`"isActive" = $${paramIdx++}`);
      values.push(Boolean(isActive));
    }
    if (inStock !== undefined) {
      updates.push(`"inStock" = $${paramIdx++}`);
      values.push(Boolean(inStock));
    }
    if (imageUrl !== undefined) {
      updates.push(`"imageUrl" = $${paramIdx++}`);
      values.push(imageUrl);
    }
    if (productName !== undefined) {
      updates.push(`"productName" = $${paramIdx++}`);
      values.push(productName);
    }
    if (offerName !== undefined) {
      updates.push(`"offerName" = $${paramIdx++}`);
      values.push(offerName);
    }
    if (displayOrder !== undefined) {
      updates.push(`"displayOrder" = $${paramIdx++}`);
      values.push(Number(displayOrder));
    }
    if (isFeatured !== undefined) {
      updates.push(`"isFeatured" = $${paramIdx++}`);
      values.push(Boolean(isFeatured));
    }
    if (arabicName !== undefined) {
      updates.push(`"arabicName" = $${paramIdx++}`);
      values.push(arabicName);
    }
    if (description !== undefined) {
      updates.push(`"description" = $${paramIdx++}`);
      values.push(description);
    }
    if (subCategory !== undefined) {
      updates.push(`"subCategory" = $${paramIdx++}`);
      values.push(subCategory);
    }
    if (productType !== undefined) {
      updates.push(`"productType" = $${paramIdx++}`);
      values.push(productType);
    }
    if (primaryProvider !== undefined) {
      updates.push(`"primaryProvider" = $${paramIdx++}`);
      values.push(String(primaryProvider).toUpperCase());
    }
    if (fallbackProvider !== undefined) {
      updates.push(`"fallbackProvider" = $${paramIdx++}`);
      values.push(fallbackProvider ? String(fallbackProvider).toUpperCase() : null);
    }
    if (fallbackEnabled !== undefined) {
      updates.push(`"fallbackEnabled" = $${paramIdx++}`);
      values.push(Boolean(fallbackEnabled));
    }

    const query = `
      UPDATE "Product" 
      SET ${updates.join(', ')} 
      WHERE id = $1 
      RETURNING *
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Synchronize product_provider_mappings if routing changed
    if (primaryProvider !== undefined || fallbackProvider !== undefined || fallbackEnabled !== undefined) {
      try {
        if (primaryProvider) {
          const normPrimary = String(primaryProvider).toUpperCase();
          await pool.query(`UPDATE product_provider_mappings SET "isPrimary" = false WHERE "productId" = $1`, [id]);
          await pool.query(`UPDATE product_provider_mappings SET "isPrimary" = true, "isFallback" = false WHERE "productId" = $1 AND UPPER("provider") = $2`, [id, normPrimary]);
        }

        if (fallbackEnabled !== undefined || fallbackProvider !== undefined) {
          await pool.query(`UPDATE product_provider_mappings SET "isFallback" = false WHERE "productId" = $1`, [id]);
          if (fallbackEnabled && fallbackProvider) {
            const normFallback = String(fallbackProvider).toUpperCase();
            await pool.query(`UPDATE product_provider_mappings SET "isFallback" = true, "isPrimary" = false WHERE "productId" = $1 AND UPPER("provider") = $2`, [id, normFallback]);
          }
        }
      } catch (ppmErr: any) {
        console.warn('[Admin Product Update] Mapping update warning:', ppmErr.message);
      }
    }

    // Synchronize individual provider active status if provided in providerMappings array
    if (Array.isArray(providerMappings) && providerMappings.length > 0) {
      try {
        for (const pm of providerMappings) {
          if (pm.provider && pm.isActive !== undefined) {
            await pool.query(
              `UPDATE product_provider_mappings 
               SET "isActive" = $1, "updatedAt" = NOW() 
               WHERE "productId" = $2 AND UPPER("provider") = $3`,
              [Boolean(pm.isActive), id, String(pm.provider).toUpperCase()]
            );
          }
        }
      } catch (pmsErr: any) {
        console.warn('[Admin Product Update] Mapping isActive update warning:', pmsErr.message);
      }
    }

    res.json({ message: 'Product updated successfully', product: result.rows[0] });
  } catch (err: any) {
    console.error('[Admin Product Update] Error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});


/**
 * ADMIN: POST /api/admin/products/:id/toggle-active
 */
router.post('/admin/products/:id/toggle-active', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      UPDATE "Product"
      SET "isActive" = NOT "isActive", "updatedAt" = NOW()
      WHERE id = $1
      RETURNING id, "isActive", "productName", "offerName"
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      message: `Product ${result.rows[0].isActive ? 'activated' : 'deactivated'}`,
      product: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle product status' });
  }
});

/**
 * ADMIN: POST /api/admin/products/sync-prices
 * Manual provider price sync initiated by Admin.
 * Updates providerCostUsd and lastProviderSyncAt.
 * CRITICAL RULE: DOES NOT modify customerPriceUsd!
 */
router.post('/admin/products/sync-prices', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { scope = 'ACTIVE_PRODUCTS', productIds } = req.body;
  const adminId = req.user?.id;
  const adminEmail = req.user?.email || 'Admin';

  const startTime = Date.now();
  console.log(`[Admin Price Sync] Started by ${adminEmail}. Scope: ${scope}`);

  try {
    let targetProducts: any[] = [];

    if (scope === 'SELECTED' && Array.isArray(productIds) && productIds.length > 0) {
      const res = await pool.query(`SELECT id, "providerOfferId", "productName", "offerName" FROM "Product" WHERE id = ANY($1::uuid[])`, [productIds]);
      targetProducts = res.rows;
    } else {
      // Default: ACTIVE_PRODUCTS
      const res = await pool.query(`SELECT id, "providerOfferId", "productName", "offerName" FROM "Product" WHERE "isActive" = true`);
      targetProducts = res.rows;
    }

    if (targetProducts.length === 0) {
      return res.json({
        message: 'No matching products to sync.',
        updatedCount: 0,
        errors: []
      });
    }

    let updatedCount = 0;
    const errors: string[] = [];

    for (const prod of targetProducts) {
      try {
        const offer = await gamesDropProvider.findOffer(prod.providerOfferId);
        const gdCost = Number(offer.price);
        const supplierCost = offer.priceBreakdown?.providerPrice !== undefined
          ? Number(offer.priceBreakdown.providerPrice)
          : gdCost;
        const addedPercent = Number(offer.priceBreakdown?.addedPercent || 0);
        const fxRate = Number(offer.priceBreakdown?.fxRate || 1);
        const currency = offer.currency || 'USD';

        await pool.query(`
          UPDATE "Product"
          SET "gamesDropCostUsd" = $1,
              "supplierCostUsd" = $2,
              "gamesDropAddedPercent" = $3,
              "gamesDropFxRate" = $4,
              "providerCostUsd" = $1,
              "providerCurrency" = $5,
              "lastProviderSyncAt" = NOW(),
              "updatedAt" = NOW()
          WHERE id = $6
        `, [gdCost, supplierCost, addedPercent, fxRate, currency, prod.id]);

        updatedCount++;
      } catch (prodErr: any) {
        errors.push(`Offer ${prod.providerOfferId} (${prod.productName}): ${prodErr.message}`);
      }
    }

    // Record in AuditLog
    await pool.query(`
      INSERT INTO "AuditLog" (id, "adminId", action, reason)
      VALUES ($1, $2, 'PRODUCT_PRICE_SYNC', $3)
    `, [
      uuidv4(),
      adminId,
      `Price sync completed for ${updatedCount} products. Errors: ${errors.length}. Duration: ${Date.now() - startTime}ms`
    ]);

    res.json({
      success: true,
      message: `تم تحديث تكلفة المزود لـ ${updatedCount} منتج بنجاح بدون تعديل أسعار البيع للعملاء.`,
      updatedCount,
      errorsCount: errors.length,
      errors
    });
  } catch (err: any) {
    console.error('[Admin Price Sync] Error:', err);
    res.status(500).json({ error: 'Failed to execute price sync: ' + err.message });
  }
});

/**
 * ADMIN: POST /api/admin/products/upload-image
 * Validates and stores product images safely on disk.
 */
router.post('/admin/products/upload-image', requireAdmin, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم إرفاق أي صورة.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!isValidImageFileSignature(req.file.path, ext)) {
    try { fs.unlinkSync(req.file.path); } catch { }
    return res.status(400).json({ error: 'بصمة الصورة غير صالحة أو الملف تالف.' });
  }

  // Permanently persist image file into PostgreSQL UploadedAsset table
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64 = fileBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';
    await pool.query(`
      INSERT INTO "UploadedAsset" ("id", "filename", "mimeType", "dataBase64", "fileSize", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT ("filename") DO UPDATE SET
        "dataBase64" = EXCLUDED."dataBase64",
        "fileSize" = EXCLUDED."fileSize",
        "mimeType" = EXCLUDED."mimeType",
        "updatedAt" = NOW()
    `, [req.file.filename, req.file.filename, mimeType, base64, req.file.size]);
  } catch (assetErr: any) {
    console.warn('[AssetPersistence] Failed to persist product image to DB:', assetErr.message);
  }

  const relativeUrl = `/uploads/products/${req.file.filename}`;
  const backendUrl = (process.env.BACKEND_URL || process.env.API_URL || '').trim().replace(/\/+$/, '');
  const finalUrl = backendUrl ? `${backendUrl}${relativeUrl}` : relativeUrl;

  res.json({
    success: true,
    imageUrl: finalUrl,
    url: finalUrl,
    message: 'تم رفع صورة المنتج بنجاح.'
  });
});

export default router;
