import pool from '../db';
import { gamesDropClient } from '../providers/gamesdrop/client';
import { GamesDropSyncResponse } from '../providers/gamesdrop/types';
import { v4 as uuidv4 } from 'uuid';

export interface SyncCatalogStats {
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
}

export class CatalogSyncService {
  /**
   * Determine matching category ID in KIROPRO based on product name and attributes
   */
  public resolveGameCategoryId(productName: string): string | null {
    const norm = (productName || '').toLowerCase();
    if (norm.includes('likee')) return 'likee';
    if (norm.includes('telegram stars') || norm.includes('telegram_stars')) return 'telegram-stars';
    if (norm.includes('telegram premium') || norm.includes('telegram_premium')) return 'telegram-premium';
    if (norm.includes('pubg')) return 'pubg-mobile';
    if (norm.includes('freefire') || norm.includes('free fire')) return 'freefire-me';
    if (norm.includes('blood strike') || norm.includes('bloodstrike')) return 'blood-strike-me';
    return null;
  }

  /**
   * Fetch offers from GamesDrop API safely with timeout and retry
   */
  private async fetchOffers(search?: string, category: string = 'Top Up', retries: number = 2): Promise<any[]> {
    const rows: any[] = [];
    let page = 1;
    const limit = 1000;

    while (true) {
      let success = false;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await gamesDropClient.request<GamesDropSyncResponse>('/api/v1/offers/sync', {
            method: 'POST',
            body: {
              limit,
              page,
              category,
              ...(search ? { search } : {})
            }
          });

          const batch = res.rows || [];
          rows.push(...batch);
          success = true;

          if (batch.length < limit || rows.length >= (res.count || 0)) {
            return rows;
          }
          break; // proceed to next page
        } catch (err: any) {
          console.warn(`[CatalogSync] Attempt ${attempt} failed fetching page ${page} for search="${search}":`, err.message);
          if (attempt === retries) {
            console.error(`[CatalogSync] All ${retries} attempts failed for search="${search}" page ${page}.`);
            return rows;
          }
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }

      if (!success) break;
      page++;
    }

    return rows;
  }

  /**
   * Run targeted sync for priority products (Likee, Telegram Stars, Telegram Premium)
   * Guaranteed to be idempotent, safe, and strictly based on live GamesDrop data.
   */
  public async syncTargetedProducts(): Promise<SyncCatalogStats> {
    console.log('[CatalogSync] Starting targeted sync for Likee, Telegram Stars, Telegram Premium...');
    const startTime = new Date();

    const stats: SyncCatalogStats = {
      productsChecked: 0,
      newOffers: 0,
      updatedOffers: 0,
      priceChanges: 0,
      outOfStock: 0,
      lastSyncTime: startTime.toISOString(),
      details: {
        likeeOffers: 0,
        telegramStarsOffers: 0,
        telegramPremiumOffers: 0
      }
    };

    // 1. Fetch live rows sequentially to respect API rate limits and network stability
    const likeeRows = await this.fetchOffers('Likee');
    const tgStarsRows = await this.fetchOffers('Telegram Stars');
    const tgPremiumRows = await this.fetchOffers('Telegram Premium');

    stats.details!.likeeOffers = likeeRows.length;
    stats.details!.telegramStarsOffers = tgStarsRows.length;
    stats.details!.telegramPremiumOffers = tgPremiumRows.length;

    // Combine all unique offers by offerGroupId
    const uniqueMap = new Map<number, any>();
    for (const r of [...likeeRows, ...tgStarsRows, ...tgPremiumRows]) {
      const offerId = Number(r.offerGroupId || r.offerId);
      if (offerId && !uniqueMap.has(offerId)) {
        uniqueMap.set(offerId, r);
      }
    }

    const allOffers = Array.from(uniqueMap.values());
    stats.productsChecked = allOffers.length;
    console.log(`[CatalogSync] Retrieved ${allOffers.length} unique live offers to process.`);

    for (const row of allOffers) {
      const offerGroupId = Number(row.offerGroupId || row.offerId);
      if (!offerGroupId || isNaN(offerGroupId)) continue;

      const productName = String(row.productName || '').trim();
      const offerName = String(row.offerGroupName || row.offerName || '').trim();
      const newCost = Number(row.price || 0);
      const pb = row.priceBreakdown;
      const supplierCost = pb && pb.providerPrice !== undefined ? Number(pb.providerPrice) : newCost;
      const addedPercent = pb && pb.addedPercent !== undefined ? Number(pb.addedPercent) : 0;
      const fxRate = pb && pb.fxRate !== undefined ? Number(pb.fxRate) : 1;
      const currency = row.currency || 'USD';
      const inStock = Boolean(row.inStock);
      const reqUser = Boolean(row.isRequiredGameUserId);
      const reqServer = Boolean(row.isRequiredGameServerId);
      const gameCatId = this.resolveGameCategoryId(productName);

      if (!inStock) {
        stats.outOfStock++;
      }

      // Check if product already exists in DB
      const existingRes = await pool.query(
        `SELECT id, "gamesDropCostUsd", "providerCostUsd", "inStock", "isActive", "customerPriceUsd"
         FROM "Product"
         WHERE "providerOfferId" = $1
         LIMIT 1`,
        [offerGroupId]
      );

      if (existingRes.rows.length === 0) {
        // INSERT New Product (Default Inactive as requested: "اترك التسعير والارباح بشكل يدوي")
        await pool.query(
          `INSERT INTO "Product" (
            id, "provider", "providerOfferId", "productId", "productName", "offerName",
            "category", "platformCode", "platformName", "regionCode", "regionName",
            "supplierCostUsd", "gamesDropCostUsd", "gamesDropAddedPercent", "gamesDropFxRate",
            "providerCostUsd", "providerCurrency", "customerPriceUsd", "isActive",
            "inStock", "requiresGameUserId", "requiresGameServerId", "gameCategoryId",
            "lastProviderSyncAt", "createdAt", "updatedAt"
          ) VALUES (
            $1, 'GAMESDROP', $2, $3, $4, $5,
            'TOP_UP', $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, NULL, false,
            $16, $17, $18, $19,
            NOW(), NOW(), NOW()
          )`,
          [
            uuidv4(),
            offerGroupId,
            row.productId ? Number(row.productId) : null,
            productName,
            offerName,
            row.platformCode || null,
            row.platformName || null,
            row.regionCode || null,
            row.regionName || null,
            supplierCost,
            newCost,
            addedPercent,
            fxRate,
            newCost,
            currency,
            inStock,
            reqUser,
            reqServer,
            gameCatId
          ]
        );
        stats.newOffers++;
      } else {
        // UPDATE Existing Product
        const existing = existingRes.rows[0];
        const oldCost = Number(existing.gamesDropCostUsd || existing.providerCostUsd || 0);

        // Check if price changed
        const hasPriceChanged = Math.abs(oldCost - newCost) > 0.001;
        if (hasPriceChanged) {
          stats.priceChanges++;
          // Log price change in PriceHistory
          await pool.query(
            `INSERT INTO "PriceHistory" (
              "providerOfferId", "productName", "offerName", "oldPrice", "newPrice", currency, "detectedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [offerGroupId, productName, offerName, oldCost, newCost, currency]
          );
        }

        // Update product preserving customerPriceUsd & isActive
        await pool.query(
          `UPDATE "Product"
           SET "gamesDropCostUsd" = $1,
               "supplierCostUsd" = $2,
               "gamesDropAddedPercent" = $3,
               "gamesDropFxRate" = $4,
               "providerCostUsd" = $1,
               "providerCurrency" = $5,
               "inStock" = $6,
               "requiresGameUserId" = $7,
               "requiresGameServerId" = $8,
               "gameCategoryId" = COALESCE($9, "gameCategoryId"),
               "lastProviderSyncAt" = NOW(),
               "updatedAt" = NOW()
           WHERE id = $10`,
          [
            newCost,
            supplierCost,
            addedPercent,
            fxRate,
            currency,
            inStock,
            reqUser,
            reqServer,
            gameCatId,
            existing.id
          ]
        );
        stats.updatedOffers++;
      }
    }

    // Save sync stats to platform_settings
    await pool.query(
      `INSERT INTO "platform_settings" (key, value, updated_at)
       VALUES ('gamesdrop_sync_stats', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(stats)]
    );

    console.log('[CatalogSync] Targeted sync finished successfully. Stats:', stats);
    return stats;
  }

  /**
   * Get latest sync stats
   */
  public async getSyncStats(): Promise<SyncCatalogStats | null> {
    const res = await pool.query(
      `SELECT value, updated_at FROM "platform_settings" WHERE key = 'gamesdrop_sync_stats' LIMIT 1`
    );
    if (res.rows.length > 0 && res.rows[0].value) {
      return res.rows[0].value as SyncCatalogStats;
    }
    return null;
  }
}

export const catalogSyncService = new CatalogSyncService();
