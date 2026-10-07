import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import {
  getAllPrizesAdmin,
  createPrizeAdmin,
  updatePrizeAdmin,
  togglePrizeActiveAdmin,
  deletePrizeAdmin,
  getWheelAdminStats
} from '../services/wheelService';

const router = Router();

// Protect all admin wheel routes: Authentication + Admin Role
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/wheel/stats
 * Statistics and metrics for economy protection & prize performance.
 */
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await getWheelAdminStats();
    res.json(stats);
  } catch (err: any) {
    console.error('[AdminWheelAPI] Stats error:', err.message);
    res.status(500).json({ error: 'فشل جلب إحصائيات عجلة الحظ.' });
  }
});

/**
 * GET /api/admin/wheel/prizes
 * Full configuration list of prizes.
 */
router.get('/prizes', async (_req: AuthRequest, res: Response) => {
  try {
    const prizes = await getAllPrizesAdmin();
    res.json(prizes);
  } catch (err: any) {
    console.error('[AdminWheelAPI] List prizes error:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة الجوائز.' });
  }
});

/**
 * POST /api/admin/wheel/prizes
 * Create a new prize configuration.
 */
router.post('/prizes', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, type, value, weight, color, icon, is_active, max_winners, max_total_cost, starts_at, expires_at, display_order } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'اسم الجائزة مطلوب.' });
    }

    if (!type || !['NO_PRIZE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'WALLET_CREDIT', 'FREE_ATTEMPT'].includes(type)) {
      return res.status(400).json({ error: 'نوع الجائزة غير صالح.' });
    }

    const numericWeight = Number(weight);
    if (!Number.isInteger(numericWeight) || numericWeight < 0) {
      return res.status(400).json({ error: 'الوزن (Weight) يجب أن يكون عدداً صحيحاً موجباً.' });
    }

    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return res.status(400).json({ error: 'قيمة الجائزة غير صالحة.' });
    }

    const prize = await createPrizeAdmin({
      name,
      description,
      type,
      value: numericValue,
      weight: numericWeight,
      color,
      icon,
      is_active,
      max_winners: max_winners ? Number(max_winners) : null,
      max_total_cost: max_total_cost ? Number(max_total_cost) : null,
      starts_at,
      expires_at,
      display_order: display_order ? Number(display_order) : 0
    });

    res.status(201).json({ success: true, prize });
  } catch (err: any) {
    console.error('[AdminWheelAPI] Create prize error:', err.message);
    res.status(500).json({ error: err.message || 'فشل إنشاء الجائزة.' });
  }
});

/**
 * PUT /api/admin/wheel/prizes/:id
 * Edit existing prize.
 */
router.put('/prizes/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'معرّف الجائزة مطلوب.' });

    const prize = await updatePrizeAdmin(id, req.body);
    if (!prize) {
      return res.status(404).json({ error: 'الجائزة غير موجودة.' });
    }

    res.json({ success: true, prize });
  } catch (err: any) {
    console.error('[AdminWheelAPI] Update prize error:', err.message);
    res.status(500).json({ error: err.message || 'فشل تحديث الجائزة.' });
  }
});

/**
 * PATCH /api/admin/wheel/prizes/:id/toggle
 * Quick toggle active/inactive status.
 */
router.patch('/prizes/:id/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'معرّف الجائزة مطلوب.' });

    const prize = await togglePrizeActiveAdmin(id);
    if (!prize) {
      return res.status(404).json({ error: 'الجائزة غير موجودة.' });
    }

    res.json({ success: true, prize });
  } catch (err: any) {
    console.error('[AdminWheelAPI] Toggle prize error:', err.message);
    res.status(500).json({ error: 'فشل تعديل حالة الجائزة.' });
  }
});

/**
 * DELETE /api/admin/wheel/prizes/:id
 * Delete or soft-disable prize.
 */
router.delete('/prizes/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'معرّف الجائزة مطلوب.' });

    const result = await deletePrizeAdmin(id);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[AdminWheelAPI] Delete prize error:', err.message);
    res.status(500).json({ error: 'فشل حذف الجائزة.' });
  }
});

export default router;
