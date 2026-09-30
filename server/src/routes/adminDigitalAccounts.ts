import { Router, Response } from 'express';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';
import { encryptPassword, decryptPassword, isValidEmail } from '../utils/cryptoAccount';

const router = Router();

// ==========================================
// 1. INVENTORY STATISTICS
// ==========================================
router.get('/stats', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { productId } = req.query;

  try {
    let query = `
      SELECT 
        COUNT(*)::int as "totalStock",
        COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END)::int as "available",
        COUNT(CASE WHEN status = 'RESERVED' THEN 1 END)::int as "reserved",
        COUNT(CASE WHEN status = 'SOLD' THEN 1 END)::int as "sold",
        COUNT(CASE WHEN status = 'DISABLED' THEN 1 END)::int as "disabled"
      FROM digital_product_accounts
    `;
    const params: any[] = [];
    if (productId && typeof productId === 'string' && productId.trim()) {
      query += ` WHERE product_id = $1`;
      params.push(productId.trim());
    }

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Failed to fetch stats:', err.message);
    res.status(500).json({ error: 'فشل جلب إحصائيات المخزون.' });
  }
});

// ==========================================
// 1.5. LIST DIGITAL ACCOUNT PRODUCTS ONLY
// ==========================================
router.get('/products', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        "productName", 
        "arabicName", 
        "offerName", 
        category, 
        "productType", 
        "customerPriceUsd", 
        "inStock"
      FROM "Product"
      WHERE ("productType" = 'DIGITAL_ACCOUNT' OR category = 'DIGITAL_ACCOUNT')
        AND "isActive" = true
      ORDER BY COALESCE("arabicName", "productName") ASC
    `);

    // Standardize commercial name: prioritize arabicName
    const products = result.rows.map(row => ({
      id: row.id,
      productName: row.arabicName || row.productName || 'حساب نقاط تشغيل / Google',
      arabicName: row.arabicName || 'حساب نقاط تشغيل / Google',
      rawProductName: row.productName,
      offerName: row.offerName || row.arabicName || row.productName,
      category: row.category,
      productType: row.productType,
      inStock: row.inStock
    }));

    res.json(products);
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Failed to fetch digital products:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة المنتجات الرقمية.' });
  }
});

// ==========================================
// 2. LIST INVENTORY ACCOUNTS (Sanitized - NO Passwords)
// ==========================================
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { productId, status, search, page = '1', limit = '50' } = req.query;

  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (productId && typeof productId === 'string' && productId.trim()) {
      conditions.push(`a.product_id = $${paramIndex++}`);
      params.push(productId.trim());
    }

    if (status && typeof status === 'string' && status !== 'ALL') {
      conditions.push(`a.status = $${paramIndex++}`);
      params.push(status.trim().toUpperCase());
    }

    if (search && typeof search === 'string' && search.trim()) {
      conditions.push(`LOWER(a.email) LIKE $${paramIndex++}`);
      params.push(`%${search.trim().toLowerCase()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching
    const countRes = await pool.query(
      `SELECT COUNT(*)::int as total FROM digital_product_accounts a ${whereClause}`,
      params
    );
    const totalCount = countRes.rows[0]?.total || 0;

    // Fetch accounts WITHOUT returning password_encrypted
    const accountsRes = await pool.query(
      `SELECT 
        a.id,
        a.product_id as "productId",
        p."productName",
        p."arabicName" as "productArabicName",
        a.email,
        a.status,
        a.order_id as "orderId",
        a.assigned_to_user_id as "assignedToUserId",
        a.assigned_at as "assignedAt",
        a.created_at as "createdAt",
        a.updated_at as "updatedAt",
        u.name as "assignedUserName",
        u.email as "assignedUserEmail"
       FROM digital_product_accounts a
       JOIN "Product" p ON a.product_id = p.id
       LEFT JOIN "User" u ON a.assigned_to_user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limitNum, offset]
    );

    res.json({
      accounts: accountsRes.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum) || 1
      }
    });
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Failed to list accounts:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة الحسابات.' });
  }
});

// ==========================================
// 3. ADD SINGLE ACCOUNT
// ==========================================
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { productId, email, password, status } = req.body;
  const adminId = req.user?.id;

  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: 'معرّف المنتج مطلوب.' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صالح.' });
  }

  const cleanPassword = String(password || '').trim();
  if (!cleanPassword) {
    return res.status(400).json({ error: 'كلمة المرور مطلوبة.' });
  }

  try {
    // 1. Verify Product exists and is of DIGITAL_ACCOUNT type
    const prodRes = await pool.query(
      `SELECT id, "productName", "arabicName", "productType", category FROM "Product" WHERE id = $1`,
      [productId.trim()]
    );
    const product = prodRes.rows[0];
    if (!product) {
      return res.status(404).json({ error: 'المنتج المحدد غير موجود.' });
    }

    if (product.productType !== 'DIGITAL_ACCOUNT' && product.category !== 'DIGITAL_ACCOUNT') {
      return res.status(400).json({ error: 'المنتج المحدد ليس من نوع DIGITAL_ACCOUNT' });
    }

    // 2. Check for duplicate email in this product
    const dupRes = await pool.query(
      `SELECT id FROM digital_product_accounts WHERE product_id = $1 AND LOWER(email) = $2`,
      [product.id, cleanEmail]
    );
    if (dupRes.rows.length > 0) {
      return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً في مخزون هذا المنتج.' });
    }

    // 3. Encrypt password securely
    const encryptedPassword = encryptPassword(cleanPassword);
    const newStatus = status && ['AVAILABLE', 'DISABLED'].includes(status) ? status : 'AVAILABLE';
    const accountId = uuidv4();

    await pool.query(
      `INSERT INTO digital_product_accounts (
        id, product_id, email, password_encrypted, status
      ) VALUES ($1, $2, $3, $4, $5)`,
      [accountId, product.id, cleanEmail, encryptedPassword, newStatus]
    );

    // Ensure Product inStock is set to true
    if (newStatus === 'AVAILABLE') {
      await pool.query(`UPDATE "Product" SET "inStock" = true WHERE id = $1`, [product.id]);
    }

    // Audit Log (Does NOT log password)
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, $3, $4)`,
      [
        uuidv4(),
        adminId,
        'CREATE_DIGITAL_ACCOUNT',
        `إضافة حساب جديد (${cleanEmail}) لمخزون المنتج: ${product.arabicName || product.productName}`
      ]
    );

    res.status(201).json({
      success: true,
      message: 'تمت إضافة الحساب بنجاح إلى المخزون.',
      account: {
        id: accountId,
        productId: product.id,
        email: cleanEmail,
        status: newStatus
      }
    });
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Create error:', err.message);
    res.status(500).json({ error: err.message || 'فشل إضافة الحساب.' });
  }
});

// ==========================================
// 4. BULK IMPORT ACCOUNTS (CSV / Lines)
// ==========================================
router.post('/bulk', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { productId, rawData, items } = req.body;
  const adminId = req.user?.id;

  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: 'معرّف المنتج مطلوب.' });
  }

  try {
    const prodRes = await pool.query(
      `SELECT id, "productName", "arabicName", "productType", category FROM "Product" WHERE id = $1`,
      [productId.trim()]
    );
    const product = prodRes.rows[0];
    if (!product) {
      return res.status(404).json({ error: 'المنتج المحدد غير موجود.' });
    }

    if (product.productType !== 'DIGITAL_ACCOUNT' && product.category !== 'DIGITAL_ACCOUNT') {
      return res.status(400).json({ error: 'المنتج المحدد ليس من نوع DIGITAL_ACCOUNT' });
    }

    // Parse items from rawData or items array
    const candidateRows: Array<{ email: string; password: string; lineNum: number }> = [];

    if (Array.isArray(items)) {
      items.forEach((item: any, idx: number) => {
        candidateRows.push({
          email: String(item.email || '').trim(),
          password: String(item.password || '').trim(),
          lineNum: idx + 1
        });
      });
    } else if (typeof rawData === 'string' && rawData.trim()) {
      const lines = rawData.split(/\r?\n/);
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        // Split by comma, colon, tab, or pipe
        let delimiter = ',';
        if (!trimmed.includes(',') && trimmed.includes(':')) delimiter = ':';
        else if (!trimmed.includes(',') && trimmed.includes('\t')) delimiter = '\t';
        else if (!trimmed.includes(',') && trimmed.includes('|')) delimiter = '|';

        const parts = trimmed.split(delimiter);
        candidateRows.push({
          email: (parts[0] || '').trim(),
          password: (parts.slice(1).join(delimiter) || '').trim(),
          lineNum: idx + 1
        });
      });
    }

    if (candidateRows.length === 0) {
      return res.status(400).json({ error: 'لم يتم العثور على أي بيانات حسابات صالحة للاستيراد.' });
    }

    // Fetch existing emails for this product to prevent duplicates
    const existingRes = await pool.query(
      `SELECT LOWER(email) as email FROM digital_product_accounts WHERE product_id = $1`,
      [product.id]
    );
    const existingSet = new Set<string>(existingRes.rows.map(r => r.email));

    const accepted: Array<{ id: string; email: string; passwordEncrypted: string }> = [];
    const rejected: Array<{ line: number; email: string; reason: string }> = [];
    const seenInBatch = new Set<string>();

    for (const row of candidateRows) {
      const normalizedEmail = row.email.toLowerCase();

      if (!isValidEmail(normalizedEmail)) {
        rejected.push({ line: row.lineNum, email: row.email, reason: 'صيغة البريد الإلكتروني غير صحيحة.' });
        continue;
      }

      if (!row.password) {
        rejected.push({ line: row.lineNum, email: row.email, reason: 'كلمة المرور مفقودة أو فارغة.' });
        continue;
      }

      if (seenInBatch.has(normalizedEmail)) {
        rejected.push({ line: row.lineNum, email: row.email, reason: 'مكرر داخل البيانات المُدخلة نفسها.' });
        continue;
      }

      if (existingSet.has(normalizedEmail)) {
        rejected.push({ line: row.lineNum, email: row.email, reason: 'هذا البريد مسجل مسبقاً في مخزون هذا المنتج.' });
        continue;
      }

      seenInBatch.add(normalizedEmail);
      existingSet.add(normalizedEmail); // prevent multiple entries in same batch

      accepted.push({
        id: uuidv4(),
        email: normalizedEmail,
        passwordEncrypted: encryptPassword(row.password)
      });
    }

    // Perform database insertion in a single transaction
    if (accepted.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const acc of accepted) {
          await client.query(
            `INSERT INTO digital_product_accounts (id, product_id, email, password_encrypted, status)
             VALUES ($1, $2, $3, $4, 'AVAILABLE')`,
            [acc.id, product.id, acc.email, acc.passwordEncrypted]
          );
        }
        await client.query(`UPDATE "Product" SET "inStock" = true WHERE id = $1`, [product.id]);
        await client.query('COMMIT');
      } catch (insertErr: any) {
        await client.query('ROLLBACK');
        throw insertErr;
      } finally {
        client.release();
      }

      // Record Audit
      await pool.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, reason)
         VALUES ($1, $2, $3, $4)`,
        [
          uuidv4(),
          adminId,
          'BULK_IMPORT_DIGITAL_ACCOUNTS',
          `استيراد مجمّع: تم قبول ${accepted.length} حساب ورفض ${rejected.length} حساب لمنتج: ${product.arabicName || product.productName}`
        ]
      );
    }

    res.json({
      success: true,
      totalProcessed: candidateRows.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      errors: rejected
    });
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Bulk import error:', err.message);
    res.status(500).json({ error: err.message || 'فشل الاستيراد المجمّع.' });
  }
});

// ==========================================
// 5. UPDATE ACCOUNT (Before Sold Only)
// ==========================================
router.patch('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { email, password, status } = req.body;
  const adminId = req.user?.id;

  try {
    const accRes = await pool.query(`SELECT * FROM digital_product_accounts WHERE id = $1`, [id]);
    const account = accRes.rows[0];
    if (!account) {
      return res.status(404).json({ error: 'الحساب غير موجود.' });
    }

    // Protection: Disallow changing credentials on already SOLD accounts
    if (account.status === 'SOLD' && (email || password)) {
      return res.status(400).json({
        error: 'لا يمكن تعديل البريد أو كلمة المرور لحساب تم بيعه وتسليمه بالفعل للعميل.'
      });
    }

    let nextEmail = account.email;
    if (email && typeof email === 'string') {
      const clean = email.trim().toLowerCase();
      if (!isValidEmail(clean)) {
        return res.status(400).json({ error: 'البريد الإلكتروني غير صالح.' });
      }
      if (clean !== account.email) {
        // Check duplicate
        const dup = await pool.query(
          `SELECT id FROM digital_product_accounts WHERE product_id = $1 AND LOWER(email) = $2 AND id != $3`,
          [account.product_id, clean, id]
        );
        if (dup.rows.length > 0) {
          return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل في هذا المنتج.' });
        }
        nextEmail = clean;
      }
    }

    let nextPasswordEncrypted = account.password_encrypted;
    if (password && typeof password === 'string' && password.trim()) {
      nextPasswordEncrypted = encryptPassword(password.trim());
    }

    const nextStatus = status && ['AVAILABLE', 'DISABLED', 'SOLD', 'RESERVED'].includes(status) ? status : account.status;

    await pool.query(
      `UPDATE digital_product_accounts 
       SET email = $1, password_encrypted = $2, status = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4`,
      [nextEmail, nextPasswordEncrypted, nextStatus, id]
    );

    // Update Product inStock status
    const availCountRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM digital_product_accounts WHERE product_id = $1 AND status = 'AVAILABLE'`,
      [account.product_id]
    );
    const hasAvailable = (availCountRes.rows[0]?.count || 0) > 0;
    await pool.query(`UPDATE "Product" SET "inStock" = $1 WHERE id = $2`, [hasAvailable, account.product_id]);

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, $3, $4)`,
      [
        uuidv4(),
        adminId,
        'UPDATE_DIGITAL_ACCOUNT',
        `تحديث بيانات الحساب (${nextEmail}) - الحالة: ${nextStatus}`
      ]
    );

    res.json({ success: true, message: 'تم تحديث بيانات الحساب بنجاح.' });
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Update error:', err.message);
    res.status(500).json({ error: 'فشل تحديث بيانات الحساب.' });
  }
});

// ==========================================
// 6. DELETE ACCOUNT (Unsold Only)
// ==========================================
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const accRes = await pool.query(`SELECT * FROM digital_product_accounts WHERE id = $1`, [id]);
    const account = accRes.rows[0];
    if (!account) {
      return res.status(404).json({ error: 'الحساب غير موجود.' });
    }

    // Critical Rule: Disallow deleting SOLD accounts!
    if (account.status === 'SOLD') {
      return res.status(400).json({
        error: 'ممنوع حذف حساب تم بيعه بالفعل منعاً لفقدان بيانات العميل وسجل الطلب.'
      });
    }

    await pool.query(`DELETE FROM digital_product_accounts WHERE id = $1`, [id]);

    // Update Product inStock status
    const availCountRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM digital_product_accounts WHERE product_id = $1 AND status = 'AVAILABLE'`,
      [account.product_id]
    );
    const hasAvailable = (availCountRes.rows[0]?.count || 0) > 0;
    await pool.query(`UPDATE "Product" SET "inStock" = $1 WHERE id = $2`, [hasAvailable, account.product_id]);

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, $3, $4)`,
      [
        uuidv4(),
        adminId,
        'DELETE_DIGITAL_ACCOUNT',
        `حذف الحساب (${account.email}) من المخزون`
      ]
    );

    res.json({ success: true, message: 'تم حذف الحساب بنجاح من المخزون.' });
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Delete error:', err.message);
    res.status(500).json({ error: 'فشل حذف الحساب.' });
  }
});

// ==========================================
// 7. REVEAL PASSWORD (With AuditLog & Zero Password Logging)
// ==========================================
router.post('/:id/reveal', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const accRes = await pool.query(
      `SELECT a.*, p."productName", p."arabicName" 
       FROM digital_product_accounts a 
       JOIN "Product" p ON a.product_id = p.id 
       WHERE a.id = $1`,
      [id]
    );
    const account = accRes.rows[0];
    if (!account) {
      return res.status(404).json({ error: 'الحساب غير موجود.' });
    }

    const decrypted = decryptPassword(account.password_encrypted);

    // Audit Event (Password is NEVER included in the log!)
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetOrderId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        'REVEAL_DIGITAL_ACCOUNT_PASSWORD',
        account.order_id,
        `قام المسؤول باستعراض كلمة مرور الحساب (${account.email})`
      ]
    );

    res.json({
      success: true,
      email: account.email,
      password: decrypted
    });
  } catch (err: any) {
    console.error('[AdminDigitalAccounts] Reveal error:', err.message);
    res.status(500).json({ error: 'فشل فك تشفير كلمة المرور.' });
  }
});

export default router;
