import {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderBalance,
  PlayerValidationParams,
  PlayerValidationResult,
  CreateTopupOrderParams,
  CreateTopupOrderResult,
  GetOrderStatusResult,
  ProviderCatalogItem,
  ProviderCanonicalStatus
} from '../types';
import { gamesDropProvider, GamesDropProvider } from './index';
import { mapGamesDropStatus } from './mapper';

export class GamesDropAdapter implements ProviderAdapter {
  public readonly name: string = 'GAMESDROP';

  public readonly capabilities: ProviderCapabilities = {
    canValidatePlayer: true,
    canTopup: true,
    canCheckBalance: true,
    canCheckOrderStatus: true,
    canSyncCatalog: true,
    hasServers: true
  };

  private provider: GamesDropProvider;

  constructor(provider: GamesDropProvider = gamesDropProvider) {
    this.provider = provider;
  }

  /**
   * Check balance via GET /api/v1/balance
   */
  public async getBalance(): Promise<ProviderBalance> {
    const res = await this.provider.getBalance();
    return {
      provider: this.name,
      balance: Number(res.balance || 0),
      currency: res.currency?.code || 'USD',
      isPostpaid: res.isPostpaid ?? false,
      raw: res
    };
  }

  /**
   * Health check measuring API round-trip latency
   */
  public async healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string | undefined }> {
    const start = Date.now();
    try {
      const res = await this.provider.getBalance();
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        latencyMs,
        message: `Online (Shop: ${res.shopName}, Balance: $${res.balance})`
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        latencyMs,
        message: err.message || 'Offline'
      };
    }
  }

  /**
   * Player validation via POST /api/v1/offers/check-game-data or resolveTelegramUser
   */
  public async validatePlayer(params: PlayerValidationParams): Promise<PlayerValidationResult> {
    const offerId = Number(params.providerProductId);
    if (!offerId || isNaN(offerId)) {
      return {
        valid: false,
        message: 'معرف عرض GamesDrop غير صالح للتحقق.'
      };
    }

    try {
      const payload: { offerId: number; gameUserId: string; gameServerId?: string } = {
        offerId,
        gameUserId: params.playerUserId.trim()
      };
      if (params.serverZoneId && params.serverZoneId.trim()) {
        payload.gameServerId = params.serverZoneId.trim();
      }

      const res = await this.provider.checkGameData(payload);

      const isValid = res && res.status === 'VALID';
      return {
        valid: isValid,
        playerName: res.gameUserLogin || params.playerUserId,
        rawResponse: res,
        message: isValid ? 'تم التحقق من الحساب بنجاح.' : 'معرف اللاعب غير صالح لدى GamesDrop.'
      };
    } catch (err: any) {
      return {
        valid: false,
        message: err.message || 'فشل التحقق من حساب اللاعب لدى GamesDrop.'
      };
    }
  }

  /**
   * Top-up order execution via POST /api/v1/offers/create-order
   */
  public async createTopupOrder(params: CreateTopupOrderParams): Promise<CreateTopupOrderResult> {
    const offerId = Number(params.providerProductId);
    const transactionId = `KIROPRO-${params.koaraOrderId}`;

    try {
      const customerPayload: { email: string; gameUserId: string; gameServerId?: string } = {
        email: params.customerEmail || 'customer@kiropro.store',
        gameUserId: params.playerUserId.trim()
      };
      if (params.serverZoneId && params.serverZoneId.trim()) {
        customerPayload.gameServerId = params.serverZoneId.trim();
      }

      const res = await this.provider.createOrder({
        offerId,
        price: params.expectedPriceUsd || 0,
        transactionId,
        customer: customerPayload
      });

      const rawStatus = (res.status || 'PROCESSING').toUpperCase();
      const mapped = mapGamesDropStatus(rawStatus);

      let canonicalStatus: ProviderCanonicalStatus = 'PROCESSING';
      if (mapped === 'COMPLETED') canonicalStatus = 'COMPLETED';
      else if (mapped === 'PROCESSING') canonicalStatus = 'PROCESSING';
      else if (mapped === 'FAILED' || mapped === 'REFUNDED') canonicalStatus = 'FAILED';

      return {
        success: true,
        provider: this.name,
        providerOrderId: res.order_id || res.orderId || 0,
        providerStatus: rawStatus,
        canonicalStatus,
        fulfillmentKey: res.key || null,
        costUsd: params.expectedPriceUsd || 0,
        currency: 'USD',
        message: res.message || 'Order dispatched to GamesDrop',
        rawResponse: res
      };
    } catch (err: any) {
      const isTimeout = err.code === 'TIMEOUT' || err.status === 504;
      const isNetwork = err.code === 'NETWORK_ERROR' || err.status === 502;

      // In ambiguous state (timeout/network drop after submit):
      // Mark isAmbiguous = true to trigger PROVIDER_UNKNOWN and strictly prevent duplicate fulfillment!
      if (isTimeout || isNetwork) {
        return {
          success: false,
          provider: this.name,
          providerOrderId: 0,
          providerStatus: 'UNKNOWN',
          canonicalStatus: 'UNKNOWN',
          isAmbiguous: true,
          message: `انقطاع اتصال أو انتهاء مهلة مع مزود GamesDrop: ${err.message}`
        };
      }

      return {
        success: false,
        provider: this.name,
        providerOrderId: 0,
        providerStatus: 'FAILED',
        canonicalStatus: 'FAILED',
        isAmbiguous: false,
        message: err.message || 'GamesDrop order creation failed'
      };
    }
  }

  /**
   * Order status polling via POST /api/v1/offers/order-status
   */
  public async getOrderStatus(providerOrderId: string | number): Promise<GetOrderStatusResult> {
    try {
      const res = await this.provider.getOrderStatus(Number(providerOrderId));
      const rawStatus = (res.status || '').toUpperCase();
      const mapped = mapGamesDropStatus(rawStatus);

      let canonicalStatus: ProviderCanonicalStatus = 'PROCESSING';
      let isTerminal = false;

      if (mapped === 'COMPLETED') {
        canonicalStatus = 'COMPLETED';
        isTerminal = true;
      } else if (mapped === 'FAILED' || mapped === 'REFUNDED') {
        canonicalStatus = 'FAILED';
        isTerminal = true;
      } else {
        canonicalStatus = 'PROCESSING';
        isTerminal = false;
      }

      return {
        provider: this.name,
        providerOrderId,
        providerStatus: rawStatus,
        canonicalStatus,
        isTerminal,
        fulfillmentKey: res.key || null,
        message: res.message || undefined,
        rawResponse: res
      };
    } catch (err: any) {
      return {
        provider: this.name,
        providerOrderId,
        providerStatus: 'UNKNOWN',
        canonicalStatus: 'UNKNOWN',
        isTerminal: false,
        message: err.message || 'Failed to check order status from GamesDrop'
      };
    }
  }

  /**
   * Catalog retrieval via POST /api/v1/offers/sync
   */
  public async syncCatalog(category: string = 'Top Up'): Promise<ProviderCatalogItem[]> {
    const res = await this.provider.syncOffers({ category, limit: 1000 });
    const rows = res.rows || [];

    return rows.map(r => ({
      provider: this.name,
      providerProductId: String(r.offerGroupId),
      gameCode: r.platformCode || 'game',
      gameName: r.productName,
      denominationName: r.offerGroupName,
      costUsd: Number(r.price || 0),
      currency: r.currency || 'USD',
      inStock: Boolean(r.inStock),
      metadata: {
        platformName: r.platformName,
        regionCode: r.regionCode,
        regionName: r.regionName
      }
    }));
  }
}

export const gamesDropAdapter = new GamesDropAdapter();
