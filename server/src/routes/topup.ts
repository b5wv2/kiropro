import { Router, Response, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
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

// Configure Uploads Directory
const UPLOADS_DIR = path.join(__dirname, '../../uploads/receipts');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext) ? ext : '.jpg';
    const uniqueFilename = `receipt_${uuidv4()}${safeExt}`;
    cb(null, uniqueFilename);
  }
});

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
 * Validates actual file signature (magic bytes) to ensure uploaded file
 * matches its purported format and is not an executable or script disguised as image.
 */
function isValidFileSignature(filePath: string, ext: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return false;

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
      return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
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
router.get('/payment-methods', async (req: Request, res: Response) => {
  try {
    const currency = req.query.currency ? String(req.query.currency).trim().toUpperCase() : null;
    let query = 'SELECT id, name, type, currency, account_name, account_number, bank_name, instructions, display_order FROM "payment_methods" WHERE enabled = true';
    const params: any[] = [];
    if (currency && (currency === 'USD' || currency === 'SDG')) {
      query += ' AND currency = $1';
      params.push(currency);
    }
    query += ' ORDER BY display_order ASC, created_at ASC';
    const result = await pool.query(query, params);
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
        min_topup: 1,
        max_topup: 500
      });
    }
    res.json(result.rows[0].value);
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

    if (!req.file) {
      return res.status(400).json({ error: 'يرجى إرفاق إيصال التحويل البنكي.' });
    }

    // Deep File Inspection: Verify genuine magic bytes signature to reject malicious disguised files
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    if (!isValidFileSignature(req.file.path, fileExt)) {
      if (fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({ 
        error: 'محتوى الملف المرفق غير صالح أو تالف. يرجى رفع ملف صورة (JPG, PNG, WEBP) أو مستند PDF حقيقي فقط.' 
      });
    }

    const { amount_usd, requested_amount, requested_currency, payment_method_id, user_note } = req.body;

    try {
      // 1. Fetch user preferred currency
      const userRes = await pool.query('SELECT preferred_currency FROM "User" WHERE id = $1', [authReq.user.id]);
      const userDefaultCurrency = userRes.rows[0]?.preferred_currency || 'USD';

      let targetCurrency = requested_currency ? String(requested_currency).trim().toUpperCase() : userDefaultCurrency;
      if (targetCurrency !== 'USD' && targetCurrency !== 'SDG') {
        targetCurrency = userDefaultCurrency;
      }

      // 2. Fetch Exchange Rate Settings from database
      const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
      const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000, min_topup: 1, max_topup: 500 };

      const exchangeRate = Number(rateConfig.rate) || 5000;
      const minTopupUsd = Number(rateConfig.min_topup) || 1;
      const maxTopupUsd = Number(rateConfig.max_topup) || 500;

      let calcAmountUsd = 0;
      let calcAmountSdg = 0;
      let finalRequestedAmount = 0;

      if (targetCurrency === 'SDG') {
        const rawSdg = Number(requested_amount || (Number(amount_usd) * exchangeRate));
        if (!Number.isFinite(rawSdg) || rawSdg <= 0) {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'يرجى تحديد مبلغ شحن صحيح بالجنيه السوداني.' });
        }
        calcAmountSdg = Math.round(rawSdg);
        finalRequestedAmount = calcAmountSdg;
        calcAmountUsd = Math.round((calcAmountSdg / exchangeRate) * 100) / 100;
      } else {
        const rawUsd = Number(requested_amount || amount_usd);
        if (!Number.isFinite(rawUsd) || rawUsd <= 0) {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'يرجى تحديد مبلغ شحن صحيح بالدولار.' });
        }
        calcAmountUsd = Math.round(rawUsd * 100) / 100;
        finalRequestedAmount = calcAmountUsd;
        calcAmountSdg = Math.round(calcAmountUsd * exchangeRate);
      }

      if (calcAmountUsd < minTopupUsd) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const minLabel = targetCurrency === 'SDG' ? `${Math.round(minTopupUsd * exchangeRate).toLocaleString()} ج.س` : `$${minTopupUsd}`;
        return res.status(400).json({ error: `أقل مبلغ للشحن هو ${minLabel}.` });
      }

      if (calcAmountUsd > maxTopupUsd) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const maxLabel = targetCurrency === 'SDG' ? `${Math.round(maxTopupUsd * exchangeRate).toLocaleString()} ج.س` : `$${maxTopupUsd}`;
        return res.status(400).json({ error: `أقصى مبلغ للشحن في المرة الواحدة هو ${maxLabel}.` });
      }

      const receiptUrl = `/uploads/receipts/${req.file.filename}`;
      const requestId = uuidv4();

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
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
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

// GET /api/admin/payment-methods - List all payment methods
router.get('/admin/payment-methods', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM "payment_methods" ORDER BY display_order ASC, created_at ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('Admin fetch payment methods error:', err);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// POST /api/admin/payment-methods - Create new payment method
router.post('/admin/payment-methods', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name, type, currency, account_name, account_number, bank_name, instructions, enabled, display_order } = req.body;

  if (!name || !account_name || !account_number || !bank_name) {
    return res.status(400).json({ error: 'اسم الطريقة، اسم البنك، اسم الحساب، ورقم الحساب حقول مطلوبة.' });
  }

  try {
    const newId = uuidv4();
    const result = await pool.query(
      `INSERT INTO "payment_methods" 
        (id, name, type, currency, account_name, account_number, bank_name, instructions, enabled, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        newId,
        name,
        type || 'BANK_TRANSFER',
        currency || 'SDG',
        account_name,
        account_number,
        bank_name,
        instructions || null,
        enabled !== undefined ? enabled : true,
        display_order || 0
      ]
    );

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), req.user?.id, 'PAYMENT_METHOD_CREATE', `Created payment method ${name}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('Error creating payment method:', err);
    res.status(500).json({ error: 'Failed to create payment method' });
  }
});

// PATCH /api/admin/payment-methods/:id - Update payment method
router.patch('/admin/payment-methods/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, type, currency, account_name, account_number, bank_name, instructions, enabled, display_order } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM "payment_methods" WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'طريقة الدفع غير موجودة' });
    }

    const current = existing.rows[0];
    const updatedRes = await pool.query(
      `UPDATE "payment_methods" SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        currency = COALESCE($3, currency),
        account_name = COALESCE($4, account_name),
        account_number = COALESCE($5, account_number),
        bank_name = COALESCE($6, bank_name),
        instructions = COALESCE($7, instructions),
        enabled = COALESCE($8, enabled),
        display_order = COALESCE($9, display_order),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [
        name !== undefined ? name : current.name,
        type !== undefined ? type : current.type,
        currency !== undefined ? currency : current.currency,
        account_name !== undefined ? account_name : current.account_name,
        account_number !== undefined ? account_number : current.account_number,
        bank_name !== undefined ? bank_name : current.bank_name,
        instructions !== undefined ? instructions : current.instructions,
        enabled !== undefined ? enabled : current.enabled,
        display_order !== undefined ? display_order : current.display_order,
        id
      ]
    );

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), req.user?.id, 'PAYMENT_METHOD_UPDATE', `Updated payment method ${id}`]
    );

    res.json(updatedRes.rows[0]);
  } catch (err: any) {
    console.error('Error updating payment method:', err);
    res.status(500).json({ error: 'Failed to update payment method' });
  }
});

// DELETE /api/admin/payment-methods/:id - Delete payment method
router.delete('/admin/payment-methods/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const deletedRes = await pool.query('DELETE FROM "payment_methods" WHERE id = $1 RETURNING name', [id]);
    if (deletedRes.rows.length === 0) {
      return res.status(404).json({ error: 'طريقة الدفع غير موجودة' });
    }

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), req.user?.id, 'PAYMENT_METHOD_DELETE', `Deleted payment method ${deletedRes.rows[0].name}`]
    );

    res.json({ message: 'تم حذف طريقة الدفع بنجاح.' });
  } catch (err: any) {
    console.error('Error deleting payment method:', err);
    res.status(500).json({ error: 'Failed to delete payment method' });
  }
});

// GET /api/admin/topups - List top-up requests for Admin with customer details
router.get('/admin/topups', requireAdmin, async (req: AuthRequest, res: Response) => {
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
router.get('/admin/topups/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
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
router.post('/admin/topups/:id/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
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
    let walletCurrency = (wallet?.currency || topup.requested_currency || 'USD').toUpperCase();
    
    // Credit amount according to user's wallet currency
    const creditAmount = walletCurrency === 'SDG' 
      ? Number(topup.amount_sdg || Math.round(Number(topup.amount_usd) * Number(topup.exchange_rate)))
      : Number(topup.amount_usd);

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
        'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [balanceAfter, walletId]
      );
    }

    // 5. Create Wallet Transaction with reference to Top-up request and locked rate
    const txId = uuidv4();
    const currencyLabel = walletCurrency === 'SDG' ? 'ج.س' : '$';
    const txDescription = walletCurrency === 'SDG'
      ? `شحن محفظة بنكي معتمد (${creditAmount.toLocaleString()} ج.س - ما يعادل $${topup.amount_usd} USD بسعر صرف ${topup.exchange_rate})`
      : `شحن محفظة معتمد ($${topup.amount_usd} USD)`;

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
router.post('/admin/topups/:id/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
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
router.patch('/admin/settings/exchange-rate', requireAdmin, async (req: AuthRequest, res: Response) => {
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
      min_topup: min_topup !== undefined ? parseFloat(min_topup) : 1,
      max_topup: max_topup !== undefined ? parseFloat(max_topup) : 500
    };

    await pool.query(
      `INSERT INTO "platform_settings" ("key", "value", "updated_at", "updated_by") 
       VALUES ('exchange_rate', $1, CURRENT_TIMESTAMP, $2)
       ON CONFLICT ("key") DO UPDATE SET 
         "value" = EXCLUDED.value, 
         "updated_at" = CURRENT_TIMESTAMP, 
         "updated_by" = EXCLUDED.updated_by`,
      [JSON.stringify(updatedValue), adminId]
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
