import { Router, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';
import { partnerService, PartnerAccountError } from '../services/partnerService';
import { partnerLedgerService } from '../services/partnerLedgerService';
import { 
  sendPartnerWelcomeEmail, 
  sendPartnerDepositApprovedEmail, 
  sendPartnerDepositRejectedEmail 
} from '../services/emailService';

const router = Router();

const getParam = (val: any): string => (Array.isArray(val) ? val[0] : String(val || ''));

// ==========================================
// 1. GET ALL PARTNERS
// ==========================================
router.get('/partners', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const query = `
      SELECT 
        p.id, p.user_id as "userId", u.name, u.email,
        p.business_name as "businessName", p.phone, p.status,
        p.total_points as "totalPoints",
        COALESCE(w.balance, 0.0000) as balance,
        w.currency,
        pl.name as "levelName",
        pl.arabic_name as "levelArabicName",
        pl.badge_color as "badgeColor",
        pl.discount_percent as "discountPercent",
        (SELECT COUNT(*) FROM partner_orders o WHERE o.partner_id = p.id)::int as "ordersCount",
        (SELECT COALESCE(SUM(o.partner_price_usd), 0) FROM partner_orders o WHERE o.partner_id = p.id AND o.status = 'COMPLETED') as "totalPurchasesUsd",
        p.created_at as "createdAt"
      FROM partner_profiles p
      JOIN "User" u ON p.user_id = u.id
      LEFT JOIN partner_wallets w ON w.partner_id = p.id
      LEFT JOIN partner_levels pl ON p.level_id = pl.id
      ORDER BY p.created_at DESC
    `;

    const result = await pool.query(query);
    const partners = result.rows.map(r => ({
      ...r,
      balance: Number(r.balance),
      totalPoints: Number(r.totalPoints),
      totalPurchasesUsd: Number(r.totalPurchasesUsd)
    }));

    res.json(partners);
  } catch (err: any) {
    console.error('[AdminPartners] Error fetching partners:', err);
    res.status(500).json({ error: 'فشل جلب قائمة الشركاء.' });
  }
});

// ==========================================
// 2. CREATE PARTNER (WITH ONE-TIME SETUP TOKEN)
// ==========================================
router.post('/partners', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name, email, phone, businessName, levelId, status, notes } = req.body;
  const adminId = req.user?.id;

  if (!name || !email) {
    return res.status(400).json({ error: 'الاسم والبريد الإلكتروني حقول مطلوبة.' });
  }

  try {
    const result = await partnerService.createPartnerAccount({
      name,
      email,
      phone,
      businessName,
      levelId,
      status: status || 'ACTIVE',
      notes
    });

    // Record in AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        'CREATE_PARTNER',
        result.userId,
        `إنشاء حساب تاجر جديد: ${name} (${email})`
      ]
    );

    res.status(201).json({
      success: true,
      message: 'تم إنشاء حساب الشريك بنجاح وإرسال رابط تعيين كلمة المرور إلى بريده الإلكتروني.',
      partner: result
    });
  } catch (err: any) {
    console.error('[AdminPartners] Error creating partner:', err);
    if (err instanceof PartnerAccountError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        data: err.data
      });
    }
    res.status(400).json({ error: err.message || 'فشل إنشاء حساب الشريك.' });
  }
});

// ==========================================
// 2.1 UPGRADE CUSTOMER TO PARTNER (ADMIN EXPLICIT CONFIRMATION)
// ==========================================
router.post('/partners/upgrade-customer', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { customerUserId, businessName, phone, levelId, status, notes } = req.body;
  const adminId = req.user?.id;

  if (!customerUserId) {
    return res.status(400).json({ error: 'معرف العميل (customerUserId) حقل مطلوب.' });
  }

  try {
    const result = await partnerService.upgradeCustomerToPartner({
      customerUserId,
      businessName,
      phone,
      levelId,
      status: status || 'ACTIVE',
      notes,
      adminId
    });

    res.status(200).json({
      success: true,
      message: `تمت ترقية حساب ${result.name} (${result.email}) إلى تاجر بنجاح.`,
      partner: result
    });
  } catch (err: any) {
    console.error('[AdminPartners] Error upgrading customer to partner:', err);
    if (err instanceof PartnerAccountError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        data: err.data
      });
    }
    res.status(400).json({ error: err.message || 'فشلت ترقية حساب العميل إلى تاجر.' });
  }
});

// ==========================================
// 3. GET PARTNER DETAILS
// ==========================================
router.get('/partners/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);

  try {
    const details = await partnerService.getPartnerDetails(id);
    if (!details) {
      return res.status(404).json({ error: 'الشريك غير موجود.' });
    }

    // Fetch recent 10 ledger entries
    const ledgerRes = await pool.query(
      `SELECT * FROM partner_ledger WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    // Fetch recent 10 orders
    const ordersRes = await pool.query(
      `SELECT * FROM partner_orders WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    // Fetch recent 5 deposits
    const depositsRes = await pool.query(
      `SELECT d.*, pm.name as "paymentMethodName" 
       FROM partner_deposits d 
       LEFT JOIN payment_methods pm ON d.payment_method_id = pm.id
       WHERE d.partner_id = $1 
       ORDER BY d.created_at DESC LIMIT 5`,
      [id]
    );

    res.json({
      ...details,
      recentLedger: ledgerRes.rows,
      recentOrders: ordersRes.rows,
      recentDeposits: depositsRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب تفاصيل الشريك.' });
  }
});

// ==========================================
// 4. UPDATE PARTNER STATUS (ACTIVATE / SUSPEND)
// ==========================================
router.patch('/partners/:id/status', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);
  const { status, reason } = req.body;
  const adminId = req.user?.id;

  if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
    return res.status(400).json({ error: 'حالة غير صالحة. القيم المسموحة: ACTIVE أو SUSPENDED.' });
  }

  try {
    const updateRes = await pool.query(
      `UPDATE partner_profiles 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING user_id`,
      [status, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'الشريك غير موجود.' });
    }

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        'UPDATE_PARTNER_STATUS',
        updateRes.rows[0].user_id,
        `تغيير حالة الشريك إلى ${status}. السبب: ${reason || 'إجراء إداري'}`
      ]
    );

    res.json({ success: true, message: `تم تحديث حالة الشريك إلى ${status === 'ACTIVE' ? 'نشط' : 'معطل'} بنجاح.` });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث حالة الشريك.' });
  }
});

// ==========================================
// 5. MANUAL WALLET ADJUSTMENT (CREDIT / DEBIT)
// ==========================================
router.post('/partners/:id/wallet/credit', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);
  const { amount, reason } = req.body;
  const adminId = req.user?.id;

  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'المبلغ يجب أن يكون رقماً موجباً.' });
  }

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'سبب الإضافة المالي إلزامي للتدقيق المحاسبي.' });
  }

  try {
    const result = await partnerLedgerService.credit({
      partnerId: id,
      type: 'MANUAL_CREDIT',
      amount: numAmount,
      currency: 'USD',
      referenceType: 'ADMIN_ADJUSTMENT',
      actorId: adminId || null,
      actorType: 'ADMIN',
      description: `شحن يدوي من الإدارة: ${reason.trim()}`
    });

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, amount, reason)
       VALUES ($1, $2, 'PARTNER_MANUAL_CREDIT', $3, $4)`,
      [uuidv4(), adminId, numAmount, `إضافة $${numAmount} لمحفظة الشريك ${id}. السبب: ${reason}`]
    );

    res.json({
      success: true,
      message: `تمت إضافة $${numAmount.toFixed(2)} بنجاح إلى رصيد الشريك.`,
      newBalance: result.balanceAfter
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'فشل شحن رصيد الشريك.' });
  }
});

router.post('/partners/:id/wallet/debit', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);
  const { amount, reason } = req.body;
  const adminId = req.user?.id;

  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'المبلغ يجب أن يكون رقماً موجباً.' });
  }

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'سبب الخصم المالي إلزامي للتدقيق المحاسبي.' });
  }

  try {
    const result = await partnerLedgerService.debit({
      partnerId: id,
      type: 'MANUAL_DEBIT',
      amount: numAmount,
      currency: 'USD',
      referenceType: 'ADMIN_ADJUSTMENT',
      actorId: adminId || null,
      actorType: 'ADMIN',
      description: `خصم يدوي من الإدارة: ${reason.trim()}`
    });

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, amount, reason)
       VALUES ($1, $2, 'PARTNER_MANUAL_DEBIT', $3, $4)`,
      [uuidv4(), adminId, numAmount, `خصم $${numAmount} من محفظة الشريك ${id}. السبب: ${reason}`]
    );

    res.json({
      success: true,
      message: `تم خصم $${numAmount.toFixed(2)} بنجاح من رصيد الشريك.`,
      newBalance: result.balanceAfter
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'فشل خصم رصيد الشريك.' });
  }
});

// ==========================================
// 6. RESEND ONE-TIME SETUP LINK
// ==========================================
router.post('/partners/:id/resend-setup-link', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);
  const adminId = req.user?.id;

  try {
    const partnerRes = await pool.query(
      `SELECT p.id, u.email, u.name 
       FROM partner_profiles p 
       JOIN "User" u ON p.user_id = u.id 
       WHERE p.id = $1`,
      [id]
    );

    if (partnerRes.rows.length === 0) {
      return res.status(404).json({ error: 'الشريك غير موجود.' });
    }

    const { email, name } = partnerRes.rows[0];

    // Invalidate existing unused tokens
    await pool.query(
      `UPDATE partner_setup_tokens 
       SET used_at = CURRENT_TIMESTAMP 
       WHERE partner_id = $1 AND used_at IS NULL`,
      [id]
    );

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO partner_setup_tokens (id, partner_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), id, tokenHash, expiresAt]
    );

    const isProd = process.env.NODE_ENV === 'production';
    const baseUrl = isProd ? 'https://kiropro.store/partner' : 'http://localhost:5173/partner';
    const setupUrl = `${baseUrl}/setup-password?token=${rawToken}`;

    sendPartnerWelcomeEmail({
      to: email,
      partnerName: name,
      setupUrl,
      expiresHours: 72
    }).catch(() => {});

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, 'RESEND_PARTNER_SETUP_LINK', $3)`,
      [uuidv4(), adminId, `إعادة إرسال رابط تعيين كلمة المرور للشريك ${name} (${email})`]
    );

    res.json({
      success: true,
      message: 'تم توليد رابط إعداد جديد وإرساله بنجاح إلى البريد الإلكتروني.',
      setupUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إعادة إرسال الرابط.' });
  }
});

// ==========================================
// 7. GET & SET PARTNER PRODUCT PRICING (UNIQUE partner_id + product_id)
// ==========================================
// 7. GET & SET PARTNER PRODUCT PRICING (UNIQUE partner_id + product_id)
// ==========================================
router.get('/partners-pricing-settings', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await partnerService.getPricingSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إعدادات الهامش الربحي للشركاء.' });
  }
});

router.put('/partners-pricing-settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { defaultMarkupUsd, minMarkupUsd, maxMarkupUsd } = req.body;
  const adminId = req.user?.id;

  const def = Number(defaultMarkupUsd);
  const min = Number(minMarkupUsd);
  const max = Number(maxMarkupUsd);

  if (isNaN(def) || isNaN(min) || isNaN(max) || min < 0 || max < min || def < min || def > max) {
    return res.status(400).json({
      error: 'القيم المدخلة غير صالحة. يجب أن يكون الهامش الأدنى >= 0، والأقصى >= الأدنى، والافتراضي بينهما.'
    });
  }

  try {
    await pool.query(
      `INSERT INTO partner_pricing_settings (key, value, updated_at)
       VALUES 
         ('default_markup_usd', $1, CURRENT_TIMESTAMP),
         ('min_markup_usd', $2, CURRENT_TIMESTAMP),
         ('max_markup_usd', $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = CURRENT_TIMESTAMP`,
      [def, min, max]
    );

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, amount, reason)
       VALUES ($1, $2, 'UPDATE_PARTNER_PRICING_SETTINGS', $3, $4)`,
      [uuidv4(), adminId, def, `تحديث إعدادات هوامش الشركاء: الافتراضي $${def}، الأدنى $${min}، الأقصى $${max}`]
    );

    res.json({
      success: true,
      message: 'تم تحديث إعدادات هوامش ربح الشركاء بنجاح.',
      settings: { defaultMarkupUsd: def, minMarkupUsd: min, maxMarkupUsd: max }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حفظ إعدادات الهامش.' });
  }
});

router.get('/partners/:id/pricing', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);

  try {
    const settings = await partnerService.getPricingSettings();
    const query = `
      SELECT 
        p.id as "productId",
        p."productName",
        p."offerName",
        p."arabicName",
        COALESCE(p."supplierCostUsd", p."gamesDropCostUsd", 0) as "costPriceUsd",
        p."customerPriceUsd" as "retailPriceUsd",
        p."defaultPartnerPriceUsd" as "defaultPartnerPriceUsd",
        ppp.partner_price_usd as "customPartnerPriceUsd",
        ppp.markup_usd as "customMarkupUsd",
        ppp.is_available as "customIsAvailable",
        p."isActive"
      FROM "Product" p
      LEFT JOIN partner_product_pricing ppp ON ppp.product_id = p.id AND ppp.partner_id = $1
      WHERE p."isActive" = true
      ORDER BY p."productName" ASC
    `;

    const result = await pool.query(query, [id]);
    const rows = result.rows.map(r => {
      const cost = Number(r.costPriceUsd || 0);
      const defaultPartnerPrice = Math.round((cost + settings.defaultMarkupUsd) * 100) / 100;
      const currentPrice = r.customPartnerPriceUsd ? Number(r.customPartnerPriceUsd) : defaultPartnerPrice;
      const markup = Math.round((currentPrice - cost) * 10000) / 10000;

      return {
        ...r,
        costPriceUsd: cost,
        defaultPartnerPriceUsd: defaultPartnerPrice,
        calculatedMarkupUsd: markup,
        defaultMarkupUsd: settings.defaultMarkupUsd
      };
    });

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب قائمة أسعار الشريك.' });
  }
});

router.put('/partners/:id/pricing/:productId', requireAdmin, async (req: AuthRequest, res: Response) => {
  const partnerId = getParam(req.params.id);
  const productId = getParam(req.params.productId);
  const { partnerPriceUsd, markupUsd, isAvailable } = req.body;
  const adminId = req.user?.id;

  try {
    const prodRes = await pool.query(
      'SELECT COALESCE("supplierCostUsd", "gamesDropCostUsd", 0) as cost FROM "Product" WHERE id = $1',
      [productId]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود.' });
    }

    const cost = Number(prodRes.rows[0].cost || 0);
    let finalPrice = Number(partnerPriceUsd);
    let finalMarkup = markupUsd !== undefined ? Number(markupUsd) : undefined;

    if ((!finalPrice || isNaN(finalPrice)) && finalMarkup !== undefined && !isNaN(finalMarkup)) {
      finalPrice = Math.round((cost + finalMarkup) * 100) / 100;
    } else if (finalPrice && (finalMarkup === undefined || isNaN(finalMarkup))) {
      finalMarkup = Math.round((finalPrice - cost) * 10000) / 10000;
    }

    if (!finalPrice || isNaN(finalPrice) || finalPrice <= 0) {
      return res.status(400).json({ error: 'سعر الشريك يجب أن يكون رقماً موجباً أكبر من الصفر.' });
    }

    // Protection: Partner Price cannot be less than Supplier Cost
    if (finalPrice < cost) {
      return res.status(400).json({ 
        error: `لا يمكن أن يكون سعر الشريك ($${finalPrice}) أقل من تكلفة المورد ($${cost}).` 
      });
    }

    await pool.query(
      `INSERT INTO partner_product_pricing (
        id, partner_id, product_id, partner_price_usd, markup_usd, is_available, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT ("partner_id", "product_id") DO UPDATE SET
        partner_price_usd = EXCLUDED.partner_price_usd,
        markup_usd = EXCLUDED.markup_usd,
        is_available = EXCLUDED.is_available,
        updated_at = CURRENT_TIMESTAMP`,
      [uuidv4(), partnerId, productId, finalPrice, finalMarkup ?? 0.03, isAvailable !== false]
    );

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, amount, reason)
       VALUES ($1, $2, 'UPDATE_PARTNER_PRICING', $3, $4)`,
      [uuidv4(), adminId, finalPrice, `تحديث سعر الشريك للمنتج ${productId} إلى $${finalPrice} (هامش $${finalMarkup})`]
    );

    res.json({ 
      success: true, 
      message: 'تم حفظ سعر الشريك للمنتج بنجاح.',
      partnerPriceUsd: finalPrice,
      markupUsd: finalMarkup
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حفظ السعر.' });
  }
});

router.delete('/partners/:id/pricing/:productId', requireAdmin, async (req: AuthRequest, res: Response) => {
  const partnerId = getParam(req.params.id);
  const productId = getParam(req.params.productId);

  try {
    await pool.query(
      `DELETE FROM partner_product_pricing WHERE partner_id = $1 AND product_id = $2`,
      [partnerId, productId]
    );
    res.json({ success: true, message: 'تم حذف التسعير المخصص واستعادة السعر الافتراضي.' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف التسعير المخصص.' });
  }
});

// ==========================================
// 8. PARTNER DEPOSITS MANAGEMENT
// ==========================================
router.get('/partner-deposits', requireAdmin, async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string;

  try {
    let statusFilter = '';
    const values: any[] = [];
    if (status && status !== 'ALL') {
      statusFilter = 'WHERE d.status = $1';
      values.push(status);
    }

    const query = `
      SELECT 
        d.id, d.partner_id as "partnerId",
        u.name as "partnerName", u.email as "partnerEmail",
        p.business_name as "businessName",
        d.amount_usd as "amountUsd",
        d.exchange_rate as "exchangeRate",
        d.amount_local as "amountLocal",
        d.currency_local as "currencyLocal",
        d.status, d.partner_notes as "partnerNotes",
        d.rejection_reason as "rejectionReason",
        d.created_at as "createdAt",
        d.reviewed_at as "reviewedAt",
        pm.name as "paymentMethodName"
      FROM partner_deposits d
      JOIN partner_profiles p ON d.partner_id = p.id
      JOIN "User" u ON p.user_id = u.id
      LEFT JOIN payment_methods pm ON d.payment_method_id = pm.id
      ${statusFilter}
      ORDER BY d.created_at DESC
    `;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات إيداع الشركاء.' });
  }
});

// Approve Deposit: Strict transaction, locks request, checks status, credits wallet, sends email
router.post('/partner-deposits/:id/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);
  const adminId = req.user?.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock deposit row for update
    const depositRes = await client.query(
      `SELECT d.*, u.email, u.name 
       FROM partner_deposits d
       JOIN partner_profiles p ON d.partner_id = p.id
       JOIN "User" u ON p.user_id = u.id
       WHERE d.id = $1 
       FOR UPDATE`,
      [id]
    );

    if (depositRes.rows.length === 0) {
      throw new Error('طلب الإيداع غير موجود.');
    }

    const deposit = depositRes.rows[0];

    // Idempotency guard: only PENDING can be approved
    if (deposit.status !== 'PENDING') {
      throw new Error(`لا يمكن اعتماد هذا الطلب لأن حالته الحالية هي: ${deposit.status}`);
    }

    const amountUsd = Number(deposit.amount_usd);

    // 2. Mark deposit as APPROVED
    await client.query(
      `UPDATE partner_deposits 
       SET status = 'APPROVED', 
           reviewed_by = $1, 
           reviewed_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [adminId, id]
    );

    // 3. Credit wallet via partnerLedgerService under the same transaction
    const creditResult = await partnerLedgerService.credit({
      partnerId: deposit.partner_id,
      type: 'DEPOSIT',
      amount: amountUsd,
      currency: 'USD',
      referenceId: id,
      referenceType: 'DEPOSIT',
      actorId: adminId || null,
      actorType: 'ADMIN',
      description: `إيداع معتمد #${id.slice(0, 8)} (${deposit.amount_local} ${deposit.currency_local})`
    }, client);

    await client.query('COMMIT');

    // 4. Send Approval Email asynchronously
    sendPartnerDepositApprovedEmail({
      to: deposit.email,
      partnerName: deposit.name,
      amountUsd,
      newBalanceUsd: creditResult.balanceAfter,
      depositId: id
    }).catch(() => {});

    // Log to AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, amount, reason)
       VALUES ($1, $2, 'APPROVE_PARTNER_DEPOSIT', $3, $4)`,
      [uuidv4(), adminId, amountUsd, `الموافقة على طلب إيداع التاجر ${deposit.name} بقيمة $${amountUsd}`]
    );

    res.json({
      success: true,
      message: `تم اعتماد الإيداع بنجاح وإضافة $${amountUsd.toFixed(2)} إلى محفظة التاجر.`,
      newBalance: creditResult.balanceAfter
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'فشل اعتماد الإيداع.' });
  } finally {
    client.release();
  }
});

// Reject Deposit
router.post('/partner-deposits/:id/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);
  const { reason } = req.body;
  const adminId = req.user?.id;

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'سبب الرفض إلزامي لإشعار التاجر.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const depositRes = await client.query(
      `SELECT d.*, u.email, u.name 
       FROM partner_deposits d
       JOIN partner_profiles p ON d.partner_id = p.id
       JOIN "User" u ON p.user_id = u.id
       WHERE d.id = $1 
       FOR UPDATE`,
      [id]
    );

    if (depositRes.rows.length === 0) {
      throw new Error('طلب الإيداع غير موجود.');
    }

    const deposit = depositRes.rows[0];
    if (deposit.status !== 'PENDING') {
      throw new Error(`لا يمكن رفض هذا الطلب لأن حالته الحالية هي: ${deposit.status}`);
    }

    await client.query(
      `UPDATE partner_deposits 
       SET status = 'REJECTED', 
           rejection_reason = $1, 
           reviewed_by = $2, 
           reviewed_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [reason.trim(), adminId, id]
    );

    await client.query('COMMIT');

    sendPartnerDepositRejectedEmail({
      to: deposit.email,
      partnerName: deposit.name,
      amountUsd: Number(deposit.amount_usd),
      reason: reason.trim(),
      depositId: id
    }).catch(() => {});

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, 'REJECT_PARTNER_DEPOSIT', $3)`,
      [uuidv4(), adminId, `رفض طلب إيداع التاجر ${deposit.name}. السبب: ${reason}`]
    );

    res.json({ success: true, message: 'تم رفض طلب الإيداع وإشعار التاجر بنجاح.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'فشل رفض الإيداع.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 9. PARTNER LEVELS MANAGEMENT
// ==========================================
router.get('/partner-levels', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const levelsRes = await pool.query(
      `SELECT * FROM partner_levels ORDER BY display_order ASC, min_points ASC`
    );
    res.json(levelsRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المستويات.' });
  }
});

router.put('/partner-levels/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = getParam(req.params.id);
  const { arabicName, minPoints, maxPoints, discountPercent, badgeColor, perksDescription } = req.body;

  try {
    await pool.query(
      `UPDATE partner_levels 
       SET arabic_name = COALESCE($1, arabic_name),
           min_points = COALESCE($2, min_points),
           max_points = $3,
           discount_percent = COALESCE($4, discount_percent),
           badge_color = COALESCE($5, badge_color),
           perks_description = COALESCE($6, perks_description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        arabicName,
        minPoints !== undefined ? Number(minPoints) : undefined,
        maxPoints !== undefined && maxPoints !== null && maxPoints !== '' ? Number(maxPoints) : null,
        discountPercent !== undefined ? Number(discountPercent) : undefined,
        badgeColor,
        perksDescription,
        id
      ]
    );

    res.json({ success: true, message: 'تم تحديث إعدادات المستوى بنجاح.' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث المستوى.' });
  }
});

// ==========================================
// 10. EXCHANGE RATE HISTORY
// ==========================================
router.get('/exchange-rate-history', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const historyRes = await pool.query(
      `SELECT h.*, u.name as "adminName", u.email as "adminEmail"
       FROM exchange_rate_history h
       LEFT JOIN "User" u ON h.changed_by = u.id
       ORDER BY h.created_at DESC LIMIT 50`
    );
    res.json(historyRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب سجل تغييرات سعر الصرف.' });
  }
});

// ==========================================
// 11. ADMIN KIROPRO CARD PARTNER PRICING CONTROLS
// ==========================================
router.get('/partner-card-settings', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const CARD_PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';

    // 1. Fetch current product settings
    const prodRes = await pool.query(
      `SELECT "customerPriceUsd", "defaultPartnerPriceUsd" FROM "Product" WHERE id = $1`,
      [CARD_PRODUCT_ID]
    );

    // 2. Fetch pricing setting key if exists
    const settingRes = await pool.query(
      `SELECT value FROM partner_pricing_settings WHERE key = 'kiropro_card_default_partner_price_usd'`
    );
    const settingPrice = settingRes.rows[0]?.value ? Number(settingRes.rows[0].value) : null;
    const defaultPartnerPrice = settingPrice || Number(prodRes.rows[0]?.defaultPartnerPriceUsd || 1.13);
    const customerPrice = Number(prodRes.rows[0]?.customerPriceUsd || 2.00);

    // 3. Stock counts from kiropro_cards_inventory
    const stockRes = await pool.query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END)::int as available,
        COUNT(CASE WHEN status = 'CLAIMED' THEN 1 END)::int as claimed
      FROM kiropro_cards_inventory
    `);

    res.json({
      productId: CARD_PRODUCT_ID,
      partnerPriceUsd: defaultPartnerPrice,
      customerPriceUsd: customerPrice,
      stock: {
        total: stockRes.rows[0]?.total || 0,
        available: stockRes.rows[0]?.available || 0,
        claimed: stockRes.rows[0]?.claimed || 0
      }
    });
  } catch (err: any) {
    console.error('[AdminPartners] Error fetching partner card settings:', err);
    res.status(500).json({ error: 'فشل جلب إعدادات بطاقة KiroPro Card للشركاء.' });
  }
});

router.put('/partner-card-settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { partnerPriceUsd } = req.body;
  const adminId = req.user?.id;
  const CARD_PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';

  const newPrice = Math.round(Number(partnerPriceUsd) * 100) / 100;
  if (isNaN(newPrice) || newPrice < 1.01) {
    return res.status(400).json({ error: 'سعر الشريك يجب أن يكون على الأقل $1.01 USD.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current price for audit log
    const prevRes = await client.query(
      `SELECT "defaultPartnerPriceUsd" FROM "Product" WHERE id = $1 FOR UPDATE`,
      [CARD_PRODUCT_ID]
    );
    const oldPrice = Number(prevRes.rows[0]?.defaultPartnerPriceUsd || 1.13);

    // 2. Update Product defaultPartnerPriceUsd (NEVER touch customerPriceUsd)
    await client.query(
      `UPDATE "Product" 
       SET "defaultPartnerPriceUsd" = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPrice, CARD_PRODUCT_ID]
    );

    // 3. Update partner_pricing_settings
    await client.query(
      `INSERT INTO partner_pricing_settings (key, value, description, updated_at)
       VALUES ('kiropro_card_default_partner_price_usd', $1, 'السعر الافتراضي لبطاقة KiroPro Card للشركاء بالدولار', CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [newPrice.toFixed(4)]
    );

    // 4. Record in AuditLog
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, 'PARTNER_CARD_PRICE_UPDATE', $3)`,
      [
        uuidv4(),
        adminId || null,
        `تحديث سعر الشريك لبطاقة KiroPro Card: من $${oldPrice.toFixed(2)} إلى $${newPrice.toFixed(2)} USD`
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `تم تحديث سعر الشريك لبطاقة KiroPro Card بنجاح إلى $${newPrice.toFixed(2)} USD.`,
      oldPrice,
      newPrice
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[AdminPartners] Error updating partner card price:', err);
    res.status(500).json({ error: 'فشل تحديث سعر الشريك للبطاقة.' });
  } finally {
    client.release();
  }
});

export default router;
