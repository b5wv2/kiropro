/**
 * Unified Provider Interface & Types for Koara
 * Enables multi-provider scalability (GamesDrop, G2Bulk, and future providers)
 * Supports exactOptionalPropertyTypes: true
 */

export interface ProviderCapabilities {
  canValidatePlayer: boolean;
  canTopup: boolean;
  canCheckBalance: boolean;
  canCheckOrderStatus: boolean;
  canSyncCatalog: boolean;
  hasServers: boolean;
}

export interface ProviderBalance {
  provider: string;
  balance: number;
  currency: string;
  isPostpaid?: boolean | undefined;
  raw?: any;
}

export interface PlayerValidationParams {
  productId?: string | undefined;
  providerProductId?: string | undefined;
  gameCode?: string | undefined;
  playerUserId: string;
  serverZoneId?: string | undefined;
  charName?: string | undefined;
}

export interface PlayerValidationResult {
  valid: boolean;
  playerName?: string | undefined;
  serverName?: string | undefined;
  rawResponse?: any;
  message?: string | undefined;
}

export interface CreateTopupOrderParams {
  koaraOrderId: string;
  providerProductId: string; // offerId for GamesDrop, catalogue name or id for G2Bulk
  gameCode?: string | undefined;
  playerUserId: string;
  serverZoneId?: string | undefined;
  charName?: string | undefined;
  customerEmail?: string | undefined;
  idempotencyKey?: string | undefined; // 36-char UUID
  expectedPriceUsd?: number | undefined;
  callbackUrl?: string | undefined;
  remark?: string | undefined;
}

export type ProviderCanonicalStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';

export interface CreateTopupOrderResult {
  success: boolean;
  provider: string;
  providerOrderId: string | number;
  providerStatus: string;
  canonicalStatus: ProviderCanonicalStatus;
  fulfillmentKey?: string | null | undefined;
  costUsd?: number | undefined;
  currency?: string | undefined;
  message?: string | undefined;
  failureReason?: string | undefined;
  isAmbiguous?: boolean | undefined; // True if network timeout/unknown state occurred
  rawResponse?: any;
}

export interface GetOrderStatusResult {
  provider: string;
  providerOrderId: string | number;
  providerStatus: string;
  canonicalStatus: ProviderCanonicalStatus;
  isTerminal: boolean;
  fulfillmentKey?: string | null | undefined;
  message?: string | undefined;
  rawResponse?: any;
}

export interface ProviderCatalogItem {
  provider: string;
  providerProductId: string;
  gameCode: string;
  gameName: string;
  denominationName: string;
  costUsd: number;
  currency: string;
  inStock: boolean;
  metadata?: Record<string, any> | undefined;
}

export interface ProviderAdapter {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  getBalance(): Promise<ProviderBalance>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string | undefined }>;
  validatePlayer(params: PlayerValidationParams): Promise<PlayerValidationResult>;
  createTopupOrder(params: CreateTopupOrderParams): Promise<CreateTopupOrderResult>;
  getOrderStatus(providerOrderId: string | number): Promise<GetOrderStatusResult>;
  syncCatalog?(gameCode?: string): Promise<ProviderCatalogItem[]>;
}
