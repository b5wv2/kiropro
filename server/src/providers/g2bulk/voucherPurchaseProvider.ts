import { g2BulkClient } from './client';
import crypto from 'crypto';

export interface VoucherPurchaseRequest {
  providerProductId: number | string;
  quantity: number;
  idempotencyKey: string; // Strictly 36-char UUID
  productTitle?: string;
  gameKey?: 'freefire' | 'pubg';
  isSimulation?: boolean; // Set by test runner only
  simulateMode?: 'COMPLETED' | 'PENDING' | 'EMPTY_CODES' | 'FAIL_REFUND' | 'NETWORK_ERROR';
}

export interface VoucherPurchaseResult {
  success: boolean;
  orderId: number | string;
  transactionId?: number | string;
  providerStatus: 'COMPLETED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  deliveryItems: string[];
  pollUrl?: string;
  isRefunded?: boolean;
  message?: string;
  isMock: boolean;
}

export type VoucherUnavailabilityReason =
  | 'READY'
  | 'PROVIDER_ORDERS_DISABLED'
  | 'PROVIDER_API_KEY_MISSING'
  | 'REAL_PURCHASES_LOCKED'
  | 'PRODUCT_MAPPING_MISSING'
  | 'PRODUCT_INACTIVE'
  | 'PRODUCT_OUT_OF_STOCK';

export interface VoucherReadinessResult {
  isAllowed: boolean;
  reason: VoucherUnavailabilityReason;
  customerMessage: string;
  isMock: boolean;
}

export class G2BulkVoucherPurchaseProvider {
  private lastLoggedReason: string = '';
  private lastLogTimestamp: number = 0;

  /**
   * Log status with deduplication to avoid flooding server logs on every product catalog load.
   */
  public logReasonThrottled(reason: VoucherUnavailabilityReason, context?: string) {
    const now = Date.now();
    if (reason !== this.lastLoggedReason || now - this.lastLogTimestamp > 60000) {
      this.lastLoggedReason = reason;
      this.lastLogTimestamp = now;
      if (reason !== 'READY') {
        console.warn(`[G2Bulk Readiness] Status: ${reason}${context ? ` (${context})` : ''}`);
      } else {
        console.log(`[G2Bulk Readiness] Status: READY${context ? ` (${context})` : ''}`);
      }
    }
  }

  /**
   * Fetches latest live unit price and stock directly from single-product endpoint:
   * GET /v1/products/:id (Public read-only)
   * Ensures freshness before checkout without polling the entire catalog.
   */
  public async getFreshProductPrice(providerProductId: number | string): Promise<{
    unitPrice: number;
    faceValue: number | null;
    stock: number;
    title: string;
  }> {
    const res = await g2BulkClient.request(`/products/${providerProductId}`, { requiresAuth: false });
    const product = res.product || res;
    if (!product || product.unit_price === undefined) {
      throw new Error(`تعذر استرجاع بيانات الفئة (${providerProductId}) من المزود.`);
    }

    return {
      unitPrice: Number(product.unit_price || 0),
      faceValue: product.face_value !== undefined && product.face_value !== null ? Number(product.face_value) : null,
      stock: Number(product.stock || 0),
      title: product.title || `Voucher (${providerProductId})`
    };
  }

  /**
   * Comprehensive unified voucher purchasing readiness checker.
   * Evaluates:
   * 1. Product mapping and identity (providerProductId)
   * 2. Local product active state (isActive)
   * 3. Stock availability (inStock & stock)
   * 4. Provider orders enabled in database (provider_settings.orders_enabled for G2BULK)
   * 5. Safe Mock Mode (VOUCHERS_MOCK_MODE=true or isSimulation or test environment)
   * 6. Live mode requirements: ALLOW_REAL_G2BULK_PURCHASE === 'true' AND valid API key configured.
   */
  public checkVoucherReadiness(options?: {
    providerProductId?: number | string;
    isActive?: boolean;
    inStock?: boolean;
    stock?: number;
    isSimulation?: boolean;
    g2bulkOrdersEnabled?: boolean;
    suppressLog?: boolean;
  }): VoucherReadinessResult {
    // 1. Product mapping check
    if (options?.providerProductId !== undefined && (!options.providerProductId || String(options.providerProductId).trim() === '' || options.providerProductId === 0)) {
      return {
        isAllowed: false,
        reason: 'PRODUCT_MAPPING_MISSING',
        customerMessage: 'هذه البطاقة غير مهيأة للشراء المباشر حالياً.',
        isMock: false
      };
    }

    // 2. Product active check
    if (options?.isActive === false) {
      return {
        isAllowed: false,
        reason: 'PRODUCT_INACTIVE',
        customerMessage: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.',
        isMock: false
      };
    }

    // 3. Product stock check
    if (options?.inStock === false || (options?.stock !== undefined && options.stock <= 0)) {
      return {
        isAllowed: false,
        reason: 'PRODUCT_OUT_OF_STOCK',
        customerMessage: 'عذراً، الكمية المطلوبة غير متوفرة حالياً في المخزون.',
        isMock: false
      };
    }

    // 4. Provider orders enabled in database check
    const isOrdersEnabled = options?.g2bulkOrdersEnabled !== false;
    if (!isOrdersEnabled) {
      if (!options?.suppressLog) this.logReasonThrottled('PROVIDER_ORDERS_DISABLED');
      return {
        isAllowed: false,
        reason: 'PROVIDER_ORDERS_DISABLED',
        customerMessage: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.',
        isMock: false
      };
    }

    // 5. Safe Mock Mode: Strictly controlled by server environment (VOUCHERS_MOCK_MODE=true or NODE_ENV=test)
    const isMock = process.env.VOUCHERS_MOCK_MODE === 'true' || (process.env.NODE_ENV === 'test' && options?.isSimulation === true);
    if (isMock) {
      if (!options?.suppressLog) this.logReasonThrottled('READY', 'MOCK_MODE');
      return {
        isAllowed: true,
        reason: 'READY',
        customerMessage: 'متاح للشراء',
        isMock: true
      };
    }

    // 6. Live environment checks
    const hasApiKey = Boolean(g2BulkClient.getApiKey());
    if (!hasApiKey) {
      if (!options?.suppressLog) this.logReasonThrottled('PROVIDER_API_KEY_MISSING');
      return {
        isAllowed: false,
        reason: 'PROVIDER_API_KEY_MISSING',
        customerMessage: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.',
        isMock: false
      };
    }

    const isLiveSpendAllowed = process.env.ALLOW_REAL_G2BULK_PURCHASE === 'true';
    if (!isLiveSpendAllowed) {
      if (!options?.suppressLog) this.logReasonThrottled('REAL_PURCHASES_LOCKED');
      return {
        isAllowed: false,
        reason: 'REAL_PURCHASES_LOCKED',
        customerMessage: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.',
        isMock: false
      };
    }

    if (!options?.suppressLog) this.logReasonThrottled('READY', 'LIVE');
    return {
      isAllowed: true,
      reason: 'READY',
      customerMessage: 'متاح للشراء',
      isMock: false
    };
  }

  /**
   * Backwards-compatible boolean wrapper around checkVoucherReadiness.
   */
  public isPurchaseAllowed(options?: {
    providerProductId?: number | string;
    isActive?: boolean;
    inStock?: boolean;
    stock?: number;
    isSimulation?: boolean;
    g2bulkOrdersEnabled?: boolean;
    suppressLog?: boolean;
  }): boolean {
    return this.checkVoucherReadiness(options).isAllowed;
  }

  /**
   * Executes digital voucher purchase.
   * 
   * CRITICAL NON-NEGOTIABLE ARCHITECTURAL RULES:
   * 1. In LIVE mode: calls POST /v1/products/:id/purchase on G2Bulk API with X-API-Key and X-Idempotency-Key.
   * 2. In NON-LIVE mode: if not an explicit test simulation, NEVER synthesize fake codes for real customer purchases.
   * 3. ZERO LOCAL SYNTHESIS: KIROPRO must NEVER generate random or fake codes as replacement for provider voucher codes.
   * 4. Safe isolated mock provider is strictly restricted to test simulations.
   */
  public async purchaseVoucher(request: VoucherPurchaseRequest): Promise<VoucherPurchaseResult> {
    const {
      providerProductId,
      quantity = 1,
      idempotencyKey,
      productTitle = 'Digital Voucher',
      gameKey = 'freefire',
      isSimulation = false,
      simulateMode = 'COMPLETED'
    } = request;

    // Strict validation of 36-character UUID format per documentation
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new Error('Invalid X-Idempotency-Key format. Must be a 36-character UUID.');
    }

    // 1. Safe Mock Mode check: strictly restricted to server environment
    const isMock = process.env.VOUCHERS_MOCK_MODE === 'true' || (process.env.NODE_ENV === 'test' && Boolean(isSimulation));
    const allowRealPurchase = process.env.ALLOW_REAL_G2BULK_PURCHASE === 'true';

    // 1. LIVE EXECUTION VIA G2BULK OFFICIAL API (Strictly requires ALLOW_REAL_G2BULK_PURCHASE === 'true' AND NOT in Mock Mode)
    if (allowRealPurchase && !isMock) {
      return this.executeRealPurchase({
        providerProductId,
        quantity,
        idempotencyKey
      });
    }

    // 2. MOCK MODE: When VOUCHERS_MOCK_MODE is enabled or during test simulation
    if (isMock) {
      return this.executeMockPurchase({
        providerProductId,
        quantity,
        idempotencyKey,
        productTitle,
        gameKey,
        simulateMode
      });
    }

    // 3. SAFETY GUARD: If real purchase is disabled and this is NOT an explicit test simulation,
    // REJECT immediately with neutral, customer-safe Arabic message.
    throw new Error(
      'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.'
    );
  }

  /**
   * Real G2Bulk Purchase execution per official API specification:
   * POST /v1/products/:id/purchase
   * Sends X-API-Key and X-Idempotency-Key strictly from backend
   */
  private async executeRealPurchase(params: {
    providerProductId: number | string;
    quantity: number;
    idempotencyKey: string;
  }): Promise<VoucherPurchaseResult> {
    const { providerProductId, quantity, idempotencyKey } = params;

    const trustedWebhookUrl = (process.env.G2BULK_WEBHOOK_URL || 'https://api.kiropro.store/webhook/provider').trim();
    const res = await g2BulkClient.purchaseProduct(
      providerProductId,
      { 
        quantity,
        callback_url: trustedWebhookUrl
      },
      idempotencyKey
    );

    const rawStatus = String(res.status || res.order?.status || '').toUpperCase();
    const orderId = res.order_id || res.order?.id || 0;
    const transactionId = res.transaction_id || res.order?.transaction_id;

    // Extract delivery items safely
    const rawDeliveryItems = Array.isArray(res.delivery_items)
      ? res.delivery_items
      : (Array.isArray(res.order?.delivery_items) ? res.order.delivery_items : []);

    const deliveryCodes: string[] = rawDeliveryItems
      .map((item: any) => (typeof item === 'string' ? item.trim() : (item?.code || item?.pin || String(item || ''))))
      .filter((c: string) => Boolean(c));

    // Case 1: Immediately completed with delivered codes
    if ((rawStatus === 'COMPLETED' || rawStatus === 'SUCCESS') && deliveryCodes.length > 0) {
      return {
        success: true,
        orderId,
        transactionId,
        providerStatus: 'COMPLETED',
        deliveryItems: deliveryCodes, // STRICTLY provider codes only
        message: 'تم استلام الأكواد الرقمية بنجاح.',
        isMock: false
      };
    }

    // Case 2: Status is COMPLETED but delivery_items is empty!
    // NEVER invent fake codes. Treat as PENDING to poll delivery endpoint.
    if ((rawStatus === 'COMPLETED' || rawStatus === 'SUCCESS') && deliveryCodes.length === 0) {
      const pollUrl = res.poll_url || res.order?.poll_url || `/orders/${orderId}/delivery`;
      return {
        success: true,
        orderId,
        transactionId,
        providerStatus: 'PENDING',
        deliveryItems: [],
        pollUrl,
        message: 'طلبك قيد التجهيز وسيتم تسليم الأكواد الرقمية فور صدورها.',
        isMock: false
      };
    }

    // Case 3: PENDING / PROCESSING with polling URL
    if (rawStatus === 'PENDING' || rawStatus === 'PROCESSING') {
      const pollUrl = res.poll_url || res.order?.poll_url || `/orders/${orderId}/delivery`;
      return {
        success: true,
        orderId,
        transactionId,
        providerStatus: 'PENDING',
        deliveryItems: [],
        pollUrl,
        message: 'طلبك قيد التجهيز وسيتم تسليم الأكواد فور صدورها.',
        isMock: false
      };
    }

    // Case 4: Terminal failure or refund from provider
    return {
      success: false,
      orderId,
      transactionId,
      providerStatus: (rawStatus === 'REFUNDED' ? 'REFUNDED' : 'FAILED'),
      deliveryItems: [],
      isRefunded: Boolean(res.is_refunded || rawStatus === 'REFUNDED'),
      message: 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.',
      isMock: false
    };
  }

  /**
   * Safe isolated Mock Provider implementation.
   * Strictly for automated tests. Returns clearly tagged TEST codes.
   */
  private async executeMockPurchase(params: {
    providerProductId: number | string;
    quantity: number;
    idempotencyKey: string;
    productTitle: string;
    gameKey: 'freefire' | 'pubg';
    simulateMode?: 'COMPLETED' | 'PENDING' | 'EMPTY_CODES' | 'FAIL_REFUND' | 'NETWORK_ERROR';
  }): Promise<VoucherPurchaseResult> {
    const {
      quantity,
      gameKey,
      simulateMode = 'COMPLETED'
    } = params;

    const mockOrderId = Math.floor(100000 + Math.random() * 900000);
    const mockTxId = Math.floor(500000 + Math.random() * 500000);

    if (simulateMode === 'NETWORK_ERROR') {
      throw new Error('Simulated network connection failure to G2Bulk API');
    }

    if (simulateMode === 'FAIL_REFUND') {
      return {
        success: false,
        orderId: mockOrderId,
        transactionId: mockTxId,
        providerStatus: 'REFUNDED',
        deliveryItems: [],
        isRefunded: true,
        message: 'Order failed and was refunded automatically by provider (Simulated HTTP 410).',
        isMock: true
      };
    }

    if (simulateMode === 'PENDING') {
      return {
        success: true,
        orderId: mockOrderId,
        transactionId: mockTxId,
        providerStatus: 'PENDING',
        deliveryItems: [],
        pollUrl: `/v1/orders/${mockOrderId}/delivery`,
        message: 'Order is pending delivery (Simulated PENDING).',
        isMock: true
      };
    }

    if (simulateMode === 'EMPTY_CODES') {
      // Simulates provider COMPLETED but delivery_items empty
      return {
        success: true,
        orderId: mockOrderId,
        transactionId: mockTxId,
        providerStatus: 'PENDING',
        deliveryItems: [],
        pollUrl: `/v1/orders/${mockOrderId}/delivery`,
        message: 'Order completed on provider but codes pending delivery.',
        isMock: true
      };
    }

    // Default COMPLETED: Returns test codes explicitly labeled as TEST/MOCK
    const mockTestCodes: string[] = [];
    const gameTag = gameKey === 'freefire' ? 'FF' : 'PUBG';

    for (let i = 0; i < quantity; i++) {
      const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
      mockTestCodes.push(`MOCK-TEST-VOUCHER-${gameTag}-${i + 1}-${hex}`);
    }

    return {
      success: true,
      orderId: mockOrderId,
      transactionId: mockTxId,
      providerStatus: 'COMPLETED',
      deliveryItems: mockTestCodes,
      message: 'Order completed successfully (Mock Test Simulation).',
      isMock: true
    };
  }

  /**
   * Safe delivery polling for PENDING orders.
   * In Live mode: calls G2Bulk delivery polling endpoint.
   * In Mock mode: simulates delivery resolution for tests.
   */
  public async pollDeliveryUrl(pollUrl: string, orderId: number | string): Promise<{
    status: 'COMPLETED' | 'PROCESSING' | 'REFUNDED' | 'FAILED';
    deliveryItems: string[];
    isRefunded?: boolean;
    message?: string;
  }> {
    const isLive = process.env.ALLOW_REAL_G2BULK_PURCHASE === 'true';

    if (isLive) {
      try {
        const res = await g2BulkClient.getDelivery(orderId);
        const rawStatus = String(res.status || '').toUpperCase();
        const rawCodes = Array.isArray(res.delivery_items) ? res.delivery_items : [];

        if (rawStatus === 'COMPLETED' && rawCodes.length > 0) {
          return {
            status: 'COMPLETED',
            deliveryItems: rawCodes,
            message: 'تم استلام الأكواد بنجاح.'
          };
        }

        if (rawStatus === 'REFUNDED' || rawStatus === 'FAILED') {
          return {
            status: 'REFUNDED',
            deliveryItems: [],
            isRefunded: true,
            message: 'تعذر تسليم الأكواد وتم استرجاع المبلغ كاملاً إلى محفظتك.'
          };
        }

        return {
          status: 'PROCESSING',
          deliveryItems: [],
          message: 'طلبك قيد التجهيز وسيتم تسليم الأكواد فور صدورها.'
        };
      } catch (pollErr: any) {
        return {
          status: 'PROCESSING',
          deliveryItems: [],
          message: 'طلبك قيد التجهيز وسيتم تسليم الأكواد فور صدورها.'
        };
      }
    }

    // Mock Simulation Mode
    const mockCodes = [
      `MOCK-TEST-POLL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    ];
    return {
      status: 'COMPLETED',
      deliveryItems: mockCodes,
      message: 'Order completed on poll (Mock Test Simulation).'
    };
  }
}

export const g2BulkVoucherPurchaseProvider = new G2BulkVoucherPurchaseProvider();
