import pool from '../db';
import {
  ProviderAdapter,
  CreateTopupOrderParams,
  CreateTopupOrderResult,
  GetOrderStatusResult,
  ProviderBalance
} from './types';
import { gamesDropAdapter } from './gamesdrop/adapter';
import { g2BulkAdapter } from './g2bulk/adapter';

export interface ProviderSettings {
  provider: string;
  ordersEnabled: boolean;
  catalogSyncEnabled: boolean;
  healthCheckEnabled: boolean;
  updatedAt: Date;
  updatedBy?: string | null;
}

export interface ProductProviderResolution {
  productId: string;
  primaryProviderName: string;
  primaryAdapter: ProviderAdapter;
  primaryProductId: string;
  primaryCostUsd: number;
  primaryMetadata: Record<string, any>;
  primaryOrdersEnabled: boolean;
  fallbackProviderName?: string | undefined;
  fallbackAdapter?: ProviderAdapter | undefined;
  fallbackProductId?: string | undefined;
  fallbackCostUsd?: number | undefined;
  fallbackMetadata?: Record<string, any> | undefined;
  fallbackOrdersEnabled: boolean;
  fallbackEnabled: boolean;
  hasAnyOrderableProvider: boolean;
}

export class ProviderRouter {
  private adapters: Map<string, ProviderAdapter> = new Map();

  constructor() {
    this.registerAdapter(gamesDropAdapter);
    this.registerAdapter(g2BulkAdapter);
  }

  public registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name.toUpperCase(), adapter);
  }

  public getAdapter(providerName: string): ProviderAdapter {
    const norm = (providerName || '').trim().toUpperCase();
    const adapter = this.adapters.get(norm);
    if (!adapter) {
      throw new Error(`Provider adapter "${providerName}" is not registered in ProviderRouter.`);
    }
    return adapter;
  }

  public getAllAdapters(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Fetch persistent settings for a specific provider from database
   */
  public async getProviderSettings(providerName: string): Promise<ProviderSettings> {
    const norm = (providerName || '').trim().toUpperCase();
    try {
      const res = await pool.query(
        `SELECT provider, orders_enabled, catalog_sync_enabled, health_check_enabled, updated_at, updated_by
         FROM provider_settings
         WHERE UPPER(provider) = $1 LIMIT 1`,
        [norm]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          provider: row.provider,
          ordersEnabled: Boolean(row.orders_enabled),
          catalogSyncEnabled: Boolean(row.catalog_sync_enabled),
          healthCheckEnabled: Boolean(row.health_check_enabled),
          updatedAt: row.updated_at,
          updatedBy: row.updated_by
        };
      }
    } catch (err: any) {
      console.warn(`[ProviderRouter] Failed to query settings for ${norm}:`, err.message);
    }

    // Default safety fallback: GamesDrop enabled, other providers disabled by default
    return {
      provider: norm,
      ordersEnabled: norm === 'GAMESDROP',
      catalogSyncEnabled: true,
      healthCheckEnabled: true,
      updatedAt: new Date(),
      updatedBy: null
    };
  }

  /**
   * Fetch all provider settings map
   */
  public async getAllProviderSettings(): Promise<Map<string, ProviderSettings>> {
    const map = new Map<string, ProviderSettings>();
    try {
      const res = await pool.query(
        `SELECT provider, orders_enabled, catalog_sync_enabled, health_check_enabled, updated_at, updated_by
         FROM provider_settings`
      );
      for (const row of res.rows) {
        map.set(row.provider.toUpperCase(), {
          provider: row.provider,
          ordersEnabled: Boolean(row.orders_enabled),
          catalogSyncEnabled: Boolean(row.catalog_sync_enabled),
          healthCheckEnabled: Boolean(row.health_check_enabled),
          updatedAt: row.updated_at,
          updatedBy: row.updated_by
        });
      }
    } catch (err: any) {
      console.warn('[ProviderRouter] Failed to query all provider settings:', err.message);
    }
    return map;
  }

  /**
   * Resolve authoritative provider routing configuration for a given product
   * Reads from product_provider_mappings, Product table, and provider_settings.
   */
  public async resolveProductProviders(productId: string): Promise<ProductProviderResolution> {
    // 1. Fetch Product header info
    const prodRes = await pool.query(
      `SELECT id, "provider", "providerOfferId", "providerCostUsd", "gamesDropCostUsd",
              "primaryProvider", "fallbackProvider", "fallbackEnabled", "offerName"
       FROM "Product"
       WHERE (id::text = $1 OR "productId"::text = $1 OR "providerOfferId"::text = $1)
       LIMIT 1`,
      [productId]
    );

    if (prodRes.rows.length === 0) {
      throw new Error(`Product not found for provider resolution: ${productId}`);
    }

    const product = prodRes.rows[0];

    // 2. Fetch all configured mappings from product_provider_mappings
    const mappingsRes = await pool.query(
      `SELECT * FROM "product_provider_mappings"
       WHERE "productId" = $1 AND "isActive" = true
       ORDER BY "isPrimary" DESC, "isFallback" ASC`,
      [product.id]
    );

    const mappings = mappingsRes.rows;
    const primaryMapping = mappings.find(m => m.isPrimary);
    const fallbackMapping = mappings.find(m => m.isFallback);

    // Fallback to legacy Product columns if no mapping row exists
    const primaryProviderName = (primaryMapping?.provider || product.primaryProvider || product.provider || 'GAMESDROP').toUpperCase();
    const primaryAdapter = this.getAdapter(primaryProviderName);
    const primaryProductId = primaryMapping?.providerProductId || String(product.providerOfferId || '');
    const primaryCostUsd = Number(primaryMapping?.providerCostUsd || product.gamesDropCostUsd || product.providerCostUsd || 0);
    const primaryMetadata = primaryMapping?.providerMetadata || {};

    const fallbackEnabled = Boolean(product.fallbackEnabled && (fallbackMapping || product.fallbackProvider));
    let fallbackProviderName: string | undefined = undefined;
    let fallbackAdapter: ProviderAdapter | undefined = undefined;
    let fallbackProductId: string | undefined = undefined;
    let fallbackCostUsd: number | undefined = undefined;
    let fallbackMetadata: Record<string, any> | undefined = undefined;

    if (fallbackEnabled) {
      fallbackProviderName = (fallbackMapping?.provider || product.fallbackProvider || '').toUpperCase();
      if (fallbackProviderName && this.adapters.has(fallbackProviderName)) {
        fallbackAdapter = this.getAdapter(fallbackProviderName);
        fallbackProductId = fallbackMapping?.providerProductId || '';
        fallbackCostUsd = fallbackMapping ? Number(fallbackMapping.providerCostUsd) : undefined;
        fallbackMetadata = fallbackMapping?.providerMetadata || {};
      }
    }

    // 3. Query persistent global provider settings
    const primarySettings = await this.getProviderSettings(primaryProviderName);
    const fallbackSettings = fallbackProviderName ? await this.getProviderSettings(fallbackProviderName) : null;

    const primaryOrdersEnabled = primarySettings.ordersEnabled;
    const fallbackOrdersEnabled = Boolean(fallbackSettings?.ordersEnabled);
    const isFallbackUsable = Boolean(fallbackEnabled && fallbackAdapter && fallbackProductId && fallbackOrdersEnabled);
    const hasAnyOrderableProvider = primaryOrdersEnabled || isFallbackUsable;

    return {
      productId: product.id,
      primaryProviderName,
      primaryAdapter,
      primaryProductId,
      primaryCostUsd,
      primaryMetadata,
      primaryOrdersEnabled,
      fallbackProviderName,
      fallbackAdapter,
      fallbackProductId,
      fallbackCostUsd,
      fallbackMetadata,
      fallbackOrdersEnabled,
      fallbackEnabled: Boolean(fallbackEnabled && fallbackAdapter && fallbackProductId),
      hasAnyOrderableProvider
    };
  }

  /**
   * Execute Top-Up with Safe Fallback Rules and Global Provider Controls
   * Strictly guarantees:
   * 1. If provider.orders_enabled = false -> NEVER createTopupOrder().
   * 2. NEVER double fulfill a customer order.
   * 3. If primary state is ambiguous (timeout, network drop), transitions to PROVIDER_UNKNOWN and halts.
   */
  public async executeTopupOrder(
    baseParams: Omit<CreateTopupOrderParams, 'providerProductId'>,
    routing: ProductProviderResolution
  ): Promise<CreateTopupOrderResult & { fallbackUsed?: boolean | undefined }> {
    console.log(`[ProviderRouter] Evaluating order ${baseParams.koaraOrderId} (Primary: ${routing.primaryProviderName}, Enabled: ${routing.primaryOrdersEnabled})`);

    // Guard 1: Verify Primary Provider's global orders_enabled
    const primarySettings = await this.getProviderSettings(routing.primaryProviderName);
    if (!primarySettings.ordersEnabled) {
      console.warn(`[ProviderRouter] Primary provider ${routing.primaryProviderName} is globally DISABLED for orders.`);

      // If fallback is configured and order-enabled, route directly to fallback
      if (routing.fallbackEnabled && routing.fallbackAdapter && routing.fallbackProductId) {
        const fallbackSettings = await this.getProviderSettings(routing.fallbackProviderName!);
        if (fallbackSettings.ordersEnabled) {
          console.log(`[ProviderRouter] Routing order directly to Fallback ${routing.fallbackProviderName} because Primary is globally disabled.`);
          const fallbackParams: CreateTopupOrderParams = {
            ...baseParams,
            providerProductId: routing.fallbackProductId,
            gameCode: routing.fallbackMetadata?.gameCode || baseParams.gameCode,
            expectedPriceUsd: routing.fallbackCostUsd || 0
          };
          const fallbackResult = await routing.fallbackAdapter.createTopupOrder(fallbackParams);
          return {
            ...fallbackResult,
            fallbackUsed: true,
            message: fallbackResult.message || `تم التوجيه للمزود الاحتياطي (${routing.fallbackProviderName}) لتعطيل المزود الأساسي.`
          };
        }
      }

      // No orderable provider available
      return {
        success: false,
        provider: routing.primaryProviderName,
        providerOrderId: 0,
        providerStatus: 'PROVIDER_DISABLED',
        canonicalStatus: 'FAILED',
        isAmbiguous: false,
        fallbackUsed: false,
        message: `المزود الأساسي (${routing.primaryProviderName}) معطل حالياً لاستقبال الطلبات من قبل الإدارة.`
      };
    }

    // 1. Attempt Primary Provider
    const primaryParams: CreateTopupOrderParams = {
      ...baseParams,
      providerProductId: routing.primaryProductId,
      gameCode: routing.primaryMetadata?.gameCode || baseParams.gameCode,
      expectedPriceUsd: routing.primaryCostUsd
    };

    let primaryResult: CreateTopupOrderResult;
    try {
      primaryResult = await routing.primaryAdapter.createTopupOrder(primaryParams);
    } catch (primErr: any) {
      console.error(`[ProviderRouter] Unhandled adapter error for primary ${routing.primaryProviderName}:`, primErr.message);
      primaryResult = {
        success: false,
        provider: routing.primaryProviderName,
        providerOrderId: 0,
        providerStatus: 'CONNECTION_FAILED',
        canonicalStatus: 'FAILED',
        isAmbiguous: false,
        failureReason: 'NETWORK_ERROR',
        message: primErr.message || 'فشل الاتصال بالمزود الأساسي'
      };
    }

    // If Primary succeeded or is being processed upstream -> Return result immediately
    if (primaryResult.success) {
      return {
        ...primaryResult,
        fallbackUsed: false
      };
    }

    // 2. Ambiguity Guard:
    // If Primary timed out or network dropped after submit -> DO NOT fallback!
    // Halting with isAmbiguous = true causes caller to mark Order as PROVIDER_UNKNOWN
    if (primaryResult.isAmbiguous) {
      console.warn(`[ProviderRouter] Primary provider ${routing.primaryProviderName} returned ambiguous/timeout state for order ${baseParams.koaraOrderId}. Fallback BLOCKED to prevent duplicate fulfillment.`);
      return {
        ...primaryResult,
        canonicalStatus: 'UNKNOWN',
        fallbackUsed: false
      };
    }

    // 3. Fallback Execution (Only if Primary definitively failed BEFORE fulfillment AND fallback is enabled)
    if (routing.fallbackEnabled && routing.fallbackAdapter && routing.fallbackProductId) {
      // REQUIREMENT 5 & 6: Verify Fallback Provider is also globally ENABLED for orders
      const fallbackSettings = await this.getProviderSettings(routing.fallbackProviderName!);
      if (!fallbackSettings.ordersEnabled) {
        console.warn(`[ProviderRouter] Primary definitively failed, but Fallback provider ${routing.fallbackProviderName} is globally DISABLED for orders. Fallback skipped.`);
        return {
          ...primaryResult,
          fallbackUsed: false,
          message: `${primaryResult.message} (المزود الاحتياطي ${routing.fallbackProviderName} معطل حالياً لاستقبال الطلبات)`
        };
      }

      console.log(`[ProviderRouter] Primary provider definitively failed (${primaryResult.message}). Executing safe fallback to ${routing.fallbackProviderName} (Item: ${routing.fallbackProductId})...`);

      const fallbackParams: CreateTopupOrderParams = {
        ...baseParams,
        providerProductId: routing.fallbackProductId,
        gameCode: routing.fallbackMetadata?.gameCode || baseParams.gameCode,
        expectedPriceUsd: routing.fallbackCostUsd || 0
      };

      let fallbackResult: CreateTopupOrderResult;
      try {
        fallbackResult = await routing.fallbackAdapter.createTopupOrder(fallbackParams);
      } catch (fbErr: any) {
        console.error(`[ProviderRouter] Unhandled adapter error for fallback ${routing.fallbackProviderName}:`, fbErr.message);
        fallbackResult = {
          success: false,
          provider: routing.fallbackProviderName || 'UNKNOWN',
          providerOrderId: 0,
          providerStatus: 'CONNECTION_FAILED',
          canonicalStatus: 'FAILED',
          isAmbiguous: false,
          failureReason: 'NETWORK_ERROR',
          message: fbErr.message || 'فشل الاتصال بالمزود الاحتياطي'
        };
      }

      return {
        ...fallbackResult,
        fallbackUsed: true
      };
    }

    // No fallback available -> Return definitive primary failure
    return {
      ...primaryResult,
      fallbackUsed: false
    };
  }

  /**
   * Centralized Order Status Check (Eliminates hardcoded provider branching in workers)
   */
  public async getOrderStatus(
    providerName: string,
    providerOrderId: string | number
  ): Promise<GetOrderStatusResult> {
    const adapter = this.getAdapter(providerName);
    return await adapter.getOrderStatus(providerOrderId);
  }

  /**
   * Check balance across all registered providers
   */
  public async getAllBalances(): Promise<ProviderBalance[]> {
    const results: ProviderBalance[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        const bal = await adapter.getBalance();
        results.push(bal);
      } catch (err: any) {
        results.push({
          provider: adapter.name,
          balance: 0,
          currency: 'USD',
          raw: { error: err.message }
        });
      }
    }
    return results;
  }
}

export const providerRouter = new ProviderRouter();
