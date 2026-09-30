import { Game, Order, DigitalAccountCredential } from '../types';
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
  quantity?: number;
}): Promise<Order> {
  const data = await api.post('/api/orders', payload);
  
  const newOrder: Order = {
    id: data.id || data.orderId,
    gameId: payload.gameId,
    packageId: payload.packageId,
    packageName: payload.packageName,
    playerId: payload.playerId,
    amount: data.chargedAmount || data.amount,
    currency: data.chargedCurrency || data.currency || 'SDG',
    status: data.status,
    orderType: data.orderType || (data.isDigitalAccount ? 'DIGITAL_ACCOUNT' : undefined),
    quantity: data.quantity || payload.quantity || 1,
    unitPrice: data.unitPrice,
    credentials: data.credentials,
    accounts: data.accounts || data.credentials,
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

export interface GamesDropCatalogSyncResult {
  success: boolean;
  message: string;
  stats: {
    productsChecked: number;
    newOffers: number;
    updatedOffers: number;
    priceChanges: number;
    outOfStock: number;
    lastSyncTime: string;
    details?: {
      likeeOffers: number;
      telegramStarsOffers: number;
      telegramPremiumOffers: number;
    };
  };
}

export async function triggerGamesDropCatalogSync(): Promise<GamesDropCatalogSyncResult> {
  return api.post('/api/admin/providers/gamesdrop/sync');
}

export async function fetchGamesDropSyncStatus(): Promise<{ success: boolean; stats: GamesDropCatalogSyncResult['stats'] }> {
  return api.get('/api/admin/providers/gamesdrop/sync-status');
}

// ----------------------------------------------------
// Digital Product Accounts (Google Play Points, etc.)
// ----------------------------------------------------

export async function fetchDigitalAccountStats(productId?: string): Promise<{ success: boolean; stats: import('../types').DigitalAccountStats }> {
  return api.get('/api/admin/digital-accounts/stats', { params: { productId } });
}

export async function fetchDigitalAccounts(params?: {
  productId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  accounts: import('../types').DigitalAccount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  return api.get('/api/admin/digital-accounts', { params });
}

export async function createDigitalAccount(data: {
  productId: string;
  email: string;
  password: string;
  status?: string;
}): Promise<{ success: boolean; account: import('../types').DigitalAccount; message: string }> {
  return api.post('/api/admin/digital-accounts', data);
}

export async function bulkImportDigitalAccounts(data: {
  productId: string;
  rawData?: string;
  items?: Array<{ email: string; password: string }>;
}): Promise<{
  success: boolean;
  inserted: number;
  rejected: number;
  errors: string[];
  message: string;
}> {
  return api.post('/api/admin/digital-accounts/bulk', data);
}

export async function updateDigitalAccount(
  id: string,
  data: { email?: string; password?: string; status?: string }
): Promise<{ success: boolean; account: import('../types').DigitalAccount; message: string }> {
  return api.patch(`/api/admin/digital-accounts/${id}`, data);
}

export async function deleteDigitalAccount(id: string): Promise<{ success: boolean; message: string }> {
  return api.delete(`/api/admin/digital-accounts/${id}`);
}

export async function revealDigitalAccountPassword(id: string): Promise<{
  success: boolean;
  id: string;
  email: string;
  password: string;
}> {
  return api.post(`/api/admin/digital-accounts/${id}/reveal`);
}

export async function fetchAdminDigitalProducts(): Promise<Array<{
  id: string;
  productName: string;
  arabicName: string;
  offerName: string;
  category?: string;
  productType?: string;
  inStock?: boolean;
}>> {
  return api.get('/api/admin/digital-accounts/products');
}

export async function fetchOrderCredentials(orderId: string): Promise<{
  success: boolean;
  orderId?: string;
  packageName?: string;
  quantity?: number;
  credentials: DigitalAccountCredential[];
  accounts?: DigitalAccountCredential[];
  email?: string;
  password?: string;
  isDigitalAccount?: boolean;
  orderStatus?: string;
}> {
  return api.get(`/api/orders/${orderId}/credentials`);
}


