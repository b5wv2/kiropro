import { api } from '../lib/api';

export interface AllowedCountry {
  code: string;
  nameAr: string;
  nameEn: string;
  flag: string;
}

export interface AllowedService {
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string;
}

export interface VirtualNumberProduct {
  countryCode: string;
  serviceCode: string;
  priceSdg: number;
  isActive: boolean;
}

export interface VirtualNumberCatalog {
  settings: {
    isSystemActive: boolean;
    freeAttemptsLimit: number;
    defaultPaidPriceSdg: number;
  };
  allowedCountries: AllowedCountry[];
  allowedServices: AllowedService[];
  products: VirtualNumberProduct[];
}

export interface UserAttemptsInfo {
  usedAttempts: number;
  freeLimit: number;
  freeRemaining: number;
  isNextFree: boolean;
  nextPriceSdg: number;
}

export interface VirtualNumberOrder {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  countryCode: string;
  countryNameAr: string;
  serviceCode: string;
  serviceNameAr: string;
  providerOrderId?: string | null;
  phoneNumber?: string | null;
  operator?: string | null;
  smsCode?: string | null;
  smsText?: string | null;
  smsReceivedAt?: string | null;
  status: 'PENDING' | 'WAITING_FOR_NUMBER' | 'NUMBER_RECEIVED' | 'WAITING_FOR_CODE' | 'CODE_RECEIVED' | 'COMPLETED' | 'CANCEL_REQUESTED' | 'CANCELED' | 'REFUNDED' | 'FAILED' | 'EXPIRED';
  attemptNumber: number;
  isFreeAttempt: boolean;
  chargedAmount: number;
  chargedCurrency: string;
  isRefunded: boolean;
  failureReason?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchVirtualNumberCatalog(): Promise<VirtualNumberCatalog> {
  return api.get<VirtualNumberCatalog>('/api/virtual-numbers/catalog');
}

export async function fetchUserAttempts(): Promise<UserAttemptsInfo> {
  return api.get<UserAttemptsInfo>('/api/virtual-numbers/attempts');
}

export async function createVirtualNumberOrder(countryCode: string, serviceCode: string): Promise<VirtualNumberOrder> {
  return api.post<VirtualNumberOrder>('/api/virtual-numbers/orders', {
    countryCode,
    serviceCode
  });
}

export async function fetchVirtualNumberOrder(orderId: string): Promise<VirtualNumberOrder> {
  return api.get<VirtualNumberOrder>(`/api/virtual-numbers/orders/${encodeURIComponent(orderId)}`);
}

export async function cancelVirtualNumberOrder(orderId: string): Promise<{ success: boolean; message: string; order: VirtualNumberOrder }> {
  return api.post<{ success: boolean; message: string; order: VirtualNumberOrder }>(`/api/virtual-numbers/orders/${encodeURIComponent(orderId)}/cancel`, {});
}

export async function fetchMyVirtualNumberOrders(): Promise<VirtualNumberOrder[]> {
  return api.get<VirtualNumberOrder[]>('/api/virtual-numbers/my-orders');
}

// Admin APIs
export async function fetchAdminVirtualNumberOrders(params: {
  status?: string;
  countryCode?: string;
  serviceCode?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; orders: VirtualNumberOrder[] }> {
  const query = new URLSearchParams();
  if (params.status) query.append('status', params.status);
  if (params.countryCode) query.append('countryCode', params.countryCode);
  if (params.serviceCode) query.append('serviceCode', params.serviceCode);
  if (params.limit) query.append('limit', String(params.limit));
  if (params.offset) query.append('offset', String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return api.get<{ total: number; orders: VirtualNumberOrder[] }>(`/api/admin/virtual-numbers/orders${qs}`);
}

export async function fetchAdminVirtualNumberSettings(): Promise<{
  settings: {
    id: number;
    free_attempts_limit: number;
    default_paid_price_sdg: number;
    is_system_active: boolean;
  };
  provider: any;
  providerError: string | null;
}> {
  return api.get('/api/admin/virtual-numbers/settings');
}

export async function updateAdminVirtualNumberSettings(body: {
  freeAttemptsLimit?: number;
  defaultPaidPriceSdg?: number;
  isSystemActive?: boolean;
}): Promise<any> {
  return api.put('/api/admin/virtual-numbers/settings', body);
}

export async function fetchAdminVirtualNumberProducts(): Promise<any[]> {
  return api.get<any[]>('/api/admin/virtual-numbers/products');
}

export async function updateAdminVirtualNumberProduct(id: string, body: {
  customPriceSdg?: number | null;
  isActive?: boolean;
}): Promise<any> {
  return api.put(`/api/admin/virtual-numbers/products/${encodeURIComponent(id)}`, body);
}

export async function fetchAdminProviderStatus(): Promise<any> {
  return api.get('/api/admin/virtual-numbers/provider-status');
}
