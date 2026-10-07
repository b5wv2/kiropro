import { Router, Response } from 'express';
import multer from 'multer';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  encryptCardData,
  decryptCardData,
  cleanCardNumber,
  extractLast4,
  formatCardNumber,
  maskCardNumber,
  isValidExpDate,
  isValidCvv,
  isValidLuhn,
  hashCardNumber,
  parseCsvLine
} from '../utils/cryptoCard';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max file size
});

// ==========================================
// 1. INVENTORY STATISTICS & LOW STOCK ALERT
// ==========================================
router.get('/stats', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*)::int as "totalCards",
        COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END)::int as "available",
        COUNT(CASE WHEN status = 'CLAIMED' THEN 1 END)::int as "claimed",
        COUNT(CASE WHEN status = 'DISABLED' THEN 1 END)::int as "disabled"
      FROM kiropro_cards_inventory
    `);

    const voucherStatsRes = await pool.query(`
      SELECT 
        COUNT(*)::int as "totalVouchers",
        COUNT(CASE WHEN is_redeemed = true THEN 1 END)::int as "redeemedVouchers",
        COUNT(CASE WHEN is_redeemed = false AND is_active = true THEN 1 END)::int as "availableVouchers"
      FROM kiropro_card_vouchers
    `);

    // Get configurable settings
    const settingsRes = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'kiropro_card_settings'`
    );
    const settings = settingsRes.rows[0]?.value || { lowStockThreshold: 10 };
    const lowStockThreshold = Number(settings.lowStockThreshold || 10);

    const stats = statsRes.rows[0] || {};
    const vStats = voucherStatsRes.rows[0] || {};
    const availableCards = Number(stats.available || 0);

    res.json({
      success: true,
      totalCards: Number(stats.totalCards || 0),
      available: availableCards,
      claimed: Number(stats.claimed || 0),
      disabled: Number(stats.disabled || 0),
      lowStockThreshold,
      isLowStock: availableCards <= lowStockThreshold,
      totalVouchers: Number(vStats.totalVouchers || 0),
      redeemedVouchers: Number(vStats.redeemedVouchers || 0),
      availableVouchers: Number(vStats.availableVouchers || 0)
    });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to fetch stats:', err.message);
    res.status(500).json({ error: 'فشل جلب إحصائيات المخزون.' });
  }
});

// ==========================================
// 2. LIST INVENTORY CARDS (Strictly Masked)
// ==========================================
router.get('/inventory', requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const statusFilter = (req.query.status as string || 'ALL').toUpperCase();
  const search = (req.query.search as string || '').trim();

  try {
    let whereClauses: string[] = [];
    const params: any[] = [];

    if (statusFilter !== 'ALL' && ['AVAILABLE', 'CLAIMED', 'DISABLED'].includes(statusFilter)) {
      params.push(statusFilter);
      whereClauses.push(`c.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(c.card_last4 ILIKE $${params.length} OR u.email ILIKE $${params.length} OR c.order_id::text ILIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query
    const countRes = await pool.query(
      `SELECT COUNT(*)::int as total 
       FROM kiropro_cards_inventory c 
       LEFT JOIN "User" u ON c.assigned_to_user_id = u.id 
       ${whereSql}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    // Items query (Masked data only)
    params.push(limit, offset);
    const itemsRes = await pool.query(
      `SELECT 
         c.id,
         c.card_last4 as "last4",
         c.exp_date as "expDate",
         c.balance,
         c.status,
         c.order_id as "orderId",
         c.assigned_at as "assignedAt",
         c.created_at as "createdAt",
         u.id as "userId",
         u.email as "customerEmail",
         u.name as "customerName"
       FROM kiropro_cards_inventory c
       LEFT JOIN "User" u ON c.assigned_to_user_id = u.id
       ${whereSql}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const cards = itemsRes.rows.map((row) => ({
      id: row.id,
      last4: row.last4,
      maskedNumber: maskCardNumber(row.last4),
      expDate: row.expDate,
      balance: Number(row.balance),
      status: row.status,
      orderId: row.orderId,
      assignedAt: row.assignedAt,
      createdAt: row.createdAt,
      customer: row.userId
        ? {
          id: row.userId,
          email: row.customerEmail,
          name: row.customerName
        }
        : null
    }));

    res.json({
      success: true,
      cards,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to list cards:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة البطاقات.' });
  }
});

// ==========================================
// 3. ADD SINGLE CARD
// ==========================================
router.post('/add', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { cardNumber, expDate, cvv, balance } = req.body;
  const adminId = req.user?.id;

  try {
    const cleanNum = cleanCardNumber(cardNumber);
    if (!cleanNum || cleanNum.length !== 16) {
      return res.status(400).json({ error: 'رقم البطاقة يجب أن يتكون من 16 رقماً بالتمام.' });
    }

    if (!isValidLuhn(cleanNum)) {
      return res.status(400).json({ error: 'رقم البطاقة غير صالح وفق خوارزمية التدقيق (Luhn Checksum).' });
    }

    if (!isValidExpDate(expDate)) {
      return res.status(400).json({ error: 'تاريخ الانتهاء غير صالح. الصيغة المطلوبة MM/YY ويجب ألا يكون منتهياً.' });
    }

    if (!isValidCvv(cvv)) {
      return res.status(400).json({ error: 'رمز الأمان CVV يجب أن يتكون من 3 أرقام.' });
    }

    const cardBalance = Number(balance || 1.00);
    if (isNaN(cardBalance) || cardBalance < 0) {
      return res.status(400).json({ error: 'رصيد البطاقة غير صالح.' });
    }

    const last4 = extractLast4(cleanNum);
    const cardHash = hashCardNumber(cleanNum);

    // Get product ID for KiroPro Card
    const prodRes = await pool.query(
      `SELECT id FROM "Product" WHERE "productType" = 'VIRTUAL_CARD' LIMIT 1`
    );
    const productId = prodRes.rows[0]?.id || 'b0000000-0000-0000-0000-000000000001';

    // Duplicate check using card_hash (deterministic cryptographic fingerprint)
    const dupCheck = await pool.query(
      `SELECT id FROM kiropro_cards_inventory WHERE card_hash = $1`,
      [cardHash]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: 'هذه البطاقة مسجلة مسبقاً في مخزون النظام.' });
    }

    // Encrypt card number and CVV with AES-256-GCM
    const cardNumberEncrypted = encryptCardData(cleanNum);
    const cvvEncrypted = encryptCardData(cvv.trim());

    const insertRes = await pool.query(
      `INSERT INTO kiropro_cards_inventory (
         id, product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status, card_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', $8)
       RETURNING id, card_last4, exp_date, balance, status, created_at`,
      [uuidv4(), productId, cardNumberEncrypted, last4, expDate.trim(), cvvEncrypted, cardBalance, cardHash]
    );

    const newCard = insertRes.rows[0];

    // Log to AuditLog (Never log card number or CVV)
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason) 
       VALUES ($1, $2, 'ADD_KIROPRO_CARD', $3)`,
      [uuidv4(), adminId, `إضافة بطاقة جديدة تنتهي بالرقم ${last4}`]
    );

    res.status(201).json({
      success: true,
      message: 'تمت إضافة البطاقة بنجاح للمخزون.',
      card: {
        id: newCard.id,
        last4: newCard.card_last4,
        maskedNumber: maskCardNumber(newCard.card_last4),
        expDate: newCard.exp_date,
        balance: Number(newCard.balance),
        status: newCard.status,
        createdAt: newCard.created_at
      }
    });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to add card:', err.message);
    res.status(500).json({ error: 'فشل إضافة البطاقة.' });
  }
});

// ==========================================
// 4. CSV TEMPLATE DOWNLOAD
// ==========================================
router.get('/template', requireAdmin, (_req: AuthRequest, res: Response) => {
  const csvContent = 'card_number,exp_date,cvv,balance\r\n' +
    '5555555555554444,12/28,123,1.00\r\n' +
    '5105105105105100,11/27,456,1.00\r\n';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kiropro_cards_template.csv"');
  res.status(200).send(csvContent);
});

// ==========================================
// 5. BULK IMPORT CARDS (Multipart File & Raw Text)
// ==========================================
router.post('/bulk-import', requireAdmin, upload.single('file'), async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;

  // 1. Extract content from either uploaded file (multer) or raw text / body
  let rawContent: string = '';
  if (req.file && req.file.buffer) {
    rawContent = req.file.buffer.toString('utf8');
  } else if (typeof req.body.rawData === 'string') {
    rawContent = req.body.rawData;
  } else if (typeof req.body.csvText === 'string') {
    rawContent = req.body.csvText;
  } else if (typeof req.body.file === 'string') {
    rawContent = req.body.file;
  } else if (Array.isArray(req.body.cards) && req.body.cards.length > 0) {
    // If sent as parsed array of card objects from frontend
    rawContent = req.body.cards.map((c: any) =>
      `${c.cardNumber || c.card_number || ''},${c.expDate || c.exp_date || ''},${c.cvv || ''},${c.balance ?? 1.00}`
    ).join('\n');
  }

  // 2. Initial input validation
  if (!rawContent || !rawContent.trim()) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_DATA',
      message: 'يرجى اختيار ملف CSV أو إدخال بيانات الاستيراد.',
      errors: []
    });
  }

  // 3. Strip UTF-8 BOM if present (\uFEFF)
  rawContent = rawContent.replace(/^\uFEFF/, '').trim();

  // 4. Split lines supporting Windows CRLF (\r\n) and UNIX LF (\n)
  const lines = rawContent.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return res.status(400).json({
      success: false,
      code: 'EMPTY_IMPORT',
      message: 'ملف الاستيراد فارغ ولا يحتوي على أي صفوف صالحة.',
      errors: []
    });
  }

  if (lines.length > 500) {
    return res.status(400).json({
      success: false,
      code: 'TOO_MANY_ROWS',
      message: 'الحد الأقصى للاستيراد في المرة الواحدة هو 500 بطاقة.',
      errors: []
    });
  }

  // 5. Inspect header row
  let startIndex = 0;
  const colMap = { card: 0, exp: 1, cvv: 2, bal: 3 };
  const firstParts = parseCsvLine(lines[0] || '');
  const lowerHeader = firstParts.map((p) => p.toLowerCase().replace(/[\s_-]/g, ''));

  const looksLikeHeader = lowerHeader.some((p) =>
    p.includes('card') || p.includes('pan') || p.includes('number') || p.includes('exp')
  );

  if (looksLikeHeader) {
    startIndex = 1;
    const cardIdx = lowerHeader.findIndex((p) => p.includes('card') || p.includes('pan') || p.includes('number'));
    const expIdx = lowerHeader.findIndex((p) => p.includes('exp') || p.includes('date'));
    const cvvIdx = lowerHeader.findIndex((p) => p.includes('cvv') || p.includes('cvc') || p.includes('sec'));
    const balIdx = lowerHeader.findIndex((p) => p.includes('bal') || p.includes('amount') || p.includes('price'));

    if (cardIdx !== -1) colMap.card = cardIdx;
    if (expIdx !== -1) colMap.exp = expIdx;
    if (cvvIdx !== -1) colMap.cvv = cvvIdx;
    if (balIdx !== -1) colMap.bal = balIdx;
  }

  const dataRowsCount = lines.length - startIndex;
  if (dataRowsCount <= 0) {
    return res.status(400).json({
      success: false,
      code: 'NO_DATA_ROWS',
      message: 'الملف يحتوي فقط على سطر العناوين (Headers) دون أي بيانات للبطاقات.',
      errors: []
    });
  }

  // 6. Connect to DB and begin atomic import transaction
  const prodRes = await pool.query(
    `SELECT id FROM "Product" WHERE "productType" = 'VIRTUAL_CARD' LIMIT 1`
  );
  const productId = prodRes.rows[0]?.id || 'b0000000-0000-0000-0000-000000000001';

  const client = await pool.connect();
  const errors: Array<{ row: number; reason: string }> = [];
  const seenHashesInBatch = new Set<string>();
  let importedCount = 0;

  try {
    await client.query('BEGIN');

    for (let i = startIndex; i < lines.length; i++) {
      const rowNumber = i + 1; // 1-indexed line number in the CSV
      const lineText = lines[i];
      if (!lineText) continue;

      const parts = parseCsvLine(lineText);
      const rawNum = parts[colMap.card]?.trim();
      const rawExp = parts[colMap.exp]?.trim();
      const rawCvv = parts[colMap.cvv]?.trim();
      const rawBal = parts[colMap.bal]?.trim();

      // Check missing columns
      if (!rawNum || !rawExp || !rawCvv) {
        errors.push({ row: rowNumber, reason: 'السطر غير مكتمل (مطلوب: رقم البطاقة، تاريخ الانتهاء، رمز CVV)' });
        continue;
      }

      // Clean card number (digits only)
      const cleanNum = cleanCardNumber(rawNum);
      if (!cleanNum || cleanNum.length !== 16) {
        errors.push({ row: rowNumber, reason: 'رقم البطاقة غير صالح (يجب أن يتكون من 16 رقماً)' });
        continue;
      }

      // Luhn Checksum validation
      if (!isValidLuhn(cleanNum)) {
        errors.push({ row: rowNumber, reason: 'رقم البطاقة غير صالح (فشل فحص خوارزمية Luhn Checksum)' });
        continue;
      }

      // Expiration Date validation (MM/YY, not expired)
      if (!isValidExpDate(rawExp)) {
        errors.push({ row: rowNumber, reason: 'تاريخ الانتهاء غير صالح أو منتهي الصلاحية (مطلوب صيغة MM/YY)' });
        continue;
      }

      // CVV validation (3 or 4 digits)
      if (!isValidCvv(rawCvv)) {
        errors.push({ row: rowNumber, reason: 'رمز الأمان (CVV) غير صالح (مطلوب 3 أو 4 أرقام)' });
        continue;
      }

      // Balance validation
      const defaultBal = req.body.defaultBalance ? Number(req.body.defaultBalance) : 1.00;
      const cardBalance = rawBal !== undefined && rawBal !== '' ? Number(rawBal) : defaultBal;
      if (isNaN(cardBalance) || cardBalance < 0) {
        errors.push({ row: rowNumber, reason: 'رصيد البطاقة غير صالح (يجب أن يكون رقماً أكبر من أو يساوي 0)' });
        continue;
      }

      // Duplicate check within current import batch using deterministic card_hash
      const cardHash = hashCardNumber(cleanNum);
      if (seenHashesInBatch.has(cardHash)) {
        errors.push({ row: rowNumber, reason: 'البطاقة مكررة داخل ملف الاستيراد نفسه' });
        continue;
      }
      seenHashesInBatch.add(cardHash);

      // Duplicate check against database using card_hash
      const existingCheck = await client.query(
        `SELECT id FROM kiropro_cards_inventory WHERE card_hash = $1 LIMIT 1`,
        [cardHash]
      );
      if (existingCheck.rows.length > 0) {
        errors.push({ row: rowNumber, reason: 'البطاقة مسجلة مسبقاً في مخزون النظام' });
        continue;
      }

      // Valid card -> Encrypt sensitive fields with AES-256-GCM
      const last4 = extractLast4(cleanNum);
      const numEnc = encryptCardData(cleanNum);
      const cvvEnc = encryptCardData(rawCvv);

      await client.query(
        `INSERT INTO kiropro_cards_inventory (
           id, product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status, card_hash
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', $8)`,
        [uuidv4(), productId, numEnc, last4, rawExp, cvvEnc, cardBalance, cardHash]
      );

      importedCount++;
    }

    // 7. Check if all rows failed
    if (importedCount === 0 && errors.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        code: 'INVALID_IMPORT',
        message: 'فشل استيراد الملف؛ جميع الصفوف تحتوي على أخطاء ولم يتم حفظ أي بطاقة.',
        imported: 0,
        failed: errors.length,
        errors
      });
    }

    await client.query('COMMIT');

    // 8. Audit Log (Never log full card numbers or CSV contents)
    if (importedCount > 0) {
      await pool.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, amount, reason) 
         VALUES ($1, $2, 'BULK_IMPORT_KIROPRO_CARDS', $3, $4)`,
        [uuidv4(), adminId, importedCount, `استيراد جماعي لـ ${importedCount} بطاقة كيرو برو بنجاح`]
      );
    }

    return res.status(200).json({
      success: true,
      imported: importedCount,
      failed: errors.length,
      total: dataRowsCount,
      message: `تم استيراد ${importedCount} بطاقة بنجاح للمخزون${errors.length > 0 ? ` (مع تعذر ${errors.length} صفوف)` : ''}.`,
      errors
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[AdminKiroProCards] Bulk import failed:', err.message);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      error: 'فشل الاستيراد الجماعي للبطاقات بسبب خطأ في الخادم.',
      errors: []
    });
  } finally {
    client.release();
  }
});

// ==========================================
// 5. REVEAL CARD CREDENTIALS (AUDITED ONLY)
// ==========================================
router.post('/:id/reveal', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const cardRes = await pool.query(
      `SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status 
       FROM kiropro_cards_inventory 
       WHERE id = $1`,
      [id]
    );

    const card = cardRes.rows[0];
    if (!card) {
      return res.status(404).json({ error: 'البطاقة غير موجودة.' });
    }

    // Record Event in AuditLog (Password/Card Number is NEVER included in the log!)
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason) 
       VALUES ($1, $2, 'REVEAL_KIROPRO_CARD', $3)`,
      [uuidv4(), adminId, `قام المسؤول بكشف أرقام البطاقة المنتهية بالرقم ${card.card_last4}`]
    );

    const fullCardNumber = decryptCardData(card.card_number_encrypted);
    const cvv = decryptCardData(card.cvv_encrypted);

    res.json({
      success: true,
      card: {
        id: card.id,
        cardNumber: formatCardNumber(fullCardNumber),
        last4: card.card_last4,
        expDate: card.exp_date,
        cvv: cvv,
        balance: Number(card.balance),
        status: card.status
      }
    });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to reveal card:', err.message);
    res.status(500).json({ error: 'فشل كشف بيانات البطاقة.' });
  }
});

// ==========================================
// 6. TOGGLE DISABLE CARD
// ==========================================
router.patch('/:id/toggle-disable', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const cardRes = await pool.query(
      `SELECT id, status, card_last4 FROM kiropro_cards_inventory WHERE id = $1`,
      [id]
    );

    const card = cardRes.rows[0];
    if (!card) {
      return res.status(404).json({ error: 'البطاقة غير موجودة.' });
    }

    if (card.status === 'CLAIMED') {
      return res.status(400).json({ error: 'لا يمكن تعطيل بطاقة مباعة ومخصصة لعميل.' });
    }

    const newStatus = card.status === 'AVAILABLE' ? 'DISABLED' : 'AVAILABLE';

    await pool.query(
      `UPDATE kiropro_cards_inventory SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newStatus, id]
    );

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason) 
       VALUES ($1, $2, 'TOGGLE_DISABLE_KIROPRO_CARD', $3)`,
      [uuidv4(), adminId, `تعديل حالة البطاقة ${card.card_last4} إلى ${newStatus}`]
    );

    res.json({
      success: true,
      newStatus,
      message: `تم تحديث حالة البطاقة إلى ${newStatus === 'AVAILABLE' ? 'متاحة' : 'معطلة'}.`
    });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to toggle disable card:', err.message);
    res.status(500).json({ error: 'فشل تحديث حالة البطاقة.' });
  }
});

// ==========================================
// 7. DELETE UNCLAIMED CARD
// ==========================================
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const cardRes = await pool.query(
      `SELECT id, status, card_last4 FROM kiropro_cards_inventory WHERE id = $1`,
      [id]
    );

    const card = cardRes.rows[0];
    if (!card) {
      return res.status(404).json({ error: 'البطاقة غير موجودة.' });
    }

    if (card.status === 'CLAIMED') {
      return res.status(400).json({ error: 'ممنوع حذف بطاقة تم تخصيصها وبيعها لعميل.' });
    }

    await pool.query(`DELETE FROM kiropro_cards_inventory WHERE id = $1`, [id]);

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason) 
       VALUES ($1, $2, 'DELETE_KIROPRO_CARD', $3)`,
      [uuidv4(), adminId, `حذف بطاقة غير مباعة تنتهي بالرقم ${card.card_last4}`]
    );

    res.json({ success: true, message: 'تم حذف البطاقة من المخزون بنجاح.' });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to delete card:', err.message);
    res.status(500).json({ error: 'فشل حذف البطاقة.' });
  }
});

// ==========================================
// 8. ISSUANCE CODES (VOUCHERS) MANAGEMENT
// ==========================================
router.get('/vouchers', requireAdmin, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  try {
    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM kiropro_card_vouchers`);
    const total = countRes.rows[0]?.total || 0;

    const vouchersRes = await pool.query(
      `SELECT 
         v.id,
         v.code,
         v.value,
         COALESCE(v.status, CASE WHEN v.is_redeemed THEN 'REDEEMED' WHEN NOT v.is_active THEN 'DISABLED' ELSE 'AVAILABLE' END) as "status",
         v.is_redeemed as "isRedeemed",
         v.is_active as "isActive",
         v.redeemed_at as "redeemedAt",
         v.redeemed_order_id as "redeemedOrderId",
         v.created_at as "createdAt",
         v.expires_at as "expiresAt",
         c.card_last4 as "claimedCardLast4",
         u.email as "redeemedUserEmail",
         u.name as "redeemedUserName"
       FROM kiropro_card_vouchers v
       LEFT JOIN kiropro_cards_inventory c ON v.card_id = c.id
       LEFT JOIN "User" u ON v.redeemed_by_user_id = u.id
       ORDER BY v.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      vouchers: vouchersRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to fetch vouchers:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة أكواد الإصدار.' });
  }
});

// Bulk Generate Cryptographically Random Issuance Codes (KPC-XXXX-XXXX-XXXX)
router.post('/vouchers/generate', requireAdmin, async (req: AuthRequest, res: Response) => {
  const count = Math.min(100, Math.max(1, parseInt(req.body.count) || 1));
  const expiresDays = req.body.expiresDays ? parseInt(req.body.expiresDays) : null;
  const adminId = req.user?.id;

  try {
    const prodRes = await pool.query(
      `SELECT id FROM "Product" WHERE "productType" = 'VIRTUAL_CARD' LIMIT 1`
    );
    const productId = prodRes.rows[0]?.id || 'b0000000-0000-0000-0000-000000000001';

    const client = await pool.connect();
    const createdCodes: string[] = [];

    try {
      await client.query('BEGIN');

      const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 86400000) : null;

      for (let i = 0; i < count; i++) {
        // Format: KPC-XXXX-XXXX-XXXX (Secure Non-Predictable Random)
        const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
        const code = `KPC-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 12)}`;

        await client.query(
          `INSERT INTO kiropro_card_vouchers (
             id, code, product_id, value, status, is_redeemed, is_active, created_by_admin_id, expires_at
           ) VALUES ($1, $2, $3, 2.00, 'AVAILABLE', false, true, $4, $5)`,
          [uuidv4(), code, productId, adminId, expiresAt]
        );
        createdCodes.push(code);
      }

      await client.query('COMMIT');

      // Audit Log without full code logging
      await pool.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, amount, reason) 
         VALUES ($1, $2, 'GENERATE_KIROPRO_ISSUANCE_CODES', $3, $4)`,
        [uuidv4(), adminId, count, `توليد ${count} كود إصدار KiroPro Card بقيمة $2.00 للكود`]
      );

      res.status(201).json({
        success: true,
        message: `تم توليد ${count} كود إصدار بنجاح بقيمة $2.00.`,
        codes: createdCodes
      });
    } catch (txErr: any) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to generate vouchers:', err.message);
    res.status(500).json({ error: 'فشل توليد أكواد الإصدار.' });
  }
});

// Toggle Voucher Active
router.patch('/vouchers/:id/toggle-disable', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const vRes = await pool.query(`SELECT id, is_active, is_redeemed FROM kiropro_card_vouchers WHERE id = $1`, [id]);
    const voucher = vRes.rows[0];
    if (!voucher) return res.status(404).json({ error: 'الكود غير موجود.' });

    if (voucher.is_redeemed) {
      return res.status(400).json({ error: 'لا يمكن تعديل كود تم استرداده مسبقاً.' });
    }

    const newActive = !voucher.is_active;
    await pool.query(`UPDATE kiropro_card_vouchers SET is_active = $1 WHERE id = $2`, [newActive, id]);

    res.json({ success: true, isActive: newActive });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to toggle voucher:', err.message);
    res.status(500).json({ error: 'فشل تعديل حالة الكود.' });
  }
});

// ==========================================
// 9. SETTINGS & LOW STOCK CONFIG
// ==========================================
router.get('/settings', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const settingsRes = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'kiropro_card_settings'`
    );
    const settings = settingsRes.rows[0]?.value || {
      lowStockThreshold: 10,
      complianceNotice: 'بطاقة افتراضية للاستخدام في الخدمات والمواقع المدعومة حسب شروط KIROPRO.',
      defaultBalance: 1.00
    };

    // Also get product price and isActive
    const prodRes = await pool.query(
      `SELECT id, "customerPriceUsd", "isActive", "inStock", description 
       FROM "Product" 
       WHERE "productType" = 'VIRTUAL_CARD' LIMIT 1`
    );
    const product = prodRes.rows[0];

    res.json({
      success: true,
      settings: {
        lowStockThreshold: Number(settings.lowStockThreshold || 10),
        complianceNotice: settings.complianceNotice || '',
        defaultBalance: Number(settings.defaultBalance || 1.00),
        productPriceUsd: product ? Number(product.customerPriceUsd) : 2.00,
        isProductActive: product ? Boolean(product.isActive) : true,
        productDescription: product?.description || ''
      }
    });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to fetch settings:', err.message);
    res.status(500).json({ error: 'فشل جلب الإعدادات.' });
  }
});

router.patch('/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { lowStockThreshold, complianceNotice, defaultBalance, productPriceUsd, isProductActive } = req.body;
  const adminId = req.user?.id;

  try {
    const updatedSettings = {
      lowStockThreshold: Math.max(1, parseInt(lowStockThreshold) || 10),
      complianceNotice: complianceNotice ? String(complianceNotice).trim() : 'بطاقة افتراضية للاستخدام في الخدمات والمواقع المدعومة حسب شروط KIROPRO.',
      defaultBalance: Math.max(0.1, parseFloat(defaultBalance) || 1.00)
    };

    // Upsert platform_settings
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) 
       VALUES ('kiropro_card_settings', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [updatedSettings]
    );

    // Update Product price and active status if supplied
    if (productPriceUsd !== undefined || isProductActive !== undefined) {
      const price = parseFloat(productPriceUsd);
      const active = Boolean(isProductActive);

      await pool.query(
        `UPDATE "Product" 
         SET "customerPriceUsd" = COALESCE($1, "customerPriceUsd"),
             "isActive" = COALESCE($2, "isActive"),
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "productType" = 'VIRTUAL_CARD'`,
        [isNaN(price) ? null : price, active]
      );
    }

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason) 
       VALUES ($1, $2, 'UPDATE_KIROPRO_CARD_SETTINGS', 'تحديث إعدادات بطاقات كيرو برو وحد المخزون المنخفض')`,
      [uuidv4(), adminId]
    );

    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح.', settings: updatedSettings });
  } catch (err: any) {
    console.error('[AdminKiroProCards] Failed to update settings:', err.message);
    res.status(500).json({ error: 'فشل حفظ الإعدادات.' });
  }
});

export default router;
