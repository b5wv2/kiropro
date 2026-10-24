import { Router, Response } from 'express';
import pool from '../db';
import { requireAdmin, requirePermission, AuthRequest } from '../middlewares/authMiddleware';
import { g2BulkVoucherService } from '../services/g2bulkVoucherService';

const router = Router();

// Require authenticated admin with PRODUCTS_MANAGE permission
router.use(requireAdmin, requirePermission('PRODUCTS_MANAGE'));

/**
 * GET /api/admin/vouchers
 * List all voucher catalog products with supplier costs, stock, selling prices, and active status.
 */
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await g2BulkVoucherService.getSyncStats();

    const result = await pool.query(`
      SELECT 
        v.id,
        v.provider_category_id as "providerCategoryId",
        v.provider_product_id as "providerProductId",
        v.title,
        v.arabic_title as "arabicTitle",
        v.description,
        v.category_title as "categoryTitle",
        v.game_key as "gameKey",
        v.unit_price as "supplierUnitPrice",
        v.face_value as "faceValue",
        v.stock,
        v.custom_image_url as "customImageUrl",
        v.currency,
        v.customer_price_usd as "customerPriceUsd",
        v.is_active as "isActive",
        v.is_in_stock as "isInStock",
        v.synced_at as "syncedAt",
        p.id as "linkedProductId",
        (
          SELECT COUNT(*)::int 
          FROM order_voucher_codes ovc 
          WHERE ovc.provider_product_id = v.provider_product_id::text
        ) as "totalSold"
      FROM g2bulk_voucher_catalog v
      LEFT JOIN "Product" p ON p.id = (
        SELECT p2.id FROM "Product" p2 
        WHERE p2.fulfillment_type = 'G2BULK_VOUCHER' 
          AND p2."productName" = v.title 
        LIMIT 1
      )
      ORDER BY v.game_key ASC, v.unit_price ASC
    `);

    return res.json({
      success: true,
      stats,
      products: result.rows
    });
  } catch (err: any) {
    console.error('[Admin Vouchers] Error listing vouchers:', err.message);
    return res.status(500).json({ error: 'تعذر جلب قائمة بطاقات الهدايا.' });
  }
});

/**
 * GET /api/admin/vouchers/:id
 * Fetch single voucher details by UUID or provider product ID.
 */
router.get('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const rawId = typeof id === 'string' ? id.trim() : String(id || '').trim();
  if (!rawId) {
    return res.status(400).json({ error: 'معرف البطاقة غير صالح.' });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  const isNumeric = /^\d+$/.test(rawId);

  if (!isUuid && !isNumeric) {
    return res.status(400).json({ error: 'معرف البطاقة غير صالح.' });
  }

  try {
    const result = isUuid
      ? await pool.query(`SELECT * FROM g2bulk_voucher_catalog WHERE id = $1::uuid`, [rawId])
      : await pool.query(`SELECT * FROM g2bulk_voucher_catalog WHERE provider_product_id = $1::integer`, [parseInt(rawId, 10)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'فئة البطاقة غير موجودة.' });
    }

    return res.json({
      success: true,
      product: result.rows[0]
    });
  } catch (err: any) {
    console.error('[Admin Vouchers] Error fetching voucher:', err.message);
    return res.status(500).json({ error: 'فشل جلب بيانات البطاقة.' });
  }
});

/**
 * PATCH /api/admin/vouchers/:id
 * Update selling price, active status, custom image, and Arabic title.
 */
router.patch('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const rawId = typeof id === 'string' ? id.trim() : String(id || '').trim();
  if (!rawId) {
    return res.status(400).json({ error: 'معرف البطاقة غير صالح.' });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  const isNumeric = /^\d+$/.test(rawId);

  if (!isUuid && !isNumeric) {
    return res.status(400).json({ error: 'معرف البطاقة غير صالح.' });
  }

  const { customerPriceUsd, isActive, customImageUrl, arabicTitle } = req.body;

  try {
    // 1. Fetch existing item by matching type with schema
    const existingRes = isUuid
      ? await pool.query(
          `SELECT * FROM g2bulk_voucher_catalog WHERE id = $1::uuid`,
          [rawId]
        )
      : await pool.query(
          `SELECT * FROM g2bulk_voucher_catalog WHERE provider_product_id = $1::integer`,
          [parseInt(rawId, 10)]
        );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'فئة البطاقة غير موجودة.' });
    }

    const item = existingRes.rows[0];

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (customerPriceUsd !== undefined) {
      const priceNum = customerPriceUsd === null ? null : Number(customerPriceUsd);
      if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0)) {
        return res.status(400).json({ error: 'سعر البيع غير صالح.' });
      }
      fields.push(`customer_price_usd = $${idx++}`);
      values.push(priceNum);
    }

    if (isActive !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(Boolean(isActive));
    }

    if (customImageUrl !== undefined) {
      fields.push(`custom_image_url = $${idx++}`);
      values.push(customImageUrl ? String(customImageUrl).trim() : null);
    }

    if (arabicTitle !== undefined) {
      fields.push(`arabic_title = $${idx++}`);
      values.push(arabicTitle ? String(arabicTitle).trim() : null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'لا توجد حقول لتحديثها.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(item.id);

    const updateRes = await pool.query(
      `UPDATE g2bulk_voucher_catalog 
       SET ${fields.join(', ')} 
       WHERE id = $${idx}::uuid 
       RETURNING *`,
      values
    );

    const updatedItem = updateRes.rows[0];

    // Mirror updates into "Product" table
    const prodUpdateFields: string[] = [];
    const prodUpdateValues: any[] = [];
    let pIdx = 1;

    if (customerPriceUsd !== undefined) {
      prodUpdateFields.push(`"customerPriceUsd" = $${pIdx++}`);
      prodUpdateValues.push(updatedItem.customer_price_usd);
    }

    if (isActive !== undefined) {
      prodUpdateFields.push(`"isActive" = $${pIdx++}`);
      prodUpdateValues.push(updatedItem.is_active);
    }

    if (customImageUrl !== undefined) {
      prodUpdateFields.push(`"imageUrl" = $${pIdx++}`);
      prodUpdateValues.push(updatedItem.custom_image_url);
    }

    if (arabicTitle !== undefined) {
      prodUpdateFields.push(`"arabicName" = $${pIdx++}`);
      prodUpdateValues.push(updatedItem.arabic_title);
    }

    if (prodUpdateFields.length > 0) {
      prodUpdateFields.push(`"updatedAt" = NOW()`);
      prodUpdateValues.push(item.title);
      await pool.query(
        `UPDATE "Product" 
         SET ${prodUpdateFields.join(', ')} 
         WHERE "productName" = $${pIdx} AND fulfillment_type = 'G2BULK_VOUCHER'`,
        prodUpdateValues
      );
    }

    return res.json({
      success: true,
      message: 'تم تحديث بيانات الفئة بنجاح ✓',
      product: updatedItem
    });
  } catch (err: any) {
    console.error('[Admin Vouchers] Error updating voucher:', err.message);
    return res.status(500).json({ error: 'فشل تحديث بيانات البطاقة.' });
  }
});

/**
 * POST /api/admin/vouchers/sync
 * Manually trigger G2Bulk voucher catalog synchronization.
 */
router.post('/sync', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await g2BulkVoucherService.syncCatalog();
    if (result.success) {
      return res.json({
        success: true,
        message: 'تمت مزامنة كتالوج البطاقات الرقمية بنجاح ✓',
        stats: result.stats
      });
    } else {
      return res.status(502).json({
        error: `فشلت مزامنة البطاقات: ${result.error}`,
        stats: result.stats
      });
    }
  } catch (err: any) {
    console.error('[Admin Vouchers] Error running sync:', err.message);
    return res.status(500).json({ error: err.message || 'فشلت المزامنة.' });
  }
});

export default router;
