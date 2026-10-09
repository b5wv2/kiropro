import { api, BASE_URL } from '../lib/api';

export interface MarketplaceSettings {
  fee_15_days: number;
  fee_30_days: number;
  currency: string;
  max_images: number;
  max_image_size_mb: number;
  enabled: boolean;
}

export interface GameCategoryInfo {
  id: 'PUBG_MOBILE' | 'FREE_FIRE';
  name: string;
  titleArabic: string;
  bindings: string[];
  levels: string[];
}

export interface AccountListing {
  id: string;
  public_code: string;
  slug: string;
  game: 'PUBG_MOBILE' | 'FREE_FIRE';
  title: string;
  price: number;
  price_currency: string;
  is_negotiable: boolean;
  account_level: string;
  rank?: string;
  binding_type: string;
  starts_at?: string;
  expires_at?: string;
  published_at?: string;
  created_at: string;
  primary_image?: string;
  total_images: number;
}

export interface ListingImage {
  id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface AccountListingDetail extends AccountListing {
  description: string;
  notes?: string;
  status: string;
  duration_days: number;
  images: ListingImage[];
  whatsappContactUrl?: string;
}

export interface MyAccountListing extends AccountListing {
  status: 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED' | 'SOLD' | 'CANCELLED' | 'REFUNDED';
  duration_days: number;
  listing_fee: number;
  sold_at?: string;
  rejection_reason?: string;
  rejection_notes?: string;
  cancellation_reason?: string;
  days_remaining: number;
}

export interface CreateListingPayload {
  paymentId: string;
  game: 'PUBG_MOBILE' | 'FREE_FIRE';
  title: string;
  price: number;
  isNegotiable: boolean;
  accountLevel: string;
  bindingType: string;
  description: string;
  notes?: string;
  sellerWhatsapp: string;
  images: Array<{
    storageKey: string;
    imageUrl: string;
    isPrimary: boolean;
    sortOrder: number;
    fileSize: number;
    mimeType: string;
  }>;
}

export interface MarketplaceFilterParams {
  game?: string;
  level?: string;
  binding?: string;
  minPrice?: number;
  maxPrice?: number;
  negotiable?: boolean;
  sort?: 'LATEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'LEVEL_DESC';
  page?: number;
  limit?: number;
  search?: string;
}

export const marketplaceApi = {
  // Public
  getSettings: () =>
    api.get<{
      settings: MarketplaceSettings;
      games: GameCategoryInfo[];
      primaryWhatsapp: { url: string; title: string } | null;
      disclaimer: string;
    }>('/api/marketplace/settings'),

  getListings: (params?: MarketplaceFilterParams) =>
    api.get<{
      listings: AccountListing[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>('/api/marketplace/listings', { params: params as any }),

  getListing: (code: string) =>
    api.get<{
      listing: AccountListingDetail;
    }>(`/api/marketplace/listings/${encodeURIComponent(code)}`),

  // Seller Actions & Draft
  payFee: (durationDays: 15 | 30, idempotencyKey?: string, initialGame?: string) =>
    api.post<{
      success: boolean;
      message: string;
      paymentId: string;
      durationDays: number;
      amount: number;
      currency: string;
      paidAt: string;
      draftData?: any;
      newBalance?: number;
    }>('/api/marketplace/pay-fee', { durationDays, idempotencyKey, initialGame }),

  getActiveDraft: () =>
    api.get<{
      hasDraft: boolean;
      payment?: {
        id: string;
        durationDays: number;
        amount: number;
        currency: string;
        paidAt: string;
      };
      draftData?: any;
    }>('/api/marketplace/draft'),

  saveDraft: (paymentId: string, draftData: any) =>
    api.put<{
      success: boolean;
      message: string;
    }>('/api/marketplace/draft', { paymentId, draftData }),

  uploadImages: async (files: File[]) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });

    const response = await fetch(`${BASE_URL}/api/marketplace/upload-images`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'فشل رفع الصور');
    }
    return data as {
      success: boolean;
      images: Array<{
        storageKey: string;
        imageUrl: string;
        fileSize: number;
        mimeType: string;
      }>;
    };
  },

  createListing: (payload: CreateListingPayload) =>
    api.post<{
      success: boolean;
      message: string;
      listing: {
        id: string;
        publicCode: string;
        slug: string;
        status: string;
        createdAt: string;
      };
    }>('/api/marketplace/listings', payload),

  getMyListings: () =>
    api.get<{
      listings: MyAccountListing[];
    }>('/api/marketplace/my-listings'),

  markSold: (id: string) =>
    api.post<{
      success: boolean;
      message: string;
    }>(`/api/marketplace/listings/${id}/mark-sold`),

  renewListing: (id: string, durationDays: 15 | 30) =>
    api.post<{
      success: boolean;
      message: string;
      expiresAt: string;
      newBalance: number;
    }>(`/api/marketplace/listings/${id}/renew`, { durationDays }),

  editListing: (id: string, payload: Partial<CreateListingPayload>) =>
    api.put<{
      success: boolean;
      message: string;
      status: string;
    }>(`/api/marketplace/listings/${id}`, payload),

  // Admin APIs
  adminGetStats: () =>
    api.get<{
      stats: {
        totalListings: number;
        publishedActive: number;
        pendingReview: number;
        expired: number;
        sold: number;
        cancelled: number;
        rejected: number;
        suspended: number;
        totalFeesCollected: number;
        totalRefunded: number;
      };
      settings: MarketplaceSettings;
    }>('/api/admin/marketplace/stats'),

  adminGetListings: (params?: any) =>
    api.get<{
      listings: any[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>('/api/admin/marketplace/listings', { params }),

  adminGetListing: (id: string) =>
    api.get<{
      listing: any;
    }>(`/api/admin/marketplace/listings/${id}`),

  adminApprove: (id: string) =>
    api.post<{
      success: boolean;
      message: string;
      expiresAt: string;
    }>(`/api/admin/marketplace/listings/${id}/approve`),

  adminReject: (id: string, reason: string, notes?: string) =>
    api.post<{
      success: boolean;
      message: string;
    }>(`/api/admin/marketplace/listings/${id}/reject`, { reason, notes }),

  adminSuspend: (id: string, reason?: string) =>
    api.post<{
      success: boolean;
      message: string;
    }>(`/api/admin/marketplace/listings/${id}/suspend`, { reason }),

  adminCancelRefund: (id: string, reason: string, notes?: string) =>
    api.post<{
      success: boolean;
      message: string;
      refundAmount: number;
      newBalance: number;
    }>(`/api/admin/marketplace/listings/${id}/cancel-refund`, { reason, notes }),

  adminUpdateSettings: (settings: { fee15Days: number; fee30Days: number; enabled?: boolean }) =>
    api.put<{
      success: boolean;
      message: string;
      settings: MarketplaceSettings;
    }>('/api/admin/marketplace/settings', settings)
};
