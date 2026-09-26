import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { fiveSimClient, FiveSimOrderResponse } from '../providers/fiveSim';

// 1. Strict Allowlists (Constants & Source of Truth)
export const ALLOWED_COUNTRIES: Record<string, { code: string; nameAr: string; nameEn: string; flag: string }> = {
  'usa': { code: 'usa', nameAr: 'أمريكا (United States)', nameEn: 'United States', flag: '🇺🇸' },
  'england': { code: 'england', nameAr: 'بريطانيا (United Kingdom)', nameEn: 'United Kingdom', flag: '🇬🇧' },
  'canada': { code: 'canada', nameAr: 'كندا (Canada)', nameEn: 'Canada', flag: '🇨🇦' },
  'indonesia': { code: 'indonesia', nameAr: 'إندونيسيا (Indonesia)', nameEn: 'Indonesia', flag: '🇮🇩' },
  'philippines': { code: 'philippines', nameAr: 'الفلبين (Philippines)', nameEn: 'Philippines', flag: '🇵🇭' },
  'brazil': { code: 'brazil', nameAr: 'البرازيل (Brazil)', nameEn: 'Brazil', flag: '🇧🇷' },
  'poland': { code: 'poland', nameAr: 'بولندا (Poland)', nameEn: 'Poland', flag: '🇵🇱' },
  'spain': { code: 'spain', nameAr: 'إسبانيا (Spain)', nameEn: 'Spain', flag: '🇪🇸' },
};

export const ALLOWED_SERVICES: Record<string, { code: string; nameAr: string; nameEn: string; icon: string }> = {
  'google': { code: 'google', nameAr: 'Google', nameEn: 'Google', icon: 'google' },
  'whatsapp': { code: 'whatsapp', nameAr: 'WhatsApp', nameEn: 'WhatsApp', icon: 'whatsapp' },
  'facebook': { code: 'facebook', nameAr: 'Facebook', nameEn: 'Facebook', icon: 'facebook' },
  'instagram': { code: 'instagram', nameAr: 'Instagram', nameEn: 'Instagram', icon: 'instagram' },
  'twitter': { code: 'twitter', nameAr: 'Twitter (X)', nameEn: 'Twitter', icon: 'twitter' },
  'paypal': { code: 'paypal', nameAr: 'PayPal', nameEn: 'PayPal', icon: 'paypal' },
};

export interface VirtualNumberOrderDTO {
  id: string;
  userId: string;
  countryCode: string;
  countryNameAr: string;
  serviceCode: string;
  serviceNameAr: string;
  providerOrderId?: string | null | undefined;
  phoneNumber?: string | null | undefined;
  operator?: string | null | undefined;
  smsCode?: string | null | undefined;
  smsText?: string | null | undefined;
  smsReceivedAt?: string | null | undefined;
  status: string;
  attemptNumber: number;
  isFreeAttempt: boolean;
  chargedAmount: number;
  chargedCurrency: string;
  isRefunded: boolean;
  failureReason?: string | null | undefined;
  expiresAt?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface UserAttemptsInfo {
  usedAttempts: number;
  freeLimit: number;
  freeRemaining: number;
  isNextFree: boolean;
  nextPriceSdg: number;
}

export class VirtualNumberService {
  /**
   * Validate Country and Service against strict Allowlist
   */
  public validateInput(countryCode: string, serviceCode: string): { country: typeof ALLOWED_COUNTRIES[string]; service: typeof ALLOWED_SERVICES[string] } {
    const cleanCountry = (countryCode || '').trim().toLowerCase();
    const cleanService = (serviceCode || '').trim().toLowerCase();

    const country = ALLOWED_COUNTRIES[cleanCountry];
    if (!country) {
      throw new Error(`INVALID_COUNTRY: الدولة المحددة (${countryCode}) غير مسموح بها في النظام.`);
    }

    const service = ALLOWED_SERVICES[cleanService];
    if (!service) {
      throw new Error(`INVALID_SERVICE: الخدمة المحددة (${serviceCode}) غير مسموح بها في النظام.`);
    }

    return { country, service };
  }

  /**
   * Get Settings (singleton row)
   */
  public async getSettings() {
    const res = await pool.query('SELECT * FROM virtual_number_settings WHERE id = 1');
    if (res.rows.length === 0) {
      return {
        id: 1,
        free_attempts_limit: 5,
        default_paid_price_sdg: 800,
        is_system_active: true
      };
    }
    return {
      id: res.rows[0].id,
      free_attempts_limit: Number(res.rows[0].free_attempts_limit) || 5,
      default_paid_price_sdg: Number(res.rows[0].default_paid_price_sdg) || 800,
      is_system_active: Boolean(res.rows[0].is_system_active)
    };
  }

  /**
   * Calculate User Attempts Info
   */
  public async getUserAttemptsInfo(userId: string): Promise<UserAttemptsInfo> {
    const settings = await this.getSettings();

    // A valid attempt is counted only when a real virtual number was allocated (phone_number IS NOT NULL and not FAILED)
    const countRes = await pool.query(
      `SELECT COUNT(*)::int as count 
       FROM virtual_number_orders 
       WHERE user_id = $1 
         AND phone_number IS NOT NULL 
         AND status NOT IN ('FAILED')`,
      [userId]
    );

    const usedAttempts = Number(countRes.rows[0]?.count) || 0;
    const freeLimit = settings.free_attempts_limit;
    const freeRemaining = Math.max(0, freeLimit - usedAttempts);
    const isNextFree = usedAttempts < freeLimit;
    const nextPriceSdg = isNextFree ? 0 : settings.default_paid_price_sdg;

    return {
      usedAttempts,
      freeLimit,
      freeRemaining,
      isNextFree,
      nextPriceSdg
    };
  }

  /**
   * Resolve authoritative price for a specific Country + Service
   */
  public async resolveProductPrice(countryCode: string, serviceCode: string): Promise<{ priceSdg: number; isActive: boolean }> {
    const settings = await this.getSettings();
    if (!settings.is_system_active) {
      throw new Error('SYSTEM_INACTIVE: خدمة الأرقام الافتراضية معطلة حالياً للصيانة.');
    }

    const prodRes = await pool.query(
      `SELECT custom_price_sdg, is_active 
       FROM virtual_number_products 
       WHERE country_code = $1 AND service_code = $2`,
      [countryCode, serviceCode]
    );

    if (prodRes.rows.length === 0) {
      return { priceSdg: settings.default_paid_price_sdg, isActive: true };
    }

    const row = prodRes.rows[0];
    const customPrice = row.custom_price_sdg !== null ? Number(row.custom_price_sdg) : null;
    const effectivePrice = customPrice !== null && !isNaN(customPrice) ? customPrice : settings.default_paid_price_sdg;

    return {
      priceSdg: effectivePrice,
      isActive: Boolean(row.is_active)
    };
  }

  /**
   * Create & Initiate a Virtual Number Order
   */
  public async createOrder(params: {
    userId: string;
    countryCode: string;
    serviceCode: string;
  }): Promise<VirtualNumberOrderDTO> {
    const { userId, countryCode, serviceCode } = params;

    // 1. Strict Allowlist Validation
    const { country, service } = this.validateInput(countryCode, serviceCode);

    // 2. Resolve Price & Availability from DB (Authoritative, Client cannot manipulate)
    const { priceSdg, isActive } = await this.resolveProductPrice(country.code, service.code);
    if (!isActive) {
      throw new Error('PRODUCT_DISABLED: هذه الخدمة معطلة حالياً لهذه الدولة.');
    }

    // 3. Duplicate Order Protection (reject same request within 4 seconds)
    const dupCheck = await pool.query(
      `SELECT id FROM virtual_number_orders 
       WHERE user_id = $1 
         AND country_code = $2 
         AND service_code = $3 
         AND created_at >= NOW() - INTERVAL '4 seconds' 
       LIMIT 1`,
      [userId, country.code, service.code]
    );
    if (dupCheck.rows.length > 0) {
      throw new Error('DUPLICATE_ORDER: تم استلام طلب مماثل للتو. يرجى الانتظار بضع ثوانٍ.');
    }

    // 4. Calculate Attempt & Authoritative Charge Amount
    const attemptsInfo = await this.getUserAttemptsInfo(userId);
    const isFree = attemptsInfo.isNextFree;
    const effectiveChargeAmount = isFree ? 0 : priceSdg;
    const attemptNumber = attemptsInfo.usedAttempts + 1;

    const orderId = uuidv4();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 5. Wallet Balance Check & Hold (Atomic)
      let wallet: any = null;
      let balanceBefore = 0;
      let balanceAfter = 0;

      if (effectiveChargeAmount > 0) {
        const walletRes = await client.query(
          'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
          [userId]
        );
        wallet = walletRes.rows[0];
        balanceBefore = Number(wallet?.balance || 0);

        if (!wallet || balanceBefore < effectiveChargeAmount) {
          throw new Error('INSUFFICIENT_BALANCE: رصيد المحفظة غير كافٍ لإتمام العملية.');
        }

        balanceAfter = Math.round((balanceBefore - effectiveChargeAmount) * 100) / 100;
        await client.query(
          'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
          [balanceAfter, wallet.id]
        );

        // Record Initial Hold Transaction
        await client.query(
          `INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, currency, 
            "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
          ) VALUES ($1, $2, $3, 'PURCHASE', $4, $5, $6, $7, 'VIRTUAL_NUMBER', $8, NULL, 'SYSTEM')`,
          [
            uuidv4(),
            wallet.id,
            effectiveChargeAmount,
            `طلب رقم افتراضي: ${service.nameAr} (${country.nameAr})`,
            wallet.currency || 'SDG',
            balanceBefore,
            balanceAfter,
            orderId
          ]
        );
      }

      // 6. Insert Order in PENDING / WAITING_FOR_NUMBER state
      await client.query(
        `INSERT INTO virtual_number_orders (
          id, user_id, country_code, country_name_ar, service_code, service_name_ar,
          status, attempt_number, is_free_attempt, charged_amount, charged_currency
        ) VALUES ($1, $2, $3, $4, $5, $6, 'WAITING_FOR_NUMBER', $7, $8, $9, 'SDG')`,
        [
          orderId,
          userId,
          country.code,
          country.nameAr,
          service.code,
          service.nameAr,
          attemptNumber,
          isFree,
          effectiveChargeAmount
        ]
      );

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 7. Request Activation Number from 5SIM
    let providerOrder: FiveSimOrderResponse;
    try {
      providerOrder = await fiveSimClient.buyActivation(country.code, 'any', service.code);
    } catch (providerErr: any) {
      // Upstream failed or returned "no free phones"
      // Immediately release wallet hold idempotently
      await this.handleImmediateProviderFailure(orderId, userId, effectiveChargeAmount, providerErr.message || 'Provider error');
      throw new Error(providerErr.message || 'تعذر الحصول على رقم من مزود الخدمة حالياً.');
    }

    // 8. Number received successfully from 5SIM!
    const expiresAt = providerOrder.expires ? new Date(providerOrder.expires) : new Date(Date.now() + 5 * 60 * 1000);

    const updateRes = await pool.query(
      `UPDATE virtual_number_orders 
       SET status = 'WAITING_FOR_CODE',
           provider_order_id = $1,
           phone_number = $2,
           operator = $3,
           expires_at = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [
        String(providerOrder.id),
        providerOrder.phone,
        providerOrder.operator || 'any',
        expiresAt,
        orderId
      ]
    );

    return this.mapOrderRowToDTO(updateRes.rows[0]);
  }

  /**
   * Handle Immediate Provider Failure (Release Hold & Mark Order FAILED)
   */
  private async handleImmediateProviderFailure(
    orderId: string,
    userId: string,
    chargedAmount: number,
    failureReason: string
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Refund if charged
      if (chargedAmount > 0) {
        const walletRes = await client.query(
          'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
          [userId]
        );
        const wallet = walletRes.rows[0];
        if (wallet) {
          const balanceBefore = Number(wallet.balance);
          const balanceAfter = Math.round((balanceBefore + chargedAmount) * 100) / 100;
          await client.query(
            'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
            [balanceAfter, wallet.id]
          );

          await client.query(
            `INSERT INTO "WalletTransaction" (
              id, "walletId", amount, type, description, currency, 
              "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
            ) VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7, 'VIRTUAL_NUMBER_REFUND', $8, NULL, 'SYSTEM')`,
            [
              uuidv4(),
              wallet.id,
              chargedAmount,
              'استرجاع تلقائي: تعذر الحصول على رقم من المزود',
              wallet.currency || 'SDG',
              balanceBefore,
              balanceAfter,
              orderId
            ]
          );
        }
      }

      await client.query(
        `UPDATE virtual_number_orders 
         SET status = 'FAILED',
             failure_reason = $1,
             is_refunded = $2,
             refund_amount = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [failureReason, chargedAmount > 0, chargedAmount, orderId]
      );

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[VirtualNumber] Failed to handle provider error refund:', err.message);
    } finally {
      client.release();
    }
  }

  /**
   * User Cancel & Refund Order
   */
  public async cancelOrder(orderId: string, userId: string): Promise<VirtualNumberOrderDTO> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        'SELECT * FROM virtual_number_orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );
      const order = orderRes.rows[0];

      if (!order) {
        throw new Error('ORDER_NOT_FOUND: الطلب غير موجود.');
      }

      // Strict Ownership Check (IDOR Prevention)
      if (order.user_id !== userId) {
        throw new Error('FORBIDDEN: غير مصرح بالوصول إلى هذا الطلب.');
      }

      // Check if order is in a cancellable state
      if (['COMPLETED', 'CANCELED', 'REFUNDED', 'EXPIRED'].includes(order.status)) {
        throw new Error(`CANNOT_CANCEL: لا يمكن إلغاء الطلب وهو في حالة (${order.status}).`);
      }

      if (order.sms_code) {
        throw new Error('CANNOT_CANCEL: تم استلام رمز التحقق بالفعل، لا يمكن إلغاء الطلب.');
      }

      // Call 5SIM cancel API if provider order ID exists
      if (order.provider_order_id) {
        try {
          await fiveSimClient.cancelOrder(order.provider_order_id);
        } catch (provErr: any) {
          // If 5SIM returns "order has sms", we must check order and cannot cancel!
          if (provErr.message && provErr.message.includes('has sms')) {
            throw new Error('CANNOT_CANCEL: وصل رمز التحقق للرقم من المزود، لا يمكن الإلغاء.');
          }
          // Log without leaking secrets
          console.warn('[VirtualNumber] Notice during 5SIM cancel call:', provErr.message);
        }
      }

      // Idempotent Wallet Refund
      const chargedAmount = Number(order.charged_amount || 0);
      let isRefunded = order.is_refunded;
      let refundTxId = order.refund_tx_id;

      if (chargedAmount > 0 && !isRefunded) {
        const walletRes = await client.query(
          'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
          [userId]
        );
        const wallet = walletRes.rows[0];
        if (wallet) {
          const balanceBefore = Number(wallet.balance);
          const balanceAfter = Math.round((balanceBefore + chargedAmount) * 100) / 100;
          await client.query(
            'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
            [balanceAfter, wallet.id]
          );

          refundTxId = uuidv4();
          await client.query(
            `INSERT INTO "WalletTransaction" (
              id, "walletId", amount, type, description, currency, 
              "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
            ) VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7, 'VIRTUAL_NUMBER_CANCEL', $8, NULL, 'CUSTOMER')`,
            [
              refundTxId,
              wallet.id,
              chargedAmount,
              `استرجاع قيمة طلب الرقم الملغي (${order.service_name_ar})`,
              wallet.currency || 'SDG',
              balanceBefore,
              balanceAfter,
              orderId
            ]
          );
          isRefunded = true;
        }
      }

      const updateRes = await client.query(
        `UPDATE virtual_number_orders 
         SET status = 'CANCELED',
             is_refunded = $1,
             refund_amount = $2,
             refund_tx_id = $3,
             failure_reason = 'تم الإلغاء بطلب من العميل واستعادة الرصيد',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [isRefunded, isRefunded ? chargedAmount : 0, refundTxId, orderId]
      );

      await client.query('COMMIT');
      return this.mapOrderRowToDTO(updateRes.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Check Order Status from 5SIM & Update in DB (Poll Tick)
   */
  public async checkAndUpdateOrder(orderId: string): Promise<VirtualNumberOrderDTO> {
    const orderRes = await pool.query('SELECT * FROM virtual_number_orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];
    if (!order) {
      throw new Error('ORDER_NOT_FOUND');
    }

    // If already in terminal state, return current record
    if (['COMPLETED', 'CANCELED', 'REFUNDED', 'EXPIRED', 'FAILED'].includes(order.status)) {
      return this.mapOrderRowToDTO(order);
    }

    if (!order.provider_order_id) {
      return this.mapOrderRowToDTO(order);
    }

    // Check timeout: if 5 minutes passed, mark as EXPIRED and refund
    const now = new Date();
    if (order.expires_at && now > new Date(order.expires_at)) {
      return await this.expireOrder(order.id);
    }

    // Call 5SIM check endpoint
    try {
      const checkRes = await fiveSimClient.checkOrder(order.provider_order_id);

      // Check if SMS arrived
      if (checkRes.sms && Array.isArray(checkRes.sms) && checkRes.sms.length > 0) {
        const latestSms = checkRes.sms[checkRes.sms.length - 1];
        if (latestSms) {
          const smsCode = latestSms.code || '';
          const smsText = latestSms.text || '';
          const smsTime = latestSms.created_at ? new Date(latestSms.created_at) : new Date();

          // Finish order upstream on 5SIM
          try {
            await fiveSimClient.finishOrder(order.provider_order_id);
          } catch (finishErr: any) {
            console.warn('[VirtualNumber] 5SIM finishOrder notice:', finishErr.message);
          }

          // Update DB to COMPLETED
          const completedRes = await pool.query(
            `UPDATE virtual_number_orders 
             SET status = 'COMPLETED',
                 sms_code = $1,
                 sms_text = $2,
                 sms_received_at = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING *`,
            [smsCode, smsText, smsTime, orderId]
          );

          return this.mapOrderRowToDTO(completedRes.rows[0]);
        }
      }

      // Upstream status checks
      if (checkRes.status === 'TIMEOUT') {
        return await this.expireOrder(order.id);
      }

      if (checkRes.status === 'CANCELED' || checkRes.status === 'BANNED') {
        return await this.cancelAndRefundOrderInternal(order.id, `حالة المزود: ${checkRes.status}`);
      }
    } catch (checkErr: any) {
      console.warn('[VirtualNumber] checkOrder error:', checkErr.message);
    }

    return this.mapOrderRowToDTO(order);
  }

  /**
   * Mark Order EXPIRED & Process Refund
   */
  public async expireOrder(orderId: string): Promise<VirtualNumberOrderDTO> {
    return this.cancelAndRefundOrderInternal(orderId, 'انتهت مهلة استلام الرمز (5 دقائق)');
  }

  /**
   * Internal Cancel & Refund (Used on Timeout / Provider Cancel)
   */
  private async cancelAndRefundOrderInternal(orderId: string, reason: string): Promise<VirtualNumberOrderDTO> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        'SELECT * FROM virtual_number_orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );
      const order = orderRes.rows[0];

      if (!order || ['COMPLETED', 'CANCELED', 'REFUNDED'].includes(order.status)) {
        await client.query('COMMIT');
        return this.mapOrderRowToDTO(order);
      }

      const chargedAmount = Number(order.charged_amount || 0);
      let isRefunded = order.is_refunded;
      let refundTxId = order.refund_tx_id;

      if (chargedAmount > 0 && !isRefunded) {
        const walletRes = await client.query(
          'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
          [order.user_id]
        );
        const wallet = walletRes.rows[0];
        if (wallet) {
          const balanceBefore = Number(wallet.balance);
          const balanceAfter = Math.round((balanceBefore + chargedAmount) * 100) / 100;
          await client.query(
            'UPDATE "Wallet" SET balance = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
            [balanceAfter, wallet.id]
          );

          refundTxId = uuidv4();
          await client.query(
            `INSERT INTO "WalletTransaction" (
              id, "walletId", amount, type, description, currency, 
              "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
            ) VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7, 'VIRTUAL_NUMBER_EXPIRED', $8, NULL, 'SYSTEM')`,
            [
              refundTxId,
              wallet.id,
              chargedAmount,
              `استرجاع تلقائي: ${reason}`,
              wallet.currency || 'SDG',
              balanceBefore,
              balanceAfter,
              orderId
            ]
          );
          isRefunded = true;
        }
      }

      const terminalStatus = reason.includes('مهلة') ? 'EXPIRED' : 'CANCELED';
      const updateRes = await client.query(
        `UPDATE virtual_number_orders 
         SET status = $1,
             is_refunded = $2,
             refund_amount = $3,
             refund_tx_id = $4,
             failure_reason = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [terminalStatus, isRefunded, isRefunded ? chargedAmount : 0, refundTxId, reason, orderId]
      );

      await client.query('COMMIT');
      return this.mapOrderRowToDTO(updateRes.rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[VirtualNumber] cancelAndRefundOrderInternal error:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get User Orders for "طلباتي"
   */
  public async getUserOrders(userId: string): Promise<VirtualNumberOrderDTO[]> {
    const res = await pool.query(
      `SELECT * FROM virtual_number_orders 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows.map(r => this.mapOrderRowToDTO(r));
  }

  /**
   * Get Specific Order by ID with User Check
   */
  public async getOrderById(orderId: string, userId?: string): Promise<VirtualNumberOrderDTO | null> {
    const query = userId
      ? 'SELECT * FROM virtual_number_orders WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM virtual_number_orders WHERE id = $1';
    const params = userId ? [orderId, userId] : [orderId];

    const res = await pool.query(query, params);
    if (res.rows.length === 0) return null;
    return this.mapOrderRowToDTO(res.rows[0]);
  }

  /**
   * Admin: Get all orders with filtering and pagination
   */
  public async getAdminOrders(params: {
    status?: string | undefined;
    countryCode?: string | undefined;
    serviceCode?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }) {
    const { status, countryCode, serviceCode, limit = 50, offset = 0 } = params;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`o.status = $${idx++}`);
      values.push(status);
    }
    if (countryCode) {
      conditions.push(`o.country_code = $${idx++}`);
      values.push(countryCode);
    }
    if (serviceCode) {
      conditions.push(`o.service_code = $${idx++}`);
      values.push(serviceCode);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int as total FROM virtual_number_orders o ${whereClause}`,
      values
    );

    const ordersRes = await pool.query(
      `SELECT o.*, u.email as "userEmail", u.name as "userName" 
       FROM virtual_number_orders o 
       LEFT JOIN "User" u ON o.user_id = u.id 
       ${whereClause} 
       ORDER BY o.created_at DESC 
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return {
      total: countRes.rows[0]?.total || 0,
      orders: ordersRes.rows.map(r => ({
        ...this.mapOrderRowToDTO(r),
        userEmail: r.userEmail,
        userName: r.userName
      }))
    };
  }

  /**
   * Admin: Update General Settings
   */
  public async updateSettings(params: {
    freeAttemptsLimit?: number | undefined;
    defaultPaidPriceSdg?: number | undefined;
    isSystemActive?: boolean | undefined;
    free_attempts_limit?: number | undefined;
    default_paid_price_sdg?: number | undefined;
    is_system_active?: boolean | undefined;
  }) {
    const freeLimitVal = params.freeAttemptsLimit !== undefined ? params.freeAttemptsLimit : params.free_attempts_limit;
    const defaultPriceVal = params.defaultPaidPriceSdg !== undefined ? params.defaultPaidPriceSdg : params.default_paid_price_sdg;
    const isSystemActiveVal = params.isSystemActive !== undefined ? params.isSystemActive : params.is_system_active;

    const current = await this.getSettings();
    const newFreeLimit = freeLimitVal !== undefined ? Number(freeLimitVal) : current.free_attempts_limit;
    const newPrice = defaultPriceVal !== undefined ? Number(defaultPriceVal) : current.default_paid_price_sdg;
    const newActive = isSystemActiveVal !== undefined ? Boolean(isSystemActiveVal) : current.is_system_active;

    await pool.query(
      `UPDATE virtual_number_settings 
       SET free_attempts_limit = $1, 
           default_paid_price_sdg = $2, 
           is_system_active = $3, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = 1`,
      [newFreeLimit, newPrice, newActive]
    );

    return this.getSettings();
  }

  /**
   * Admin: Get all configured products
   */
  public async getAdminProducts() {
    const res = await pool.query(
      `SELECT * FROM virtual_number_products ORDER BY display_order ASC, country_code ASC, service_code ASC`
    );
    return res.rows;
  }

  /**
   * Admin: Update product custom price or active state
   */
  public async updateProduct(id: string, params: {
    customPriceSdg?: number | null | undefined;
    isActive?: boolean | undefined;
    custom_price_sdg?: number | null | undefined;
    is_active?: boolean | undefined;
  }) {
    const customPriceVal = params.customPriceSdg !== undefined ? params.customPriceSdg : params.custom_price_sdg;
    const isActiveVal = params.isActive !== undefined ? params.isActive : params.is_active;

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (customPriceVal !== undefined) {
      updates.push("custom_price_sdg = $" + (idx++));
      values.push(customPriceVal);
    }
    if (isActiveVal !== undefined) {
      updates.push("is_active = $" + (idx++));
      values.push(isActiveVal);
    }

    if (updates.length === 0) {
      const current = await pool.query('SELECT * FROM virtual_number_products WHERE id = $1', [id]);
      return current.rows[0];
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const res = await pool.query(
      "UPDATE virtual_number_products SET " + updates.join(', ') + " WHERE id = $" + idx + " RETURNING *",
      values
    );
    return res.rows[0];
  }

  /**
   * Safe DTO Mapper (Removes internal secrets, formats types)
   */
  private mapOrderRowToDTO(row: any): VirtualNumberOrderDTO {
    return {
      id: row.id,
      userId: row.user_id,
      countryCode: row.country_code,
      countryNameAr: row.country_name_ar,
      serviceCode: row.service_code,
      serviceNameAr: row.service_name_ar,
      providerOrderId: row.provider_order_id,
      phoneNumber: row.phone_number,
      operator: row.operator,
      smsCode: row.sms_code,
      smsText: row.sms_text,
      smsReceivedAt: row.sms_received_at ? new Date(row.sms_received_at).toISOString() : undefined,
      status: row.status,
      attemptNumber: Number(row.attempt_number) || 1,
      isFreeAttempt: Boolean(row.is_free_attempt),
      chargedAmount: Number(row.charged_amount) || 0,
      chargedCurrency: row.charged_currency || 'SDG',
      isRefunded: Boolean(row.is_refunded),
      failureReason: row.failure_reason,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }
}

export const virtualNumberService = new VirtualNumberService();
