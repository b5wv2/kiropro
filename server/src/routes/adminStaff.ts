import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { revokeAllUserSessions } from '../services/sessionService';
import { logSecurityEvent } from '../services/securityEventService';

export interface StaffPermission {
  id: string;
  name: string;
  category: 'OPERATIONS' | 'CATALOG' | 'FINANCE' | 'SYSTEM';
  description: string;
}

export const STAFF_PERMISSIONS: StaffPermission[] = [
  // عمليات وطلبات
  { id: 'ORDERS_MANAGE', name: 'إدارة الطلبات والشحن', category: 'OPERATIONS', description: 'مراجعة وتحديث حالات الطلبات، وإعادة المحاولة وتنفيذ الطلبات يدوياً' },
  { id: 'CUSTOMERS_MANAGE', name: 'إدارة العملاء والمستخدمين', category: 'OPERATIONS', description: 'عرض قائمة العملاء، فحص وتعديل الأرصدة، الحظر وإلغاء الحظر' },
  { id: 'ACCOUNT_MARKETPLACE_MANAGE', name: 'سوق الحسابات', category: 'OPERATIONS', description: 'مراجعة وتفعيل وإلغاء إعلانات حسابات الألعاب واسترداد الرسوم' },
  { id: 'REVIEWS_MANAGE', name: 'التقييمات والمراجعات', category: 'OPERATIONS', description: 'مراجعة تقييمات العملاء للخدمات والألعاب وتفعيلها أو إخفاؤها' },

  // المنتجات والكتالوج
  { id: 'PRODUCTS_MANAGE', name: 'المنتجات وباقات الألعاب', category: 'CATALOG', description: 'تعديل وإضافة ألعاب وباقات الأسعار والأكواد الرقمية' },
  { id: 'KIROPRO_CARDS_MANAGE', name: 'بطاقات كيرو برو ماستركارد', category: 'CATALOG', description: 'تعديل سعر البطاقة وإدارة المخزون والتوليد الآلي' },
  { id: 'VIRTUAL_NUMBERS_MANAGE', name: 'الأرقام الافتراضية', category: 'CATALOG', description: 'إدارة عروض الأرقام الافتراضية، المشغلين والبلدان' },

  // الشؤون المالية والشركاء
  { id: 'TOPUPS_MANAGE', name: 'طلبات الشحن البنكي', category: 'FINANCE', description: 'تدقيق إيصالات التحويل البنكي وقبول أو رفض طلبات إضافة الرصيد' },
  { id: 'PAYMENT_METHODS_MANAGE', name: 'طرق الدفع والحسابات', category: 'FINANCE', description: 'تعديل الحسابات البنكية ومحافظ الاستقبال للتحويل المحلي' },
  { id: 'CRYPTO_MANAGE', name: 'إدارة USDT والشبكات', category: 'FINANCE', description: 'مراقبة محافظ الكريبتو وسعر الصرف وتدقيق الإيداعات' },
  { id: 'PARTNERS_MANAGE', name: 'الشركاء والتجار (B2B)', category: 'FINANCE', description: 'إدارة حسابات التجار، مستويات الأسعار، والإيداعات والخصومات' },
  { id: 'PROMO_CODES_MANAGE', name: 'أكواد الخصم والترويج', category: 'FINANCE', description: 'إنشاء كوبونات الخصم، تحديد نسب التخفيض، والحدود' },
  { id: 'CASHBACK_MANAGE', name: 'مكافآت الكاش باك', category: 'FINANCE', description: 'إدارة نسب واسترداد النقود وقواعد مكافآت الشراء' },
  { id: 'WHEEL_MANAGE', name: 'عجلة الحظ والجوائز', category: 'FINANCE', description: 'إدارة نسب الفوز وجوائز العجلة وتوزيع محاولات اللعب' },

  // النظام والرقابة
  { id: 'PROVIDERS_MANAGE', name: 'مزودو الخدمة (APIs)', category: 'SYSTEM', description: 'إدارة والاتصال ببوابات الشحن الخارجية وAPIs' },
  { id: 'AUDIT_VIEW', name: 'سجل العمليات والرقابة (Audit)', category: 'SYSTEM', description: 'تصفح سجل العمليات الإدارية الحساسة لجميع المسؤولين' },
  { id: 'SECURITY_VIEW', name: 'سجل الأمان والحماية', category: 'SYSTEM', description: 'مراقبة محاولات تسجيل الدخول والأنشطة المشبوهة' },
  { id: 'SETTINGS_MANAGE', name: 'إعدادات المنصة والنظام', category: 'SYSTEM', description: 'تعديل اسم المتجر، وضع الصيانة، وقنوات الدعم الفني' },
];

const VALID_PERMISSION_IDS = new Set(STAFF_PERMISSIONS.map(p => p.id).concat(['*']));

const router = Router();

// =========================================================================
// 1. GET /api/admin/staff - Fetch all admins, permissions, and status
// =========================================================================
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const isSuperAdmin = Boolean(req.user?.isSuperAdmin);

    // Fetch all admins
    const adminsRes = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.is_super_admin, 
        u.permissions, 
        u."createdAt", 
        u."updatedAt",
        u."emailVerified",
        (
          SELECT json_build_object(
            'session_id', s.session_id,
            'ip_address', s.ip_address,
            'device_type', s.device_type,
            'last_seen_at', s.last_seen_at
          )
          FROM user_sessions s
          WHERE s.user_id = u.id AND s.status = 'ACTIVE'
          ORDER BY s.last_seen_at DESC
          LIMIT 1
        ) as "activeSession"
      FROM "User" u
      WHERE u.role = 'ADMIN'
      ORDER BY u.is_super_admin DESC, u."createdAt" ASC
    `);

    const staff = adminsRes.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isSuperAdmin: Boolean(row.is_super_admin),
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      emailVerified: Boolean(row.emailVerified),
      activeSession: row.activeSession || null
    }));

    res.json({
      success: true,
      currentUserIsSuperAdmin: isSuperAdmin,
      staff,
      availablePermissions: STAFF_PERMISSIONS
    });
  } catch (err: any) {
    console.error('[AdminStaff] Error fetching staff:', err);
    res.status(500).json({ error: 'فشل استرجاع قائمة فريق الإدارة.' });
  }
});

// =========================================================================
// 2. POST /api/admin/staff/appoint - Promote existing user to Admin with permissions
// =========================================================================
router.post('/appoint', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'عذراً، تعيين إداريين جدد محصور بالأدمن الرئيسي (Super Admin) فقط.' });
    }

    const { email, permissions = [] } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'يرجى تقديم بريد إلكتروني صالح للمستخدم المطلوب تعيينه.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check user in DB
    const userRes = await pool.query('SELECT id, name, email, role, is_super_admin FROM "User" WHERE email = $1', [normalizedEmail]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود. تأكد من صحة البريد الإلكتروني أو أنشئ حساباً جديداً له.' });
    }

    const targetUser = userRes.rows[0];
    if (targetUser.is_super_admin) {
      return res.status(400).json({ error: 'هذا الحساب هو الأدمن الرئيسي للنظام بالفعل.' });
    }

    // Validate permissions array
    const cleanPermissions: string[] = Array.isArray(permissions)
      ? permissions.filter((p: any) => typeof p === 'string' && VALID_PERMISSION_IDS.has(p))
      : [];

    await pool.query(
      `UPDATE "User"
       SET role = 'ADMIN',
           permissions = $1::jsonb,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(cleanPermissions), targetUser.id]
    );

    // Record in AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        req.user.id,
        'STAFF_APPOINTED',
        targetUser.id,
        `تعيين المستخدم (${targetUser.email}) كمدير بصلاحيات: [${cleanPermissions.join(', ')}]`
      ]
    ).catch(e => console.warn('[AuditLog] Staff appoint warning:', e.message));

    res.json({
      success: true,
      message: `تم تعيين ${targetUser.name || targetUser.email} إدارياً بنجاح وتحديد صلاحياته.`,
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: 'ADMIN',
        permissions: cleanPermissions
      }
    });
  } catch (err: any) {
    console.error('[AdminStaff] Error appointing staff:', err);
    res.status(500).json({ error: 'فشل تعيين الإداري الجديد.' });
  }
});

// =========================================================================
// 3. POST /api/admin/staff/create - Create brand new Admin account with permissions
// =========================================================================
router.post('/create', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'عذراً، إنشاء حساب إداري جديد محصور بالأدمن الرئيسي (Super Admin) فقط.' });
    }

    const { name, email, password, permissions = [] } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'يرجى تقديم البريد الإلكتروني وكلمة المرور.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن لا تقل عن 6 خانات.' });
    }

    const existingUser = await pool.query('SELECT id FROM "User" WHERE email = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً. يمكنك ترقيته بدلاً من إعادة إنشائه.' });
    }

    const cleanPermissions: string[] = Array.isArray(permissions)
      ? permissions.filter((p: any) => typeof p === 'string' && VALID_PERMISSION_IDS.has(p))
      : [];

    const newUserId = uuidv4();
    const newWalletId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const adminName = (name && typeof name === 'string' && name.trim()) ? name.trim() : 'مسؤول إداري';

    // Insert user
    await pool.query(
      `INSERT INTO "User" (
        id, email, name, "passwordHash", role, "emailVerified", 
        "preferred_currency", is_super_admin, permissions, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'ADMIN', true, 'SDG', false, $5::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [newUserId, normalizedEmail, adminName, passwordHash, JSON.stringify(cleanPermissions)]
    );

    // Create wallet
    await pool.query(
      `INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, 0, 'SDG')`,
      [newWalletId, newUserId]
    );

    // Record AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        req.user.id,
        'STAFF_CREATED',
        newUserId,
        `إنشاء حساب مدير جديد (${normalizedEmail}) بصلاحيات: [${cleanPermissions.join(', ')}]`
      ]
    ).catch(e => console.warn('[AuditLog] Staff create warning:', e.message));

    res.status(201).json({
      success: true,
      message: `تم إنشاء حساب الإداري (${adminName}) بنجاح.`,
      user: {
        id: newUserId,
        name: adminName,
        email: normalizedEmail,
        role: 'ADMIN',
        permissions: cleanPermissions
      }
    });
  } catch (err: any) {
    console.error('[AdminStaff] Error creating staff:', err);
    res.status(500).json({ error: 'فشل إنشاء حساب الإداري الجديد.' });
  }
});

// =========================================================================
// 4. PATCH /api/admin/staff/:id/permissions - Update permissions for specific Admin
// =========================================================================
router.patch('/:id/permissions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'عذراً، تعديل الصلاحيات محصور بالأدمن الرئيسي (Super Admin) فقط.' });
    }

    const targetId: string = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '';
    const { permissions = [] } = req.body;
    const adminId: string = req.user?.id || 'system';

    const targetRes = await pool.query('SELECT id, name, email, is_super_admin, permissions FROM "User" WHERE id = $1', [targetId]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'الإداري المطلوب غير موجود.' });
    }

    const targetUser = targetRes.rows[0];
    if (targetUser.is_super_admin) {
      return res.status(403).json({ error: 'لا يمكن تقييد أو تعديل صلاحيات الأدمن الرئيسي.' });
    }

    const cleanPermissions: string[] = Array.isArray(permissions)
      ? permissions.filter((p: any) => typeof p === 'string' && VALID_PERMISSION_IDS.has(p))
      : [];

    await pool.query(
      `UPDATE "User"
       SET permissions = $1::jsonb,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(cleanPermissions), targetId]
    );

    // Record AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        'STAFF_PERMISSIONS_UPDATED',
        targetId,
        `تحديث صلاحيات المدير (${targetUser.email}) إلى: [${cleanPermissions.join(', ')}]`
      ]
    ).catch(e => console.warn('[AuditLog] Staff permissions update warning:', e.message));

    res.json({
      success: true,
      message: `تم تحديث صلاحيات (${targetUser.name || targetUser.email}) بنجاح.`,
      permissions: cleanPermissions
    });
  } catch (err: any) {
    console.error('[AdminStaff] Error updating permissions:', err);
    res.status(500).json({ error: 'فشل تحديث الصلاحيات.' });
  }
});

// =========================================================================
// 5. POST /api/admin/staff/:id/revoke - Revoke permissions from specific Admin
// =========================================================================
router.post('/:id/revoke', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'عذراً، سحب الصلاحيات محصور بالأدمن الرئيسي (Super Admin) فقط.' });
    }

    const targetId: string = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '';
    const { demoteToCustomer = false } = req.body;
    const adminId: string = req.user?.id || 'system';

    const targetRes = await pool.query('SELECT id, name, email, is_super_admin FROM "User" WHERE id = $1', [targetId]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'الإداري المطلوب غير موجود.' });
    }

    const targetUser = targetRes.rows[0];
    if (targetUser.is_super_admin) {
      return res.status(403).json({ error: 'حماية النظام: لا يمكن سحب الصلاحيات من الأدمن الرئيسي.' });
    }

    // Clear permissions and optionally demote
    if (demoteToCustomer) {
      await pool.query(
        `UPDATE "User"
         SET role = 'CUSTOMER',
             permissions = '[]'::jsonb,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [targetId]
      );
    } else {
      await pool.query(
        `UPDATE "User"
         SET permissions = '[]'::jsonb,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [targetId]
      );
    }

    // Revoke their active sessions immediately
    await revokeAllUserSessions(targetId, adminId, 'ADMIN_REVOKED_BY_SUPER_ADMIN').catch(() => {});

    // Log security event
    await logSecurityEvent({
      userId: targetId || null,
      eventType: 'SESSION_REVOKED',
      ipAddress: '0.0.0.0',
      metadata: {
        reason: 'PERMISSIONS_REVOKED',
        by_admin: adminId,
        demoted_to_customer: demoteToCustomer
      }
    }).catch(() => {});

    // Record AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        'STAFF_REVOKED',
        targetId,
        `سحب جميع الصلاحيات من المدير (${targetUser.email})${demoteToCustomer ? ' وإلغاء رتبته إلى مستخدم عادي' : ''}`
      ]
    ).catch(e => console.warn('[AuditLog] Staff revoke warning:', e.message));

    res.json({
      success: true,
      message: `تم سحب كافة الصلاحيات بنجاح من (${targetUser.name || targetUser.email}).`
    });
  } catch (err: any) {
    console.error('[AdminStaff] Error revoking staff:', err);
    res.status(500).json({ error: 'فشل سحب الصلاحيات.' });
  }
});

// =========================================================================
// 6. DELETE /api/admin/staff/:id - Remove admin role & demote back to customer
// =========================================================================
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'عذراً، هذا الإجراء محصور بالأدمن الرئيسي (Super Admin) فقط.' });
    }

    const targetId: string = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '';
    const adminId: string = req.user?.id || 'system';

    const targetRes = await pool.query('SELECT id, name, email, is_super_admin FROM "User" WHERE id = $1', [targetId]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'الإداري المطلوب غير موجود.' });
    }

    const targetUser = targetRes.rows[0];
    if (targetUser.is_super_admin) {
      return res.status(403).json({ error: 'لا يمكن حذف أو تخفيض رتبة الأدمن الرئيسي.' });
    }

    await pool.query(
      `UPDATE "User"
       SET role = 'CUSTOMER',
           permissions = '[]'::jsonb,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [targetId]
    );

    await revokeAllUserSessions(targetId, adminId, 'ADMIN_DEMOTED_BY_SUPER_ADMIN').catch(() => {});

    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        adminId,
        'STAFF_DEMOTED',
        targetId,
        `تخفيض رتبة المدير (${targetUser.email}) إلى مستخدم عادي وإلغاء صلاحياته`
      ]
    ).catch(e => console.warn('[AuditLog] Staff demote warning:', e.message));

    res.json({
      success: true,
      message: `تم إلغاء رتبة الإداري (${targetUser.name || targetUser.email}) وتحويله إلى عميل عادي.`
    });
  } catch (err: any) {
    console.error('[AdminStaff] Error demoting staff:', err);
    res.status(500).json({ error: 'فشل حذف رتبة الإداري.' });
  }
});

// =========================================================================
// 7. POST /api/admin/staff/revoke-all - Revoke permissions from ALL sub-admins
// =========================================================================
router.post('/revoke-all', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      return res.status(403).json({ error: 'عذراً، هذا الإجراء الصارم محصور بالأدمن الرئيسي (Super Admin) فقط.' });
    }

    const { demoteToCustomer = false } = req.body;
    const adminId = req.user?.id || 'system';

    // Get all sub-admins that will be affected
    const subAdminsRes = await pool.query(
      `SELECT id, email, name FROM "User" WHERE role = 'ADMIN' AND is_super_admin = FALSE`
    );

    const affectedAdmins = subAdminsRes.rows;
    if (affectedAdmins.length === 0) {
      return res.json({
        success: true,
        message: 'لا يوجد أي مشرفين فرعيين حالياً لسحب الصلاحيات منهم.',
        affectedCount: 0
      });
    }

    if (demoteToCustomer) {
      await pool.query(
        `UPDATE "User"
         SET role = 'CUSTOMER',
             permissions = '[]'::jsonb,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE role = 'ADMIN' AND is_super_admin = FALSE`
      );
    } else {
      await pool.query(
        `UPDATE "User"
         SET permissions = '[]'::jsonb,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE role = 'ADMIN' AND is_super_admin = FALSE`
      );
    }

    // Revoke all sessions for each affected admin
    for (const admin of affectedAdmins) {
      await revokeAllUserSessions(admin.id, adminId, 'BULK_REVOKE_BY_SUPER_ADMIN').catch(() => {});
    }

    // Record in AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, $3, $4)`,
      [
        uuidv4(),
        adminId,
        'STAFF_ALL_REVOKED',
        `سحب الصلاحيات من جميع الإداريين الفرعيين (${affectedAdmins.length} مشرف) بواسطة الأدمن الرئيسي${demoteToCustomer ? ' مع تحويلهم لعملاء عاديين' : ''}`
      ]
    ).catch(e => console.warn('[AuditLog] Staff bulk revoke warning:', e.message));

    res.json({
      success: true,
      message: `تم سحب كافة الصلاحيات بنجاح من جميع الإداريين (${affectedAdmins.length} مشرف). حساب الأدمن الرئيسي فقط هو المحمي والنشط.`,
      affectedCount: affectedAdmins.length
    });
  } catch (err: any) {
    console.error('[AdminStaff] Error revoking all staff:', err);
    res.status(500).json({ error: 'فشل سحب الصلاحيات من الإداريين.' });
  }
});

export default router;
