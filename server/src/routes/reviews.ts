import { Router, Request, Response } from 'express';
import pool from '../db';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { verifyReviewToken, hashToken } from '../services/reviewTokenService';

const router = Router();

// Simple HTML sanitizer to strip all HTML tags & scripts
function sanitizeComment(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, 1000);
}

// Compute client IP hash for privacy-friendly abuse protection
function getClientIpHash(req: Request): string {
  const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                req.socket.remoteAddress || 
                '127.0.0.1';
  return crypto.createHash('sha256').update(rawIp).digest('hex');
}

// Optional Auth Middleware (attaches user if JWT present, but doesn't reject guest)
function optionalAuth(req: Request, res: Response, next: () => void) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;
  } catch {}
  next();
}

// =========================================================================
// 1. GET /api/reviews/token/:token - Verify Review Token & Get Safe Metadata
// =========================================================================
router.get('/token/:token', async (req: Request, res: Response) => {
  try {
    const rawToken = String(req.params.token || '');
    const verification = await verifyReviewToken(rawToken);

    if (!verification.isValid) {
      return res.status(400).json({
        isValid: false,
        error: verification.error || 'رابط التقييم غير صالح أو منتهي الصلاحية.'
      });
    }

    res.json({
      isValid: true,
      data: verification.tokenRecord
    });
  } catch (err: any) {
    console.error('Error verifying review token:', err);
    res.status(500).json({ isValid: false, error: 'تعذر التحقق من رابط التقييم.' });
  }
});

// =========================================================================
// 2. POST /api/reviews - Submit Review (Authenticated or Guest via Token)
// =========================================================================
router.post('/', optionalAuth, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  const { reviewToken, token, orderId, productId, rating, comment } = req.body;
  const effectiveToken = reviewToken || token;
  const ipHash = getClientIpHash(req);

  try {
    // 1. Validate Rating
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'يرجى تحديد تقييم صحيح من 1 إلى 5 نجوم.' });
    }

    // 2. Sanitize Comment
    const cleanComment = sanitizeComment(comment || '');

    // 3. Rate-Limiting Protection (Anti-Spam based on IP Hash)
    const recentReviewsRes = await pool.query(
      `SELECT COUNT(*) FROM "reviews" 
       WHERE ip_hash = $1 AND created_at >= NOW() - INTERVAL '15 minutes'`,
      [ipHash]
    );
    const recentCount = parseInt(recentReviewsRes.rows[0].count, 10);
    if (recentCount >= 6) {
      return res.status(429).json({ error: 'تم إرسال عدد كبير من التقييمات. يرجى المحاولة لاحقاً بعد قليل.' });
    }

    let targetOrderId: string | null = null;
    let targetProductId: string | null = null;
    let targetProductName: string = 'خدمة KIROPRO';
    let reviewTokenId: string | null = null;
    let tokenRecordCreatorId: string | null = null;

    // Case A: Using a Review Token (Order-Specific or General)
    if (effectiveToken && typeof effectiveToken === 'string' && effectiveToken.trim()) {
      const verification = await verifyReviewToken(effectiveToken);
      if (!verification.isValid || !verification.tokenRecord) {
        return res.status(400).json({ error: verification.error || 'رابط التقييم غير صالح أو مستخدم مسبقاً.' });
      }

      const rec = verification.tokenRecord;
      reviewTokenId = rec.id;
      tokenRecordCreatorId = rec.createdBy || null;
      targetOrderId = rec.orderId || null;
      targetProductId = rec.productId || productId || null;
      targetProductName = rec.productName || 'خدمة KIROPRO';

    } else if (authUser && orderId) {
      // Case B: Authenticated customer reviewing their own completed order directly
      const orderRes = await pool.query(
        'SELECT id, "userId", "packageName", "packageId", status FROM "Order" WHERE id = $1',
        [orderId]
      );
      const order = orderRes.rows[0];

      if (!order) {
        return res.status(404).json({ error: 'الطلب غير موجود.' });
      }

      if (order.userId !== authUser.id) {
        return res.status(403).json({ error: 'لا يمكنك تقييم طلب لا يخص حسابك.' });
      }

      if (order.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'يمكنك تقييم الطلبات المكتملة فقط.' });
      }

      targetOrderId = order.id;
      targetProductId = order.packageId || null;
      targetProductName = order.packageName || 'خدمة KIROPRO';

    } else {
      return res.status(400).json({ error: 'يرجى توفير رابط تقييم صالح أو تسجيل الدخول وتحديد طلب مكتمل.' });
    }

    // Check if this order has already been reviewed (Strict one review per order)
    if (targetOrderId) {
      const existingReview = await pool.query(
        'SELECT id FROM "reviews" WHERE order_id = $1 LIMIT 1',
        [targetOrderId]
      );
      if (existingReview.rows.length > 0) {
        return res.status(400).json({ error: 'تم تقييم هذا الطلب مسبقاً، شكراً لك.' });
      }
    }

    // Determine Reviewer Identity
    // CRITICAL SECURITY & PRIVACY RULE:
    // 1. review_token.created_by is ONLY internal metadata recording which Admin generated the link.
    // 2. It must NEVER be used as or confused with the reviewer's identity.
    // 3. If an Admin account is opening/testing the link, they are NOT the customer. Identity is strictly GUEST ("مستخدم مجهول").
    // 4. Authenticated identity is ONLY used when a regular customer (non-admin, not link creator) is logged in.
    let reviewerType: 'AUTHENTICATED' | 'GUEST' = 'GUEST';
    let customerName = 'مستخدم مجهول';
    let finalUserId: string | null = null;

    if (authUser && authUser.id) {
      const isTokenCreator = tokenRecordCreatorId && String(tokenRecordCreatorId) === String(authUser.id);
      const isAdminUser = authUser.role === 'ADMIN';

      if (isTokenCreator || isAdminUser) {
        // Admin testing or previewing the link; must NEVER be recorded as the reviewer
        reviewerType = 'GUEST';
        customerName = 'مستخدم مجهول';
        finalUserId = null;
      } else {
        reviewerType = 'AUTHENTICATED';
        finalUserId = authUser.id;
        const userRes = await pool.query('SELECT name FROM "User" WHERE id = $1', [authUser.id]);
        customerName = userRes.rows[0]?.name || authUser.name || 'عميل مسجل';
      }
    }

    // Begin DB transaction: Insert review and increment token usage
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert review in PENDING status (Internal moderation)
      const insertRes = await client.query(
        `INSERT INTO "reviews" 
          (user_id, order_id, product_id, product_name, rating, comment, reviewer_type, customer_name, review_token_id, ip_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
         RETURNING id, rating, comment, customer_name, status, created_at`,
        [
          finalUserId,
          targetOrderId,
          targetProductId,
          targetProductName,
          numRating,
          cleanComment || null,
          reviewerType,
          customerName,
          reviewTokenId,
          ipHash
        ]
      );

      // 2. Increment token uses_count and deactivate if reached max_uses
      if (reviewTokenId) {
        await client.query(
          `UPDATE "review_tokens" 
           SET 
             uses_count = uses_count + 1,
             is_active = CASE WHEN (uses_count + 1) >= max_uses THEN false ELSE is_active END,
             updated_at = NOW()
           WHERE id = $1`,
          [reviewTokenId]
        );
      }

      await client.query('COMMIT');

      // Warm and welcoming confirmation message (no censorship phrasing!)
      const successMessage = reviewerType === 'AUTHENTICATED' && customerName !== 'عميل مسجل'
        ? `شكرًا يا ${customerName}، تمت مشاركة رأيك بنجاح! ⭐`
        : 'شكرًا لمشاركتنا رأيك، تمت إضافة تقييمك بنجاح! ⭐';

      res.status(201).json({
        message: successMessage,
        review: insertRes.rows[0]
      });

    } catch (txErr: any) {
      await client.query('ROLLBACK');
      if (txErr.code === '23505') {
        return res.status(400).json({ error: 'تم إرسال تقييم لهذا الطلب مسبقاً.' });
      }
      console.error('Error inserting review:', txErr);
      res.status(500).json({ error: 'حدث خطأ أثناء حفظ التقييم. يرجى المحاولة لاحقاً.' });
    } finally {
      client.release();
    }

  } catch (err: any) {
    console.error('Error submitting review:', err);
    res.status(500).json({ error: 'تعذر إرسال التقييم حالياً. يرجى المحاولة لاحقاً.' });
  }
});

// =========================================================================
// 3. GET /api/reviews/my - Customer's Own Reviews (Authenticated)
// =========================================================================
router.get('/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await pool.query(
      `SELECT 
        r.id,
        r.rating,
        r.comment,
        r.product_name,
        r.status,
        r.created_at,
        o.id as order_id,
        o."packageName"
       FROM "reviews" r
       LEFT JOIN "Order" o ON r.order_id = o.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    // Format status respectfully: "تم استلام تقييمك" or "معتمد ومتاح"
    const formatted = result.rows.map(row => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      productName: row.packageName || row.product_name || 'منتج KIROPRO',
      createdAt: row.created_at,
      status: row.status,
      statusLabel: row.status === 'APPROVED' ? 'معتمد ومتاح' : 'تم استلام تقييمك'
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('Error fetching user reviews:', err);
    res.status(500).json({ error: 'تعذر جلب التقييمات.' });
  }
});

// =========================================================================
// 4. GET /api/reviews/product/:id - Public Approved Reviews for Product
// =========================================================================
router.get('/product/:id', async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    const summaryRes = await pool.query(
      `SELECT 
        COUNT(*) as total_reviews,
        ROUND(AVG(rating)::numeric, 1) as avg_rating
       FROM "reviews" 
       WHERE (product_id = $1 OR order_id IN (SELECT id FROM "Order" WHERE "packageId" = $1)) 
         AND status = 'APPROVED'`,
      [productId]
    );

    const reviewsRes = await pool.query(
      `SELECT 
        id,
        rating,
        comment,
        customer_name,
        created_at
       FROM "reviews"
       WHERE (product_id = $1 OR order_id IN (SELECT id FROM "Order" WHERE "packageId" = $1))
         AND status = 'APPROVED'
       ORDER BY created_at DESC
       LIMIT 50`,
      [productId]
    );

    const total = parseInt(summaryRes.rows[0]?.total_reviews || '0', 10);
    const avg = parseFloat(summaryRes.rows[0]?.avg_rating || '5.0');

    res.json({
      total,
      averageRating: total > 0 ? avg : 5.0,
      reviews: reviewsRes.rows
    });
  } catch (err: any) {
    console.error('Error fetching product reviews:', err);
    res.status(500).json({ error: 'تعذر جلب تقييمات المنتج.' });
  }
});

// =========================================================================
// 5. GET /api/reviews/featured - Top Approved Reviews for Store Homepage
// =========================================================================
router.get('/featured', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 6), 12);

    const summaryRes = await pool.query(
      `SELECT 
        COUNT(*) as total_reviews,
        ROUND(AVG(rating)::numeric, 1) as avg_rating
       FROM "reviews" 
       WHERE status = 'APPROVED'`
    );

    const reviewsRes = await pool.query(
      `SELECT 
        id,
        rating,
        comment,
        customer_name,
        product_name,
        product_id,
        created_at
       FROM "reviews"
       WHERE status = 'APPROVED'
       ORDER BY rating DESC, created_at DESC
       LIMIT $1`,
      [limit]
    );

    const total = parseInt(summaryRes.rows[0]?.total_reviews || '0', 10);
    const avg = parseFloat(summaryRes.rows[0]?.avg_rating || '5.0');

    res.json({
      total,
      averageRating: total > 0 ? avg : 5.0,
      reviews: reviewsRes.rows
    });
  } catch (err: any) {
    console.error('Error fetching featured reviews:', err);
    res.status(500).json({ error: 'تعذر جلب التقييمات المميزة.' });
  }
});

// =========================================================================
// 6. GET /api/reviews/all - All Approved Reviews with Breakdown & Pagination
// =========================================================================
router.get('/all', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 12), 50);
    const offset = (page - 1) * limit;
    const filterRating = req.query.rating ? parseInt(req.query.rating as string, 10) : null;

    // 1. Overall stats (from ALL approved reviews)
    const summaryRes = await pool.query(
      `SELECT 
        COUNT(*) as total_reviews,
        ROUND(AVG(rating)::numeric, 1) as avg_rating
       FROM "reviews" 
       WHERE status = 'APPROVED'`
    );

    const totalApproved = parseInt(summaryRes.rows[0]?.total_reviews || '0', 10);
    const avgRating = parseFloat(summaryRes.rows[0]?.avg_rating || '5.0');

    // 2. Rating breakdown distribution (5, 4, 3, 2, 1 stars)
    const distRes = await pool.query(
      `SELECT 
        rating,
        COUNT(*) as count
       FROM "reviews"
       WHERE status = 'APPROVED'
       GROUP BY rating`
    );

    const distMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    distRes.rows.forEach(r => {
      const star = parseInt(r.rating, 10);
      if (distMap[star] !== undefined) {
        distMap[star] = parseInt(r.count, 10);
      }
    });

    const distribution: Record<number, { count: number; percent: number }> = {};
    for (let s = 5; s >= 1; s--) {
      const count = distMap[s] || 0;
      const percent = totalApproved > 0 ? Math.round((count / totalApproved) * 100) : 0;
      distribution[s] = { count, percent };
    }

    // 3. Filtered reviews query
    let listQuery = `
      SELECT 
        id,
        rating,
        comment,
        customer_name,
        product_name,
        product_id,
        created_at
      FROM "reviews"
      WHERE status = 'APPROVED'
    `;
    const params: any[] = [];

    if (filterRating && filterRating >= 1 && filterRating <= 5) {
      params.push(filterRating);
      listQuery += ` AND rating = $${params.length}`;
    }

    // Count for current filtered view
    const filteredCountRes = await pool.query(
      listQuery.replace(/SELECT\s+[\s\S]+?\s+FROM/, 'SELECT COUNT(*) as count FROM'),
      params
    );
    const filteredTotal = parseInt(filteredCountRes.rows[0]?.count || '0', 10);

    params.push(limit);
    listQuery += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    params.push(offset);
    listQuery += ` OFFSET $${params.length}`;

    const listRes = await pool.query(listQuery, params);

    res.json({
      total: totalApproved,
      filteredTotal,
      averageRating: totalApproved > 0 ? avgRating : 5.0,
      distribution,
      page,
      limit,
      totalPages: Math.ceil(filteredTotal / limit) || 1,
      hasMore: offset + listRes.rows.length < filteredTotal,
      reviews: listRes.rows
    });
  } catch (err: any) {
    console.error('Error fetching all reviews:', err);
    res.status(500).json({ error: 'تعذر جلب التقييمات.' });
  }
});

// =========================================================================
// 7. GET /api/reviews/public - Backward Compatibility Endpoint
// =========================================================================
router.get('/public', async (req: Request, res: Response) => {
  try {
    const summaryRes = await pool.query(
      `SELECT 
        COUNT(*) as total_reviews,
        ROUND(AVG(rating)::numeric, 1) as avg_rating
       FROM "reviews" 
       WHERE status = 'APPROVED'`
    );

    const reviewsRes = await pool.query(
      `SELECT 
        id,
        rating,
        comment,
        customer_name,
        product_name,
        product_id,
        created_at
       FROM "reviews"
       WHERE status = 'APPROVED'
       ORDER BY created_at DESC
       LIMIT 30`
    );

    const total = parseInt(summaryRes.rows[0]?.total_reviews || '0', 10);
    const avg = parseFloat(summaryRes.rows[0]?.avg_rating || '5.0');

    res.json({
      total,
      averageRating: total > 0 ? avg : 5.0,
      reviews: reviewsRes.rows
    });
  } catch (err: any) {
    console.error('Error fetching public reviews:', err);
    res.status(500).json({ error: 'تعذر جلب التقييمات العامة.' });
  }
});

export default router;
