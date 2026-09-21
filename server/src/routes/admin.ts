import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { requireAdmin, AuthRequest } from '../middlewares/authMiddleware';
import { v4 as uuidv4 } from 'uuid';
import { awardOrderCashback, reverseOrderCashback } from '../services/cashbackService';
import { processReferralRewardOnOrder } from '../services/referralService';
import { getOrCreateOrderReviewToken, createGeneralReviewToken } from '../services/reviewTokenService';
import { executeOrderWithProvider } from '../services/orderExecutionService';
import { validatePlayerAccount } from '../services/playerValidationService';

const router = Router();

// Dashboard Stats
router.get('/stats', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const totalCustomersRes = await pool.query('SELECT COUNT(*) FROM "User" WHERE role = $1', ['CUSTOMER']);
    const totalCustomers = parseInt(totalCustomersRes.rows[0].count, 10);

    const totalWalletRes = await pool.query('SELECT SUM(balance) as "totalBalance" FROM "Wallet"');
    const totalWalletBalance = parseFloat(totalWalletRes.rows[0].totalBalance || '0');

    const ordersRes = await pool.query(`
      SELECT 
        COUNT(*) as "totalOrders",
        COUNT(*) FILTER (WHERE status = 'PENDING') as "pendingOrders",
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as "completedOrders",
        COUNT(*) FILTER (WHERE status = 'FAILED') as "failedOrders"
      FROM "Order"
    `);
    
    const { totalOrders, pendingOrders, completedOrders, failedOrders } = ordersRes.rows[0];

    const recentOrdersRes = await pool.query(`
      SELECT o.*, u.name as "userName", u.email as "userEmail" 
      FROM "Order" o 
      LEFT JOIN "User" u ON o."userId" = u.id 
      ORDER BY o."createdAt" DESC LIMIT 10
    `);

    const recentWalletActivityRes = await pool.query(`
      SELECT t.*, u.name as "userName"
      FROM "WalletTransaction" t
      JOIN "Wallet" w ON t."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      ORDER BY t."createdAt" DESC LIMIT 10
    `);

    res.json({
      totalCustomers,
      totalWalletBalance,
      totalOrders: parseInt(totalOrders, 10),
      pendingOrders: parseInt(pendingOrders, 10),
      completedOrders: parseInt(completedOrders, 10),
      failedOrders: parseInt(failedOrders, 10),
      recentOrders: recentOrdersRes.rows,
      recentWalletActivity: recentWalletActivityRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Users
router.get('/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const usersRes = await pool.query(`
      SELECT 
        u.id, u.email, u.name, u."createdAt",
        COALESCE(w.balance, 0) as balance,
        COALESCE(w.currency, u.preferred_currency, 'USD') as currency,
        (SELECT COUNT(*) FROM "Order" o WHERE o."userId" = u.id) as "ordersCount"
      FROM "User" u
      LEFT JOIN "Wallet" w ON u.id = w."userId"
      WHERE u.role = 'CUSTOMER'
      ORDER BY u."createdAt" DESC
    `);

    res.json(usersRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Wallet Management: Credit
router.post('/users/:id/wallet/credit', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { amount, currency, reason } = req.body;
  const adminId = req.user?.id;

  if (!currency || typeof currency !== 'string') {
    return res.status(400).json({ error: 'العملة مطلوبة (Currency is required).' });
  }

  const cleanCurrency = currency.trim().toUpperCase();
  if (!['USD', 'SDG'].includes(cleanCurrency)) {
    return res.status(400).json({ error: 'العملة غير صحيحة. العملات المدعومة هي USD أو SDG فقط.' });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'المبلغ غير صالح (Invalid amount).' });
  }

  const roundedAmount = Math.round(numAmount * 100) / 100;
  if (Math.abs(numAmount - roundedAmount) > 0.00001) {
    return res.status(400).json({ error: 'المبلغ لا يمكن أن يتجاوز منزلتين عشريتين.' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query('SELECT id, name, email, preferred_currency FROM "User" WHERE id = $1', [id]);
      const user = userRes.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'العميل غير موجود.' });
      }

      let walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [id]);
      let wallet = walletRes.rows[0];
      const userWalletCurrency = (wallet?.currency || user.preferred_currency || 'USD').toUpperCase();

      // STRICT CHECK: Reject currency mismatch
      if (cleanCurrency !== userWalletCurrency) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `عملة العملية (${cleanCurrency}) لا تتطابق مع عملة محفظة العميل (${userWalletCurrency}). لا يمكن إيداع رصيد بعملة مختلفة عن عملة المحفظة.` 
        });
      }

      // Read limits & exchange rate from platform_settings
      const rateSettingRes = await client.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
      const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000 };
      const exchangeRate = Number(rateConfig.rate) || 5000;

      const minAmount = cleanCurrency === 'USD' 
        ? (Number(rateConfig.min_admin_usd) || 0.1) 
        : (Number(rateConfig.min_admin_sdg) || Math.round(0.1 * exchangeRate));
      const maxAmount = cleanCurrency === 'USD' 
        ? (Number(rateConfig.max_admin_usd) || 10000) 
        : (Number(rateConfig.max_admin_sdg) || Math.round(10000 * exchangeRate));

      if (roundedAmount < minAmount) {
        await client.query('ROLLBACK');
        const minLabel = cleanCurrency === 'USD' ? `$${minAmount}` : `${minAmount.toLocaleString()} ج.س`;
        return res.status(400).json({ error: `الحد الأدنى للإيداع هو ${minLabel}.` });
      }

      if (roundedAmount > maxAmount) {
        await client.query('ROLLBACK');
        const maxLabel = cleanCurrency === 'USD' ? `$${maxAmount}` : `${maxAmount.toLocaleString()} ج.س`;
        return res.status(400).json({ error: `الحد الأقصى للإيداع في المرة الواحدة هو ${maxLabel}.` });
      }

      const sourceAmountUsd = cleanCurrency === 'USD' 
        ? roundedAmount 
        : (exchangeRate > 0 ? Math.round((roundedAmount / exchangeRate) * 100) / 100 : roundedAmount);

      const balanceBefore = wallet ? Number(wallet.balance) : 0;
      const newBalance = Math.round((balanceBefore + roundedAmount) * 100) / 100;
      let walletId = wallet?.id;

      if (!walletId) {
        walletId = uuidv4();
        await client.query(
          'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)', 
          [walletId, id, newBalance, cleanCurrency]
        );
      } else {
        await client.query(
          'UPDATE "Wallet" SET balance = $1, currency = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3', 
          [newBalance, cleanCurrency, walletId]
        );
      }

      const txDescription = reason || `إيداع يدوي من لوحة الإدارة (${roundedAmount} ${cleanCurrency})`;

      await client.query(`
        INSERT INTO "WalletTransaction" 
          (id, "walletId", amount, type, description, "referenceType", "referenceId", "balanceBefore", "balanceAfter", "createdBy", "created_by_type", currency, source_amount_usd, exchange_rate) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        uuidv4(), 
        walletId, 
        roundedAmount, 
        'ADMIN_ADJUSTMENT', 
        txDescription, 
        'ADMIN_CREDIT', 
        null, 
        balanceBefore, 
        newBalance, 
        adminId || null, 
        'ADMIN', 
        cleanCurrency, 
        sourceAmountUsd, 
        exchangeRate
      ]);

      const auditReason = `${txDescription} | الرصيد السابق: ${balanceBefore} ${cleanCurrency} -> الجديد: ${newBalance} ${cleanCurrency}`;
      await client.query(
        'INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", amount, reason) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuidv4(), adminId, 'WALLET_CREDIT', id, roundedAmount, auditReason]
      );

      await client.query('COMMIT');
      res.json({ 
        success: true, 
        message: `تمت إضافة ${roundedAmount} ${cleanCurrency} إلى محفظة العميل بنجاح.`,
        balance: newBalance,
        currency: cleanCurrency,
        previousBalance: balanceBefore
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Failed to credit balance:', err);
    res.status(500).json({ error: 'فشل إيداع الرصيد في المحفظة.' });
  }
});

// Wallet Management: Debit
router.post('/users/:id/wallet/debit', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { amount, currency, reason } = req.body;
  const adminId = req.user?.id;

  if (!currency || typeof currency !== 'string') {
    return res.status(400).json({ error: 'العملة مطلوبة (Currency is required).' });
  }

  const cleanCurrency = currency.trim().toUpperCase();
  if (!['USD', 'SDG'].includes(cleanCurrency)) {
    return res.status(400).json({ error: 'العملة غير صحيحة. العملات المدعومة هي USD أو SDG فقط.' });
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'المبلغ غير صالح (Invalid amount).' });
  }

  const roundedAmount = Math.round(numAmount * 100) / 100;
  if (Math.abs(numAmount - roundedAmount) > 0.00001) {
    return res.status(400).json({ error: 'المبلغ لا يمكن أن يتجاوز منزلتين عشريتين.' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query('SELECT id, name, email, preferred_currency FROM "User" WHERE id = $1', [id]);
      const user = userRes.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'العميل غير موجود.' });
      }

      const walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [id]);
      const wallet = walletRes.rows[0];

      if (!wallet) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'محفظة العميل غير موجودة.' });
      }

      const userWalletCurrency = (wallet.currency || user.preferred_currency || 'USD').toUpperCase();

      // STRICT CHECK: Reject currency mismatch
      if (cleanCurrency !== userWalletCurrency) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `عملة العملية (${cleanCurrency}) لا تتطابق مع عملة محفظة العميل (${userWalletCurrency}). لا يمكن خصم رصيد بعملة مختلفة عن عملة المحفظة.` 
        });
      }

      const balanceBefore = Number(wallet.balance);
      if (balanceBefore < roundedAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `رصيد المحفظة غير كافٍ للخصم. الرصيد الحالي: ${balanceBefore} ${userWalletCurrency}` 
        });
      }

      // Read limits & exchange rate from platform_settings
      const rateSettingRes = await client.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
      const rateConfig = rateSettingRes.rows[0]?.value || { rate: 5000 };
      const exchangeRate = Number(rateConfig.rate) || 5000;

      const sourceAmountUsd = cleanCurrency === 'USD' 
        ? roundedAmount 
        : (exchangeRate > 0 ? Math.round((roundedAmount / exchangeRate) * 100) / 100 : roundedAmount);

      const newBalance = Math.round((balanceBefore - roundedAmount) * 100) / 100;
      await client.query(
        'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', 
        [newBalance, wallet.id]
      );

      const txDescription = reason || `خصم يدوي من لوحة الإدارة (${roundedAmount} ${cleanCurrency})`;

      await client.query(`
        INSERT INTO "WalletTransaction" 
          (id, "walletId", amount, type, description, "referenceType", "referenceId", "balanceBefore", "balanceAfter", "createdBy", "created_by_type", currency, source_amount_usd, exchange_rate) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        uuidv4(), 
        wallet.id, 
        -roundedAmount, 
        'ADMIN_ADJUSTMENT', 
        txDescription, 
        'ADMIN_DEBIT', 
        null, 
        balanceBefore, 
        newBalance, 
        adminId || null, 
        'ADMIN', 
        cleanCurrency, 
        sourceAmountUsd, 
        exchangeRate
      ]);

      const auditReason = `${txDescription} | الرصيد السابق: ${balanceBefore} ${cleanCurrency} -> الجديد: ${newBalance} ${cleanCurrency}`;
      await client.query(
        'INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", amount, reason) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuidv4(), adminId, 'WALLET_DEBIT', id, roundedAmount, auditReason]
      );

      await client.query('COMMIT');
      res.json({ 
        success: true, 
        message: `تم خصم ${roundedAmount} ${cleanCurrency} من محفظة العميل بنجاح.`,
        balance: newBalance,
        currency: cleanCurrency,
        previousBalance: balanceBefore
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Failed to debit balance:', err);
    res.status(500).json({ error: 'فشل خصم الرصيد من المحفظة.' });
  }
});

// Audit Logs
router.get('/audit', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const logsRes = await pool.query(`
      SELECT 
        l.*,
        json_build_object('name', u.name, 'email', u.email) as admin
      FROM "AuditLog" l
      LEFT JOIN "User" u ON l."adminId" = u.id
      ORDER BY l."createdAt" DESC
    `);
    res.json(logsRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Admin Orders: List all orders
router.get('/orders', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const ordersRes = await pool.query(`
      SELECT o.*, u.name as "userName", u.email as "userEmail" 
      FROM "Order" o 
      LEFT JOIN "User" u ON o."userId" = u.id 
      ORDER BY o."createdAt" DESC
    `);
    res.json(ordersRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Admin Orders: Manual Order Execution with GamesDrop
router.post('/orders/:id/manual-execute', requireAdmin, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const adminId = req.user?.id;

  if (!orderId) {
    return res.status(400).json({ error: 'رقم الطلب مطلوب.' });
  }

  try {
    const result = await executeOrderWithProvider({ orderId, adminId });
    res.json(result);
  } catch (err: any) {
    console.error(`[Admin Manual Execute Error] Order ${orderId}:`, err?.message || err);
    res.status(400).json({ error: err?.message || 'فشل تنفيذ الطلب يدويًا.' });
  }
});

// Admin Orders: Validate Player ID for an existing order using same validation logic
router.post('/orders/:id/validate-player', requireAdmin, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);

  if (!orderId) {
    return res.status(400).json({ error: 'رقم الطلب مطلوب.' });
  }

  try {
    const orderRes = await pool.query(
      'SELECT id, "packageId", "playerId", "serverId", "playerName" FROM "Order" WHERE id = $1',
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'الطلب غير موجود.' });
    }

    const order = orderRes.rows[0];

    if (!order.playerId) {
      return res.status(400).json({ error: 'الطلب لا يحتوي على معرّف لاعب (Player ID).' });
    }

    // Call identical validation service
    const validationResult = await validatePlayerAccount({
      productId: order.packageId,
      gameUserId: order.playerId,
      gameServerId: order.serverId || undefined,
      userId: req.user?.id
    });

    if (validationResult.valid && validationResult.playerName) {
      // Persist the verified player name in the order
      await pool.query(
        'UPDATE "Order" SET "playerName" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [validationResult.playerName, orderId]
      );
    }

    // Return sanitized result
    res.json({
      valid: validationResult.valid,
      playerName: validationResult.playerName,
      message: validationResult.message
    });
  } catch (err: any) {
    console.error(`[Admin Validate Player Error] Order ${orderId}:`, err?.message || err);
    res.status(500).json({ error: 'حدث خطأ أثناء التحقق من معرّف اللاعب.' });
  }
});

// Admin Orders: Update order status
router.put('/orders/:id/status', requireAdmin, async (req: AuthRequest, res: Response) => {
  const orderId = String(req.params.id);
  const { status } = req.body;
  const adminId = req.user?.id;

  if (!orderId || !['COMPLETED', 'FAILED', 'REFUNDED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1 FOR UPDATE', [orderId]);
      const order = orderRes.rows[0];

      if (!order) {
        throw new Error('Order not found');
      }

      if (['COMPLETED', 'FAILED', 'REFUNDED'].includes(order.status)) {
        throw new Error('Order is already in a terminal state');
      }

      await client.query('UPDATE "Order" SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [status, orderId]);

      if (status === 'COMPLETED') {
        try {
          await awardOrderCashback(orderId, client);
        } catch (cbErr) {
          console.error('[Admin] Manual execution cashback error:', cbErr);
        }

        try {
          await processReferralRewardOnOrder(orderId, client);
        } catch (refErr) {
          console.error('[Admin] Manual execution referral reward error:', refErr);
        }
      }

      if (status === 'FAILED' || status === 'REFUNDED') {
        try {
          await reverseOrderCashback(orderId, client);
        } catch (rcErr) {
          console.error('[Admin] Manual refund cashback reversal error:', rcErr);
        }

        const refundAmount = Number(order.chargedAmount || order.amount);
        if (Number.isFinite(refundAmount) && refundAmount > 0) {
          const walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [order.userId]);
          const wallet = walletRes.rows[0];
          if (wallet) {
            const balanceBefore = Number(wallet.balance);
            const newBalance = Math.round((balanceBefore + refundAmount) * 100) / 100;
            await client.query('UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [newBalance, wallet.id]);
            await client.query(
              `INSERT INTO "WalletTransaction" 
                (id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                uuidv4(), 
                wallet.id, 
                refundAmount, 
                'REFUND', 
                `استرجاع يدوي من الإدارة للطلب: ${order.packageName}`,
                wallet.currency || 'USD',
                balanceBefore,
                newBalance,
                'ORDER',
                order.id,
                adminId || null,
                'ADMIN'
              ]
            );
          }
        }

        // Revert promo code redemption if applicable
        const promoRedemption = await client.query('SELECT id, promo_code_id FROM promo_code_redemptions WHERE order_id = $1', [order.id]);
        for (const r of promoRedemption.rows) {
          await client.query('DELETE FROM promo_code_redemptions WHERE id = $1', [r.id]);
          await client.query('UPDATE promo_codes SET usage_count = GREATEST(0, usage_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = $1', [r.promo_code_id]);
        }
      }

      await client.query(
        'INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", "targetOrderId", amount, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          uuidv4(), 
          adminId, 
          status === 'COMPLETED' ? 'ORDER_MANUAL_EXECUTION' : 'ORDER_FAILED_REFUND',
          order.userId,
          order.id,
          order.amount,
          `Admin updated order status to ${status}`
        ]
      );

      await client.query('COMMIT');
      res.json({ message: 'Order status updated successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === 'Order not found') {
      res.status(404).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }
});

// Admin Customers: Detail (profile + wallet + orders + transactions)
router.get('/customers/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const userRes = await pool.query(
      'SELECT id, name, email, role, "preferred_currency", "createdAt" FROM "User" WHERE id = $1',
      [id]
    );
    const customer = userRes.rows[0];
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const walletRes = await pool.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1', [id]);
    const wallet = walletRes.rows[0] || { balance: 0, currency: customer.preferred_currency || 'USD' };

    const ordersRes = await pool.query(
      'SELECT * FROM "Order" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 20',
      [id]
    );

    let transactions: any[] = [];
    if (wallet.id) {
      const txRes = await pool.query(
        'SELECT * FROM "WalletTransaction" WHERE "walletId" = $1 ORDER BY "createdAt" DESC LIMIT 20',
        [wallet.id]
      );
      transactions = txRes.rows;
    }

    res.json({
      customer: {
        ...customer,
        balance: wallet.balance,
        currency: wallet.currency || customer.preferred_currency || 'USD'
      },
      orders: ordersRes.rows,
      transactions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// Admin Customers: Update Currency
router.patch('/customers/:id/currency', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { currency } = req.body;
  const adminId = req.user?.id;

  const cleanCur = String(currency || '').trim().toUpperCase();
  if (cleanCur !== 'USD' && cleanCur !== 'SDG') {
    return res.status(400).json({ error: 'العملة المحددة غير صحيحة. العملات المدعومة هي USD أو SDG فقط.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query('SELECT id, name, email, "preferred_currency" FROM "User" WHERE id = $1 FOR UPDATE', [id]);
    const customer = userRes.rows[0];
    if (!customer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    await client.query('UPDATE "User" SET "preferred_currency" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [cleanCur, id]);
    await client.query('UPDATE "Wallet" SET currency = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $2', [cleanCur, id]);

    await client.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason) VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), adminId, 'CUSTOMER_CURRENCY_UPDATE', id, `Admin changed currency from ${customer.preferred_currency} to ${cleanCur}`]
    );

    await client.query('COMMIT');
    res.json({ message: `تم تحديث عملة العميل إلى ${cleanCur} بنجاح.`, currency: cleanCur });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Admin update customer currency error:', err);
    res.status(500).json({ error: 'فشل تحديث عملة العميل' });
  } finally {
    client.release();
  }
});

// Admin Wallet: All transactions
router.get('/wallet/transactions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const txRes = await pool.query(`
      SELECT t.*, u.name as "userName", u.email as "userEmail"
      FROM "WalletTransaction" t
      JOIN "Wallet" w ON t."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      ORDER BY t."createdAt" DESC LIMIT 100
    `);
    res.json(txRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch wallet transactions' });
  }
});

// Admin Promo Codes: List
router.get('/promo-codes', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const codesRes = await pool.query(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM promo_code_redemptions r WHERE r.promo_code_id = p.id)::int as "redemptionCount"
      FROM promo_codes p 
      ORDER BY p.created_at DESC
    `);
    res.json(codesRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});

// Cryptographically secure promo/gift code generator
function generateSecurePromoCode(prefix = 'KP'): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(12);
  let result = prefix ? `${prefix}-` : '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) result += '-';
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

// Admin Promo Codes: Generate strong random code
router.get('/promo-codes/generate-code', requireAdmin, (req: Request, res: Response) => {
  const prefix = typeof req.query.prefix === 'string' && req.query.prefix.trim()
    ? req.query.prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    : 'KP';
  res.json({ code: generateSecurePromoCode(prefix) });
});

// Admin Promo Codes: Create
router.post('/promo-codes', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { 
    code, 
    type, 
    discountType, 
    discountValue, 
    maxDiscount, 
    creditAmount, 
    currency = 'USD',
    usageLimit, 
    perUserLimit = 1,
    isActive = true, 
    expiresAt 
  } = req.body;
  const adminId = req.user?.id;

  if (!type) {
    return res.status(400).json({ error: 'نوع الكود مطلوب.' });
  }

  const cleanCode = (code ? String(code).toUpperCase().trim() : generateSecurePromoCode('KP')).trim();
  if (cleanCode.length < 6) {
    return res.status(400).json({ error: 'رمز الكود يجب ألا يقل عن 6 أحرف/أرقام لمنع التخمين العشوائي.' });
  }
  const rawCurrency = String(currency || '').trim().toUpperCase();
  const cleanCurrency = rawCurrency === 'SDG' ? 'SDG' : 'USD';

  let parsedDiscountValue: number | null = null;
  let parsedMaxDiscount: number | null = null;
  let parsedCreditAmount: number | null = null;

  if (type === 'DISCOUNT') {
    if (discountType === 'FIXED') {
      if (!currency || !['USD', 'SDG'].includes(rawCurrency)) {
        return res.status(400).json({ error: 'يرجى تحديد عملة الخصم الثابت (USD أو SDG).' });
      }
    }

    const numVal = Number(discountValue);
    if (!Number.isFinite(numVal) || numVal <= 0) {
      return res.status(400).json({ error: 'قيمة الخصم مطلوبة ويجب أن تكون رقماً أكبر من صفر.' });
    }
    if (discountType === 'PERCENTAGE' && numVal > 100) {
      return res.status(400).json({ error: 'نسبة الخصم المئوية لا يمكن أن تتجاوز 100%.' });
    }
    parsedDiscountValue = Math.round(numVal * 100) / 100;

    if (maxDiscount !== undefined && maxDiscount !== null && String(maxDiscount).trim() !== '') {
      const numMax = Number(maxDiscount);
      if (!Number.isFinite(numMax) || numMax <= 0) {
        return res.status(400).json({ error: 'الحد الأقصى للخصم يجب أن يكون رقماً موجباً.' });
      }
      parsedMaxDiscount = Math.round(numMax * 100) / 100;
    }
  } else if (type === 'WALLET_CREDIT') {
    if (!currency || !['USD', 'SDG'].includes(rawCurrency)) {
      return res.status(400).json({ error: 'يرجى تحديد عملة رصيد الهدية (USD أو SDG).' });
    }

    const numCredit = Number(creditAmount);
    if (!Number.isFinite(numCredit) || numCredit <= 0) {
      return res.status(400).json({ error: 'مبلغ الرصيد الهدية مطلوب ويجب أن يكون رقماً أكبر من صفر.' });
    }
    parsedCreditAmount = Math.round(numCredit * 100) / 100;
    if (Math.abs(numCredit - parsedCreditAmount) > 0.00001) {
      return res.status(400).json({ error: 'مبلغ الرصيد الهدية لا يمكن أن يتجاوز منزلتين عشريتين.' });
    }
  } else {
    return res.status(400).json({ error: 'نوع الكود غير صالح.' });
  }

  try {
    const promoId = uuidv4();
    const result = await pool.query(
      `INSERT INTO promo_codes (
        id, code, type, discount_type, discount_value, max_discount, 
        credit_amount, currency, usage_limit, usage_count, per_user_limit, 
        is_active, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12)
      RETURNING *`,
      [
        promoId,
        cleanCode,
        type,
        type === 'DISCOUNT' ? (discountType || 'PERCENTAGE') : null,
        type === 'DISCOUNT' ? parsedDiscountValue : null,
        type === 'DISCOUNT' ? parsedMaxDiscount : null,
        type === 'WALLET_CREDIT' ? parsedCreditAmount : null,
        cleanCurrency,
        usageLimit ? parseInt(usageLimit, 10) : null,
        perUserLimit ? parseInt(perUserLimit, 10) : 1,
        isActive !== undefined ? isActive : true,
        expiresAt ? new Date(expiresAt) : null
      ]
    );

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'PROMO_CREATE', `Created promo code ${cleanCode} (${type} - ${cleanCurrency})`]
    );

    res.status(201).json({
      message: 'تم إنشاء كود الخصم بنجاح',
      code: result.rows[0]
    });
  } catch (err: any) {
    console.error('Create promo code error:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'رمز الكود مسجل مسبقاً، يرجى اختيار رمز آخر.' });
    }
    res.status(500).json({ error: 'فشل إنشاء كود الخصم' });
  }
});

// Admin Promo Codes: Toggle Active
router.patch('/promo-codes/:id/toggle', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const result = await pool.query(
      'UPDATE promo_codes SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'PROMO_TOGGLE', `Toggled promo code ${result.rows[0].code} status`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle promo code' });
  }
});

// Admin Promo Codes: Delete
router.delete('/promo-codes/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const deletedRes = await pool.query('DELETE FROM promo_codes WHERE id = $1 RETURNING code', [id]);
    if (deletedRes.rows.length === 0) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'PROMO_DELETE', `Deleted promo code ${deletedRes.rows[0].code}`]
    );

    res.json({ message: 'Promo code deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete promo code' });
  }
});

// Admin Promo Codes: Usage History / Redemptions
router.get('/promo-codes/:id/redemptions', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const redemptionsRes = await pool.query(`
      SELECT 
        r.id,
        r.discount_amount as "discountAmount",
        r.credit_amount as "creditAmount",
        r.created_at as "createdAt",
        u.name as "userName",
        u.email as "userEmail",
        o.id as "orderId",
        o."packageName",
        o."playerId"
      FROM promo_code_redemptions r
      JOIN "User" u ON r.user_id = u.id
      LEFT JOIN "Order" o ON r.order_id = o.id
      WHERE r.promo_code_id = $1
      ORDER BY r.created_at DESC
    `, [id]);

    res.json(redemptionsRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch promo code redemptions' });
  }
});

import { gamesDropProvider } from '../providers/gamesdrop';

// Admin Providers: Status & Health (Real GamesDrop Integration)
router.get('/providers', requireAdmin, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const balanceData = await gamesDropProvider.getBalance();
    const latency = Date.now() - startTime;

    res.json([
      {
        id: 'gamesdrop',
        name: 'GamesDrop Partner API',
        region: 'Global / B2B Aggregator',
        status: 'ONLINE',
        latency: `${latency}ms`,
        productsConnected: 1, // Test Offer 999 only in dev phase
        lastCheck: new Date().toISOString(),
        balance: balanceData.balance,
        draftBalance: balanceData.draftBalance,
        currency: balanceData.currency?.code || 'USD',
        balanceProfile: balanceData.balanceProfile,
        isPostpaid: balanceData.isPostpaid,
        partnerId: balanceData.partnerId,
        shopId: balanceData.shopId,
        shopName: balanceData.shopName,
        activeTestOffer: 999
      }
    ]);
  } catch (err: any) {
    const latency = Date.now() - startTime;
    console.error('[Admin] GamesDrop provider health check failed:', err.message);
    res.json([
      {
        id: 'gamesdrop',
        name: 'GamesDrop Partner API',
        region: 'Global / B2B Aggregator',
        status: 'OFFLINE',
        latency: `${latency}ms`,
        productsConnected: 0,
        lastCheck: new Date().toISOString(),
        error: err.message,
        balance: 0,
        currency: 'USD',
        balanceProfile: 'UNKNOWN',
        isPostpaid: false
      }
    ]);
  }
});

// Admin Providers: Test Connection explicitly
router.post('/providers/gamesdrop/test-connection', requireAdmin, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const balanceData = await gamesDropProvider.getBalance();
    const latency = Date.now() - startTime;
    res.json({
      success: true,
      connected: true,
      latency: `${latency}ms`,
      balance: balanceData.balance,
      draftBalance: balanceData.draftBalance,
      currency: balanceData.currency?.code || 'USD',
      balanceProfile: balanceData.balanceProfile,
      isPostpaid: balanceData.isPostpaid,
      partnerId: balanceData.partnerId,
      shopId: balanceData.shopId,
      shopName: balanceData.shopName,
      message: 'تم الاتصال بنجاح بمزود GamesDrop Partner API والتحقق من الرصيد والبروفايل.'
    });
  } catch (err: any) {
    const latency = Date.now() - startTime;
    res.status(502).json({
      success: false,
      connected: false,
      latency: `${latency}ms`,
      error: err.message,
      message: 'فشل الاتصال بـ GamesDrop Partner API. يرجى التأكد من التوكن وصلاحية الشبكة.'
    });
  }
});

// In-memory store for settings
let platformSettings = {
  storeName: 'KIROPRO Gaming Services',
  supportEmail: 'support@kiropro.com',
  supportPhone: '+966 50 000 0000',
  telegramSupport: '@kiropro_support',
  defaultCurrency: '$ (USD)',
  maintenanceMode: false,
  autoFulfillOrders: false
};

// Admin Settings: Get
router.get('/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  res.json({
    settings: platformSettings,
    system: {
      dbStatus: 'CONNECTED (PostgreSQL)',
      serverUptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
      apiVersion: 'v1.4.0'
    }
  });
});

// Admin Settings: Update
router.put('/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { storeName, supportEmail, supportPhone, telegramSupport, defaultCurrency, maintenanceMode, autoFulfillOrders } = req.body;
  const adminId = req.user?.id;

  platformSettings = {
    ...platformSettings,
    storeName: storeName || platformSettings.storeName,
    supportEmail: supportEmail || platformSettings.supportEmail,
    supportPhone: supportPhone || platformSettings.supportPhone,
    telegramSupport: telegramSupport || platformSettings.telegramSupport,
    defaultCurrency: defaultCurrency || platformSettings.defaultCurrency,
    maintenanceMode: maintenanceMode !== undefined ? Boolean(maintenanceMode) : platformSettings.maintenanceMode,
    autoFulfillOrders: autoFulfillOrders !== undefined ? Boolean(autoFulfillOrders) : platformSettings.autoFulfillOrders,
  };

  await pool.query(
    'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
    [uuidv4(), adminId, 'SETTINGS_UPDATE', 'Admin updated platform settings']
  );

  res.json({ message: 'Settings updated successfully', settings: platformSettings });
});

// ==========================================
// ADMIN REVIEWS & RATINGS MODERATION
// ==========================================

// GET /api/admin/reviews - List reviews with filters and counts
router.get('/reviews', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search } = req.query;

    let query = `
      SELECT 
        r.id,
        r.user_id,
        r.order_id,
        r.product_id,
        r.product_name,
        r.rating,
        r.comment,
        r.reviewer_type,
        r.customer_name,
        r.review_token_id,
        r.status,
        r.admin_note,
        r.moderated_at,
        r.created_at,
        u.name as user_name,
        u.email as user_email,
        o.id as order_full_id,
        o."packageName" as order_package_name,
        rt.label as token_label,
        rt.type as token_type
      FROM "reviews" r
      LEFT JOIN "User" u ON r.user_id = u.id
      LEFT JOIN "Order" o ON r.order_id = o.id
      LEFT JOIN "review_tokens" rt ON r.review_token_id = rt.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'ALL') {
      params.push(String(status).toUpperCase());
      query += ` AND r.status = $${params.length}`;
    }

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += ` AND (r.customer_name ILIKE $${params.length} OR r.comment ILIKE $${params.length} OR r.product_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);

    // Fetch summary counts
    const countsRes = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected
      FROM "reviews"
    `);

    const counts = countsRes.rows[0];

    res.json({
      reviews: result.rows,
      counts: {
        total: parseInt(counts?.total || '0', 10),
        pending: parseInt(counts?.pending || '0', 10),
        approved: parseInt(counts?.approved || '0', 10),
        rejected: parseInt(counts?.rejected || '0', 10)
      }
    });
  } catch (err: any) {
    console.error('Error fetching admin reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// POST /api/admin/reviews/:id/approve - Approve Review
router.post('/reviews/:id/approve', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const updateRes = await pool.query(
      `UPDATE "reviews" 
       SET status = 'APPROVED', moderated_by = $1, moderated_at = NOW(), updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [adminId, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'المراجعة غير موجودة.' });
    }

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'REVIEW_APPROVE', `Approved review ${id}`]
    );

    res.json({ message: 'تم اعتماد المراجعة بنجاح وستظهر للعامة.', review: updateRes.rows[0] });
  } catch (err: any) {
    console.error('Error approving review:', err);
    res.status(500).json({ error: 'تعذر اعتماد المراجعة.' });
  }
});

// POST /api/admin/reviews/:id/reject - Reject Review
router.post('/reviews/:id/reject', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;
  const { admin_note, rejection_reason } = req.body;

  try {
    const note = rejection_reason || admin_note || null;
    const updateRes = await pool.query(
      `UPDATE "reviews" 
       SET status = 'REJECTED', admin_note = $1, moderated_by = $2, moderated_at = NOW(), updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [note, adminId, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'المراجعة غير موجودة.' });
    }

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'REVIEW_REJECT', `Rejected review ${id}. Reason: ${note}`]
    );

    res.json({ message: 'تم رفض المراجعة.', review: updateRes.rows[0] });
  } catch (err: any) {
    console.error('Error rejecting review:', err);
    res.status(500).json({ error: 'تعذر رفض المراجعة.' });
  }
});

// GET /api/admin/review-links - List generated review tokens
router.get('/review-links', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        rt.*,
        u.name as creator_name,
        u.email as creator_email,
        o."packageName" as order_package_name
       FROM "review_tokens" rt
       LEFT JOIN "User" u ON rt.created_by = u.id
       LEFT JOIN "Order" o ON rt.order_id = o.id
       ORDER BY rt.created_at DESC`
    );

    res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching review links:', err);
    res.status(500).json({ error: 'Failed to fetch review links' });
  }
});

// POST /api/admin/review-links - Generate secure review link (Order-specific or General)
router.post('/review-links', requireAdmin, async (req: AuthRequest, res: Response) => {
  const adminId = req.user?.id;
  const { type, orderId, productId, productName, label, maxUses, expiryDays, expiresIn } = req.body;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

  try {
    let result: { token: string; tokenId: string };

    if (type === 'ORDER_SPECIFIC' || (orderId && type !== 'GENERAL')) {
      if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
        return res.status(400).json({ error: 'يرجى تحديد معرف الطلب للرابط المخصص.' });
      }

      const cleanOrderId = orderId.trim();

      // Verify order exists and load Customer & Product from PostgreSQL
      const ordRes = await pool.query(
        `SELECT o.id, o."packageName", o."packageId", o."userId", o.status,
                u.id as customer_id, u.name as customer_name,
                p.id as product_id, p."productName" as product_name
         FROM "Order" o
         LEFT JOIN "User" u ON o."userId" = u.id
         LEFT JOIN "Product" p ON p.id::text = o."packageId"
         WHERE o.id = $1`,
        [cleanOrderId]
      );

      if (ordRes.rows.length === 0) {
        return res.status(404).json({ error: 'الطلب المحدد غير موجود في النظام.' });
      }

      const order = ordRes.rows[0];

      if (!order.customer_id) {
        return res.status(400).json({ error: 'الطلب غير مرتبط بعميل صالح.' });
      }

      if (order.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'لا يمكن إنشاء رابط تقييم لطلب غير مكتمل.' });
      }

      // Check if order already has an existing review
      const reviewCheck = await pool.query('SELECT id FROM "reviews" WHERE order_id = $1 LIMIT 1', [order.id]);
      if (reviewCheck.rows.length > 0) {
        return res.status(409).json({ error: 'تم تقييم هذا الطلب مسبقاً.' });
      }

      const authoritativeProductName = order.product_name || order.packageName || 'طلب ألعاب رقمي';
      const authoritativeProductId = order.product_id || order.packageId || null;

      result = await getOrCreateOrderReviewToken(
        order.id, 
        authoritativeProductId, 
        authoritativeProductName, 
        adminId
      );
    } else {
      // General campaign link
      let verifiedProductName = productName || 'تقييم تجربة متجر KIROPRO';
      let verifiedProductId = productId || null;

      if (productId) {
        const prodCheck = await pool.query(
          `SELECT id, "productName" FROM "Product" 
           WHERE (id::text = $1 OR "productId" = $1) AND "isActive" = true 
           LIMIT 1`, 
          [productId]
        );
        if (prodCheck.rows.length > 0) {
          verifiedProductName = prodCheck.rows[0].productName;
          verifiedProductId = prodCheck.rows[0].id;
        }
      }

      const days = Number(expiryDays || expiresIn) || 30;

      result = await createGeneralReviewToken({
        productId: verifiedProductId || undefined,
        productName: verifiedProductName,
        label: label || 'رابط تقييم عام للمتجر',
        maxUses: Number(maxUses) || 50,
        expiryDays: days,
        createdBy: adminId || undefined
      });
    }

    const fullUrl = `${frontendUrl}/review/${result.token}`;

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'REVIEW_LINK_GENERATE', `Generated review link (${type || 'ORDER_SPECIFIC'}): ${fullUrl}`]
    );

    res.status(201).json({
      success: true,
      message: 'تم توليد رابط التقييم الآمن بنجاح!',
      reviewUrl: fullUrl,
      url: fullUrl,
      token: result.token,
      tokenId: result.tokenId
    });
  } catch (err: any) {
    console.error('Error generating review link:', err);
    res.status(500).json({ error: 'فشل إنشاء رابط التقييم.' });
  }
});

// POST /api/admin/review-links/:id/toggle - Toggle link active status
router.post('/review-links/:id/toggle', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  try {
    const updateRes = await pool.query(
      `UPDATE "review_tokens" 
       SET is_active = NOT is_active, updated_at = NOW() 
       WHERE id = $1 
       RETURNING id, is_active`,
      [id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'الرابط غير موجود.' });
    }

    await pool.query(
      'INSERT INTO "AuditLog" (id, "adminId", action, reason) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'REVIEW_LINK_TOGGLE', `Toggled link ${id} active=${updateRes.rows[0].is_active}`]
    );

    res.json({
      message: updateRes.rows[0].is_active ? 'تم تفعيل الرابط بنجاح' : 'تم تعطيل الرابط',
      isActive: updateRes.rows[0].is_active
    });
  } catch (err: any) {
    console.error('Error toggling review link:', err);
    res.status(500).json({ error: 'تعذر تعديل حالة الرابط.' });
  }
});

export default router;
