import { Router, Response } from 'express';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import {
  getMarketplaceSettings,
  MarketplaceSettings,
  DEFAULT_MARKETPLACE_SETTINGS,
  VALID_GAMES,
  VALID_LEVELS,
  GAME_BINDINGS
} from './marketplace';

const router = Router();

// =========================================================================
// 1. STATS & OVERVIEW
// =========================================================================

/**
 * GET /api/admin/marketplace/stats
 * Overview counts, status breakdown, and financial totals
 */
router.get('/stats', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_listings,
        COUNT(*) FILTER (WHERE status = 'PUBLISHED' AND expires_at > NOW()) as published_active,
        COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW') as pending_review,
        COUNT(*) FILTER (WHERE status = 'EXPIRED' OR (status = 'PUBLISHED' AND expires_at <= NOW())) as expired,
        COUNT(*) FILTER (WHERE status = 'SOLD') as sold,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected,
        COUNT(*) FILTER (WHERE status = 'SUSPENDED') as suspended
      FROM account_listings
    `);

    const finRes = await pool.query(`
      SELECT 
        COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0) as total_fees_collected,
        COALESCE(SUM(refund_amount) FILTER (WHERE status = 'REFUNDED'), 0) as total_refunded
      FROM account_listing_payments
    `);

    const settings = await getMarketplaceSettings();

    res.json({
      stats: {
        totalListings: Number(statsRes.rows[0].total_listings || 0),
        publishedActive: Number(statsRes.rows[0].published_active || 0),
        pendingReview: Number(statsRes.rows[0].pending_review || 0),
        expired: Number(statsRes.rows[0].expired || 0),
        sold: Number(statsRes.rows[0].sold || 0),
        cancelled: Number(statsRes.rows[0].cancelled || 0),
        rejected: Number(statsRes.rows[0].rejected || 0),
        suspended: Number(statsRes.rows[0].suspended || 0),
        totalFeesCollected: Number(finRes.rows[0].total_fees_collected || 0),
        totalRefunded: Number(finRes.rows[0].total_refunded || 0)
      },
      settings
    });
  } catch (err: any) {
    console.error('[Admin Marketplace] Stats error:', err.message);
    res.status(500).json({ error: 'فشل جلب إحصائيات سوق الحسابات.' });
  }
});

// =========================================================================
// 2. LISTINGS MODERATION
// =========================================================================

/**
 * GET /api/admin/marketplace/listings
 * Full listing table for admins with private seller details, search & filters
 */
router.get('/listings', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      game,
      search,
      page = 1,
      limit = 25
    } = req.query;

    const conditions: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    if (status && typeof status === 'string' && status !== 'ALL') {
      conditions.push(`al.status = $${pIdx++}`);
      values.push(status);
    }

    if (game && typeof game === 'string' && game !== 'ALL') {
      conditions.push(`al.game = $${pIdx++}`);
      values.push(game);
    }

    if (search && typeof search === 'string' && search.trim()) {
      conditions.push(`(
        al.title ILIKE $${pIdx} OR 
        al.public_code ILIKE $${pIdx} OR 
        al.seller_whatsapp ILIKE $${pIdx} OR
        u.email ILIKE $${pIdx} OR
        u.name ILIKE $${pIdx}
      )`);
      values.push(`%${search.trim()}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const pageNum = Math.max(1, parseInt(String(page)) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit)) || 25));
    const offset = (pageNum - 1) * limitNum;

    const countRes = await pool.query(
      `SELECT COUNT(*) as total 
       FROM account_listings al
       LEFT JOIN "User" u ON al.seller_user_id = u.id
       ${whereClause}`,
      values
    );
    const total = parseInt(countRes.rows[0].total || '0', 10);

    const query = `
      SELECT 
        al.*,
        u.name as seller_name,
        u.email as seller_email,
        (
          SELECT img.image_url 
          FROM account_listing_images img 
          WHERE img.listing_id = al.id 
          ORDER BY img.is_primary DESC, img.sort_order ASC 
          LIMIT 1
        ) as primary_image,
        (
          SELECT COUNT(*) 
          FROM account_listing_images img 
          WHERE img.listing_id = al.id
        )::int as total_images,
        p.status as payment_status,
        p.amount as fee_amount,
        p.refund_amount,
        p.refunded_at
      FROM account_listings al
      LEFT JOIN "User" u ON al.seller_user_id = u.id
      LEFT JOIN account_listing_payments p ON p.listing_id = al.id
      ${whereClause}
      ORDER BY 
        CASE WHEN al.status = 'PENDING_REVIEW' THEN 0 ELSE 1 END,
        al.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    values.push(limitNum, offset);
    const result = await pool.query(query, values);

    res.json({
      listings: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err: any) {
    console.error('[Admin Marketplace] Listings error:', err.message);
    res.status(500).json({ error: 'فشل جلب قائمة الإعلانات للإدارة.' });
  }
});

/**
 * GET /api/admin/marketplace/listings/:id
 * Full single listing detail with images, seller private info, payments and audit events
 */
router.get('/listings/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const listingRes = await pool.query(
      `SELECT 
        al.*,
        u.name as seller_name,
        u.email as seller_email,
        w.balance as seller_wallet_balance
       FROM account_listings al
       LEFT JOIN "User" u ON al.seller_user_id = u.id
       LEFT JOIN "Wallet" w ON w."userId" = u.id
       WHERE al.id = $1`,
      [id]
    );

    if (listingRes.rows.length === 0) {
      return res.status(404).json({ error: 'الإعلان غير موجود.' });
    }

    const listing = listingRes.rows[0];

    // Images
    const imagesRes = await pool.query(
      `SELECT * FROM account_listing_images 
       WHERE listing_id = $1 
       ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
      [id]
    );

    // Payments
    const paymentsRes = await pool.query(
      `SELECT * FROM account_listing_payments 
       WHERE listing_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );

    // Audit / Events
    const eventsRes = await pool.query(
      `SELECT e.*, u.name as actor_name, u.email as actor_email
       FROM account_listing_events e
       LEFT JOIN "User" u ON e.actor_id = u.id
       WHERE e.listing_id = $1
       ORDER BY e.created_at DESC`,
      [id]
    );

    res.json({
      listing: {
        ...listing,
        images: imagesRes.rows,
        payments: paymentsRes.rows,
        events: eventsRes.rows
      }
    });
  } catch (err: any) {
    console.error('[Admin Marketplace] Listing detail error:', err.message);
    res.status(500).json({ error: 'فشل جلب تفاصيل الإعلان.' });
  }
});

/**
 * POST /api/admin/marketplace/listings/:id/approve
 * Approves a listing, publishes it, and sets authoritative expires_at
 */
router.post('/listings/:id/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT * FROM account_listings WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الإعلان غير موجود.' });
    }

    const listing = checkRes.rows[0];
    const duration = Number(listing.duration_days) || 15;

    // Calculate expiry: from NOW() + duration days
    const now = new Date();
    const expiry = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    await client.query(
      `UPDATE account_listings 
       SET status = 'PUBLISHED',
           starts_at = NOW(),
           published_at = NOW(),
           expires_at = $1,
           rejection_reason = NULL,
           rejection_notes = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [expiry, id]
    );

    // Record Event
    await client.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, metadata, notes
      ) VALUES ($1, $2, 'ADMIN', 'APPROVED', $3, 'PUBLISHED', $4, 'تم قبول الإعلان ونشره في السوق')`,
      [
        id,
        adminId,
        listing.status,
        JSON.stringify({ duration, expiresAt: expiry })
      ]
    );

    // Record in global AuditLog
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES (gen_random_uuid(), $1, 'APPROVE_MARKETPLACE_LISTING', $2, $3)`,
      [
        adminId,
        listing.seller_user_id,
        `قبول ونشر إعلان حساب (${listing.public_code}) لمدة ${duration} يوم`
      ]
    ).catch(e => console.warn('[AuditLog] marketplace approve warning:', e.message));

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'تم قبول الإعلان ونشره بنجاح!',
      expiresAt: expiry
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Admin Marketplace] Approve error:', err.message);
    res.status(500).json({ error: 'فشل قبول الإعلان.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/marketplace/listings/:id/reject
 * Rejects listing with structured reason and optional note
 */
router.post('/listings/:id/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;
  const { id } = req.params;
  const { reason, notes } = req.body;

  if (!reason || typeof reason !== 'string') {
    return res.status(400).json({ error: 'يرجى تحديد سبب الرفض.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT * FROM account_listings WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الإعلان غير موجود.' });
    }

    const listing = checkRes.rows[0];

    await client.query(
      `UPDATE account_listings 
       SET status = 'REJECTED',
           rejected_at = NOW(),
           rejection_reason = $1,
           rejection_notes = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [reason.trim(), notes ? String(notes).trim() : null, id]
    );

    // Record Event
    await client.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, metadata, notes
      ) VALUES ($1, $2, 'ADMIN', 'REJECTED', $3, 'REJECTED', $4, $5)`,
      [
        id,
        adminId,
        listing.status,
        JSON.stringify({ reason: reason.trim(), notes }),
        `تم رفض الإعلان: ${reason.trim()}`
      ]
    );

    // Record in global AuditLog
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES (gen_random_uuid(), $1, 'REJECT_MARKETPLACE_LISTING', $2, $3)`,
      [
        adminId,
        listing.seller_user_id,
        `رفض إعلان حساب (${listing.public_code}): ${reason.trim()}`
      ]
    ).catch(e => console.warn('[AuditLog] marketplace reject warning:', e.message));

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'تم رفض الإعلان وتسجيل السبب بنجاح.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Admin Marketplace] Reject error:', err.message);
    res.status(500).json({ error: 'فشل رفض الإعلان.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/marketplace/listings/:id/suspend
 * Suspends an active listing
 */
router.post('/listings/:id/suspend', requireAdmin, async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;
  const { id } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query(
      'SELECT * FROM account_listings WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الإعلان غير موجود.' });
    }

    const listing = checkRes.rows[0];

    await client.query(
      `UPDATE account_listings 
       SET status = 'SUSPENDED', updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    // Record Event
    await client.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, notes
      ) VALUES ($1, $2, 'ADMIN', 'SUSPENDED', $3, 'SUSPENDED', $4)`,
      [id, adminId, listing.status, reason ? `تعليق الإعلان: ${reason}` : 'تم تعليق الإعلان بواسطة الإدارة']
    );

    // Record in global AuditLog
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES (gen_random_uuid(), $1, 'SUSPEND_MARKETPLACE_LISTING', $2, $3)`,
      [adminId, listing.seller_user_id, `تعليق إعلان حساب (${listing.public_code})`]
    ).catch(e => console.warn('[AuditLog] marketplace suspend warning:', e.message));

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'تم تعليق الإعلان بنجاح.'
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Admin Marketplace] Suspend error:', err.message);
    res.status(500).json({ error: 'فشل تعليق الإعلان.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/marketplace/listings/:id/cancel-refund
 * Cancels listing and refunds listing fee back to seller's wallet atomically.
 * Strictly idempotent: verifies payment is not already refunded.
 */
router.post('/listings/:id/cancel-refund', requireAdmin, async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;
  const { id } = req.params;
  const { reason, notes } = req.body;

  if (!reason || typeof reason !== 'string') {
    return res.status(400).json({ error: 'يرجى توضيح سبب الإلغاء والاسترداد.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock listing FOR UPDATE
    const listRes = await client.query(
      'SELECT * FROM account_listings WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (listRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الإعلان غير موجود.' });
    }

    const listing = listRes.rows[0];

    // 2. Lock payment FOR UPDATE
    const payRes = await client.query(
      `SELECT * FROM account_listing_payments 
       WHERE listing_id = $1 AND status = 'PAID' 
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [id]
    );

    if (payRes.rows.length === 0) {
      // Check if already refunded
      const alreadyRefundedRes = await client.query(
        `SELECT id FROM account_listing_payments WHERE listing_id = $1 AND status = 'REFUNDED' LIMIT 1`,
        [id]
      );
      await client.query('ROLLBACK');
      if (alreadyRefundedRes.rows.length > 0) {
        return res.status(400).json({ error: 'تم استرداد رسوم هذا الإعلان مسبقاً. لا يمكن تكرار العملية.' });
      }
      return res.status(400).json({ error: 'لا يوجد سجل دفع مؤكد قابل للاسترداد لهذا الإعلان.' });
    }

    const payment = payRes.rows[0];
    const refundAmount = Number(payment.amount);

    // 3. Lock user wallet FOR UPDATE
    const walletRes = await client.query(
      'SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
      [listing.seller_user_id]
    );

    if (walletRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'محفظة المستخدم غير موجودة.' });
    }

    const wallet = walletRes.rows[0];
    const balanceBefore = Number(wallet.balance || 0);
    const newBalance = balanceBefore + refundAmount;

    // 4. Update wallet balance
    await client.query(
      'UPDATE "Wallet" SET balance = $1, "updatedAt" = NOW() WHERE id = $2',
      [newBalance, wallet.id]
    );

    // 5. Update payment record to REFUNDED
    await client.query(
      `UPDATE account_listing_payments 
       SET status = 'REFUNDED',
           refunded_at = NOW(),
           refund_amount = $1,
           refund_reason = $2,
           refunded_by_admin_id = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [refundAmount, reason.trim(), adminId, payment.id]
    );

    // 6. Record WalletTransaction
    const txDescription = `استرداد رسوم إعلان حساب (${listing.public_code}): ${reason.trim()}`;
    await client.query(
      `INSERT INTO "WalletTransaction" (
        "walletId", amount, type, description, currency,
        "balanceBefore", "balanceAfter", "referenceType", "referenceId",
        "createdBy", "created_by_type"
      ) VALUES ($1, $2, 'REFUND', $3, $4, $5, $6, 'ACCOUNT_MARKETPLACE', $7, $8, 'ADMIN')`,
      [
        wallet.id,
        refundAmount,
        txDescription,
        payment.currency,
        balanceBefore,
        newBalance,
        listing.id,
        adminId
      ]
    );

    // 7. Update listing status to CANCELLED
    await client.query(
      `UPDATE account_listings 
       SET status = 'CANCELLED',
           cancelled_at = NOW(),
           cancellation_reason = $1,
           cancellation_notes = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [reason.trim(), notes ? String(notes).trim() : null, id]
    );

    // 8. Record Event
    await client.query(
      `INSERT INTO account_listing_events (
        listing_id, actor_id, actor_type, event_type, old_status, new_status, metadata, notes
      ) VALUES ($1, $2, 'ADMIN', 'CANCELLED_REFUNDED', $3, 'CANCELLED', $4, $5)`,
      [
        id,
        adminId,
        listing.status,
        JSON.stringify({ refundAmount, paymentId: payment.id, reason: reason.trim() }),
        `تم إلغاء الإعلان واسترداد الرسوم بمبلغ ${refundAmount} ${payment.currency}`
      ]
    );

    // 9. Record in global AuditLog
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", amount, reason)
       VALUES (gen_random_uuid(), $1, 'CANCEL_REFUND_MARKETPLACE_LISTING', $2, $3, $4)`,
      [
        adminId,
        listing.seller_user_id,
        refundAmount,
        `إلغاء واسترداد رسوم إعلان (${listing.public_code}) بمبلغ ${refundAmount} ${payment.currency}: ${reason.trim()}`
      ]
    ).catch(e => console.warn('[AuditLog] marketplace refund warning:', e.message));

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `تم إلغاء الإعلان واسترداد رسوم النشر (${refundAmount.toLocaleString()} ${payment.currency}) إلى محفظة المستخدم بنجاح.`,
      refundAmount,
      newBalance
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Admin Marketplace] Cancel refund error:', err.message);
    res.status(500).json({ error: 'فشل إلغاء الإعلان واسترداد الرسوم.' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/admin/marketplace/settings
 * Admin updates marketplace fee settings
 */
router.put('/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;
  const { fee15Days, fee30Days, enabled } = req.body;

  const f15 = parseFloat(String(fee15Days));
  const f30 = parseFloat(String(fee30Days));

  if (isNaN(f15) || f15 <= 0 || isNaN(f30) || f30 <= 0) {
    return res.status(400).json({ error: 'يرجى إدخال رسوم صحيحة وأكبر من الصفر.' });
  }

  try {
    const currentSettings = await getMarketplaceSettings();
    const updatedSettings: MarketplaceSettings = {
      ...currentSettings,
      fee_15_days: f15,
      fee_30_days: f30,
      enabled: enabled !== undefined ? Boolean(enabled) : currentSettings.enabled
    };

    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at, updated_by)
       VALUES ('account_marketplace_settings', $1, NOW(), $2)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(updatedSettings), adminId]
    );

    // Record in global AuditLog
    await pool.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES (gen_random_uuid(), $1, 'UPDATE_MARKETPLACE_SETTINGS', $2)`,
      [adminId, `تحديث رسوم سوق الحسابات: 15 يوم = ${f15} SDG، 30 يوم = ${f30} SDG`]
    ).catch(e => console.warn('[AuditLog] settings update warning:', e.message));

    res.json({
      success: true,
      message: 'تم تحديث إعدادات سوق الحسابات بنجاح.',
      settings: updatedSettings
    });
  } catch (err: any) {
    console.error('[Admin Marketplace] Settings update error:', err.message);
    res.status(500).json({ error: 'فشل تحديث إعدادات سوق الحسابات.' });
  }
});

export default router;
