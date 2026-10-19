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

/**
 * Classifies network drops, socket timeouts, and ambiguous gateway responses (SEC-FIN-05)
 * Prevents double fulfillment caused by treating unknown provider states as definitive failures.
 */
export function isAmbiguousNetworkError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || err.cause?.code || '').toUpperCase();
  const msg = String(err.message || '').toUpperCase();
  const status = Number(err.status || err.response?.status || 0);

  // Timeout indicators
  if (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    code === 'TIMEOUT' ||
    msg.includes('TIMEOUT') ||
    msg.includes('ETIMEDOUT')
  ) {
    return true;
  }

  // Network connection drops after send
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    msg.includes('ECONNRESET') ||
    msg.includes('SOCKET HANG UP')
  ) {
    return true;
  }

  // Server error codes where upstream may have accepted request
  if (status === 502 || status === 504 || status === 503) {
    return true;
  }

  return false;
}

