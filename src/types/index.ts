export interface GamePackage {
  id: string;
  name: string;
  englishName?: string;
  arabicName?: string;
  description?: string;
  subCategory?: string;
  productType?: string;
  imageUrl?: string;
  price: number;
  priceSdg?: number;
  originalPrice?: number;
  originalPriceSdg?: number;
  bestValue?: boolean;
  requiresGameServerId?: boolean;
  isRequiredGameServerId?: boolean;
}

export interface GameCategory {
  id: string;
  name: string;
  arabicName: string;
  imageUrl: string | null;
  platform?: string;
  badge?: string;
  deliveryTime?: string;
  idFieldLabel?: string;
  idPlaceholder?: string;
  displayOrder?: number;
  isActive?: boolean;
  activeProductCount?: number;
  totalProductCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Game {
  id: string;
  name: string;
  category: 'mobile' | 'pc' | 'cards' | 'subscriptions' | 'digital';
  badge: string;
  deliveryTime: string;
  minPrice: number;
  minPriceSdg?: number;
  currency: string;
  exchangeRate?: number;
  type: string;
  image: string;
  popular?: boolean;
  packages: GamePackage[];
  idFieldLabel: string;
  idPlaceholder: string;
}

export interface Product {
  id: string;
  name: string;
  game: string;
  price: number;
  currency: string;
  providerProductId?: string;
  active: boolean;
}

export interface Order {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  gameId: string;
  packageId: string;
  packageName: string;
  playerId: string;
  serverId?: string;
  playerName?: string;
  amount: number;
  currency?: string;
  customerPriceUsd?: number;
  chargedAmount?: number;
  chargedCurrency?: string;
  exchangeRateUsed?: number;
  discountAmount?: number;
  cashbackAmount?: number;
  providerCostUsd?: number;
  providerPrice?: number;
  promoCode?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  fulfillmentKey?: string;
  key?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface WalletTransaction {
  id: string;
  walletId?: string;
  type: string; // 'TOPUP' | 'PURCHASE' | 'REFUND' | 'CASHBACK' | 'PROMO_CREDIT' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT'
  amount: number;
  currency?: string;
  source_amount_usd?: number;
  exchange_rate?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
  createdAt?: string;
  date?: string;
}

export interface CashbackRule {
  id: string;
  name: string;
  percentage: number;
  max_cashback_usd: number | null;
  scope_type: 'ALL_PRODUCTS' | 'CATEGORY' | 'SELECTED_PRODUCTS';
  eligible_ids: string[];
  usage_limit_total: number | null;
  usage_limit_per_user: number;
  max_cashback_per_user_usd: number | null;
  allow_promo_stacking: boolean;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  creatorName?: string;
  totalRedemptionsCount?: number;
  totalCashbackGivenUsd?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  type: 'DISCOUNT' | 'WALLET_CREDIT';
  discount_type?: 'PERCENTAGE' | 'FIXED';
  discount_value?: number;
  max_discount?: number;
  credit_amount?: number;
  currency?: 'USD' | 'SDG';
  usage_limit?: number;
  usage_count: number;
  per_user_limit: number;
  is_active: boolean;
  starts_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface TrustIndicator {
  title: string;
  sub: string;
  icon: 'zap' | 'wallet' | 'clock' | 'help';
}

export interface FeatureItem {
  title: string;
  description: string;
  iconSvg: string;
}

export interface StepItem {
  step: string;
  title: string;
  description: string;
}

export interface AdminProduct {
  id: string;
  providerOfferId: number;
  productId?: number;
  productName: string;
  offerName: string;
  platformCode?: string;
  platformName?: string;
  regionCode?: string;
  regionName?: string;
  supplierCostUsd: number;
  gamesDropCostUsd: number;
  gamesDropAddedPercent?: number;
  gamesDropFxRate?: number;
  providerCostUsd: number;
  customerPriceUsd: number | null;
  profitUsd: number | null;
  isActive: boolean;
  inStock: boolean;
  imageUrl?: string | null;
  displayOrder: number;
  isFeatured: boolean;
  requiresGameUserId: boolean;
  requiresGameServerId: boolean;
  arabicName?: string | null;
  description?: string | null;
  subCategory?: string | null;
  productType?: string | null;
  gameCategoryId?: string | null;
  category?: string;
  lastProviderSyncAt?: string | null;
}

export interface AdminCatalogResponse {
  products: AdminProduct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    totalCatalog: number;
    activeCount: number;
    inactiveCount: number;
  };
}
