import { Game, Order } from '../types';
import { api } from '../lib/api';

let cachedGames: { data: Game[]; timestamp: number } | null = null;
let inFlightGamesPromise: Promise<Game[]> | null = null;
const GAMES_CACHE_TTL_MS = 30 * 1000; // 30 seconds local memory cache

/**
 * Fetch real products from KIROPRO API.
 * Deduplicates concurrent calls (e.g. React 18 StrictMode mount)
 * and caches results in-memory for 30s to prevent duplicate request storms.
 */
export async function fetchGames(forceRefresh = false): Promise<Game[]> {
  const now = Date.now();
  if (!forceRefresh && cachedGames && (now - cachedGames.timestamp < GAMES_CACHE_TTL_MS)) {
    return cachedGames.data;
  }

  if (inFlightGamesPromise) {
    return inFlightGamesPromise;
  }

  inFlightGamesPromise = api.get<Game[]>('/api/products')
    .then((data) => {
      cachedGames = { data, timestamp: Date.now() };
      inFlightGamesPromise = null;
      return data;
    })
    .catch((err) => {
      inFlightGamesPromise = null;
      if (cachedGames) {
        console.warn('[fetchGames] Returning cached catalog due to API error:', err?.message);
        return cachedGames.data;
      }
      throw err;
    });

  return inFlightGamesPromise;
}

export interface PlayerValidationResponse {
  valid: boolean;
  playerName?: string;
  message?: string;
}

export async function verifyPlayerId(
  productId: string, 
  playerId: string, 
  serverId?: string
): Promise<PlayerValidationResponse> {
  if (!playerId || !playerId.trim()) {
    return { valid: false, message: "يرجى إدخال معرّف اللاعب (Player ID)" };
  }

  try {
    const res = await api.post<PlayerValidationResponse>(`/api/products/${productId}/validate-player`, {
      gameUserId: playerId.trim(),
      gameServerId: serverId ? serverId.trim() : undefined
    });
    return res;
  } catch (err: any) {
    const status = err?.status || err?.response?.status;
    const errorMsg = err?.message || err?.response?.data?.error || err?.response?.data?.message;

    if (status === 429) {
      return {
        valid: false,
        message: 'تم تجاوز الحد المسموح لعمليات التحقق. حاول مرة أخرى بعد قليل.'
      };
    }

    return {
      valid: false,
      message: errorMsg || 'تعذر التحقق من معرّف اللاعب. تأكد من الرقم وحاول مرة أخرى.'
    };
  }
}

export async function fetchProductServers(productId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await api.get<{ servers: Array<{ id: string; name: string }> }>(`/api/products/${productId}/servers`);
    return res.servers || [];
  } catch (err) {
    console.error('Failed to fetch game servers:', err);
    return [];
  }
}

export interface PromoValidationResult {
  valid: boolean;
  type: 'DISCOUNT' | 'WALLET_CREDIT';
  code: string;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountValue?: number;
  discountCurrency?: string;
  appliedCurrency?: string;
  maxDiscount?: number | null;
  calculatedDiscount?: number;
  discount?: number;
  discountAmount?: number;
  cartTotal?: number;
  finalTotal?: number;
  creditAmount?: number;
  exchangeRateUsed?: number;
  discountLabel?: string;
  message?: string;
  error?: string;
}

export async function validatePromoCode(
  code: string, 
  cartTotal?: number, 
  currency?: string, 
  purpose: 'CHECKOUT_DISCOUNT' | 'WALLET_REDEEM' = 'CHECKOUT_DISCOUNT'
): Promise<PromoValidationResult> {
  return api.post('/api/promo-codes/validate', { code, cartTotal, currency, purpose });
}

export async function redeemWalletCreditCode(code: string): Promise<{ success: boolean; newBalance: number; creditAmount: number; message: string }> {
  return api.post('/api/promo-codes/redeem-credit', { code });
}

export async function createOrder(payload: {
  gameId: string;
  packageId: string;
  packageName: string;
  playerId: string;
  serverId?: string;
  playerName?: string;
  amount?: number;
  promoCode?: string;
}): Promise<Order> {
  const data = await api.post('/api/orders', payload);
  
  const newOrder: Order = {
    id: data.id,
    gameId: payload.gameId,
    packageId: payload.packageId,
    packageName: payload.packageName,
    playerId: payload.playerId,
    amount: data.chargedAmount,
    currency: data.chargedCurrency || 'SDG',
    status: data.status,
    fulfillmentKey: data.key,
    key: data.key,
    createdAt: new Date().toISOString()
  };
  return newOrder;
}

export async function adminManualExecuteOrder(orderId: string): Promise<{
  success: boolean;
  message: string;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  providerOrderId?: number | null;
  providerStatus?: string | null;
}> {
  return api.post(`/api/admin/orders/${orderId}/manual-execute`);
}

export async function adminValidateOrderPlayer(orderId: string): Promise<PlayerValidationResponse> {
  return api.post(`/api/admin/orders/${orderId}/validate-player`);
}

export async function fetchMyOrders(): Promise<Order[]> {
  return api.get('/api/orders/my-orders');
}

export async function fetchOrderById(orderId: string): Promise<Order> {
  return api.get(`/api/orders/${orderId}`);
}

export async function fetchAdminCatalog(params?: { 
  page?: number; 
  limit?: number; 
  search?: string; 
  status?: string;
  gameCategory?: string;
}): Promise<import('../types').AdminCatalogResponse> {
  return api.get('/api/products/admin/catalog', { params });
}

export async function updateAdminProduct(
  id: string, 
  data: Partial<import('../types').AdminProduct>
): Promise<{ success: boolean; product: import('../types').AdminProduct }> {
  return api.patch(`/api/products/admin/products/${id}`, data);
}

export async function toggleAdminProductActive(
  id: string
): Promise<{ success: boolean; product: import('../types').AdminProduct }> {
  return api.post(`/api/products/admin/products/${id}/toggle-active`);
}

export async function syncProviderPrices(
  payload: { scope: 'ACTIVE' | 'ALL' | 'SELECTED'; productIds?: string[] }
): Promise<{ success: boolean; message: string; results: any }> {
  return api.post('/api/products/admin/products/sync-prices', payload);
}

export async function uploadProductImage(
  file: File
): Promise<{ success: boolean; url: string; imageUrl?: string }> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await api.upload<any>('/api/products/admin/products/upload-image', formData);
  const finalUrl = res.url || res.imageUrl;
  return {
    success: res.success,
    url: finalUrl,
    imageUrl: finalUrl
  };
}

export async function fetchAdminCategories(): Promise<import('../types').GameCategory[]> {
  return api.get('/api/products/admin/categories');
}

export async function updateAdminCategory(
  id: string,
  data: Partial<import('../types').GameCategory>
): Promise<{ success: boolean; category: import('../types').GameCategory; message: string }> {
  return api.patch(`/api/products/admin/categories/${id}`, data);
}

export async function uploadAdminCategoryImage(
  id: string,
  file: File
): Promise<{ success: boolean; imageUrl: string; category: import('../types').GameCategory; message: string }> {
  const formData = new FormData();
  formData.append('image', file);
  return api.upload(`/api/products/admin/categories/${id}/upload-image`, formData);
}

export async function removeAdminCategoryImage(
  id: string
): Promise<{ success: boolean; category: import('../types').GameCategory; message: string }> {
  return api.delete(`/api/products/admin/categories/${id}/image`);
}

