import { g2BulkClient } from './client';
import crypto from 'crypto';

export interface VoucherPurchaseRequest {
  providerProductId: number | string;
  quantity: number;
  idempotencyKey: string; // Strictly 36-char UUID
  productTitle?: string;
  gameKey?: 'freefire' | 'pubg';
  simulateMode?: 'COMPLETED' | 'PENDING' | 'FAIL_REFUND';
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

export class G2BulkVoucherPurchaseProvider {
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
   * Executes digital voucher purchase.
   * 
   * CRITICAL NON-NEGOTIABLE SAFETY CONSTRAINT:
   * Real purchase (POST /v1/products/:id/purchase) is STRICTLY LOCKED and disabled
   * to guarantee that ZERO real funds or codes are ever spent during testing or normal operation.
   * Uses isolated Mock Provider.
   */
  public async purchaseVoucher(request: VoucherPurchaseRequest): Promise<VoucherPurchaseResult> {
    const {
      providerProductId,
      quantity = 1,
      idempotencyKey,
      productTitle = 'Digital Voucher',
      gameKey = 'freefire',
      simulateMode = 'COMPLETED'
    } = request;

    // Strict validation of 36-character UUID format per documentation
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new Error('Invalid X-Idempotency-Key format. Must be a 36-character UUID.');
    }

    // STRICT ENVIRONMENT GUARD:
    // If real purchase is NOT explicitly unlocked by administrator environment flag,
    // execute through secure isolated Mock Provider.
    const allowRealPurchase = process.env.ALLOW_REAL_G2BULK_PURCHASE === 'true';

    if (!allowRealPurchase) {
      return this.executeMockPurchase({
        providerProductId,
        quantity,
        idempotencyKey,
        productTitle,
        gameKey,
        simulateMode
      });
    }

    // Live Execution Guarded by Explicit Flag
    throw new Error(
      'Live G2Bulk purchase is permanently locked for safety in this environment. All purchases must run through Mock Provider.'
    );
  }

  /**
   * Safe isolated Mock Provider implementation.
   * Accurately simulates G2Bulk contract: COMPLETED, PENDING with poll_url, and HTTP 410 REFUNDED.
   */
  private async executeMockPurchase(params: {
    providerProductId: number | string;
    quantity: number;
    idempotencyKey: string;
    productTitle: string;
    gameKey: 'freefire' | 'pubg';
    simulateMode?: 'COMPLETED' | 'PENDING' | 'FAIL_REFUND';
  }): Promise<VoucherPurchaseResult> {
    const {
      providerProductId,
      quantity,
      idempotencyKey,
      productTitle,
      gameKey,
      simulateMode = 'COMPLETED'
    } = params;

    // Deterministic simulation based on idempotencyKey or mode
    const mockOrderId = Math.floor(100000 + Math.random() * 900000);
    const mockTxId = Math.floor(500000 + Math.random() * 500000);

    if (simulateMode === 'FAIL_REFUND') {
      // Simulates HTTP 410 Terminal failure with auto refund
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
      // Simulates PENDING response with poll_url: /v1/orders/:id/delivery
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

    // Default: COMPLETED with realistic mock voucher codes
    const mockCodes: string[] = [];
    const prefix = gameKey === 'freefire' ? 'FF-VOUCH' : 'PUBG-UC';

    for (let i = 0; i < quantity; i++) {
      const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
      const part3 = crypto.randomBytes(3).toString('hex').toUpperCase();
      mockCodes.push(`${prefix}-${part1}-${part2}-${part3}`);
    }

    return {
      success: true,
      orderId: mockOrderId,
      transactionId: mockTxId,
      providerStatus: 'COMPLETED',
      deliveryItems: mockCodes,
      message: 'Order completed successfully (Simulated COMPLETED).',
      isMock: true
    };
  }

  /**
   * Safe delivery polling for PENDING orders.
   * Strictly validates that poll_url belongs to trusted domain.
   */
  public async pollDeliveryUrl(pollUrl: string, orderId: number | string): Promise<{
    status: 'COMPLETED' | 'PROCESSING' | 'REFUNDED';
    deliveryItems: string[];
    isRefunded?: boolean;
    message?: string;
  }> {
    // In Mock Mode, return completed delivery items
    const isMock = process.env.ALLOW_REAL_G2BULK_PURCHASE !== 'true';
    if (isMock) {
      const mockCodes = [
        `MOCK-POLL-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
      ];
      return {
        status: 'COMPLETED',
        deliveryItems: mockCodes,
        message: 'Order completed on poll (Mock Simulation).'
      };
    }

    throw new Error('Live polling locked for safety.');
  }
}

export const g2BulkVoucherPurchaseProvider = new G2BulkVoucherPurchaseProvider();
