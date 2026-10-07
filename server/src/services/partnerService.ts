import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { sendPartnerWelcomeEmail } from './emailService';
import { sanitizeEmail, isValidEmailFormat } from '../utils/sanitizeEmail';
import { decryptCardData } from '../utils/cryptoCard';
import { decryptPassword } from '../utils/cryptoAccount';
import { partnerLedgerService } from './partnerLedgerService';

export class PartnerAccountError extends Error {
  code: string;
  statusCode: number;
  data?: any;

  constructor(message: string, code: string, statusCode = 400, data?: any) {
    super(message);
    this.name = 'PartnerAccountError';
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
  }
}

export interface CreatePartnerParams {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  levelId?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  notes?: string;
}

export interface UpgradeCustomerParams {
  customerUserId: string;
  businessName?: string | undefined;
  phone?: string | undefined;
  levelId?: string | undefined;
  status?: 'ACTIVE' | 'SUSPENDED' | undefined;
  notes?: string | undefined;
  adminId?: string | undefined;
}

export class PartnerService {
  /**
   * Admin: Creates a new Partner account with One-Time Password Setup Token.
   * Never transmits cleartext passwords via email.
   * Performs multi-state check:
   * - If ADMIN: rejects with EMAIL_IS_ADMIN
   * - If PARTNER: rejects with EMAIL_ALREADY_PARTNER
   * - If CUSTOMER: stops and returns EMAIL_IS_CUSTOMER with customer data for explicit upgrade confirmation
   */
  public async createPartnerAccount(params: CreatePartnerParams) {
    const { name, email, phone, businessName, levelId, status, notes } = params;

    const normalizedEmail = sanitizeEmail(email);
    if (!isValidEmailFormat(normalizedEmail)) {
      throw new PartnerAccountError('يرجى إدخال بريد إلكتروني صحيح وصالح.', 'INVALID_EMAIL_FORMAT', 400);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 0. Multi-State Check: Check if email already exists in User table
      const existingUser = await client.query(
        'SELECT id, role, email, name, "createdAt" FROM "User" WHERE LOWER(TRIM(email)) = $1',
        [normalizedEmail]
      );

      if (existingUser.rows.length > 0) {
        const u = existingUser.rows[0];

        if (u.role === 'ADMIN') {
          throw new PartnerAccountError(
            'هذا البريد الإلكتروني مسجل كحساب إدارة (Admin) في النظام ولا يمكن تحويله إلى شريك.',
            'EMAIL_IS_ADMIN',
            400
          );
        }

        if (u.role === 'PARTNER') {
          const pProf = await client.query(
            'SELECT status, business_name FROM partner_profiles WHERE user_id = $1',
            [u.id]
          );
          const currentStatus = pProf.rows[0]?.status || 'ACTIVE';
          const statusText = currentStatus === 'ACTIVE' ? 'نشط' : 'معطل مؤقتاً';
          throw new PartnerAccountError(
            `هذا البريد مرتبط بتاجر موجود مسبقاً في النظام (الحالة: ${statusText}).`,
            'EMAIL_ALREADY_PARTNER',
            400,
            {
              partnerStatus: currentStatus,
              businessName: pProf.rows[0]?.business_name
            }
          );
        }

        if (u.role === 'CUSTOMER') {
          throw new PartnerAccountError(
            'هذا البريد الإلكتروني مرتبط بحساب عميل (Customer) مسجل في المتجر. يمكنك ترقية هذا الحساب إلى شريك بعد تأكيد الإدارة.',
            'EMAIL_IS_CUSTOMER',
            400,
            {
              customer: {
                id: u.id,
                name: u.name,
                email: u.email,
                createdAt: u.createdAt
              }
            }
          );
        }
      }

      // 1. Resolve Default Level (Bronze if none specified)
      let effectiveLevelId = levelId;
      if (!effectiveLevelId) {
        const defaultLevelRes = await client.query(
          `SELECT id FROM partner_levels ORDER BY min_points ASC LIMIT 1`
        );
        effectiveLevelId = defaultLevelRes.rows[0]?.id;
      }

      // 2. Generate random 32-byte cryptographic setup token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours validity

      // 3. Create placeholder password hash (random unusable hash)
      const placeholderPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

      // 4. Insert User with role PARTNER
      const userId = uuidv4();
      await client.query(
        `INSERT INTO "User" (
          id, email, name, "passwordHash", role, 
          "emailVerified", preferred_currency, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, 'PARTNER', true, 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, normalizedEmail, name.trim(), placeholderPasswordHash]
      );

      // 5. Insert Partner Profile
      const partnerId = uuidv4();
      await client.query(
        `INSERT INTO partner_profiles (
          id, user_id, business_name, phone, status, 
          level_id, total_points, must_change_password, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 0.00, true, $7)`,
        [
          partnerId,
          userId,
          businessName?.trim() || null,
          phone?.trim() || null,
          status || 'ACTIVE',
          effectiveLevelId || null,
          notes?.trim() || null
        ]
      );

      // 6. Create Partner USD Wallet
      await client.query(
        `INSERT INTO partner_wallets (
          id, partner_id, balance, currency, total_deposited_usd, total_spent_usd
        ) VALUES ($1, $2, 0.0000, 'USD', 0.0000, 0.0000)`,
        [uuidv4(), partnerId]
      );

      // 7. Store Setup Token
      await client.query(
        `INSERT INTO partner_setup_tokens (
          id, partner_id, token_hash, expires_at
        ) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), partnerId, tokenHash, expiresAt]
      );

      await client.query('COMMIT');

      // 8. Construct Setup Link
      // Primary: https://kiropro.store/partner
      const isProd = process.env.NODE_ENV === 'production';
      const baseUrl = isProd ? 'https://kiropro.store/partner' : 'http://localhost:5173/partner';
      const setupUrl = `${baseUrl}/setup-password?token=${rawToken}`;

      // 9. Send Welcome Email via Resend asynchronously
      sendPartnerWelcomeEmail({
        to: normalizedEmail,
        partnerName: name.trim(),
        setupUrl,
        expiresHours: 72
      }).catch((err: any) => {
        console.error('[PartnerService] Failed to send welcome email:', err.message);
      });

      return {
        success: true,
        partnerId,
        userId,
        email: normalizedEmail,
        name: name.trim(),
        setupUrl
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Admin: Explicitly upgrades an existing CUSTOMER account to PARTNER upon admin confirmation.
   * Runs in a single atomic transaction:
   * - Locks user row FOR UPDATE
   * - Verifies role === 'CUSTOMER'
   * - Retains existing password and verification intact
   * - Updates role -> 'PARTNER'
   * - Inserts partner_profiles and partner_wallets
   * - Records AuditLog: UPGRADE_CUSTOMER_TO_PARTNER
   * - Rolls back everything on failure.
   */
  public async upgradeCustomerToPartner(params: UpgradeCustomerParams) {
    const { customerUserId, businessName, phone, levelId, status, notes, adminId } = params;

    if (!customerUserId) {
      throw new PartnerAccountError('معرف العميل مطلوب لتنفيذ الترقية.', 'INVALID_INPUT', 400);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock user row
      const userRes = await client.query(
        'SELECT id, email, name, role, "passwordHash" FROM "User" WHERE id = $1 FOR UPDATE',
        [customerUserId]
      );
      if (userRes.rows.length === 0) {
        throw new PartnerAccountError('حساب العميل غير موجود في النظام.', 'USER_NOT_FOUND', 404);
      }

      const user = userRes.rows[0];
      if (user.role === 'ADMIN') {
        throw new PartnerAccountError('لا يمكن ترقية حساب إداري (Admin) إلى تاجر.', 'CANNOT_UPGRADE_ADMIN', 400);
      }
      if (user.role === 'PARTNER') {
        throw new PartnerAccountError('هذا الحساب تم ترقيته إلى تاجر مسبقاً.', 'ALREADY_PARTNER', 400);
      }
      if (user.role !== 'CUSTOMER') {
        throw new PartnerAccountError(`دور المستخدم الحالي (${user.role}) غير مؤهل للترقية.`, 'INVALID_ROLE', 400);
      }

      // Check if already in partner_profiles
      const existingProfile = await client.query(
        'SELECT id FROM partner_profiles WHERE user_id = $1',
        [customerUserId]
      );
      if (existingProfile.rows.length > 0) {
        throw new PartnerAccountError('يوجد ملف تاجر مرتبط بهذا المستخدم مسبقاً.', 'PROFILE_EXISTS', 400);
      }

      // 2. Resolve default level if none specified
      let effectiveLevelId = levelId;
      if (!effectiveLevelId) {
        const defaultLevelRes = await client.query(
          `SELECT id FROM partner_levels ORDER BY min_points ASC LIMIT 1`
        );
        effectiveLevelId = defaultLevelRes.rows[0]?.id;
      }

      // 3. Update User role to PARTNER (retaining password & emailVerified)
      await client.query(
        `UPDATE "User" SET role = 'PARTNER', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        [customerUserId]
      );

      // 4. Insert partner_profile
      const partnerId = uuidv4();
      await client.query(
        `INSERT INTO partner_profiles (
          id, user_id, business_name, phone, status, 
          level_id, total_points, must_change_password, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 0.00, false, $7)`,
        [
          partnerId,
          customerUserId,
          businessName?.trim() || null,
          phone?.trim() || null,
          status || 'ACTIVE',
          effectiveLevelId || null,
          notes?.trim() || null
        ]
      );

      // 5. Create partner wallet (0.0000 USD)
      await client.query(
        `INSERT INTO partner_wallets (
          id, partner_id, balance, currency, total_deposited_usd, total_spent_usd
        ) VALUES ($1, $2, 0.0000, 'USD', 0.0000, 0.0000)`,
        [uuidv4(), partnerId]
      );

      // 6. Record in AuditLog (adminId is NOT NULL in AuditLog, fallback to system Admin)
      const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
      let resolvedAdminId: string | null = null;
      if (adminId && isUuid(adminId)) {
        const adminCheck = await client.query('SELECT id FROM "User" WHERE id = $1', [adminId]);
        if (adminCheck.rows.length > 0) {
          resolvedAdminId = adminId;
        }
      }
      if (!resolvedAdminId) {
        const anyAdmin = await client.query('SELECT id FROM "User" WHERE role = \'ADMIN\' LIMIT 1');
        resolvedAdminId = anyAdmin.rows[0]?.id || null;
      }

      await client.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
         VALUES ($1, $2, 'UPGRADE_CUSTOMER_TO_PARTNER', $3, $4)`,
        [
          uuidv4(),
          resolvedAdminId,
          customerUserId,
          `ترقية حساب عميل إلى تاجر: ${user.name} (${user.email})`
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        partnerId,
        userId: customerUserId,
        email: user.email,
        name: user.name,
        role: 'PARTNER',
        status: status || 'ACTIVE'
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Consumes a One-Time Password Setup Token and initializes the partner's secure password.
   */
  public async verifyAndConsumeSetupToken(rawToken: string, newPassword: string) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new Error('رمز إعداد الحساب مفقود.');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error('كلمة المرور يجب ألا تقل عن 6 أحرف.');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Find token row under lock
      const tokenRes = await client.query(
        `SELECT t.*, p.user_id, p.id as partner_id, u.email, u.name, p.status 
         FROM partner_setup_tokens t
         JOIN partner_profiles p ON t.partner_id = p.id
         JOIN "User" u ON p.user_id = u.id
         WHERE t.token_hash = $1 
         FOR UPDATE`,
        [tokenHash]
      );

      if (tokenRes.rows.length === 0) {
        throw new Error('رابط إعداد الحساب غير صالح أو تم استخدامه مسبقاً.');
      }

      const tokenRecord = tokenRes.rows[0];

      if (tokenRecord.used_at) {
        throw new Error('تم استخدام رابط إعداد الحساب مسبقاً. يرجى تسجيل الدخول مباشرة.');
      }

      if (new Date() > new Date(tokenRecord.expires_at)) {
        throw new Error('انتهت صلاحية رابط إعداد الحساب. يرجى مراجعة إدارة المنصة لتزويدك برابط جديد.');
      }

      if (tokenRecord.status !== 'ACTIVE') {
        throw new Error('حساب التاجر معطل حالياً. يرجى مراجعة إدارة المنصة.');
      }

      // 2. Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // 3. Mark token as used
      await client.query(
        `UPDATE partner_setup_tokens 
         SET used_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [tokenRecord.id]
      );

      // 4. Update user's password and passwordChangedAt
      await client.query(
        `UPDATE "User" 
         SET "passwordHash" = $1, 
             "passwordChangedAt" = CURRENT_TIMESTAMP, 
             "updatedAt" = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [passwordHash, tokenRecord.user_id]
      );

      // 5. Update partner profile
      await client.query(
        `UPDATE partner_profiles 
         SET must_change_password = false, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [tokenRecord.partner_id]
      );

      await client.query('COMMIT');

      return {
        success: true,
        userId: tokenRecord.user_id,
        partnerId: tokenRecord.partner_id,
        email: tokenRecord.email,
        name: tokenRecord.name
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
  /**
   * Fetches admin-configured partner pricing markup settings.
   * Default markup: $0.03 (Min: $0.01, Max: $0.05)
   */
  public async getPricingSettings(): Promise<{
    defaultMarkupUsd: number;
    minMarkupUsd: number;
    maxMarkupUsd: number;
  }> {
    try {
      const res = await pool.query('SELECT key, value FROM "partner_pricing_settings"');
      const map: Record<string, number> = {};
      for (const row of res.rows) {
        map[row.key] = Number(row.value);
      }
      return {
        defaultMarkupUsd: map['default_markup_usd'] ?? 0.03,
        minMarkupUsd: map['min_markup_usd'] ?? 0.01,
        maxMarkupUsd: map['max_markup_usd'] ?? 0.05
      };
    } catch {
      return {
        defaultMarkupUsd: 0.03,
        minMarkupUsd: 0.01,
        maxMarkupUsd: 0.05
      };
    }
  }

  /**
   * Calculates authoritative Partner Price based strictly on:
   * Partner Price = Provider/Supplier Cost + Small Markup ($0.01 to $0.05)
   *
   * Priority:
   * 1. partner_product_pricing (UNIQUE partner_id + product_id override)
   * 2. Product.defaultPartnerPriceUsd
   * 3. Supplier Cost + Admin-defined markup ($0.03 default, min $0.01, max $0.05)
   *
   * NO percentages. NO Customer retail price.
   */
  public async getEffectivePartnerPrice(partnerId: string, productId: string) {
    const query = `
      SELECT 
        p.id as product_id,
        p."supplierCostUsd",
        p."gamesDropCostUsd",
        p."customerPriceUsd",
        p."defaultPartnerPriceUsd",
        p."isActive",
        p."inStock",
        ppp.partner_price_usd as custom_partner_price,
        ppp.markup_usd as custom_markup_usd,
        ppp.is_available as custom_is_available
      FROM "Product" p
      LEFT JOIN partner_product_pricing ppp ON ppp.partner_id = $1 AND ppp.product_id = p.id
      WHERE p.id = $2
      LIMIT 1
    `;

    const res = await pool.query(query, [partnerId, productId]);
    if (res.rows.length === 0) {
      throw new Error('المنتج المطلوب غير موجود.');
    }

    const row = res.rows[0];

    if (!row.isActive) {
      throw new Error('المنتج غير متاح حالياً.');
    }

    if (row.custom_is_available === false) {
      throw new Error('هذا المنتج غير مصرح لمتجرك بشرائه.');
    }

    // 1. Supplier / Provider Cost in USD (e.g. GamesDrop cost)
    const supplierCostUsd = Number(row.supplierCostUsd || row.gamesDropCostUsd || 0);

    // 2. Pricing Settings from Admin
    const settings = await this.getPricingSettings();
    const defaultMarkup = Math.min(settings.maxMarkupUsd, Math.max(settings.minMarkupUsd, settings.defaultMarkupUsd));

    let finalPartnerPriceUsd: number;
    let markupUsd: number;
    let isCustom = false;

    if (row.custom_partner_price !== null && row.custom_partner_price !== undefined) {
      finalPartnerPriceUsd = Number(row.custom_partner_price);
      markupUsd = Math.round((finalPartnerPriceUsd - supplierCostUsd) * 10000) / 10000;
      isCustom = true;
    } else if (row.custom_markup_usd !== null && row.custom_markup_usd !== undefined) {
      markupUsd = Number(row.custom_markup_usd);
      finalPartnerPriceUsd = Math.round((supplierCostUsd + markupUsd) * 100) / 100;
      isCustom = true;
    } else if (row.defaultPartnerPriceUsd !== null && row.defaultPartnerPriceUsd !== undefined && Number(row.defaultPartnerPriceUsd) > 0) {
      finalPartnerPriceUsd = Number(row.defaultPartnerPriceUsd);
      markupUsd = Math.round((finalPartnerPriceUsd - supplierCostUsd) * 10000) / 10000;
    } else {
      // Base formula strictly: Supplier Cost + Admin Markup ($0.01 - $0.05, default $0.03)
      markupUsd = defaultMarkup;
      finalPartnerPriceUsd = Math.round((supplierCostUsd + markupUsd) * 100) / 100;
    }

    // Protection 1: Partner price CANNOT be lower than Supplier Cost + minMarkup ($0.01)
    if (finalPartnerPriceUsd < supplierCostUsd + settings.minMarkupUsd) {
      finalPartnerPriceUsd = Math.round((supplierCostUsd + settings.minMarkupUsd) * 100) / 100;
      markupUsd = settings.minMarkupUsd;
    }

    // Protection 2: Minimum absolute price $0.01
    finalPartnerPriceUsd = Math.max(0.01, finalPartnerPriceUsd);

    return {
      productId: row.product_id,
      supplierCostUsd,
      markupUsd,
      customerPriceUsd: Number(row.customerPriceUsd || 0),
      finalPartnerPriceUsd,
      isCustomPricing: isCustom
    };
  }

  /**
   * Awards loyalty points for completed purchases ($1 = 1 Point) and evaluates automatic tier promotion.
   */
  public async awardPointsAndCheckPromotion(partnerId: string, purchaseAmountUsd: number) {
    const pointsToAward = Math.round(purchaseAmountUsd * 100) / 100;
    if (pointsToAward <= 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update total points
      const updateRes = await client.query(
        `UPDATE partner_profiles 
         SET total_points = total_points + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 
         RETURNING total_points, level_id`,
        [pointsToAward, partnerId]
      );

      if (updateRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const { total_points, level_id: currentLevelId } = updateRes.rows[0];
      const newTotalPoints = Number(total_points);

      // Find matching tier
      const tierRes = await client.query(
        `SELECT id, name, arabic_name 
         FROM partner_levels 
         WHERE min_points <= $1 AND (max_points IS NULL OR max_points >= $1)
         ORDER BY min_points DESC 
         LIMIT 1`,
        [newTotalPoints]
      );

      if (tierRes.rows.length > 0) {
        const qualifiedTier = tierRes.rows[0];
        if (qualifiedTier.id !== currentLevelId) {
          // Promote partner
          await client.query(
            `UPDATE partner_profiles 
             SET level_id = $1 
             WHERE id = $2`,
            [qualifiedTier.id, partnerId]
          );
          console.log(`[PartnerPromotion] Partner ${partnerId} promoted to ${qualifiedTier.name} (${newTotalPoints} points)`);
        }
      }

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[PartnerService] Points awarding notice:', err.message);
    } finally {
      client.release();
    }
  }

  /**
   * Fetch Partner Profile, USD Wallet, Level and Statistics
   */
  public async getPartnerDetails(partnerId: string) {
    const query = `
      SELECT 
        p.id as "partnerId",
        p.user_id as "userId",
        u.email,
        u.name,
        p.business_name as "businessName",
        p.phone,
        p.status,
        p.total_points as "totalPoints",
        p.must_change_password as "mustChangePassword",
        p.created_at as "createdAt",
        w.id as "walletId",
        COALESCE(w.balance, 0.0000) as balance,
        w.currency,
        COALESCE(w.total_deposited_usd, 0.0000) as "totalDepositedUsd",
        COALESCE(w.total_spent_usd, 0.0000) as "totalSpentUsd",
        pl.id as "levelId",
        pl.name as "levelName",
        pl.arabic_name as "levelArabicName",
        pl.discount_percent as "discountPercent",
        pl.badge_color as "badgeColor",
        pl.min_points as "levelMinPoints",
        pl.max_points as "levelMaxPoints",
        (SELECT COUNT(*) FROM partner_orders o WHERE o.partner_id = p.id)::int as "totalOrders",
        (SELECT COUNT(*) FROM partner_orders o WHERE o.partner_id = p.id AND o.status = 'COMPLETED')::int as "completedOrders",
        (SELECT COUNT(*) FROM partner_deposits d WHERE d.partner_id = p.id AND d.status = 'APPROVED')::int as "totalApprovedDeposits"
      FROM partner_profiles p
      JOIN "User" u ON p.user_id = u.id
      LEFT JOIN partner_wallets w ON w.partner_id = p.id
      LEFT JOIN partner_levels pl ON p.level_id = pl.id
      WHERE p.id = $1
      LIMIT 1
    `;

    const res = await pool.query(query, [partnerId]);
    if (res.rows.length === 0) {
      return null;
    }

    const partner = res.rows[0];

    // Compute progress to next level
    let nextLevel = null;
    let progressPercent = 100;

    if (partner.levelMaxPoints) {
      const nextLevelRes = await pool.query(
        `SELECT name, arabic_name, min_points 
         FROM partner_levels 
         WHERE min_points > $1 
         ORDER BY min_points ASC LIMIT 1`,
        [Number(partner.levelMaxPoints)]
      );
      if (nextLevelRes.rows.length > 0) {
        nextLevel = nextLevelRes.rows[0];
        const span = Number(partner.levelMaxPoints) - Number(partner.levelMinPoints || 0);
        const currentInSpan = Number(partner.totalPoints) - Number(partner.levelMinPoints || 0);
        progressPercent = span > 0 ? Math.min(100, Math.round((currentInSpan / span) * 100)) : 100;
      }
    }

    return {
      ...partner,
      balance: Number(partner.balance),
      totalPoints: Number(partner.totalPoints),
      discountPercent: Number(partner.discountPercent || 0),
      nextLevel,
      progressPercent
    };
  }

  /**
   * Partner: Retrieves KiroPro Card summary, inventory availability, partner price and wallet check.
   */
  public async getPartnerCardInfo(partnerId: string) {
    const CARD_PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';

    // 1. Available Stock from original kiropro_cards_inventory
    const stockRes = await pool.query(
      `SELECT COUNT(*)::int as "availableStock" 
       FROM kiropro_cards_inventory 
       WHERE status = 'AVAILABLE'`
    );
    const availableStock = stockRes.rows[0]?.availableStock || 0;

    // 2. Partner Pricing ($1.13 default)
    const priceDetails = await this.getEffectivePartnerPrice(partnerId, CARD_PRODUCT_ID);
    const partnerPriceUsd = Number(priceDetails.finalPartnerPriceUsd);

    // 3. Partner Wallet Balance
    const walletRes = await pool.query(
      `SELECT balance FROM partner_wallets WHERE partner_id = $1`,
      [partnerId]
    );
    const walletBalance = Number(walletRes.rows[0]?.balance || 0);

    return {
      productId: CARD_PRODUCT_ID,
      productName: 'KiroPro Card',
      cardType: 'Mastercard Virtual Prepaid',
      cardBalanceUsd: 1.00,
      customerPriceUsd: 2.00, // Retail price unmodified
      partnerPriceUsd,
      availableStock,
      inStock: availableStock > 0,
      walletBalance,
      canAfford: walletBalance >= partnerPriceUsd
    };
  }

  /**
   * Partner: Issues a KiroPro Card atomically from the existing inventory.
   * - Uses PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED
   * - Locks Partner Wallet FOR UPDATE
   * - Verifies wallet balance >= partnerPrice ($1.13)
   * - Inserts Partner Order with idempotency_key
   * - Deducts wallet via partnerLedgerService.debit
   * - Assigns card to partner (assigned_to_user_id)
   * - Commits atomically. If any step fails, rolls back completely.
   * - NEVER logs PAN or CVV.
   */
  public async issueKiroProCard(params: {
    partnerId: string;
    partnerUserId: string;
    idempotencyKey?: string;
  }) {
    const { partnerId, partnerUserId, idempotencyKey } = params;
    const CARD_PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';

    const client = await pool.connect();
    try {
      // 1. Idempotency Guard (fast return if already completed)
      if (idempotencyKey && idempotencyKey.trim()) {
        const cleanKey = idempotencyKey.trim();
        const existingOrderRes = await client.query(
          `SELECT o.id, o.status, o.partner_price_usd as "partnerPriceUsd", o.created_at as "createdAt",
                  c.id as "cardId", c.card_last4 as "cardLast4", c.exp_date as "expDate", c.balance as "cardBalance"
           FROM partner_orders o
           LEFT JOIN kiropro_cards_inventory c ON c.partner_order_id = o.id
           WHERE o.partner_id = $1 AND o.idempotency_key = $2
           LIMIT 1`,
          [partnerId, cleanKey]
        );
        if (existingOrderRes.rows.length > 0) {
          return {
            success: true,
            isDuplicate: true,
            order: existingOrderRes.rows[0],
            message: 'تم تنفيذ هذا الطلب مسبقاً.'
          };
        }
      }

      await client.query('BEGIN');

      // 2. Validate Partner Status
      const partnerRes = await client.query(
        `SELECT id, status FROM partner_profiles WHERE id = $1 FOR SHARE`,
        [partnerId]
      );
      if (partnerRes.rows.length === 0) {
        throw new Error('ملف الشريك غير موجود.');
      }
      if (partnerRes.rows[0].status !== 'ACTIVE') {
        throw new Error('حساب الشريك معطل حالياً ولا يمكنه إصدار البطاقات.');
      }

      // 3. Resolve Partner Price ($1.13 default)
      const priceDetails = await this.getEffectivePartnerPrice(partnerId, CARD_PRODUCT_ID);
      const partnerPrice = Number(priceDetails.finalPartnerPriceUsd);
      if (partnerPrice <= 0) {
        throw new Error('تعذر تحديد سعر الشريك لبطاقة KiroPro Card.');
      }

      // 4. Lock partner wallet row FOR UPDATE
      const walletRes = await client.query(
        `SELECT id, balance FROM partner_wallets WHERE partner_id = $1 FOR UPDATE`,
        [partnerId]
      );
      if (walletRes.rows.length === 0) {
        throw new Error('محفظة الشريك غير موجودة.');
      }
      const walletBalance = Number(walletRes.rows[0].balance);
      if (walletBalance < partnerPrice) {
        throw new Error(`رصيد محفظتك ($${walletBalance.toFixed(2)} USD) غير كافٍ لإصدار البطاقة ($${partnerPrice.toFixed(2)} USD).`);
      }

      // 5. Lock ONE available Mastercard via SELECT ... FOR UPDATE SKIP LOCKED
      const cardRes = await client.query(
        `SELECT id, card_last4, exp_date, balance
         FROM kiropro_cards_inventory
         WHERE status = 'AVAILABLE'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );
      if (cardRes.rows.length === 0) {
        throw new Error('نفد مخزون بطاقات Mastercard المتاحة حالياً في المخزون.');
      }

      const card = cardRes.rows[0];
      const cardId = card.id;
      const orderId = uuidv4();

      // 6. Create Partner Order
      await client.query(
        `INSERT INTO partner_orders (
          id, partner_id, product_id, provider_offer_id, game_id, package_name, player_id, player_name,
          cost_price_usd, partner_price_usd, markup_usd, points_awarded,
          status, completed_at, fulfillment_key, idempotency_key
        ) VALUES ($1, $2, $3, 0, 'KIROPRO_CARD', $4, $5, $6, $7, $8, $9, 0, 'COMPLETED', CURRENT_TIMESTAMP, $10, $11)`,
        [
          orderId,
          partnerId,
          CARD_PRODUCT_ID,
          'KiroPro Card (Mastercard Virtual)',
          card.card_last4,
          `Partner Issuance •••• ${card.card_last4}`,
          1.00,
          partnerPrice,
          Math.max(0, partnerPrice - 1.00),
          card.card_last4,
          idempotencyKey?.trim() || null
        ]
      );

      // 7. Deduct from Partner Wallet atomically (re-using outer client)
      await partnerLedgerService.debit({
        partnerId,
        amount: partnerPrice,
        type: 'PURCHASE',
        referenceId: orderId,
        referenceType: 'ORDER',
        actorId: partnerUserId,
        actorType: 'PARTNER',
        description: `إصدار KiroPro Card (Mastercard •••• ${card.card_last4}) بسعر الشريك $${partnerPrice.toFixed(2)} USD`
      }, client);

      // 8. Assign card to partner and mark CLAIMED
      const updateCardRes = await client.query(
        `UPDATE kiropro_cards_inventory
         SET status = 'CLAIMED',
             partner_order_id = $1,
             assigned_to_user_id = $2,
             assigned_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND status = 'AVAILABLE'
         RETURNING id`,
        [orderId, partnerUserId, cardId]
      );

      if (updateCardRes.rows.length !== 1) {
        throw new Error('فشل تخصيص البطاقة؛ قد تكون خضعت لعملية حجز أخرى متزامنة.');
      }

      await client.query('COMMIT');

      // 9. Award loyalty points asynchronously
      this.awardPointsAndCheckPromotion(partnerId, partnerPrice).catch(err => {
        console.error('[PartnerService] Error awarding points for card purchase:', err.message);
      });

      return {
        success: true,
        order: {
          id: orderId,
          cardId,
          cardLast4: card.card_last4,
          expDate: card.exp_date,
          cardBalance: Number(card.balance),
          partnerPriceUsd: partnerPrice,
          status: 'COMPLETED',
          completedAt: new Date().toISOString()
        }
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Partner: Securely retrieves decrypted credentials for a partner's OWN issued card.
   * Strict IDOR protection: verified through both assigned_to_user_id and partner_orders.partner_id.
   * NEVER logs PAN or CVV.
   */
  public async getPartnerCardCredentials(partnerId: string, partnerUserId: string, cardId: string) {
    const res = await pool.query(
      `SELECT c.id, c.card_number_encrypted, c.card_last4, c.exp_date, c.cvv_encrypted, c.balance,
              c.assigned_to_user_id, o.partner_id
       FROM kiropro_cards_inventory c
       JOIN partner_orders o ON c.partner_order_id = o.id
       WHERE c.id = $1 AND (o.partner_id = $2 OR c.assigned_to_user_id = $3)`,
      [cardId, partnerId, partnerUserId]
    );

    if (res.rows.length === 0) {
      throw new Error('البطاقة غير موجودة أو غير مصرح لك بعرض بياناتها.');
    }

    const row = res.rows[0];
    const cardNumber = decryptCardData(row.card_number_encrypted);
    const cvv = decryptCardData(row.cvv_encrypted);

    return {
      id: row.id,
      cardNumber,
      cardLast4: row.card_last4,
      expDate: row.exp_date,
      cvv,
      balance: Number(row.balance)
    };
  }

  /**
   * Partner: Lists all cards issued to this partner.
   */
  public async getPartnerIssuedCards(partnerId: string) {
    const res = await pool.query(
      `SELECT c.id, c.card_last4 as "cardLast4", c.exp_date as "expDate", c.balance,
              c.status, c.assigned_at as "assignedAt", o.id as "orderId", o.partner_price_usd as "partnerPriceUsd",
              o.completed_at as "completedAt"
       FROM kiropro_cards_inventory c
       JOIN partner_orders o ON c.partner_order_id = o.id
       WHERE o.partner_id = $1
       ORDER BY o.completed_at DESC`,
      [partnerId]
    );
    return res.rows.map(r => ({
      ...r,
      balance: Number(r.balance),
      partnerPriceUsd: Number(r.partnerPriceUsd)
    }));
  }

  /**
   * Partner: Issues Digital Accounts atomically from digital_product_accounts.
   * - Uses PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED
   * - Locks Partner Wallet FOR UPDATE
   * - Verifies wallet balance >= partnerPrice * quantity
   * - Strictly checks availability: if available < quantity, rejects full operation (no partial fulfillment)
   * - Inserts Partner Order with quantity, unit_price_usd, and idempotency_key
   * - Deducts wallet via partnerLedgerService.debit
   * - Updates accounts to SOLD and records assignments
   * - Commits atomically. If any step fails, rolls back completely.
   */
  public async issueDigitalAccounts(params: {
    partnerId: string;
    partnerUserId: string;
    productId: string;
    quantity: number;
    idempotencyKey?: string;
  }) {
    const { partnerId, partnerUserId, productId, quantity, idempotencyKey } = params;

    if (!quantity || quantity < 1) {
      throw new Error('الكمية المطلوبة يجب أن تكون 1 على الأقل.');
    }

    const client = await pool.connect();
    try {
      // 1. Idempotency Guard (fast return if already completed)
      if (idempotencyKey && idempotencyKey.trim()) {
        const cleanKey = idempotencyKey.trim();
        const existingOrderRes = await client.query(
          `SELECT o.id, o.status, o.partner_price_usd as "partnerPriceUsd", o.quantity, o.created_at as "createdAt"
           FROM partner_orders o
           WHERE o.partner_id = $1 AND o.idempotency_key = $2
           LIMIT 1`,
          [partnerId, cleanKey]
        );
        if (existingOrderRes.rows.length > 0) {
          const ord = existingOrderRes.rows[0];
          // Fetch assigned accounts
          const accRes = await client.query(
            `SELECT id, email, password_encrypted FROM digital_product_accounts WHERE partner_order_id = $1`,
            [ord.id]
          );
          const accounts = accRes.rows.map(a => ({
            id: a.id,
            email: a.email,
            password: decryptPassword(a.password_encrypted)
          }));
          return {
            success: true,
            isDuplicate: true,
            order: ord,
            accounts,
            message: 'تم تنفيذ هذا الطلب مسبقاً.'
          };
        }
      }

      await client.query('BEGIN');

      // 2. Validate Partner Status
      const partnerRes = await client.query(
        `SELECT id, status FROM partner_profiles WHERE id = $1 FOR SHARE`,
        [partnerId]
      );
      if (partnerRes.rows.length === 0) {
        throw new Error('ملف الشريك غير موجود.');
      }
      if (partnerRes.rows[0].status !== 'ACTIVE') {
        throw new Error('حساب الشريك معطل حالياً ولا يمكنه إتمام الشراء.');
      }

      // 3. Fetch product details
      const prodRes = await client.query(
        `SELECT id, "productName", "arabicName", "customerPriceUsd", "defaultPartnerPriceUsd",
                COALESCE("supplierCostUsd", 0) as "supplierCostUsd", "fulfillment_type", "inStock"
         FROM "Product" WHERE id = $1`,
        [productId]
      );
      if (prodRes.rows.length === 0) {
        throw new Error('المنتج غير موجود.');
      }
      const product = prodRes.rows[0];

      // 4. Resolve Partner Unit Price
      const priceDetails = await this.getEffectivePartnerPrice(partnerId, productId);
      const unitPrice = Number(priceDetails.finalPartnerPriceUsd);
      if (unitPrice <= 0) {
        throw new Error('تعذر تحديد سعر الشريك للمنتج.');
      }
      const totalAmountUsd = Math.round(unitPrice * quantity * 100) / 100;

      // 5. Lock partner wallet row FOR UPDATE
      const walletRes = await client.query(
        `SELECT id, balance FROM partner_wallets WHERE partner_id = $1 FOR UPDATE`,
        [partnerId]
      );
      if (walletRes.rows.length === 0) {
        throw new Error('محفظة الشريك غير موجودة.');
      }
      const walletBalance = Number(walletRes.rows[0].balance);
      if (walletBalance < totalAmountUsd) {
        throw new Error(`رصيد محفظتك ($${walletBalance.toFixed(2)} USD) غير كافٍ لإتمام شراء ${quantity} حساب ($${totalAmountUsd.toFixed(2)} USD).`);
      }

      // 6. Check available stock before locking
      const stockRes = await client.query(
        `SELECT COUNT(*)::int as count 
         FROM digital_product_accounts 
         WHERE product_id = $1 AND status = 'AVAILABLE'`,
        [productId]
      );
      const availableCount = stockRes.rows[0]?.count || 0;
      if (availableCount < quantity) {
        throw new Error(`المخزون المتوفر غير كافٍ لتلبية الكمية المطلوبة (${quantity}). المتاح حالياً: ${availableCount} فقط.`);
      }

      // 7. Select & Lock Inventory Accounts Atomically (FOR UPDATE SKIP LOCKED)
      const accLockRes = await client.query(
        `SELECT id, email, password_encrypted 
         FROM digital_product_accounts 
         WHERE product_id = $1 AND status = 'AVAILABLE' 
         ORDER BY created_at ASC 
         LIMIT $2 
         FOR UPDATE SKIP LOCKED`,
        [productId, quantity]
      );
      if (accLockRes.rows.length < quantity) {
        throw new Error(`تعذر حجز الكمية المطلوبة بالكامل (${quantity}) نظراً لضغط الطلب المتزامن. المتاح حالياً للحجز: ${accLockRes.rows.length} حساب.`);
      }

      const assignedAccounts = accLockRes.rows;
      const accountIds = assignedAccounts.map(a => a.id);
      const orderId = uuidv4();

      // 8. Create Partner Order
      await client.query(
        `INSERT INTO partner_orders (
          id, partner_id, product_id, provider_offer_id, game_id, package_name, player_id, player_name,
          cost_price_usd, partner_price_usd, unit_price_usd, quantity, markup_usd, points_awarded,
          status, completed_at, fulfillment_key, idempotency_key
        ) VALUES ($1, $2, $3, 0, 'DIGITAL_ACCOUNT', $4, null, $5, $6, $7, $8, $9, $10, 0, 'COMPLETED', CURRENT_TIMESTAMP, $11, $12)`,
        [
          orderId,
          partnerId,
          productId,
          product.arabicName || product.productName,
          `Partner Digital Account (${quantity}x)`,
          Number(product.supplierCostUsd) * quantity,
          totalAmountUsd,
          unitPrice,
          quantity,
          Math.max(0, totalAmountUsd - (Number(product.supplierCostUsd) * quantity)),
          `ACCOUNTS:${accountIds.join(',')}`,
          idempotencyKey?.trim() || null
        ]
      );

      // 9. Deduct from Partner Wallet atomically
      await partnerLedgerService.debit({
        partnerId,
        amount: totalAmountUsd,
        type: 'PURCHASE',
        referenceId: orderId,
        referenceType: 'ORDER',
        actorId: partnerUserId,
        actorType: 'PARTNER',
        description: `شراء حسابات رقمية (${product.arabicName || product.productName}) كمية: ${quantity} بسعر $${totalAmountUsd.toFixed(2)} USD`
      }, client);

      // 10. Mark accounts as SOLD and associate with partner order
      await client.query(
        `UPDATE digital_product_accounts 
         SET status = 'SOLD', 
             partner_order_id = $1, 
             assigned_to_user_id = $2, 
             assigned_at = CURRENT_TIMESTAMP, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ANY($3::uuid[])`,
        [orderId, partnerUserId, accountIds]
      );

      // 11. Record in digital_account_assignments
      for (const acc of assignedAccounts) {
        await client.query(
          `INSERT INTO digital_account_assignments (
             id, partner_order_id, digital_account_id, user_id, created_at
           ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [uuidv4(), orderId, acc.id, partnerUserId]
        );
      }

      await client.query('COMMIT');

      // 12. Award loyalty points asynchronously
      this.awardPointsAndCheckPromotion(partnerId, totalAmountUsd).catch(err => {
        console.error('[PartnerService] Error awarding points for digital accounts:', err.message);
      });

      const decryptedAccounts = assignedAccounts.map(a => ({
        id: a.id,
        email: a.email,
        password: decryptPassword(a.password_encrypted)
      }));

      return {
        success: true,
        order: {
          id: orderId,
          productName: product.arabicName || product.productName,
          quantity,
          unitPriceUsd: unitPrice,
          totalAmountUsd,
          status: 'COMPLETED',
          completedAt: new Date().toISOString()
        },
        accounts: decryptedAccounts
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Partner: Securely retrieves decrypted credentials for digital accounts associated with a partner order.
   * Strict IDOR protection: verified through partner_orders.partner_id.
   */
  public async getPartnerOrderDigitalAccounts(partnerId: string, orderId: string) {
    const orderRes = await pool.query(
      `SELECT id, partner_id, product_id, package_name as "packageName", quantity, partner_price_usd as "amountUsd", status, created_at as "createdAt"
       FROM partner_orders
       WHERE id = $1 AND partner_id = $2`,
      [orderId, partnerId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error('الطلب غير موجود أو غير مصرح لك بعرض بياناته.');
    }

    const accRes = await pool.query(
      `SELECT id, email, password_encrypted, assigned_at as "assignedAt"
       FROM digital_product_accounts
       WHERE partner_order_id = $1`,
      [orderId]
    );

    const accounts = accRes.rows.map(a => ({
      id: a.id,
      email: a.email,
      password: decryptPassword(a.password_encrypted),
      assignedAt: a.assignedAt
    }));

    return {
      order: orderRes.rows[0],
      accounts
    };
  }
}

export const partnerService = new PartnerService();
