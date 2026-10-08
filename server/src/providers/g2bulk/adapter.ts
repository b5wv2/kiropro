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
import { g2BulkClient, G2BulkClient } from './client';
import { G2BulkCheckPlayerParams, G2BulkCreateOrderParams } from './types';

export class G2BulkAdapter implements ProviderAdapter {
  public readonly name: string = 'G2BULK';

  public readonly capabilities: ProviderCapabilities = {
    canValidatePlayer: true,
    canTopup: true,
    canCheckBalance: true,
    canCheckOrderStatus: true,
    canSyncCatalog: true,
    hasServers: true
  };

  private client: G2BulkClient;

  constructor(client: G2BulkClient = g2BulkClient) {
    this.client = client;
  }

  /**
   * Balance check via GET /v1/getMe
   */
  public async getBalance(): Promise<ProviderBalance> {
    const res = await this.client.getMe();
    return {
      provider: this.name,
      balance: Number(res.balance || 0),
      currency: 'USD',
      isPostpaid: false,
      raw: res
    };
  }

  /**
   * Health check measuring API round-trip latency
   */
  public async healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string | undefined }> {
    const start = Date.now();
    try {
      const res = await this.client.getMe();
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        latencyMs,
        message: `Online (User: ${res.username}, Balance: $${res.balance})`
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
   * Player account validation via POST /v1/games/checkPlayerId
   */
  public async validatePlayer(params: PlayerValidationParams): Promise<PlayerValidationResult> {
    const rawUserId = String(params.playerUserId || (params as any).playerId || '').trim();
    if (!rawUserId) {
      return {
        valid: false,
        message: 'معرف اللاعب مطلوب للتحقق.'
      };
    }

    const game = (params.gameCode || 'pubgm').trim();

    try {
      const checkPayload: G2BulkCheckPlayerParams = {
        game,
        user_id: rawUserId
      };
      if (params.serverZoneId && params.serverZoneId.trim()) {
        checkPayload.server_id = params.serverZoneId.trim();
      }
      if (params.charName && params.charName.trim()) {
        checkPayload.charname = params.charName.trim();
      }

      const res = await this.client.checkPlayerId(checkPayload);

      const isValid = res.valid === 'valid' || Boolean(res.name);
      return {
        valid: isValid,
        playerName: res.name || rawUserId,
        rawResponse: res,
        message: isValid ? 'تم التحقق من الحساب بنجاح.' : (res.message || 'معرف اللاعب غير صالح.')
      };
    } catch (err: any) {
      return {
        valid: false,
        message: err.message || 'تعذر التحقق من معرّف اللاعب لدى مزود G2Bulk.'
      };
    }
  }

  /**
   * Top-up order execution via POST /v1/games/:code/order
   * Includes idempotency key and safe error classification
   */
  public async createTopupOrder(params: CreateTopupOrderParams): Promise<CreateTopupOrderResult> {
    const gameCode = (params.gameCode || 'pubgm').trim();
    const catalogueName = params.providerProductId; // catalogue denomination name (e.g. "60")

    try {
      const orderPayload: G2BulkCreateOrderParams = {
        catalogue_name: catalogueName,
        player_id: params.playerUserId.trim(),
        remark: params.remark || `KIROPRO-${params.koaraOrderId}`
      };
      if (params.serverZoneId && params.serverZoneId.trim()) {
        orderPayload.server_id = params.serverZoneId.trim();
      }
      if (params.charName && params.charName.trim()) {
        orderPayload.charname = params.charName.trim();
      }
      if (params.callbackUrl && params.callbackUrl.trim()) {
        orderPayload.callback_url = params.callbackUrl.trim();
      }

      const res = await this.client.createTopupOrder(
        gameCode,
        orderPayload,
        params.idempotencyKey
      );

      const orderData = res.order;
      const rawStatus = (orderData?.status || 'PENDING').toUpperCase();

      let canonicalStatus: ProviderCanonicalStatus = 'PENDING';
      if (rawStatus === 'COMPLETED') canonicalStatus = 'COMPLETED';
      else if (rawStatus === 'PROCESSING') canonicalStatus = 'PROCESSING';
      else if (rawStatus === 'FAILED') canonicalStatus = 'FAILED';

      return {
        success: true,
        provider: this.name,
        providerOrderId: orderData?.order_id,
        providerStatus: rawStatus,
        canonicalStatus,
        costUsd: Number(orderData?.price || params.expectedPriceUsd || 0),
        currency: 'USD',
        message: res.message || 'Order submitted successfully',
        rawResponse: res
      };
    } catch (err: any) {
      const status = err.status || 500;
      const isTimeout = err.isTimeout || status === 504;

      // Crucial Security Rule: If network timeout or ambiguous failure occurred,
      // mark isAmbiguous = true so ProviderRouter/Order transitions to PROVIDER_UNKNOWN
      // and strictly PREVENTS duplicate fulfillment.
      if (isTimeout || status === 502) {
        return {
          success: false,
          provider: this.name,
          providerOrderId: 0,
          providerStatus: 'UNKNOWN',
          canonicalStatus: 'UNKNOWN',
          isAmbiguous: true,
          message: `انقطاع اتصال أو انتهاء مهلة مع مزود G2Bulk: ${err.message}`
        };
      }

      // Definitive rejection (e.g. 400 Bad Request, 404, etc.)
      return {
        success: false,
        provider: this.name,
        providerOrderId: 0,
        providerStatus: 'FAILED',
        canonicalStatus: 'FAILED',
        isAmbiguous: false,
        message: err.message || 'G2Bulk order creation rejected'
      };
    }
  }

  /**
   * Order status polling via POST /v1/games/order/status
   */
  public async getOrderStatus(providerOrderId: string | number): Promise<GetOrderStatusResult> {
    try {
      const res = await this.client.getOrderStatus(providerOrderId);
      const rawStatus = String(res.status || '').toUpperCase();

      let canonicalStatus: ProviderCanonicalStatus = 'PENDING';
      let isTerminal = false;

      if (rawStatus === 'COMPLETED') {
        canonicalStatus = 'COMPLETED';
        isTerminal = true;
      } else if (rawStatus === 'FAILED' || rawStatus === 'REFUNDED') {
        canonicalStatus = 'FAILED';
        isTerminal = true;
      } else if (rawStatus === 'PROCESSING') {
        canonicalStatus = 'PROCESSING';
        isTerminal = false;
      } else {
        canonicalStatus = 'PENDING';
        isTerminal = false;
      }

      const fulfillmentKey = res.delivery_items && res.delivery_items.length > 0 
        ? res.delivery_items.join('\n') 
        : null;

      return {
        provider: this.name,
        providerOrderId,
        providerStatus: rawStatus,
        canonicalStatus,
        isTerminal,
        fulfillmentKey,
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
        message: err.message || 'Failed to check order status'
      };
    }
  }

  /**
   * Catalog retrieval via GET /v1/games/:code/catalogue
   */
  public async syncCatalog(gameCode: string = 'pubgm'): Promise<ProviderCatalogItem[]> {
    const res = await this.client.getCatalogue(gameCode);
    const catalogues = res.catalogues || [];

    return catalogues.map(item => ({
      provider: this.name,
      providerProductId: item.name, // The catalogue name needed for placing orders
      gameCode: res.game?.code || gameCode,
      gameName: res.game?.name || gameCode,
      denominationName: item.name,
      costUsd: Number(item.amount || 0),
      currency: 'USD',
      inStock: true,
      metadata: {
        catalogueId: item.id,
        gameImageUrl: res.game?.image_url
      }
    }));
  }
}

export const g2BulkAdapter = new G2BulkAdapter();
