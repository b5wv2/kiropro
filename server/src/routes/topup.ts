import { Router, Response, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { randomUUID as uuidv4 } from 'crypto';
import pool from '../db';
import { requireAuth, requireAdmin, requirePermission, AuthRequest } from '../middlewares/authMiddleware';
import { sendTopupCreatedEmail, sendTopupApprovedEmail, sendTopupRejectedEmail } from '../services/emailService';
import { getGeneralSettings } from './admin';

const router = Router();

// Strict Top-Up Submission Limiter: 10 uploads / 15 mins per IP (prevents disk DoS)
const topupCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تم تجاوز الحد المسموح لطلبات الشحن مؤقتاً. يرجى الانتظار 15 دقيقة.' }
});

// Memory storage for Multer: Zero disk dependency on boot or during upload.
// Completely prevents ENOENT / EROFS crashes in read-only serverless environments (e.g. Vercel).
const storage = multer.memoryStorage();

// Multer Storage Configuration
// File Filter & MIME Validation
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

  if (allowedMimeTypes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter
});

/**
 * Validates actual file signature (magic bytes) from buffer to ensure uploaded file
 * matches its purported format and is not an executable or script disguised as image or document.
 */
function isValidFileSignature(buffer: Buffer, ext: string): boolean {
  try {
    if (!buffer || buffer.length < 4) return false;

    const cleanExt = ext.toLowerCase();
    // JPEG: FF D8 FF
    if (cleanExt === '.jpg' || cleanExt === '.jpeg') {
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    // PNG: 89 50 4E 47
    if (cleanExt === '.png') {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    }
    // WEBP: RIFF .... WEBP
    if (cleanExt === '.webp') {
      return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    }
    // PDF: %PDF
    if (cleanExt === '.pdf') {
      return buffer.toString('ascii', 0, 4) === '%PDF';
    }
    return false;
  } catch {
    return false;
  }
}

// ==========================================
// 1. PUBLIC / CUSTOMER ENDPOINTS
// ==========================================

// GET /api/payment-methods - Get enabled payment methods for customers
router.get('/payment-methods', async (_req: Request, res: Response) => {
  try {
    const query = 'SELECT id, name, type, currency, account_name, account_number, bank_name, instructions, display_order FROM "payment_methods" WHERE enabled = true AND currency = \'SDG\' ORDER BY display_order ASC, created_at ASC';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching payment methods:', err);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// GET /api/settings/exchange-rate - Get current exchange rate settings
router.get('/settings/exchange-rate', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT value, updated_at FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    if (result.rows.length === 0) {
      return res.json({
        rate: 5000,
        base_currency: 'USD',
        quote_currency: 'SDG',
        min_topup: 0.01,
        min_topup_sdg: 2,
        max_topup: 500
      });
    }
    const val = result.rows[0].value || {};
    res.json({
      ...val,
      min_topup: val.min_topup !== undefined ? Number(val.min_topup) : 0.01,
      min_topup_sdg: val.min_topup_sdg !== undefined ? Number(val.min_topup_sdg) : 2
    });
  } catch (err: any) {
    console.error('Error fetching exchange rate:', err);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

// POST /api/topups - Create Top-up Request with Receipt Upload (Supports USD & SDG)
router.post('/topups', topupCreateLimiter, requireAuth, (req: Request, res: Response) => {
  upload.single('receipt')(req, res, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الملف كبير جداً، الحد الأقصى المسموح به هو 5 ميغابايت.' });
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'نوع الملف غير مدعوم. الصيغ المقبولة هي JPG, PNG, WEBP, PDF فقط.' });
      }
      return res.status(400).json({ error: 'فشل رفع الإيصال: ' + err.message });
    }

    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Maintenance Mode Check: Prevent non-admin topups during maintenance
    const genSettings = await getGeneralSettings();
    if (genSettings.maintenanceMode && authReq.user.role !== 'ADMIN') {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(503).json({
        error: 'المتجر قيد الصيانة حالياً. لا يمكن استقبال طلبات شحن مؤقتاً.',
        maintenance: true
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'يرجى إرفاق إيصال التحويل البنكي.' });
    }

    // Deep File Inspection: Verify genuine magic bytes signature from buffer
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    if (!isValidFileSignature(req.file.buffer, fileExt)) {
      return res.status(400).json({ 
        error: 'محتوى الملف المرفق غير صالح أو تالف. يرجى رفع ملف صورة (JPG, PNG, WEBP) أو مستند PDF حقيقي فقط.' 
      });
    }

    const { amount_usd, requested_amount, requested_currency, payment_method_id, user_note } = req.body;

    try {
      // 1. Strict Currency Policy: Store customer wallet top-ups are strictly SDG
      const reqCurrency = requested_currency ? String(requested_currency).trim().toUpperCase() : 'SDG';
      if (reqCurrency !== 'SDG') {
        return res.status(400).json({ error: 'العملة المعتمدة لشحن محفظة المتجر هي الجنيه السوداني (SDG) فقط.' });
      }

      const targetCurrency = 'SDG';

      // 2. Fetch Exchange Rate Settings from database
      const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
      const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000, min_topup_sdg: 2, max_topup: 500 };

      const exchangeRate = Number(rateConfig.rate) || 5000;
      const maxTopupUsd = Number(rateConfig.max_topup) || 500;
      const maxTopupSdg = Math.round(maxTopupUsd * exchangeRate);

      const rawSdg = Number(requested_amount || (Number(amount_usd) * exchangeRate));
      if (!Number.isFinite(rawSdg) || rawSdg <= 0) {
        return res.status(400).json({ error: 'يرجى تحديد مبلغ شحن صحيح بالجنيه السوداني.' });
      }
      const calcAmountSdg = Math.round(rawSdg * 100) / 100;
      const finalRequestedAmount = calcAmountSdg;
      const calcAmountUsd = Math.round((calcAmountSdg / exchangeRate) * 100) / 100;

      // Security check: Must be strictly greater than 1 SDG as per business policy
      if (calcAmountSdg <= 1) {
        return res.status(400).json({ error: 'الحد الأدنى للشحن يجب أن يكون أكبر من 1 جنيه سوداني.' });
      }

      if (calcAmountSdg > maxTopupSdg) {
        return res.status(400).json({ error: `أقصى مبلغ للشحن في المرة الواحدة هو ${maxTopupSdg.toLocaleString()} ج.س.` });
      }

      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(fileExt) ? fileExt : '.jpg';
      const uniqueFilename = `receipt_${uuidv4()}${safeExt}`;
      const receiptUrl = `/uploads/receipts/${uniqueFilename}`;
      const requestId = uuidv4();

      // Permanently persist receipt into PostgreSQL "UploadedAsset" table
      try {
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype || (safeExt === '.pdf' ? 'application/pdf' : 'image/jpeg');
        await pool.query(
          `INSERT INTO "UploadedAsset" ("id", "filename", "mimeType", "dataBase64", "fileSize", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT ("filename") DO UPDATE SET
             "dataBase64" = EXCLUDED."dataBase64",
             "fileSize" = EXCLUDED."fileSize",
             "mimeType" = EXCLUDED."mimeType",
             "updatedAt" = NOW()`,
          [uniqueFilename, uniqueFilename, mimeType, base64, req.file.size]
        );
      } catch (assetErr: any) {
        console.error('[Topup] Failed to persist receipt to database:', assetErr.message);
        return res.status(500).json({
          error: 'تعذر حفظ إيصال التحويل بشكل دائم في النظام. يرجى المحاولة لاحقاً.'
        });
      }

      // Optional best-effort local disk caching (survives inside session; non-blocking)
      try {
        const cacheDir = process.env.VERCEL ? path.join('/tmp', 'uploads/receipts') : path.join(__dirname, '../../uploads/receipts');
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(path.join(cacheDir, uniqueFilename), req.file.buffer);
      } catch {}

      // Insert Pending Top-up Request with locked exchange rate and requested currency details
      const insertRes = await pool.query(
        `INSERT INTO "topup_requests" 
          (id, user_id, payment_method_id, amount_usd, exchange_rate, amount_sdg, status, receipt_url, user_note, requested_amount, requested_currency) 
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10) 
         RETURNING *`,
        [requestId, authReq.user.id, payment_method_id || null, calcAmountUsd, exchangeRate, calcAmountSdg, receiptUrl, user_note || null, finalRequestedAmount, targetCurrency]
      );

      // Trigger Top-Up Received Email Safely (Non-blocking background delivery)
      let pmName = 'تحويل بنكي';
      if (payment_method_id) {
        try {
          const pmRes = await pool.query('SELECT name FROM "payment_methods" WHERE id = $1', [payment_method_id]);
          if (pmRes.rows[0]?.name) pmName = pmRes.rows[0].name;
        } catch {}
      }

      sendTopupCreatedEmail({
        to: authReq.user.email,
        userId: authReq.user.id,
        topupId: requestId,
        customerName: (authReq.user as any)?.name || undefined,
        amount: finalRequestedAmount,
        currency: targetCurrency,
        paymentMethodName: pmName,
        exchangeRate: exchangeRate,
        requestIdShort: requestId.slice(0, 8).toUpperCase()
      }).catch(mailErr => console.error('[Topup] Non-blocking email error:', mailErr));

      res.status(201).json({
        message: 'تم استلام طلب شحن محفظتك بنجاح وسيتم مراجعته من قبل الإدارة.',
        topup: insertRes.rows[0]
      });
    } catch (dbErr: any) {
      console.error('Error creating topup request:', dbErr);
      res.status(500).json({ error: 'فشل تسجيل طلب الشحن في النظام.' });
    }
  });
});

// GET /api/topups - Customer: Get my top-up requests
router.get('/topups', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await pool.query(
      `SELECT t.*, pm.name as payment_method_name, pm.bank_name, pm.account_name, pm.account_number 
       FROM "topup_requests" t
       LEFT JOIN "payment_methods" pm ON t.payment_method_id = pm.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching user topup requests:', err);
    res.status(500).json({ error: 'Failed to fetch top-up requests' });
  }
});

// GET /api/topups/:id - Customer: Get single top-up request
router.get('/topups/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await pool.query(
      `SELECT t.*, pm.name as payment_method_name, pm.bank_name, pm.account_name, pm.account_number 
       FROM "topup_requests" t
       LEFT JOIN "payment_methods" pm ON t.payment_method_id = pm.id
       WHERE t.id = $1 AND t.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Top-up request not found' });
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Error fetching topup request:', err);
    res.status(500).json({ error: 'Failed to fetch top-up request' });
  }
});

// ==========================================
// 2. ADMIN ENDPOINTS (RBAC: requireAdmin)
// ==========================================

// Helper to validate UUID format
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

// In-memory cache for payment_methods table columns
let cachedPmCols: Set<string> | null = null;
async function getPaymentMethodColumns(): Promise<Set<string>> {
  if (cachedPmCols) return cachedPmCols;
  try {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'payment_methods'`
    );
    cachedPmCols = new Set(res.rows.map(r => r.column_name));
    return cachedPmCols;
  } catch {
    return new Set(['id', 'name', 'type', 'currency', 'account_name', 'account_number', 'bank_name', 'instructions', 'enabled', 'display_order', 'created_at', 'updated_at']);
  }
}

// GET /api/admin/payment-methods - List all payment methods
router.get('/admin/payment-methods', requirePermission('PAYMENT_METHODS_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM "payment_methods" ORDER BY display_order ASC, created_at ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('Admin fetch payment methods error:', err);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// POST /api/admin/payment-methods - Create new payment method
router.post('/admin/payment-methods', requirePermission('PAYMENT_METHODS_MANAGE'), async (req: AuthRequest, res: Response) => {
  const { name, type, currency, account_name, account_number, bank_name, phone_number, qr_code_url, instructions, enabled, display_order } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'اسم طريقة الدفع حقل مطلوب.' });
  }
  if (!account_name || typeof account_name !== 'string' || !account_name.trim()) {
    return res.status(400).json({ error: 'اسم صاحب الحساب حقل مطلوب.' });
  }
  if (!account_number || typeof account_number !== 'string' || !account_number.trim()) {
    return res.status(400).json({ error: 'رقم الحساب أو الآيبان حقل مطلوب.' });
  }
  if (!bank_name || typeof bank_name !== 'string' || !bank_name.trim()) {
    return res.status(400).json({ error: 'اسم البنك أو المزود حقل مطلوب.' });
  }

  try {
    const cols = await getPaymentMethodColumns();
    const newId = uuidv4();
    const insertCols: string[] = ['id', 'name', 'type', 'currency', 'account_name', 'account_number', 'bank_name'];
    const insertVals: any[] = [
      newId,
      name.trim(),
      type ? String(type).trim() : 'BANK_TRANSFER',
      currency ? String(currency).trim().toUpperCase() : 'SDG',
      account_name.trim(),
      account_number.trim(),
      bank_name.trim()
    ];

    if (cols.has('instructions')) {
      insertCols.push('instructions');
      insertVals.push(instructions && String(instructions).trim() ? String(instructions).trim() : null);
    }
    if (cols.has('enabled')) {
      insertCols.push('enabled');
      insertVals.push(enabled !== undefined ? Boolean(enabled) : true);
    }
    if (cols.has('display_order')) {
      insertCols.push('display_order');
      const orderNum = parseInt(display_order, 10);
      insertVals.push(isNaN(orderNum) ? 0 : orderNum);
    }
    if (cols.has('phone_number')) {
      insertCols.push('phone_number');
      insertVals.push(phone_number && String(phone_number).trim() ? String(phone_number).trim() : null);
    }
    if (cols.has('qr_code_url')) {
      insertCols.push('qr_code_url');
      insertVals.push(qr_code_url && String(qr_code_url).trim() ? String(qr_code_url).trim() : null);
    }

    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
    const query = `INSERT INTO "payment_methods" (${insertCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;

    const result = await pool.query(query, insertVals);

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), req.user?.id, 'PAYMENT_METHOD_CREATE', `Created payment method ${name.trim()}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('Error creating payment method:', err);
    res.status(500).json({ error: 'فشل إنشاء طريقة الدفع. يرجى التحقق من صحة البيانات المدخلة.' });
  }
});

// PATCH /api/admin/payment-methods/:id - Update payment method
router.patch('/admin/payment-methods/:id', requirePermission('PAYMENT_METHODS_MANAGE'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'معرّف طريقة الدفع غير صالح.' });
  }

  const { name, type, currency, account_name, account_number, bank_name, phone_number, qr_code_url, instructions, enabled, display_order } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM "payment_methods" WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'طريقة الدفع غير موجودة.' });
    }

    const cols = await getPaymentMethodColumns();
    const updateClauses: string[] = [];
    const updateVals: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'اسم طريقة الدفع لا يمكن أن يكون فارغاً.' });
      }
      updateClauses.push(`"name" = $${paramIdx++}`);
      updateVals.push(name.trim());
    }

    if (type !== undefined) {
      updateClauses.push(`"type" = $${paramIdx++}`);
      updateVals.push(type ? String(type).trim() : 'BANK_TRANSFER');
    }

    if (currency !== undefined) {
      updateClauses.push(`"currency" = $${paramIdx++}`);
      updateVals.push(currency ? String(currency).trim().toUpperCase() : 'SDG');
    }

    if (account_name !== undefined) {
      if (typeof account_name !== 'string' || !account_name.trim()) {
        return res.status(400).json({ error: 'اسم صاحب الحساب لا يمكن أن يكون فارغاً.' });
      }
      updateClauses.push(`"account_name" = $${paramIdx++}`);
      updateVals.push(account_name.trim());
    }

    if (account_number !== undefined) {
      if (typeof account_number !== 'string' || !account_number.trim()) {
        return res.status(400).json({ error: 'رقم الحساب أو الآيبان لا يمكن أن يكون فارغاً.' });
      }
      updateClauses.push(`"account_number" = $${paramIdx++}`);
      updateVals.push(account_number.trim());
    }

    if (bank_name !== undefined) {
      if (typeof bank_name !== 'string' || !bank_name.trim()) {
        return res.status(400).json({ error: 'اسم البنك لا يمكن أن يكون فارغاً.' });
      }
      updateClauses.push(`"bank_name" = $${paramIdx++}`);
      updateVals.push(bank_name.trim());
    }

    if (instructions !== undefined && cols.has('instructions')) {
      updateClauses.push(`"instructions" = $${paramIdx++}`);
      updateVals.push(instructions && String(instructions).trim() ? String(instructions).trim() : null);
    }

    if (enabled !== undefined && cols.has('enabled')) {
      updateClauses.push(`"enabled" = $${paramIdx++}`);
      updateVals.push(Boolean(enabled));
    }

    if (display_order !== undefined && cols.has('display_order')) {
      const orderNum = parseInt(display_order, 10);
      updateClauses.push(`"display_order" = $${paramIdx++}`);
      updateVals.push(isNaN(orderNum) ? 0 : orderNum);
    }

    if (cols.has('phone_number') && phone_number !== undefined) {
      updateClauses.push(`"phone_number" = $${paramIdx++}`);
      updateVals.push(phone_number && String(phone_number).trim() ? String(phone_number).trim() : null);
    }

    if (cols.has('qr_code_url') && qr_code_url !== undefined) {
      updateClauses.push(`"qr_code_url" = $${paramIdx++}`);
      updateVals.push(qr_code_url && String(qr_code_url).trim() ? String(qr_code_url).trim() : null);
    }

    if (cols.has('updated_at')) {
      updateClauses.push(`"updated_at" = CURRENT_TIMESTAMP`);
    }

    if (updateClauses.length === 0) {
      return res.json(existing.rows[0]);
    }

    updateVals.push(id);
    const query = `UPDATE "payment_methods" SET ${updateClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const updatedRes = await pool.query(query, updateVals);

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), req.user?.id, 'PAYMENT_METHOD_UPDATE', `Updated payment method ${id}`]
    );

    res.json(updatedRes.rows[0]);
  } catch (err: any) {
    console.error('Error updating payment method:', err);
    res.status(500).json({ error: 'فشل تحديث طريقة الدفع. يرجى التحقق من صحة البيانات.' });
  }
});

// DELETE /api/admin/payment-methods/:id - Delete payment method
router.delete('/admin/payment-methods/:id', requirePermission('PAYMENT_METHODS_MANAGE'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'معرّف طريقة الدفع غير صالح.' });
  }

  try {
    const deletedRes = await pool.query('DELETE FROM "payment_methods" WHERE id = $1 RETURNING name', [id]);
    if (deletedRes.rows.length === 0) {
      return res.status(404).json({ error: 'طريقة الدفع غير موجودة.' });
    }

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), req.user?.id, 'PAYMENT_METHOD_DELETE', `Deleted payment method ${deletedRes.rows[0].name}`]
    );

    res.json({ message: 'تم حذف طريقة الدفع بنجاح.' });
  } catch (err: any) {
    console.error('Error deleting payment method:', err);
    res.status(500).json({ error: 'فشل حذف طريقة الدفع.' });
  }
});

// GET /api/admin/topups - List top-up requests for Admin with customer details
router.get('/admin/topups', requirePermission('TOPUPS_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        t.*,
        u.name as user_name,
        u.email as user_email,
        pm.name as payment_method_name,
        pm.bank_name,
        pm.account_name,
        pm.account_number,
        rev.name as reviewer_name,
        rev.email as reviewer_email
       FROM "topup_requests" t
       JOIN "User" u ON t.user_id = u.id
       LEFT JOIN "payment_methods" pm ON t.payment_method_id = pm.id
       LEFT JOIN "User" rev ON t.reviewed_by = rev.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('Admin fetch topup requests error:', err);
    res.status(500).json({ error: 'Failed to fetch topup requests' });
  }
});

// GET /api/admin/topups/:id - Get single top-up request details
router.get('/admin/topups/:id', requirePermission('TOPUPS_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        t.*,
        u.name as user_name,
        u.email as user_email,
        pm.name as payment_method_name,
        pm.bank_name,
        pm.account_name,
        pm.account_number,
        rev.name as reviewer_name,
        rev.email as reviewer_email
       FROM "topup_requests" t
       JOIN "User" u ON t.user_id = u.id
       LEFT JOIN "payment_methods" pm ON t.payment_method_id = pm.id
       LEFT JOIN "User" rev ON t.reviewed_by = rev.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'طلب الشحن غير موجود' });
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Admin fetch topup request detail error:', err);
    res.status(500).json({ error: 'Failed to fetch topup request' });
  }
});

// POST /api/admin/topups/:id/approve - Approve Top-up with Row-Lock Transaction & Idempotency
router.post('/admin/topups/:id/approve', requirePermission('TOPUPS_MANAGE'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;
  const { admin_note } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Top-up ID is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock top-up request row FOR UPDATE to guarantee concurrency protection
    const topupRes = await client.query('SELECT * FROM "topup_requests" WHERE id = $1 FOR UPDATE', [id]);
    const topup = topupRes.rows[0];

    if (!topup) {
      throw new Error('NOT_FOUND');
    }

    // 2. Strict check: Must be in PENDING state. Prevent double approval or approving rejected requests
    if (topup.status !== 'PENDING') {
      throw new Error('ALREADY_PROCESSED');
    }

    // 2.1. Strict Separation of Duties: Admin cannot approve their own top-up request
    if (topup.user_id === adminId) {
      throw new Error('SELF_APPROVAL_FORBIDDEN');
    }

    // 3. Update top-up request status to APPROVED
    await client.query(
      `UPDATE "topup_requests" SET 
        status = 'APPROVED', 
        reviewed_by = $1, 
        reviewed_at = CURRENT_TIMESTAMP,
        admin_note = COALESCE($2, admin_note),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [adminId, admin_note || null, id]
    );

    // 4. Lock user's wallet FOR UPDATE
    let walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [topup.user_id]);
    let wallet = walletRes.rows[0];
    let walletId = wallet?.id;
    const walletCurrency = 'SDG';
    
    // Credit amount strictly in SDG
    const creditAmount = Number(topup.amount_sdg || Math.round(Number(topup.amount_usd) * Number(topup.exchange_rate)));

    let balanceBefore = 0;
    let balanceAfter = creditAmount;

    if (!wallet) {
      walletId = uuidv4();
      await client.query(
        'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
        [walletId, topup.user_id, balanceAfter, walletCurrency]
      );
    } else {
      balanceBefore = Number(wallet.balance);
      balanceAfter = Math.round((balanceBefore + creditAmount) * 100) / 100;
      await client.query(
        'UPDATE "Wallet" SET balance = $1, currency = \'SDG\', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [balanceAfter, walletId]
      );
    }

    // 5. Create Wallet Transaction with reference to Top-up request and locked rate
    const txId = uuidv4();
    const txDescription = `شحن محفظة بنكي معتمد (${creditAmount.toLocaleString()} ج.س)`;

    await client.query(
      `INSERT INTO "WalletTransaction" 
        (id, "walletId", amount, type, description, "referenceId", "referenceType", "balanceBefore", "balanceAfter", "createdBy", currency, source_amount_usd, exchange_rate, "created_by_type") 
       VALUES ($1, $2, $3, 'TOPUP', $4, $5, 'TOPUP_REQUEST', $6, $7, $8, $9, $10, $11, 'ADMIN')`,
      [
        txId,
        walletId,
        creditAmount,
        txDescription,
        topup.id,
        balanceBefore,
        balanceAfter,
        adminId,
        walletCurrency,
        topup.amount_usd,
        topup.exchange_rate
      ]
    );

    // 6. Record in Audit Log
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", amount, reason) 
       VALUES ($1, $2, 'TOPUP_APPROVE', $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        topup.user_id,
        topup.amount_usd,
        `Approved top-up request #${topup.id.slice(0, 8)} (${topup.amount_usd} USD / ${topup.amount_sdg} SDG)`
      ]
    );

    await client.query('COMMIT');

    // Trigger Top-up Approved Email safely in background
    pool.query('SELECT name, email FROM "User" WHERE id = $1', [topup.user_id])
      .then(uRes => {
        const u = uRes.rows[0];
        if (u?.email) {
          sendTopupApprovedEmail({
            to: u.email,
            userId: topup.user_id,
            topupId: topup.id,
            customerName: u.name || undefined,
            amount: creditAmount,
            currency: walletCurrency,
            currentBalance: balanceAfter
          }).catch(mailErr => console.error('[Topup Approve] Non-blocking email error:', mailErr));
        }
      })
      .catch(err => console.error('[Topup Approve] User query error for email:', err));

    res.json({
      message: 'تمت الموافقة على طلب الشحن وإيداع الرصيد في محفظة العميل بنجاح.',
      balance: balanceAfter
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'طلب الشحن غير موجود.' });
    }
    if (err.message === 'ALREADY_PROCESSED') {
      return res.status(400).json({ error: 'هذا الطلب تمت معالجته مسبقاً ولا يمكن تكرار الموافقة عليه.' });
    }
    if (err.message === 'SELF_APPROVAL_FORBIDDEN') {
      return res.status(403).json({ error: 'غير مصرح: لا يمكن للمسؤول اعتماد أو مراجعة طلب شحن خاص بحسابه الشخصي (فصل الصلاحيات).' });
    }
    console.error('Error approving topup request:', err);
    res.status(500).json({ error: 'فشل اعتماد طلب الشحن: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/admin/topups/:id/reject - Reject Top-up Request
router.post('/admin/topups/:id/reject', requirePermission('TOPUPS_MANAGE'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;
  const { rejection_reason, admin_note } = req.body;

  if (!rejection_reason || !rejection_reason.trim()) {
    return res.status(400).json({ error: 'يرجى تحديد سبب الرفض.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const topupRes = await client.query('SELECT * FROM "topup_requests" WHERE id = $1 FOR UPDATE', [id]);
    const topup = topupRes.rows[0];

    if (!topup) {
      throw new Error('NOT_FOUND');
    }

    if (topup.status !== 'PENDING') {
      throw new Error('ALREADY_PROCESSED');
    }

    // Strict Separation of Duties: Admin cannot reject/moderate their own top-up request
    if (topup.user_id === adminId) {
      throw new Error('SELF_APPROVAL_FORBIDDEN');
    }

    await client.query(
      `UPDATE "topup_requests" SET 
        status = 'REJECTED', 
        rejection_reason = $1, 
        admin_note = COALESCE($2, admin_note),
        reviewed_by = $3, 
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [rejection_reason.trim(), admin_note || null, adminId, id]
    );

    // Audit Log
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", amount, reason) 
       VALUES ($1, $2, 'TOPUP_REJECT', $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        topup.user_id,
        topup.amount_usd,
        `Rejected top-up #${topup.id.slice(0, 8)}. Reason: ${rejection_reason.trim()}`
      ]
    );

    await client.query('COMMIT');

    // Trigger Top-up Rejected Email safely in background
    const rejectionAmount = (topup.requested_currency || 'USD') === 'SDG'
      ? Number(topup.amount_sdg || topup.requested_amount)
      : Number(topup.amount_usd);

    pool.query('SELECT name, email FROM "User" WHERE id = $1', [topup.user_id])
      .then(uRes => {
        const u = uRes.rows[0];
        if (u?.email) {
          sendTopupRejectedEmail({
            to: u.email,
            userId: topup.user_id,
            topupId: topup.id,
            customerName: u.name || undefined,
            amount: rejectionAmount,
            currency: topup.requested_currency || 'USD',
            requestIdShort: topup.id.slice(0, 8).toUpperCase(),
            rejectionReason: rejection_reason.trim()
          }).catch(mailErr => console.error('[Topup Reject] Non-blocking email error:', mailErr));
        }
      })
      .catch(err => console.error('[Topup Reject] User query error for email:', err));

    res.json({ message: 'تم رفض طلب الشحن وتسجيل السبب بنجاح.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'طلب الشحن غير موجود.' });
    }
    if (err.message === 'ALREADY_PROCESSED') {
      return res.status(400).json({ error: 'هذا الطلب تمت معالجته مسبقاً.' });
    }
    if (err.message === 'SELF_APPROVAL_FORBIDDEN') {
      return res.status(403).json({ error: 'غير مصرح: لا يمكن للمسؤول مراجعة طلب شحن خاص بحسابه الشخصي.' });
    }
    console.error('Error rejecting topup request:', err);
    res.status(500).json({ error: 'فشل رفض طلب الشحن: ' + err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/admin/settings/exchange-rate - Admin updates exchange rate & limits
router.patch('/admin/settings/exchange-rate', requirePermission('SETTINGS_MANAGE'), async (req: AuthRequest, res: Response) => {
  const { rate, base_currency, quote_currency, min_topup, max_topup } = req.body;
  const adminId = req.user?.id;

  const numRate = parseFloat(rate);
  if (!numRate || isNaN(numRate) || numRate <= 0) {
    return res.status(400).json({ error: 'سعر الصرف يجب أن يكون رقماً موجباً.' });
  }

  try {
    const updatedValue = {
      rate: numRate,
      base_currency: base_currency || 'USD',
      quote_currency: quote_currency || 'SDG',
      min_topup: min_topup !== undefined ? parseFloat(min_topup) : 0.01,
      min_topup_sdg: 2,
      max_topup: max_topup !== undefined ? parseFloat(max_topup) : 500
    };

    // Fetch previous rate for audit history
    const prevRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const prevRate = Number(prevRes.rows[0]?.value?.rate) || numRate;

    await pool.query(
      `INSERT INTO "platform_settings" ("key", "value", "updated_at", "updated_by") 
       VALUES ('exchange_rate', $1, CURRENT_TIMESTAMP, $2)
       ON CONFLICT ("key") DO UPDATE SET 
         "value" = EXCLUDED.value, 
         "updated_at" = CURRENT_TIMESTAMP, 
         "updated_by" = EXCLUDED.updated_by`,
      [JSON.stringify(updatedValue), adminId]
    );

    // Record in exchange_rate_history
    await pool.query(
      `INSERT INTO exchange_rate_history (id, old_rate, new_rate, base_currency, quote_currency, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        prevRate,
        numRate,
        updatedValue.base_currency,
        updatedValue.quote_currency,
        adminId || null,
        `تحديث سعر الصرف من ${prevRate} إلى ${numRate} ${updatedValue.quote_currency}`
      ]
    );

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'EXCHANGE_RATE_UPDATE', `Updated exchange rate to 1 USD = ${numRate} ${updatedValue.quote_currency}`]
    );

    res.json({ message: 'تم تحديث سعر الصرف وإعدادات الدفع بنجاح.', settings: updatedValue });
  } catch (err: any) {
    console.error('Error updating exchange rate:', err);
    res.status(500).json({ error: 'فشل تحديث سعر الصرف.' });
  }
});

export default router;
