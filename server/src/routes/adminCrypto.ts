import { Router, Response } from 'express';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import {
  getUsdtAdminStats,
  updateUsdtInventory,
  updateUsdtExchangeRate,
  updateUsdtMinAmount,
  completeUsdtOrder,
  cancelUsdtOrder
} from '../services/cryptoService';

const router = Router();

// All routes in this file require an authenticated admin session
router.use(requireAdmin);

/**
 * Admin: Get USDT Dashboard Stats & Inventory
 */
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await getUsdtAdminStats();
    return res.json(stats);
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to fetch stats:', err);
    return res.status(500).json({ error: 'تعذر جلب إحصائيات الكريبتو.' });
  }
});

/**
 * Admin: Update Available USDT Inventory
 */
router.patch('/inventory', async (req: AuthRequest, res: Response) => {
  const { available } = req.body;
  const adminId = req.user?.id;

  if (available === undefined || isNaN(Number(available)) || Number(available) < 0) {
    return res.status(400).json({ error: 'الكمية المتاحة يجب أن تكون رقماً أكبر من أو يساوي 0.' });
  }

  try {
    const result = await updateUsdtInventory(Number(available), adminId);
    return res.json({ success: true, ...result, message: 'تم تحديث المخزون المتاح بنجاح.' });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to update inventory:', err);
    return res.status(400).json({ error: err.message || 'فشل تحديث المخزون.' });
  }
});

/**
 * Admin: Update USDT Exchange Rate
 */
router.patch('/rate', async (req: AuthRequest, res: Response) => {
  const { rate } = req.body;
  const adminId = req.user?.id;

  if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
    return res.status(400).json({ error: 'سعر الصرف يجب أن يكون رقماً أكبر من 0.' });
  }

  try {
    const result = await updateUsdtExchangeRate(Number(rate), adminId);
    return res.json({ success: true, ...result, message: 'تم تحديث سعر صرف USDT بنجاح.' });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to update rate:', err);
    return res.status(400).json({ error: err.message || 'فشل تحديث سعر الصرف.' });
  }
});

/**
 * Admin: Update Minimum Order Amount (Hard Floor >= 3.0)
 */
router.patch('/settings', async (req: AuthRequest, res: Response) => {
  const { minAmount } = req.body;
  const adminId = req.user?.id;

  const numMin = Number(minAmount);
  if (isNaN(numMin) || numMin < 3.0) {
    return res.status(400).json({
      code: 'MINIMUM_USDT_AMOUNT_NOT_MET',
      error: 'لا يمكن تعيين الحد الأدنى لأقل من 3 USDT كقاعدة حماية إلزامية في النظام.'
    });
  }

  try {
    const result = await updateUsdtMinAmount(numMin, adminId);
    return res.json({ success: true, ...result, message: 'تم تحديث الحد الأدنى بنجاح.' });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to update settings:', err);
    return res.status(err.statusCode || 400).json({ error: err.message || 'فشل حفظ الإعدادات.' });
  }
});

/**
 * Admin: List USDT Orders with Filtering & Pagination
 */
router.get('/orders', async (req: AuthRequest, res: Response) => {
  const { status, search, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClause = `WHERE o."orderType" = 'USDT_TRANSFER'`;
    const values: any[] = [];
    let paramIndex = 1;

    if (status && typeof status === 'string' && status !== 'ALL') {
      whereClause += ` AND o.status = $${paramIndex}`;
      values.push(status.trim());
      paramIndex++;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClause += ` AND (LOWER(o.id::text) LIKE $${paramIndex} OR LOWER(o."walletAddress") LIKE $${paramIndex} OR LOWER(u.email) LIKE $${paramIndex} OR LOWER(COALESCE(u.name, '')) LIKE $${paramIndex})`;
      values.push(q);
      paramIndex++;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM "Order" o JOIN "User" u ON o."userId" = u.id ${whereClause}`,
      values
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const ordersRes = await pool.query(
      `SELECT 
        o.id,
        o."userId",
        o."usdtAmount",
        o."cryptoNetwork",
        o."walletAddress",
        o."chargedAmount",
        o."chargedCurrency",
        o."exchangeRateUsed",
        o.status,
        o."txHash",
        o."createdAt",
        o."completedAt",
        o."canceledAt",
        o."canceledReason",
        u.email as "userEmail",
        u.name as "userName"
       FROM "Order" o
       JOIN "User" u ON o."userId" = u.id
       ${whereClause}
       ORDER BY o."createdAt" DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limitNum, offset]
    );

    return res.json({
      orders: ordersRes.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to fetch orders:', err);
    return res.status(500).json({ error: 'تعذر جلب قائمة الطلبات.' });
  }
});

/**
 * Admin: Complete USDT Order manually
 */
router.post('/orders/:id/complete', async (req: AuthRequest, res: Response) => {
  const id: string = String(req.params.id || '');
  const { txHash } = req.body;
  const adminId = req.user?.id;

  try {
    const result = await completeUsdtOrder({
      orderId: id,
      adminId: adminId || null,
      txHash: txHash ? String(txHash).trim() : undefined
    });
    return res.json(result);
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to complete order:', err);
    return res.status(400).json({ error: err.message || 'فشل إكمال الطلب.' });
  }
});

/**
 * Admin: Cancel USDT Order and Refund Customer
 */
router.post('/orders/:id/cancel', async (req: AuthRequest, res: Response) => {
  const id: string = String(req.params.id || '');
  const { reason } = req.body;
  const adminId = req.user?.id;

  try {
    const result = await cancelUsdtOrder({
      orderId: id,
      adminId: adminId || null,
      reason: reason ? String(reason).trim() : 'إلغاء من قبل إدارة المنصة'
    });
    return res.json(result);
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to cancel order:', err);
    return res.status(400).json({ error: err.message || 'فشل إلغاء الطلب.' });
  }
});

/**
 * Admin: Manage Crypto Networks
 */
router.get('/networks', async (_req: AuthRequest, res: Response) => {
  try {
    const netRes = await pool.query('SELECT * FROM crypto_networks ORDER BY display_order ASC');
    return res.json(netRes.rows);
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to list networks:', err);
    return res.status(500).json({ error: 'تعذر جلب قائمة الشبكات.' });
  }
});

router.patch('/networks/:id', async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
  const { enabled, min_amount, display_order, name } = req.body;

  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (enabled !== undefined) {
      fields.push(`enabled = $${idx++}`);
      values.push(Boolean(enabled));
    }
    if (min_amount !== undefined) {
      const numMin = Number(min_amount);
      if (numMin < 3.0) {
        return res.status(400).json({ error: 'الحد الأدنى للشبكة لا يمكن أن يقل عن 3 USDT.' });
      }
      fields.push(`min_amount = $${idx++}`);
      values.push(numMin);
    }
    if (display_order !== undefined) {
      fields.push(`display_order = $${idx++}`);
      values.push(Number(display_order));
    }
    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(String(name).trim());
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'لا توجد حقول للتعديل.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const updateRes = await pool.query(
      `UPDATE crypto_networks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    return res.json({ success: true, network: updateRes.rows[0] });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to update network:', err);
    return res.status(400).json({ error: err.message || 'فشل تحديث الشبكة.' });
  }
});

export default router;
