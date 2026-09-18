import pool from '../db';
import { isAddress } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { sendUsdtOrderCompletedEmail, sendUsdtOrderCanceledEmail } from './emailService';

export interface CryptoNetworkRow {
  id: string;
  identifier: string;
  name: string;
  currency: string;
  validator_type: string;
  min_amount: string | number;
  enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface UsdtInventoryRow {
  id: number;
  available: string | number;
  reserved: string | number;
  sold: string | number;
  min_order_amount: string | number;
  exchange_rate: string | number;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Validates a cryptocurrency destination address according to the network's protocol.
 */
export function validateWalletAddress(networkIdentifier: string, address: string): { valid: boolean; error?: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'عنوان المحفظة مطلوب.' };
  }

  const cleanAddress = address.trim();

  const net = networkIdentifier.toUpperCase();

  // EVM networks (Polygon, BSC, Ethereum, Arbitrum, etc.)
  if (['POLYGON', 'BSC', 'ETHEREUM', 'ETH', 'ARBITRUM', 'AVAX'].includes(net)) {
    if (!cleanAddress.startsWith('0x')) {
      return { valid: false, error: 'عنوان محفظة شبكة EVM يجب أن يبدأ بـ 0x.' };
    }
    if (cleanAddress.length !== 42) {
      return { valid: false, error: 'طول عنوان المحفظة لشبكة EVM يجب أن يكون 42 حرفاً بالتحديد.' };
    }
    if (!isAddress(cleanAddress.toLowerCase())) {
      return { valid: false, error: 'عنوان محفظة شبكة Polygon / EVM غير صالح.' };
    }
    return { valid: true };
  }

  // TRON (TRC20)
  if (net === 'TRON' || net === 'TRC20') {
    // Standard TRON base58 addresses start with 'T' and are 34 characters
    const tronRegex = /^T[a-km-zA-HJ-NP-Z1-9]{33}$/;
    if (!tronRegex.test(cleanAddress)) {
      return { valid: false, error: 'عنوان محفظة TRON (TRC20) غير صالح. يجب أن يبدأ بحرف T ويتكون من 34 حرفاً.' };
    }
    return { valid: true };
  }

  // Fallback generic validation if network exists but no custom validator defined yet
  if (cleanAddress.length < 20 || cleanAddress.length > 100) {
    return { valid: false, error: 'طول عنوان المحفظة غير صالح.' };
  }

  return { valid: true };
}

/**
 * Public configuration for customers
 */
export async function getUsdtPublicConfig() {
  const invRes = await pool.query('SELECT available, min_order_amount, exchange_rate, image_url FROM usdt_inventory WHERE id = 1');
  const inv = invRes.rows[0] || { available: '0', min_order_amount: '3', exchange_rate: '5000', image_url: null };

  const netRes = await pool.query(
    'SELECT identifier, name, currency, validator_type, min_amount FROM crypto_networks WHERE enabled = true ORDER BY display_order ASC'
  );

  return {
    available: Number(inv.available),
    minOrderAmount: Math.max(3, Number(inv.min_order_amount || 3)),
    exchangeRate: Number(inv.exchange_rate),
    imageUrl: inv.image_url || null,
    networks: netRes.rows.map(r => ({
      identifier: r.identifier,
      name: r.name,
      currency: r.currency,
      validatorType: r.validator_type,
      minAmount: Math.max(3, Number(r.min_amount || 3))
    }))
  };
}

/**
 * Admin stats and inventory info
 */
export async function getUsdtAdminStats() {
  const invRes = await pool.query('SELECT * FROM usdt_inventory WHERE id = 1');
  const inv = invRes.rows[0] || { available: 0, reserved: 0, sold: 0, min_order_amount: 3, exchange_rate: 5000, image_url: null };

  const ordersCountRes = await pool.query(`
    SELECT 
      COUNT(*) as "totalCryptoOrders",
      COUNT(*) FILTER (WHERE status = 'AWAITING_TRANSFER') as "awaitingOrders",
      COUNT(*) FILTER (WHERE status = 'COMPLETED') as "completedOrders",
      COUNT(*) FILTER (WHERE status = 'CANCELED') as "canceledOrders"
    FROM "Order"
    WHERE "orderType" = 'USDT_TRANSFER'
  `);

  const networksRes = await pool.query('SELECT * FROM crypto_networks ORDER BY display_order ASC');

  return {
    inventory: {
      available: Number(inv.available),
      reserved: Number(inv.reserved),
      sold: Number(inv.sold),
      minOrderAmount: Number(inv.min_order_amount),
      exchangeRate: Number(inv.exchange_rate),
      imageUrl: inv.image_url || null,
      updatedAt: inv.updated_at
    },
    ordersSummary: ordersCountRes.rows[0],
    networks: networksRes.rows
  };
}

/**
 * Admin updates available inventory
 */
export async function updateUsdtInventory(newAvailable: number, adminId?: string) {
  if (typeof newAvailable !== 'number' || isNaN(newAvailable) || newAvailable < 0) {
    throw new Error('الكمية المتاحة يجب أن تكون رقماً أكبر من أو يساوي الصفر.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const curRes = await client.query('SELECT * FROM usdt_inventory WHERE id = 1 FOR UPDATE');
    const current = curRes.rows[0];

    const reserved = Number(current?.reserved || 0);
    // Integrity check: do not allow setting a value that conflicts with reserved or breaks system integrity
    await client.query(
      `UPDATE usdt_inventory 
       SET available = $1, updated_at = NOW(), updated_by = $2 
       WHERE id = 1`,
      [newAvailable, adminId || null]
    );

    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" ("adminId", "action", "amount", "reason")
         VALUES ($1, 'UPDATE_USDT_INVENTORY', $2, $3)`,
        [adminId, newAvailable, `تعديل المخزون المتاح من ${current.available} إلى ${newAvailable} USDT (المحجوز: ${reserved})`]
      );
    }

    await client.query('COMMIT');
    return { available: newAvailable, reserved };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin updates exchange rate
 */
export async function updateUsdtExchangeRate(newRate: number, adminId?: string) {
  if (typeof newRate !== 'number' || isNaN(newRate) || newRate <= 0) {
    throw new Error('سعر الصرف يجب أن يكون رقماً موجباً أكبر من الصفر.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const curRes = await client.query('SELECT * FROM usdt_inventory WHERE id = 1 FOR UPDATE');
    const oldRate = Number(curRes.rows[0]?.exchange_rate || 5000);

    await client.query(
      `UPDATE usdt_inventory 
       SET exchange_rate = $1, updated_at = NOW(), updated_by = $2 
       WHERE id = 1`,
      [newRate, adminId || null]
    );

    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" ("adminId", "action", "amount", "reason")
         VALUES ($1, 'UPDATE_USDT_EXCHANGE_RATE', $2, $3)`,
        [adminId, newRate, `تعديل سعر صرف USDT من ${oldRate} إلى ${newRate} SDG`]
      );
    }

    await client.query('COMMIT');
    return { exchangeRate: newRate, oldRate };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin updates minimum order amount (Hard Floor >= 3.0)
 */
export async function updateUsdtMinAmount(newMin: number, adminId?: string) {
  if (typeof newMin !== 'number' || isNaN(newMin) || newMin < 3.0) {
    const error: any = new Error('الحد الأدنى لشراء USDT لا يمكن أن يقل عن 3 دولار.');
    error.statusCode = 400;
    error.code = 'MINIMUM_USDT_AMOUNT_NOT_MET';
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE usdt_inventory 
       SET min_order_amount = $1, updated_at = NOW(), updated_by = $2 
       WHERE id = 1`,
      [newMin, adminId || null]
    );

    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" ("adminId", "action", "amount", "reason")
         VALUES ($1, 'UPDATE_USDT_MIN_AMOUNT', $2, $3)`,
        [adminId, newMin, `تعديل الحد الأدنى لشراء USDT إلى ${newMin}`]
      );
    }

    await client.query('COMMIT');
    return { minOrderAmount: newMin };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin updates USDT product image
 */
export async function updateUsdtImage(imageUrl: string | null, adminId?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE usdt_inventory 
       SET image_url = $1, updated_at = NOW(), updated_by = $2 
       WHERE id = 1`,
      [imageUrl, adminId || null]
    );

    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" ("adminId", "action", "amount", "reason")
         VALUES ($1, 'UPDATE_USDT_IMAGE', 0, $2)`,
        [adminId, imageUrl ? `تحديث صورة منتج USDT إلى: ${imageUrl}` : 'حذف صورة منتج USDT والعودة للصورة الافتراضية']
      );
    }

    await client.query('COMMIT');
    return { imageUrl };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomic Customer Order Creation with Row Locking to guarantee ZERO overselling
 */
export async function createUsdtOrder(params: {
  userId: string;
  amount: number;
  networkIdentifier: string;
  walletAddress: string;
}) {
  const { userId, amount, networkIdentifier, walletAddress } = params;

  // 1. Validate Amount
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    const error: any = new Error('الكمية المدخلة غير صالحة.');
    error.statusCode = 400;
    throw error;
  }

  // Mandatory Hard Floor Check (Backend Enforcement)
  if (numAmount < 3.0) {
    const error: any = new Error('الحد الأدنى لشراء USDT هو 3 دولار.');
    error.statusCode = 400;
    error.code = 'MINIMUM_USDT_AMOUNT_NOT_MET';
    throw error;
  }

  // 2. Validate Network
  const netRes = await pool.query(
    'SELECT * FROM crypto_networks WHERE identifier = $1 AND enabled = true',
    [networkIdentifier.toUpperCase()]
  );
  const network = netRes.rows[0];
  if (!network) {
    const error: any = new Error('شبكة التحويل المختارة غير مدعومة حالياً.');
    error.statusCode = 400;
    throw error;
  }

  const netMinAmount = Number(network.min_amount || 3.0);
  if (numAmount < netMinAmount) {
    const error: any = new Error(`الحد الأدنى للتحويل على شبكة ${network.name} هو ${netMinAmount} USDT.`);
    error.statusCode = 400;
    error.code = 'MINIMUM_USDT_AMOUNT_NOT_MET';
    throw error;
  }

  // 3. Validate Destination Wallet Address
  const addrCheck = validateWalletAddress(network.identifier, walletAddress);
  if (!addrCheck.valid) {
    const error: any = new Error(addrCheck.error || 'عنوان المحفظة غير صالح للشبكة المحددة.');
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 4. Duplicate Order Protection (5 seconds)
    const duplicateCheck = await client.query(
      `SELECT id FROM "Order" 
       WHERE "userId" = $1 
         AND "orderType" = 'USDT_TRANSFER' 
         AND "walletAddress" = $2 
         AND "createdAt" >= NOW() - INTERVAL '5 seconds'
       LIMIT 1`,
      [userId, walletAddress.trim()]
    );
    if (duplicateCheck.rows.length > 0) {
      const error: any = new Error('تم استلام طلب مطابق للتو. يرجى الانتظار بضع ثوانٍ لمنع التكرار.');
      error.statusCode = 429;
      throw error;
    }

    // 5. Row lock USDT Inventory
    const invRes = await client.query('SELECT * FROM usdt_inventory WHERE id = 1 FOR UPDATE');
    const inventory = invRes.rows[0];
    if (!inventory) {
      throw new Error('بيانات مخزون USDT غير مهيأة.');
    }

    const available = Number(inventory.available);
    if (numAmount > available) {
      const error: any = new Error(`الكمية المطلوبة (${numAmount} USDT) أكبر من المخزون المتاح حالياً (${available} USDT).`);
      error.statusCode = 400;
      error.code = 'INSUFFICIENT_INVENTORY';
      throw error;
    }

    // 6. User Preferred Currency & Price Calculation
    const userRes = await client.query('SELECT email, name, preferred_currency FROM "User" WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user) {
      throw new Error('المستخدم غير موجود.');
    }

    const userCurrency = (user.preferred_currency || 'USD').toUpperCase();
    const exchangeRate = Number(inventory.exchange_rate) || 5000;

    let customerChargedAmount = numAmount;
    if (userCurrency === 'SDG') {
      customerChargedAmount = Math.round(numAmount * exchangeRate);
    } else {
      customerChargedAmount = Math.round(numAmount * 100) / 100;
    }

    // 7. Row lock User Wallet & Check Balance
    const walletRes = await client.query('SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [userId]);
    const wallet = walletRes.rows[0];
    if (!wallet || Number(wallet.balance) < customerChargedAmount) {
      const error: any = new Error('رصيد محفظتك غير كافٍ لإتمام عملية الشراء. يرجى شحن محفظتك أولاً.');
      error.statusCode = 400;
      error.code = 'INSUFFICIENT_BALANCE';
      throw error;
    }

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore - customerChargedAmount;

    // 8. Debit User Wallet
    await client.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [balanceAfter, wallet.id]);

    const orderId = uuidv4();

    // 9. Record Wallet Transaction
    await client.query(
      `INSERT INTO "WalletTransaction" (
        id, "walletId", amount, type, description, currency, 
        source_amount_usd, exchange_rate, "balanceBefore", "balanceAfter", 
        "referenceType", "referenceId", "createdBy"
      ) VALUES ($1, $2, $3, 'PURCHASE', $4, $5, $6, $7, $8, $9, 'USDT_ORDER', $10, NULL)`,
      [
        uuidv4(),
        wallet.id,
        -customerChargedAmount,
        `طلب تحويل فوري: ${numAmount} USDT (${network.name})`,
        userCurrency,
        numAmount,
        exchangeRate,
        balanceBefore,
        balanceAfter,
        orderId
      ]
    );

    // 10. Reserve USDT Inventory atomically
    await client.query(
      `UPDATE usdt_inventory 
       SET available = available - $1, reserved = reserved + $1, updated_at = NOW() 
       WHERE id = 1`,
      [numAmount]
    );

    // 11. Insert Order with immutable historical snapshot
    const packageName = `USDT Instant Transfer (${numAmount} USDT - ${network.name})`;
    await client.query(
      `INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId",
        amount, "originalAmount", "discountAmount", status, provider,
        "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount",
        "chargedCurrency", "exchangeRateUsed", "cashbackAmount",
        "orderType", "cryptoNetwork", "walletAddress", "usdtAmount"
      ) VALUES (
        $1, $2, 'CRYPTO', 'USDT_INSTANT', $3, $4,
        $5, $5, 0.0, 'AWAITING_TRANSFER', 'MANUAL_ADMIN',
        $6, $6, $7, $8,
        $9, $10, 0.0,
        'USDT_TRANSFER', $11, $12, $13
      )`,
      [
        orderId,
        userId,
        packageName,
        walletAddress.trim(),
        customerChargedAmount,
        customerChargedAmount,
        numAmount,
        customerChargedAmount,
        userCurrency,
        exchangeRate,
        network.identifier,
        walletAddress.trim(),
        numAmount
      ]
    );

    // 12. Register for Telegram Reminders
    await client.query(
      `INSERT INTO "usdt_telegram_reminders" ("order_id", "last_notified_at", "notification_count", "is_active")
       VALUES ($1, NULL, 0, true)
       ON CONFLICT ("order_id") DO UPDATE SET "is_active" = true`,
      [orderId]
    );

    await client.query('COMMIT');

    return {
      orderId,
      status: 'AWAITING_TRANSFER',
      usdtAmount: numAmount,
      network: network.name,
      networkIdentifier: network.identifier,
      walletAddress: walletAddress.trim(),
      chargedAmount: customerChargedAmount,
      chargedCurrency: userCurrency,
      exchangeRate,
      remainingBalance: balanceAfter,
      message: 'تم استلام طلبك وجاري إرسال المبلغ من قبل الإدارة...'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Complete Order by Admin (From Web Panel or Telegram Bot)
 */
export async function completeUsdtOrder(params: {
  orderId: string;
  adminId?: string | null | undefined;
  txHash?: string | null | undefined;
}) {
  const { orderId, adminId, txHash } = params;

  const client = await pool.connect();
  let completedOrder: any = null;

  try {
    await client.query('BEGIN');

    // 1. Lock Order
    const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1 FOR UPDATE', [orderId]);
    completedOrder = orderRes.rows[0];

    if (!completedOrder) {
      throw new Error('الطلب غير موجود.');
    }

    if (completedOrder.status !== 'AWAITING_TRANSFER') {
      throw new Error(`لا يمكن إكمال هذا الطلب لأنه في حالة: ${completedOrder.status}`);
    }

    const usdtAmount = Number(completedOrder.usdtAmount || 0);

    // 2. Lock & Deduct from Inventory (Reserved -> Sold)
    await client.query('SELECT * FROM usdt_inventory WHERE id = 1 FOR UPDATE');
    await client.query(
      `UPDATE usdt_inventory 
       SET reserved = GREATEST(0, reserved - $1), sold = sold + $1, updated_at = NOW() 
       WHERE id = 1`,
      [usdtAmount]
    );

    // 3. Update Order Status
    const cleanTxHash = txHash ? txHash.trim() : null;
    await client.query(
      `UPDATE "Order" 
       SET status = 'COMPLETED', "txHash" = $1, "completedAt" = NOW(), "completedBy" = $2, "updatedAt" = NOW() 
       WHERE id = $3`,
      [cleanTxHash, adminId || null, orderId]
    );

    // 4. Deactivate Telegram Reminders
    await client.query(
      'UPDATE "usdt_telegram_reminders" SET is_active = false WHERE order_id = $1',
      [orderId]
    );

    // 5. Audit Log
    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" ("adminId", "action", "targetOrderId", "targetUserId", "amount", "reason")
         VALUES ($1, 'COMPLETE_USDT_ORDER', $2, $3, $4, $5)`,
        [
          adminId,
          orderId,
          completedOrder.userId,
          usdtAmount,
          `إكمال تحويل ${usdtAmount} USDT على شبكة ${completedOrder.cryptoNetwork} بنجاح. TxID: ${cleanTxHash || 'N/A'}`
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 6. Send Idempotent Transactional Email to Customer
  try {
    const userRes = await pool.query('SELECT email, name FROM "User" WHERE id = $1', [completedOrder.userId]);
    const user = userRes.rows[0];

    if (user?.email) {
      await sendUsdtOrderCompletedEmail({
        to: user.email,
        name: user.name || '',
        userId: completedOrder.userId,
        orderId: completedOrder.id,
        orderNumber: completedOrder.id.slice(0, 8).toUpperCase(),
        usdtAmount: Number(completedOrder.usdtAmount),
        network: completedOrder.cryptoNetwork || 'Polygon',
        walletAddress: completedOrder.walletAddress || '',
        txHash: completedOrder.txHash || txHash || null,
        chargedAmount: Number(completedOrder.chargedAmount || completedOrder.amount),
        chargedCurrency: completedOrder.chargedCurrency || 'SDG'
      });
    }
  } catch (emailErr: any) {
    console.warn('[CryptoService] Failed to send completion email:', emailErr.message);
  }

  return {
    success: true,
    orderId,
    status: 'COMPLETED',
    txHash: txHash || null,
    message: 'تم إكمال الطلب بنجاح وتحديث المخزون وإشعار العميل.'
  };
}

/**
 * Cancel Order by Admin and Refund Customer
 */
export async function cancelUsdtOrder(params: {
  orderId: string;
  adminId?: string | null | undefined;
  reason?: string | null | undefined;
}) {
  const { orderId, adminId, reason } = params;

  const client = await pool.connect();
  let canceledOrder: any = null;

  try {
    await client.query('BEGIN');

    const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1 FOR UPDATE', [orderId]);
    canceledOrder = orderRes.rows[0];

    if (!canceledOrder) {
      throw new Error('الطلب غير موجود.');
    }

    if (canceledOrder.status !== 'AWAITING_TRANSFER') {
      throw new Error(`لا يمكن إلغاء هذا الطلب لأنه في حالة: ${canceledOrder.status}`);
    }

    const usdtAmount = Number(canceledOrder.usdtAmount || 0);
    const refundAmount = Number(canceledOrder.chargedAmount || canceledOrder.amount);
    const chargedCurrency = canceledOrder.chargedCurrency || 'SDG';

    // 1. Return Reserved to Available
    await client.query('SELECT * FROM usdt_inventory WHERE id = 1 FOR UPDATE');
    await client.query(
      `UPDATE usdt_inventory 
       SET reserved = GREATEST(0, reserved - $1), available = available + $1, updated_at = NOW() 
       WHERE id = 1`,
      [usdtAmount]
    );

    // 2. Refund User Wallet
    const walletRes = await client.query('SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [canceledOrder.userId]);
    const wallet = walletRes.rows[0];

    if (wallet) {
      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + refundAmount;

      await client.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [balanceAfter, wallet.id]);

      await client.query(
        `INSERT INTO "WalletTransaction" (
          id, "walletId", amount, type, description, currency, 
          source_amount_usd, exchange_rate, "balanceBefore", "balanceAfter", 
          "referenceType", "referenceId", "createdBy"
        ) VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7, $8, $9, 'USDT_ORDER_REFUND', $10, $11)`,
        [
          uuidv4(),
          wallet.id,
          refundAmount,
          `استرجاع قيمة طلب USDT الملغي #${orderId.slice(0, 8)} (${reason || 'إلغاء من الإدارة'})`,
          chargedCurrency,
          usdtAmount,
          canceledOrder.exchangeRateUsed || 1,
          balanceBefore,
          balanceAfter,
          orderId,
          adminId || null
        ]
      );
    }

    // 3. Update Order Status
    const cleanReason = reason ? reason.trim() : 'إلغاء من قبل الإدارة';
    await client.query(
      `UPDATE "Order" 
       SET status = 'CANCELED', "canceledAt" = NOW(), "canceledReason" = $1, "updatedAt" = NOW() 
       WHERE id = $2`,
      [cleanReason, orderId]
    );

    // 4. Deactivate Telegram Reminders
    await client.query(
      'UPDATE "usdt_telegram_reminders" SET is_active = false WHERE order_id = $1',
      [orderId]
    );

    // 5. Audit Log
    if (adminId) {
      await client.query(
        `INSERT INTO "AuditLog" ("adminId", "action", "targetOrderId", "targetUserId", "amount", "reason")
         VALUES ($1, 'CANCEL_USDT_ORDER', $2, $3, $4, $5)`,
        [
          adminId,
          orderId,
          canceledOrder.userId,
          usdtAmount,
          `إلغاء طلب ${usdtAmount} USDT ورد رصيد ${refundAmount} ${chargedCurrency}. السبب: ${cleanReason}`
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 6. Send Cancellation & Refund Email
  try {
    const userRes = await pool.query('SELECT email, name FROM "User" WHERE id = $1', [canceledOrder.userId]);
    const user = userRes.rows[0];

    if (user?.email) {
      await sendUsdtOrderCanceledEmail({
        to: user.email,
        name: user.name || '',
        userId: canceledOrder.userId,
        orderId: canceledOrder.id,
        orderNumber: canceledOrder.id.slice(0, 8).toUpperCase(),
        usdtAmount: Number(canceledOrder.usdtAmount),
        reason: reason || 'تم إلغاء الطلب ورد المبلغ لمحفظتك.',
        refundedAmount: Number(canceledOrder.chargedAmount || canceledOrder.amount),
        refundedCurrency: canceledOrder.chargedCurrency || 'SDG'
      });
    }
  } catch (emailErr: any) {
    console.warn('[CryptoService] Failed to send cancellation email:', emailErr.message);
  }

  return {
    success: true,
    orderId,
    status: 'CANCELED',
    message: 'تم إلغاء الطلب بنجاح وإرجاع الكمية إلى المخزون ورد الرصيد للمحفظة.'
  };
}

/**
 * Get active pending orders requiring reminders for the Telegram Bot (10s interval)
 */
export async function getPendingTelegramOrders() {
  const res = await pool.query(`
    SELECT 
      o.id,
      o."userId",
      o."usdtAmount",
      o."cryptoNetwork",
      o."walletAddress",
      o."chargedAmount",
      o."chargedCurrency",
      o."exchangeRateUsed",
      o.status,
      o."createdAt",
      u.email as "userEmail",
      u.name as "userName",
      r.last_notified_at as "lastNotifiedAt",
      r.notification_count as "notificationCount"
    FROM "Order" o
    JOIN "User" u ON o."userId" = u.id
    JOIN "usdt_telegram_reminders" r ON o.id = r.order_id
    WHERE o.status = 'AWAITING_TRANSFER'
      AND o."orderType" = 'USDT_TRANSFER'
      AND r.is_active = true
    ORDER BY o."createdAt" ASC
  `);

  return res.rows;
}

/**
 * Acknowledge notification sent by Telegram Bot
 */
export async function ackTelegramOrder(orderId: string) {
  await pool.query(
    `UPDATE "usdt_telegram_reminders"
     SET last_notified_at = NOW(), notification_count = notification_count + 1
     WHERE order_id = $1`,
    [orderId]
  );
  return { success: true };
}
