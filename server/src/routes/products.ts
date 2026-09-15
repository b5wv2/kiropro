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
const uploadsDir = path.join(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
 * CUSTOMER ENDPOINT: GET /api/products
 * Reads strictly from local PostgreSQL database.
 * NEVER contacts GamesDrop during customer visits, login, or browsing.
 * Only returns products where isActive = true.
 * Completely sanitizes any upstream provider details.
 */
const DEFAULT_PLACEHOLDER = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';

const resolveImageUrl = (productImg?: string | null, categoryImg?: string | null): string => {
  if (productImg && productImg.trim()) return productImg.trim();
  if (categoryImg && categoryImg.trim()) return categoryImg.trim();
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
router.get('/', async (req: Request, res: Response) => {
  // Public cache header: browser and proxies can cache for 15s, avoiding redundant requests
  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

  try {
    const result = await pool.query(`
      SELECT 
        p.id, p."providerOfferId", p."productName", p."offerName", p.category,
        p."arabicName", p.description, p."subCategory", p."productType",
        p."platformCode", p."platformName", p."regionCode", p."regionName",
        p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
        p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
        p."gameCategoryId",
        c."imageUrl" as "categoryImageUrl",
        c."name" as "categoryName",
        c."arabicName" as "categoryArabicName",
        c.badge as "categoryBadge",
        c."deliveryTime" as "categoryDeliveryTime",
        c."idFieldLabel" as "categoryIdFieldLabel",
        c."idPlaceholder" as "categoryIdPlaceholder"
      FROM "Product" p
      LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
      WHERE p."isActive" = true
      ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
    `);

    // Group items by curated game / category
    const groupedMap = new Map<string, any>();

    for (const row of result.rows) {
      const groupKey = row.gameCategoryId || (row.productName.toLowerCase().includes('pubg') ? 'pubg-mobile' : 'freefire-me');
      const gameDisplayName = row.categoryArabicName || row.categoryName || (groupKey === 'pubg-mobile' ? 'PUBG Mobile' : 'Free Fire (الشرق الأوسط)');
      const gameCover = row.categoryImageUrl || (groupKey === 'pubg-mobile' ? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80' : 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80');

      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          id: groupKey,
          name: gameDisplayName,
          category: 'mobile',
          badge: row.categoryBadge || 'تسليم فوري',
          deliveryTime: row.categoryDeliveryTime || 'تسليم فوري وتلقائي',
          minPrice: Number(row.price || 0),
          currency: '$',
          type: 'شحن ألعاب مباشر (Direct Top-Up)',
          image: gameCover,
          popular: true,
          packages: [],
          idFieldLabel: row.categoryIdFieldLabel || 'معرّف اللاعب (Player ID)',
          idPlaceholder: row.categoryIdPlaceholder || 'أدخل معرّف اللاعب الخاص بك (Player ID)'
        });
      }

      const card = groupedMap.get(groupKey);
      const pkgPrice = Number(row.price || 0);
      const resolvedPackageImage = resolveImageUrl(row.productImageUrl, row.categoryImageUrl);

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
        originalPrice: Math.round(pkgPrice * 1.2 * 100) / 100,
        bestValue: card.packages.length === 0,
        requiresGameServerId: Boolean(row.requiresGameServerId),
        isRequiredGameServerId: Boolean(row.requiresGameServerId)
      });

      if (pkgPrice > 0 && (card.minPrice === 0 || pkgPrice < card.minPrice)) {
        card.minPrice = pkgPrice;
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
    // Check if queried by category/game id
    const catCheck = await pool.query(
      `SELECT * FROM "GameCategory" WHERE "id" = $1 LIMIT 1`,
      [id]
    );

    if (catCheck.rows.length > 0) {
      const category = catCheck.rows[0];
      const targetCatId = category.id;

      const result = await pool.query(`
        SELECT 
          p.id, p."providerOfferId", p."productName", p."offerName", p.category,
          p."arabicName", p.description, p."subCategory", p."productType",
          p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
          p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
          c."imageUrl" as "categoryImageUrl"
        FROM "Product" p
        LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
        WHERE p."isActive" = true AND p."gameCategoryId" = $1
        ORDER BY p."displayOrder" ASC, p."productName" ASC
      `, [targetCatId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'اللعبة غير متاحة حالياً أو لا توجد باقات مفعلة.' });
      }

      const categoryImageUrl = category.imageUrl || DEFAULT_PLACEHOLDER;

      const packages = result.rows.map((row, idx) => ({
        id: row.id,
        name: row.arabicName || row.offerName,
        englishName: row.offerName,
        arabicName: row.arabicName,
        description: row.description,
        subCategory: row.subCategory,
        productType: row.productType,
        imageUrl: resolveImageUrl(row.productImageUrl, row.categoryImageUrl || categoryImageUrl),
        price: Number(row.price || 0),
        originalPrice: Math.round(Number(row.price || 0) * 1.2 * 100) / 100,
        bestValue: idx === 0
      }));

      const validPrices = packages.map(p => p.price).filter(p => p > 0);
      const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;

      return res.json({
        id: targetCatId,
        name: category.arabicName || category.name,
        category: category.platform || 'mobile',
        badge: category.badge || 'تسليم فوري',
        deliveryTime: category.deliveryTime || 'تسليم فوري وتلقائي',
        minPrice,
        currency: '$',
        type: 'شحن ألعاب مباشر (Direct Top-Up)',
        image: categoryImageUrl,
        popular: true,
        packages,
        idFieldLabel: category.idFieldLabel || 'معرّف اللاعب (User ID)',
        idPlaceholder: category.idPlaceholder || 'أدخل معرّف اللاعب الخاص بك (User ID)'
      });
    }

    // Otherwise query individual package by UUID or providerOfferId
    const singleRes = await pool.query(`
      SELECT 
        p.id, p."providerOfferId", p."productName", p."offerName", p.category,
        p."arabicName", p.description, p."subCategory", p."productType",
        p."platformCode", p."platformName", p."regionCode", p."regionName",
        p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
        p."requiresGameUserId", p."requiresGameServerId",
        c."imageUrl" as "categoryImageUrl"
      FROM "Product" p
      LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
      WHERE (p."id"::text = $1 OR p."providerOfferId"::text = $1) AND p."isActive" = true
      LIMIT 1
    `, [id]);

    if (singleRes.rows.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود أو غير متاح حالياً.' });
    }

    const row = singleRes.rows[0];
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
      inStock: row.inStock,
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
    res.json(result.rows);
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

  const relativeUrl = `/uploads/products/${req.file.filename}`;

  try {
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
      imageUrl: relativeUrl,
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
  const filterGameCategory = req.query.gameCategory as string; // 'pubg-mobile' | 'freefire-me' | 'blood-strike-global' | 'blood-strike-me' | 'all'

  const offset = (page - 1) * limit;
  const whereClauses: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (search) {
    whereClauses.push(`("productName" ILIKE $${paramIdx} OR "offerName" ILIKE $${paramIdx} OR "providerOfferId"::text ILIKE $${paramIdx} OR "platformName" ILIKE $${paramIdx} OR "regionName" ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  if (filterActive === 'true' || filterStatus === 'active') {
    whereClauses.push(`"isActive" = true`);
  } else if (filterActive === 'false' || filterStatus === 'inactive') {
    whereClauses.push(`"isActive" = false`);
  }

  if (filterGameCategory && filterGameCategory !== 'all') {
    whereClauses.push(`"gameCategoryId" = $${paramIdx}`);
    params.push(filterGameCategory);
    paramIdx++;
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    const [countRes, statsRes, itemsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM "Product" ${whereSql}`, params),
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "isActive" = true) as active,
          COUNT(*) FILTER (WHERE "isActive" = false) as inactive
        FROM "Product"
      `),
      pool.query(`
        SELECT 
          id, "provider", "providerOfferId", "productId", "productName", "offerName",
          "category", "platformCode", "platformName", "regionCode", "regionName",
          "supplierCostUsd", "gamesDropCostUsd", "gamesDropAddedPercent", "gamesDropFxRate",
          "providerCostUsd", "providerCurrency", "customerPriceUsd", "isActive",
          "inStock", "imageUrl", "displayOrder", "isFeatured", "gameCategoryId",
          "requiresGameUserId", "requiresGameServerId", "lastProviderSyncAt",
          ("customerPriceUsd" - "gamesDropCostUsd") as "profitUsd",
          "createdAt", "updatedAt"
        FROM "Product"
        ${whereSql}
        ORDER BY "isActive" DESC, "displayOrder" ASC, "productName" ASC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `, [...params, limit, offset])
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    const globalStats = statsRes.rows[0];

    res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalCatalog: parseInt(globalStats.total, 10),
        activeCount: parseInt(globalStats.active, 10),
        inactiveCount: parseInt(globalStats.inactive, 10),
      },
      products: itemsRes.rows
    });
  } catch (err: any) {
    console.error('[Admin Catalog] Error:', err);
    res.status(500).json({ error: 'Failed to fetch admin catalog' });
  }
});

/**
 * ADMIN: PATCH /api/admin/products/:id
 * Updates operational fields: customer sale price, active status, image, display name.
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
    productType
  } = req.body;

  try {
    const updates: string[] = ['"updatedAt" = NOW()'];
    const values: any[] = [id];
    let paramIdx = 2;

    if (customerPriceUsd !== undefined) {
      updates.push(`"customerPriceUsd" = $${paramIdx++}`);
      values.push(Number(customerPriceUsd));
    }
    if (isActive !== undefined) {
      updates.push(`"isActive" = $${paramIdx++}`);
      values.push(Boolean(isActive));
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
 * Validates and stores product images safely.
 */
router.post('/admin/products/upload-image', requireAdmin, upload.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم إرفاق أي صورة.' });
  }

  const relativeUrl = `/uploads/products/${req.file.filename}`;
  res.json({
    success: true,
    imageUrl: relativeUrl,
    message: 'تم رفع صورة المنتج بنجاح.'
  });
});

export default router;
