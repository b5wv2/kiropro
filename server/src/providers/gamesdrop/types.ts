/**
 * GamesDrop Partner API TypeScript Interfaces
 * Strictly based on official GamesDrop Partner API documentation
 */

export interface GamesDropCurrency {
  id: number;
  code: string;
}

export interface GamesDropBalance {
  balance: number;
  draftBalance?: number;
  draft_balance?: number;
  isPostpaid?: boolean;
  is_postpaid?: boolean;
  balanceProfile?: 'FIAT' | 'USDT' | 'MIXED';
  balance_profile?: 'FIAT' | 'USDT' | 'MIXED';
  partnerId?: number;
  partner_id?: number;
  shopId?: number;
  shop_id?: number;
  shopName?: string;
  shop_name?: string;
  currency?: GamesDropCurrency;
}

export interface GamesDropPriceBreakdown {
  addedPercent?: number;
  currency?: string;
  fxRate?: number;
  isPriceFresh?: boolean;
  price?: number;
  providerCurrency?: string;
  providerPrice?: number;
}

export interface GamesDropOffer {
  offerId: number;
  offerGroupId?: number;
  productName: string;
  offerName: string;
  price: number;
  currency: string;
  priceBreakdown?: GamesDropPriceBreakdown;
  count?: number;
  isReturnDataForCustomer: boolean;
  isRequiredGameUserId?: boolean;
  isRequiredGameServerId?: boolean;
  platformCode?: string;
  platformName?: string;
  regionCode?: string;
  regionName?: string;
  regionalLimitations?: string;
  excludedCountryCodes?: string[];
  countryCompatibility?: 'allowed' | 'blocked' | 'unverified' | 'not_checked';
  inStock?: boolean;
  selectedTextStock?: number;
  quoteCheckedAt?: string;
  quoteExpiresAt?: string;
  isPriceFresh?: boolean;
  settlementMethod?: 'FIAT' | 'USDT' | 'MIXED';
  balanceProfile?: 'FIAT' | 'USDT' | 'MIXED';
  isSettlementCompatible?: boolean;
}

export interface GamesDropCustomerData {
  email?: string;
  gameUserId?: string;
  gameServerId?: string;
}

export interface GamesDropCreateOrderParams {
  offerId: number;
  price: number;
  transactionId: string;
  countryCode?: string;
  keyFormat?: 'text' | 'image';
  useBalance?: boolean;
  customer?: GamesDropCustomerData;
}

export type GamesDropOrderStatus = 
  | 'SUBMITTED' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'CANCELED' 
  | 'FAILED' 
  | 'REFUND';

export interface GamesDropOrderResponse {
  orderId?: number;
  order_id?: number;
  count?: number;
  price: number;
  currency: string;
  offerId?: number;
  offer_id?: number;
  productName?: string;
  product_name?: string;
  offerName?: string;
  offer_name?: string;
  status: GamesDropOrderStatus;
  isReturnDataForCustomer?: boolean;
  is_return_data_for_customer?: boolean;
  key?: string;
  message?: string;
  transactionId?: string;
  transaction_id?: string;
  createdAt?: string;
  created_at?: string;
  selected_key_format?: string;
  fulfillment_items?: any[];
}

export interface GamesDropCheckGameDataParams {
  offerId: number;
  gameUserId: string;
  gameServerId?: string;
}

export interface GamesDropCheckGameDataResponse {
  status: 'VALID' | 'INVALID';
  gameUserLogin?: string;
}

export type GamesDropServersResponse = Record<string, string>;

export interface GamesDropSyncParams {
  limit?: number;
  page?: number;
  category?: string;
  search?: string;
  countryCode?: string;
}

export interface GamesDropSyncResponse {
  count: number;
  rows: Array<{
    productId?: number;
    productName: string;
    offerGroupId: number;
    offerGroupName: string;
    platformCode?: string;
    platformName?: string;
    regionCode?: string;
    regionName?: string;
    regionalLimitations?: string;
    excludedCountryCodes?: string[];
    countryCompatibility?: string;
    productOfferId?: number;
    providerProductId?: string;
    providerOfferId?: string;
    sellerOfferCount?: number;
    selectedTextStock?: number;
    price: number;
    currency: string;
    isPriceFresh?: boolean;
    inStock?: boolean;
    isRequiredGameUserId?: boolean;
    isRequiredGameServerId?: boolean;
  }>;
}
