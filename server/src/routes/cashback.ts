import { Router, Response, Request } from 'express';
import pool from '../db';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ==========================================
// 1. CUSTOMER CASHBACK SUMMARY
// GET /api/cashback/summary
// ==========================================
router.get('/summary', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Total cashback earned by user
    const totalRes = await pool.query(`
      SELECT 
        COUNT(*) as "totalRedemptions",
        COALESCE(SUM(credited_amount), 0) as "totalCredited",
        COALESCE(SUM(base_cashback_usd), 0) as "totalUsd"
      FROM cashback_redemptions 
      WHERE user_id = $1
    `, [req.user.id]);

    // Recent cashback wallet transactions
    const txRes = await pool.query(`
      SELECT 
        t.id, 
        t.amount, 
        t.currency, 
        t.source_amount_usd, 
        t.exchange_rate, 
        t.description, 
        t."createdAt", 
        t."referenceId"
      FROM "WalletTransaction" t
      JOIN "Wallet" w ON t."walletId" = w.id
      WHERE w."userId" = $1 AND t.type = 'CASHBACK'
      ORDER BY t."createdAt" DESC
      LIMIT 10
    `, [req.user.id]);

    // Active promotions available
    const activeRulesRes = await pool.query(`
      SELECT id, name, percentage, max_cashback_usd, scope_type, allow_promo_stacking, expires_at
      FROM cashback_rules
      WHERE is_active = true
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (expires_at IS NULL OR expires_at >= NOW())
      ORDER BY percentage DESC
    `);

    res.json({
      summary: {
        totalRedemptions: Number(totalRes.rows[0]?.totalRedemptions || 0),
        totalCredited: Number(totalRes.rows[0]?.totalCredited || 0),
        totalUsd: Number(totalRes.rows[0]?.totalUsd || 0)
      },
      recentActivity: txRes.rows,
      activePromotions: activeRulesRes.rows
    });
  } catch (err: any) {
    console.error('Customer cashback summary error:', err);
    res.status(500).json({ error: 'Failed to fetch cashback summary' });
  }
});

// ==========================================
// 2. ADMIN CASHBACK RULES CRUD
// ==========================================

// GET /api/cashback/rules - List all rules with stats
router.get('/rules', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.*,
        u.name as "creatorName",
        (SELECT COUNT(*) FROM cashback_redemptions cr WHERE cr.cashback_rule_id = r.id)::int as "totalRedemptionsCount",
        (SELECT COALESCE(SUM(base_cashback_usd), 0) FROM cashback_redemptions cr WHERE cr.cashback_rule_id = r.id)::float as "totalCashbackGivenUsd"
      FROM cashback_rules r
      LEFT JOIN "User" u ON r.created_by = u.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Admin fetch cashback rules error:', err);
    res.status(500).json({ error: 'Failed to fetch cashback rules' });
  }
});

// POST /api/cashback/rules - Create new rule
router.post('/rules', requireAdmin, async (req: AuthRequest, res: Response) => {
  const {
    name,
    percentage,
    max_cashback_usd,
    scope_type = 'ALL_PRODUCTS',
    eligible_ids = [],
    usage_limit_total,
    usage_limit_per_user = 1,
    max_cashback_per_user_usd,
    allow_promo_stacking = true,
    starts_at,
    expires_at,
    is_active = true
  } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'اسم القاعدة مطلوب.' });
  }

  const numPercentage = Number(percentage);
  if (!Number.isFinite(numPercentage) || numPercentage <= 0 || numPercentage > 100) {
    return res.status(400).json({ error: 'نسبة الكاش باك يجب أن تكون بين 0.01% و 100%.' });
  }

  const numMaxCashback = max_cashback_usd ? Number(max_cashback_usd) : null;
  if (numMaxCashback !== null && (!Number.isFinite(numMaxCashback) || numMaxCashback <= 0)) {
    return res.status(400).json({ error: 'الحد الأقصى للكاش باك للطلب يجب أن يكون رقماً أكبر من صفر.' });
  }

  const validScopeTypes = ['ALL_PRODUCTS', 'CATEGORY', 'SELECTED_PRODUCTS'];
  if (!validScopeTypes.includes(scope_type)) {
    return res.status(400).json({ error: 'نطاق التطبيق غير صالح.' });
  }

  try {
    const ruleId = uuidv4();
    const insertRes = await pool.query(`
      INSERT INTO cashback_rules (
        id, name, percentage, max_cashback_usd, scope_type, eligible_ids,
        usage_limit_total, usage_limit_per_user, max_cashback_per_user_usd,
        allow_promo_stacking, starts_at, expires_at, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      ruleId,
      name.trim(),
      numPercentage,
      numMaxCashback,
      scope_type,
      JSON.stringify(eligible_ids || []),
      usage_limit_total ? Number(usage_limit_total) : null,
      usage_limit_per_user ? Number(usage_limit_per_user) : 1,
      max_cashback_per_user_usd ? Number(max_cashback_per_user_usd) : null,
      allow_promo_stacking !== false,
      starts_at || null,
      expires_at || null,
      is_active !== false,
      req.user?.id
    ]);

    res.status(201).json({
      message: 'تم إنشاء قاعدة الكاش باك بنجاح.',
      rule: insertRes.rows[0]
    });
  } catch (err: any) {
    console.error('Admin create cashback rule error:', err);
    res.status(500).json({ error: 'فشل إنشاء قاعدة الكاش باك.' });
  }
});

// PUT /api/cashback/rules/:id - Update rule
router.put('/rules/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    name,
    percentage,
    max_cashback_usd,
    scope_type,
    eligible_ids,
    usage_limit_total,
    usage_limit_per_user,
    max_cashback_per_user_usd,
    allow_promo_stacking,
    starts_at,
    expires_at,
    is_active
  } = req.body;

  try {
    const updateRes = await pool.query(`
      UPDATE cashback_rules SET
        name = COALESCE($1, name),
        percentage = COALESCE($2, percentage),
        max_cashback_usd = $3,
        scope_type = COALESCE($4, scope_type),
        eligible_ids = COALESCE($5, eligible_ids),
        usage_limit_total = $6,
        usage_limit_per_user = COALESCE($7, usage_limit_per_user),
        max_cashback_per_user_usd = $8,
        allow_promo_stacking = COALESCE($9, allow_promo_stacking),
        starts_at = $10,
        expires_at = $11,
        is_active = COALESCE($12, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `, [
      name ? name.trim() : null,
      percentage ? Number(percentage) : null,
      max_cashback_usd !== undefined ? (max_cashback_usd ? Number(max_cashback_usd) : null) : null,
      scope_type || null,
      eligible_ids ? JSON.stringify(eligible_ids) : null,
      usage_limit_total !== undefined ? (usage_limit_total ? Number(usage_limit_total) : null) : null,
      usage_limit_per_user ? Number(usage_limit_per_user) : null,
      max_cashback_per_user_usd !== undefined ? (max_cashback_per_user_usd ? Number(max_cashback_per_user_usd) : null) : null,
      allow_promo_stacking !== undefined ? Boolean(allow_promo_stacking) : null,
      starts_at || null,
      expires_at || null,
      is_active !== undefined ? Boolean(is_active) : null,
      id
    ]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'قاعدة الكاش باك غير موجودة.' });
    }

    res.json({ message: 'تم تحديث قاعدة الكاش باك بنجاح.', rule: updateRes.rows[0] });
  } catch (err: any) {
    console.error('Admin update cashback rule error:', err);
    res.status(500).json({ error: 'فشل تحديث قاعدة الكاش باك.' });
  }
});

// PATCH /api/cashback/rules/:id/toggle - Toggle active status
router.patch('/rules/:id/toggle', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE cashback_rules SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'القاعدة غير موجودة.' });
    }
    res.json({ message: 'تم تغيير حالة القاعدة بنجاح.', rule: result.rows[0] });
  } catch (err: any) {
    console.error('Toggle cashback rule error:', err);
    res.status(500).json({ error: 'فشل تغيير حالة القاعدة.' });
  }
});

// DELETE /api/cashback/rules/:id - Delete rule
router.delete('/rules/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM cashback_rules WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'القاعدة غير موجودة.' });
    }
    res.json({ message: 'تم حذف قاعدة الكاش باك بنجاح.' });
  } catch (err: any) {
    console.error('Delete cashback rule error:', err);
    res.status(500).json({ error: 'فشل حذف قاعدة الكاش باك.' });
  }
});

// GET /api/cashback/rules/:id/redemptions - List redemptions for a rule
router.get('/rules/:id/redemptions', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        cr.*,
        u.name as "userName",
        u.email as "userEmail",
        o."packageName",
        o."customerPriceUsd"
      FROM cashback_redemptions cr
      JOIN "User" u ON cr.user_id = u.id
      JOIN "Order" o ON cr.order_id = o.id
      WHERE cr.cashback_rule_id = $1
      ORDER BY cr.created_at DESC
      LIMIT 100
    `, [id]);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Fetch cashback redemptions error:', err);
    res.status(500).json({ error: 'Failed to fetch redemptions' });
  }
});

export default router;
