import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { sendPartnerWelcomeEmail } from './emailService';

export interface CreatePartnerParams {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  levelId?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  notes?: string;
}

export class PartnerService {
  /**
   * Admin: Creates a new Partner account with One-Time Password Setup Token.
   * Never transmits cleartext passwords via email.
   */
  public async createPartnerAccount(params: CreatePartnerParams) {
    const { name, email, phone, businessName, levelId, status, notes } = params;

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('يرجى إدخال بريد إلكتروني صحيح.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if email already exists
      const existingUser = await client.query('SELECT id FROM "User" WHERE email = $1', [normalizedEmail]);
      if (existingUser.rows.length > 0) {
        throw new Error('البريد الإلكتروني مسجل مسبقاً في النظام.');
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
      // Primary: partner.kiropro.store
      const isProd = process.env.NODE_ENV === 'production';
      const baseUrl = isProd ? 'https://partner.kiropro.store' : 'http://localhost:5173/partner';
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
   * Calculates authoritative Partner Price for a specific product.
   * Priority:
   * 1. partner_product_pricing (UNIQUE partner_id + product_id override)
   * 2. Product.defaultPartnerPriceUsd
   * 3. Product.customerPriceUsd * 0.95 fallback
   * Level discount is applied to the base partner price.
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
        ppp.is_available as custom_is_available,
        pl.discount_percent as level_discount_percent
      FROM "Product" p
      LEFT JOIN partner_profiles pp ON pp.id = $1
      LEFT JOIN partner_levels pl ON pp.level_id = pl.id
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

    const supplierCostUsd = Number(row.supplierCostUsd || row.gamesDropCostUsd || 0);

    let basePartnerPriceUsd: number;
    let isCustom = false;

    if (row.custom_partner_price !== null && row.custom_partner_price !== undefined) {
      basePartnerPriceUsd = Number(row.custom_partner_price);
      isCustom = true;
    } else if (row.defaultPartnerPriceUsd !== null && row.defaultPartnerPriceUsd !== undefined) {
      basePartnerPriceUsd = Number(row.defaultPartnerPriceUsd);
    } else {
      basePartnerPriceUsd = Math.round(Number(row.customerPriceUsd || 0) * 0.95 * 100) / 100;
    }

    // Apply level discount (only if not customized specifically, or as stackable discount)
    const discountPercent = Number(row.level_discount_percent || 0);
    let finalPartnerPriceUsd = basePartnerPriceUsd;

    if (discountPercent > 0 && !isCustom) {
      finalPartnerPriceUsd = Math.round(basePartnerPriceUsd * (1 - discountPercent / 100) * 100) / 100;
    }

    // Protection: partner price cannot be less than 0.01
    finalPartnerPriceUsd = Math.max(0.01, finalPartnerPriceUsd);

    return {
      productId: row.product_id,
      supplierCostUsd,
      customerPriceUsd: Number(row.customerPriceUsd || 0),
      basePartnerPriceUsd,
      discountPercent,
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
}

export const partnerService = new PartnerService();
