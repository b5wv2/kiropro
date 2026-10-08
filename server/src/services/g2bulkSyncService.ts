import pool from '../db';
import { g2BulkClient } from '../providers/g2bulk/client';
import { productMatchingService, CandidateProduct } from './productMatchingService';
import { v4 as uuidv4 } from 'uuid';

export interface G2BulkSyncStats {
  gamesFetched: number;
  cataloguesChecked: number;
  matched: number;
  newProducts: number;
  ambiguous: number;
  rejected: number;
  updated: number;
  priceChanges: number;
  lastSyncTime: string;
}

export class G2BulkSyncService {
  /**
   * Run full or targeted synchronization for G2Bulk Catalog.
   * Concurrently processes games while respecting API limits.
   * Unifies products with existing GamesDrop catalog and stores G2Bulk mappings.
   */
  public async syncGames(targetGameCodes?: string[]): Promise<G2BulkSyncStats> {
    const startTime = new Date();
    console.log(`[G2BulkSync] Initiating Unified Catalog sync (Target: ${targetGameCodes ? targetGameCodes.join(', ') : 'ALL GAMES'})...`);

    const stats: G2BulkSyncStats = {
      gamesFetched: 0,
      cataloguesChecked: 0,
      matched: 0,
      newProducts: 0,
      ambiguous: 0,
      rejected: 0,
      updated: 0,
      priceChanges: 0,
      lastSyncTime: startTime.toISOString()
    };

    // 1. Fetch available games from G2Bulk
    let gamesToProcess: Array<{ id: number; code: string; name: string; image_url?: string }> = [];
    try {
      const allGamesRes = await g2BulkClient.getGames();
      const allGames = allGamesRes.games || [];
      stats.gamesFetched = allGames.length;

      if (targetGameCodes && targetGameCodes.length > 0 && !targetGameCodes.includes('all')) {
        const set = new Set(targetGameCodes.map(c => c.toLowerCase()));
        gamesToProcess = allGames.filter(g => set.has(g.code.toLowerCase()));
      } else {
        gamesToProcess = allGames;
      }
    } catch (err: any) {
      console.error('[G2BulkSync] Failed to fetch games list from G2Bulk:', err.message);
      throw new Error(`تعذر جلب قائمة ألعاب G2Bulk: ${err.message}`);
    }

    console.log(`[G2BulkSync] Fetched ${stats.gamesFetched} total games from G2Bulk. Processing ${gamesToProcess.length} games...`);

    // 2. Fetch all existing Koara products as candidates for matching
    const productsRes = await pool.query(`
      SELECT 
        id, "productName", "offerName", "arabicName", "gameCategoryId",
        "regionCode", "regionName", "customerPriceUsd", "gamesDropCostUsd", "isActive"
      FROM "Product"
    `);
    
    // In-memory candidate pool for high-performance matching
    const candidatePool: CandidateProduct[] = productsRes.rows.map(r => ({
      id: r.id,
      productName: r.productName,
      offerName: r.offerName,
      arabicName: r.arabicName,
      gameCategoryId: r.gameCategoryId,
      regionCode: r.regionCode,
      regionName: r.regionName,
      customerPriceUsd: r.customerPriceUsd !== null ? Number(r.customerPriceUsd) : null,
      gamesDropCostUsd: r.gamesDropCostUsd !== null ? Number(r.gamesDropCostUsd) : null,
      isActive: Boolean(r.isActive)
    }));

    // 3. Process games in controlled concurrency batches (6 parallel requests)
    const BATCH_SIZE = 6;
    for (let i = 0; i < gamesToProcess.length; i += BATCH_SIZE) {
      const batch = gamesToProcess.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(game => this.processSingleGame(game, candidatePool, stats))
      );
    }

    // 4. Save sync summary in platform_settings
    try {
      await pool.query(
        `INSERT INTO "platform_settings" (key, value, updated_at)
         VALUES ('g2bulk_sync_stats', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(stats)]
      );
    } catch (saveErr: any) {
      console.warn('[G2BulkSync] Warning: Failed to save sync stats in platform_settings:', saveErr.message);
    }

    console.log(`[G2BulkSync] Unified Sync Complete! Stats:`, stats);
    return stats;
  }

  /**
   * Process a single game's catalogue and reconcile with Koara products
   */
  private async processSingleGame(
    game: { id: number; code: string; name: string; image_url?: string },
    candidatePool: CandidateProduct[],
    stats: G2BulkSyncStats
  ): Promise<void> {
    try {
      const catRes = await g2BulkClient.getCatalogue(game.code);
      const items = catRes.catalogues || [];
      stats.cataloguesChecked += items.length;

      const seenMappingIds: string[] = [];

      for (const item of items) {
        const catalogueName = String(item.name || '').trim();
        const costUsd = Number(item.amount || 0);

        if (!catalogueName) {
          stats.rejected++;
          continue;
        }

        // Run structured matching engine
        const matchResult = productMatchingService.matchProviderProductToKoaraProduct(
          {
            gameCode: game.code,
            gameName: game.name,
            itemId: item.id,
            itemName: catalogueName,
            costUsd
          },
          candidatePool
        );

        if (matchResult.status === 'REJECTED') {
          stats.rejected++;
          continue;
        }

        if (matchResult.status === 'AMBIGUOUS') {
          stats.ambiguous++;
          console.warn(`[G2BulkSync] Ambiguous match for [${game.name}] "${catalogueName}":`, matchResult.reason);
          // Do not merge automatically per strict rule #16
          continue;
        }

        if (matchResult.status === 'MATCHED' && matchResult.productId) {
          // Reconcile with existing Koara Product
          const productId = matchResult.productId;

          const mappingId = await this.upsertG2BulkMapping(
            productId,
            catalogueName,
            costUsd,
            game,
            item,
            false // Not primary since existing product already has GamesDrop primary
          );

          if (mappingId) {
            seenMappingIds.push(mappingId);
            stats.matched++;
            stats.updated++;
          }
        } else if (matchResult.status === 'NEW_PRODUCT') {
          // Create a new Koara Product entity for this G2Bulk-exclusive item
          const newProductId = uuidv4();
          const suggested = matchResult.suggestedAttributes || {
            productName: game.name,
            offerName: catalogueName
          };

          // Safe insert new Product
          await pool.query(
            `INSERT INTO "Product" (
              id, "provider", "providerOfferId", "productId", "productName", "offerName",
              "category", "productType", "fulfillment_type", "platformName",
              "regionCode", "regionName", "supplierCostUsd", "providerCostUsd",
              "providerCurrency", "customerPriceUsd", "isActive", "inStock",
              "requiresGameUserId", "requiresGameServerId", "gameCategoryId",
              "primaryProvider", "fallbackProvider", "fallbackEnabled",
              "lastProviderSyncAt", "createdAt", "updatedAt"
            ) VALUES (
              $1, 'G2BULK', NULL, NULL, $2, $3,
              'TOP_UP', 'TOPUP', 'DIRECT_TOPUP', 'Mobile',
              $4, $5, $6, $6,
              'USD', NULL, false, true,
              true, false, $7,
              'G2BULK', NULL, false,
              NOW(), NOW(), NOW()
            )`,
            [
              newProductId,
              suggested.productName || game.name,
              suggested.offerName || catalogueName,
              suggested.regionCode || null,
              suggested.regionName || null,
              costUsd,
              suggested.gameCategoryId || null
            ]
          );

          // Insert G2Bulk mapping as Primary for this new product
          const mappingId = await this.upsertG2BulkMapping(
            newProductId,
            catalogueName,
            costUsd,
            game,
            item,
            true // Primary since this is a G2Bulk-native product
          );

          if (mappingId) {
            seenMappingIds.push(mappingId);
          }

          // Add to local candidate pool so subsequent items of this game can cross-reference
          candidatePool.push({
            id: newProductId,
            productName: suggested.productName || game.name,
            offerName: suggested.offerName || catalogueName,
            gameCategoryId: suggested.gameCategoryId || null,
            regionCode: suggested.regionCode || null,
            regionName: suggested.regionName || null,
            customerPriceUsd: null,
            gamesDropCostUsd: null,
            isActive: false
          });

          stats.newProducts++;
        }
      }

      // Mark disappeared G2Bulk mappings as inactive (Rule #19: Do NOT delete Koara product)
      if (seenMappingIds.length > 0) {
        await pool.query(
          `UPDATE "product_provider_mappings"
           SET "isActive" = false, "updatedAt" = NOW()
           WHERE "provider" = 'G2BULK'
             AND "providerMetadata"->>'gameCode' = $1
             AND id != ALL($2::uuid[])`,
          [game.code, seenMappingIds]
        );
      }
    } catch (gameErr: any) {
      console.warn(`[G2BulkSync] Warning on game ${game.code}:`, gameErr.message);
    }
  }

  /**
   * Insert or update G2Bulk mapping in product_provider_mappings
   */
  private async upsertG2BulkMapping(
    productId: string,
    catalogueName: string,
    costUsd: number,
    game: { code: string; name: string },
    item: { id: number; name: string; amount: number },
    isPrimary: boolean
  ): Promise<string | null> {
    try {
      const existingRes = await pool.query(
        `SELECT id, "providerCostUsd", "isPrimary", "isFallback"
         FROM "product_provider_mappings"
         WHERE "productId" = $1 AND "provider" = 'G2BULK' AND "providerProductId" = $2
         LIMIT 1`,
        [productId, catalogueName]
      );

      const metadata = JSON.stringify({
        gameCode: game.code,
        gameName: game.name,
        catalogueId: item.id
      });

      if (existingRes.rows.length === 0) {
        const newId = uuidv4();
        await pool.query(
          `INSERT INTO "product_provider_mappings" (
            id, "productId", "provider", "providerProductId", "providerCostUsd",
            "isActive", "isPrimary", "isFallback", "providerMetadata", "createdAt", "updatedAt"
          ) VALUES ($1, $2, 'G2BULK', $3, $4, true, $5, false, $6, NOW(), NOW())
          ON CONFLICT ("productId", "provider", "providerProductId") DO UPDATE SET
            "providerCostUsd" = EXCLUDED."providerCostUsd",
            "isActive" = true,
            "providerMetadata" = EXCLUDED."providerMetadata",
            "updatedAt" = NOW()`,
          [newId, productId, catalogueName, costUsd, isPrimary, metadata]
        );
        return newId;
      } else {
        const existing = existingRes.rows[0];
        await pool.query(
          `UPDATE "product_provider_mappings"
           SET "providerCostUsd" = $1,
               "isActive" = true,
               "providerMetadata" = $2,
               "updatedAt" = NOW()
           WHERE id = $3`,
          [costUsd, metadata, existing.id]
        );
        return existing.id;
      }
    } catch (err: any) {
      console.error(`[G2BulkSync] Mapping upsert error on product ${productId}:`, err.message);
      return null;
    }
  }

  /**
   * Get latest sync stats from platform_settings
   */
  public async getSyncStats(): Promise<G2BulkSyncStats | null> {
    const res = await pool.query(
      `SELECT value FROM "platform_settings" WHERE key = 'g2bulk_sync_stats' LIMIT 1`
    );
    if (res.rows.length > 0 && res.rows[0].value) {
      return res.rows[0].value as G2BulkSyncStats;
    }
    return null;
  }
}

export const g2BulkSyncService = new G2BulkSyncService();
