import { Router, Response, Request } from 'express';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import {
  getUsdtAdminStats,
  updateUsdtInventory,
  updateUsdtExchangeRate,
  updateUsdtMinAmount,
  updateUsdtImage,
  completeUsdtOrder,
  cancelUsdtOrder,
  createCryptoNetwork,
  updateCryptoNetwork,
  deleteCryptoNetwork
} from '../services/cryptoService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Configure local storage upload for USDT product image matching products.ts
const uploadsDir = path.resolve(__dirname, '../../uploads/products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `prod_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('صيغة الصورة غير مدعومة. يسمح فقط بصيغ JPG, PNG, WEBP, SVG.'));
    }
  }
});

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
      return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
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

// All routes in this file require an authenticated admin session
router.use(requireAdmin);

/**
 * Admin: Upload or replace USDT Product Card Image
 * POST /api/admin/crypto/image
 */
router.post('/image', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم إرفاق أي صورة.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!isValidImageFileSignature(req.file.path, ext)) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'بصمة الصورة غير صالحة أو الملف تالف.' });
  }

  const relativeUrl = `/uploads/products/${req.file.filename}`;
  const backendUrl = (process.env.BACKEND_URL || process.env.API_URL || '').trim().replace(/\/+$/, '');
  const finalUrl = backendUrl ? `${backendUrl}${relativeUrl}` : relativeUrl;

  try {
    const adminUser = (req as AuthRequest).user;
    await updateUsdtImage(finalUrl, adminUser?.id);
    return res.json({
      success: true,
      imageUrl: finalUrl,
      message: 'تم تحديث صورة منتج USDT بنجاح.'
    });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to save image to database:', err);
    return res.status(500).json({ error: 'فشل حفظ رابط الصورة في قاعدة البيانات.' });
  }
});

/**
 * Admin: Remove USDT Product Card Image (Reverts to fallback)
 * DELETE /api/admin/crypto/image
 */
router.delete('/image', async (req: AuthRequest, res: Response) => {
  try {
    await updateUsdtImage(null, req.user?.id);
    return res.json({
      success: true,
      imageUrl: null,
      message: 'تم حذف صورة المنتج والعودة للصورة الافتراضية.'
    });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to remove image:', err);
    return res.status(500).json({ error: 'فشل حذف صورة المنتج.' });
  }
});

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
 * Admin: Update Minimum Order Amount (Hard Floor >= 1.0)
 */
router.patch('/settings', async (req: AuthRequest, res: Response) => {
  const { minAmount } = req.body;
  const adminId = req.user?.id;

  const numMin = Number(minAmount);
  if (isNaN(numMin) || numMin < 1.0) {
    return res.status(400).json({
      code: 'MINIMUM_USDT_AMOUNT_NOT_MET',
      error: 'لا يمكن تعيين الحد الأدنى لأقل من 1 USDT كقاعدة حماية إلزامية في النظام.'
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
        COALESCE(o."usdtExchangeRateUsed", o."exchangeRateUsed") as "usdtExchangeRateUsed",
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
    const netRes = await pool.query(`
      SELECT 
        n.*,
        COALESCE((
          SELECT COUNT(*)::int 
          FROM "Order" o 
          WHERE (o."cryptoNetwork" = n.identifier OR UPPER(o."cryptoNetwork") = UPPER(n.name))
            AND o."orderType" = 'USDT_TRANSFER'
        ), 0) as orders_count
      FROM crypto_networks n
      ORDER BY n.display_order ASC
    `);
    return res.json(netRes.rows);
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to list networks:', err);
    return res.status(500).json({ error: 'تعذر جلب قائمة الشبكات.' });
  }
});

/**
 * Admin: Add New Crypto Network
 */
router.post('/networks', async (req: AuthRequest, res: Response) => {
  const { identifier, name, validatorType, minAmount, enabled, displayOrder } = req.body;
  try {
    const network = await createCryptoNetwork({
      identifier,
      name,
      validatorType,
      minAmount,
      enabled,
      displayOrder
    });
    return res.status(201).json({ success: true, network, message: 'تمت إضافة الشبكة بنجاح.' });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to create network:', err);
    return res.status(400).json({ error: err.message || 'فشل إضافة الشبكة.' });
  }
});

/**
 * Admin: Update Crypto Network
 */
router.patch('/networks/:id', async (req: AuthRequest, res: Response) => {
  const id: string = String(req.params.id || '');
  const { enabled, min_amount, minAmount, display_order, displayOrder, name, identifier, validator_type, validatorType } = req.body;

  try {
    const network = await updateCryptoNetwork(id, {
      name,
      identifier,
      validatorType: validatorType || validator_type,
      minAmount: minAmount !== undefined ? minAmount : min_amount,
      enabled,
      displayOrder: displayOrder !== undefined ? displayOrder : display_order
    });

    return res.json({ success: true, network, message: 'تم تحديث الشبكة بنجاح.' });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to update network:', err);
    return res.status(400).json({ error: err.message || 'فشل تحديث الشبكة.' });
  }
});

/**
 * Admin: Delete Crypto Network (Guarded against historical orders)
 */
router.delete('/networks/:id', async (req: AuthRequest, res: Response) => {
  const id: string = String(req.params.id || '');
  try {
    const result = await deleteCryptoNetwork(id);
    return res.json({ message: 'تم حذف الشبكة بنجاح.', ...result });
  } catch (err: any) {
    console.error('[AdminCrypto] Failed to delete network:', err);
    return res.status(err.statusCode || 400).json({ error: err.message || 'فشل حذف الشبكة.', code: err.code });
  }
});

export default router;
