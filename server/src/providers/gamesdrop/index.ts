import { gamesDropClient } from './client';
import { 
  GamesDropBalance, 
  GamesDropOffer, 
  GamesDropCreateOrderParams, 
  GamesDropOrderResponse,
  GamesDropCheckGameDataParams,
  GamesDropCheckGameDataResponse,
  GamesDropServersResponse,
  GamesDropSyncParams,
  GamesDropSyncResponse
} from './types';
import { mapGamesDropStatus, mapGamesDropErrorMessage } from './mapper';

export class GamesDropProvider {
  /**
   * Check Partner Account Balance
   * GET /api/v1/balance (fallback to /api/v1/partner/balance)
   */
  public async getBalance(): Promise<GamesDropBalance> {
    try {
      return await gamesDropClient.request<GamesDropBalance>('/api/v1/balance', { method: 'GET' });
    } catch (err: any) {
      if (err.status === 404) {
        return await gamesDropClient.request<GamesDropBalance>('/api/v1/partner/balance', { method: 'GET' });
      }
      throw err;
    }
  }

  /**
   * Fetch Single Offer Information
   * POST /api/v1/offers/find-one
   * Important: offerId must be numeric offerGroupId
   */
  public async findOffer(offerId: number = 999, countryCode?: string): Promise<GamesDropOffer> {
    const payload: { offerId: number; countryCode?: string } = {
      offerId: Number(offerId)
    };
    if (countryCode) {
      payload.countryCode = countryCode;
    }

    return await gamesDropClient.request<GamesDropOffer>('/api/v1/offers/find-one', {
      method: 'POST',
      body: payload
    });
  }

  /**
   * Create an Order with GamesDrop
   * POST /api/v1/offers/create-order
   */
  public async createOrder(params: GamesDropCreateOrderParams): Promise<GamesDropOrderResponse> {
    const payload: any = {
      offerId: Number(params.offerId),
      price: Number(params.price),
      transactionId: params.transactionId
    };

    if (params.countryCode) {
      payload.countryCode = params.countryCode;
    }

    if (params.keyFormat) {
      payload.keyFormat = params.keyFormat;
    }

    // For test offer 999, useBalance can be omitted
    if (params.useBalance !== undefined) {
      payload.useBalance = params.useBalance;
    }

    if (params.customer) {
      payload.customer = {};
      if (params.customer.email) payload.customer.email = params.customer.email;
      if (params.customer.gameUserId) payload.customer.gameUserId = params.customer.gameUserId;
      if (params.customer.gameServerId) payload.customer.gameServerId = params.customer.gameServerId;
    }

    console.log(`[GamesDrop createOrder] Dispatching order for offerId: ${payload.offerId}, transactionId: ${payload.transactionId}, price: ${payload.price}`);

    return await gamesDropClient.request<GamesDropOrderResponse>('/api/v1/offers/create-order', {
      method: 'POST',
      body: payload
    });
  }

  /**
   * Check Order Status
   * POST /api/v1/offers/order-status
   */
  public async getOrderStatus(orderId: number): Promise<GamesDropOrderResponse> {
    return await gamesDropClient.request<GamesDropOrderResponse>('/api/v1/offers/order-status', {
      method: 'POST',
      body: { orderId: Number(orderId) }
    });
  }

  /**
   * Player Validation
   * POST /api/v1/offers/check-game-data
   */
  public async checkGameData(params: GamesDropCheckGameDataParams): Promise<GamesDropCheckGameDataResponse> {
    const payload: any = {
      offerId: Number(params.offerId),
      gameUserId: String(params.gameUserId)
    };
    if (params.gameServerId) {
      payload.gameServerId = String(params.gameServerId);
    }

    return await gamesDropClient.request<GamesDropCheckGameDataResponse>('/api/v1/offers/check-game-data', {
      method: 'POST',
      body: payload
    });
  }

  /**
   * Server List Discovery
   * POST /api/v1/partner/product-offer/servers
   */
  public async getServers(offerId: number): Promise<GamesDropServersResponse> {
    return await gamesDropClient.request<GamesDropServersResponse>('/api/v1/partner/product-offer/servers', {
      method: 'POST',
      body: { offerId: Number(offerId) }
    });
  }

  /**
   * Telegram Username to Numeric User ID Resolution
   * POST https://gamesdrop.io/api/aggregator/a6/telegram/user-info
   * Never stores telegram tokens or secrets.
   */
  public async resolveTelegramUser(username: string): Promise<{
    valid: boolean;
    userId?: number;
    firstName?: string;
    username?: string;
    photoUrl?: string;
    message?: string;
  }> {
    const clean = username.trim();
    if (!clean) {
      return { valid: false, message: 'يرجى إدخال اسم المستخدم لحساب تيليجرام.' };
    }

    // If already numeric ID
    if (/^\d+$/.test(clean)) {
      return {
        valid: true,
        userId: Number(clean),
        username: clean
      };
    }

    try {
      const res = await gamesDropClient.request<any>('https://gamesdrop.io/api/aggregator/a6/telegram/user-info', {
        method: 'POST',
        body: { username: clean.startsWith('@') ? clean : `@${clean}` },
        timeoutMs: 10000
      });

      if (res && res.valid && res.userInfo && res.userInfo.id) {
        return {
          valid: true,
          userId: Number(res.userInfo.id),
          firstName: res.userInfo.first_name,
          username: res.userInfo.username,
          photoUrl: res.userInfo.photo_url,
          message: res.message || 'تم التحقق من حساب تيليجرام بنجاح.'
        };
      }

      return {
        valid: false,
        message: 'اسم المستخدم صالح لكن المعرف الرقمي غير متاح علناً. يرجى إدخال معرّف تيليجرام الرقمي (User ID) مباشرة أو بدء محادثة مع البوت @gamesdrop_api_bot أولاً.'
      };
    } catch (err: any) {
      console.warn('[GamesDrop resolveTelegramUser] Failed to resolve username:', err.message);
      return {
        valid: false,
        message: 'تعذر التحقق من اسم المستخدم تلقائياً. يرجى إدخال معرّف تيليجرام الرقمي (User ID) الخاص بك مباشرة.'
      };
    }
  }

  /**
   * Catalog Synchronization (for future production sync)
   * POST /api/v1/offers/sync
   */
  public async syncOffers(params: GamesDropSyncParams = {}): Promise<GamesDropSyncResponse> {
    return await gamesDropClient.request<GamesDropSyncResponse>('/api/v1/offers/sync', {
      method: 'POST',
      body: {
        limit: params.limit || 1000,
        page: params.page || 1,
        ...(params.category ? { category: params.category } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.countryCode ? { countryCode: params.countryCode } : {})
      }
    });
  }
}

export const gamesDropProvider = new GamesDropProvider();
export * from './types';
export * from './mapper';
export * from './client';
