import pool from '../db';
import { g2BulkClient } from '../providers/g2bulk/client';
import { randomUUID as uuidv4 } from 'crypto';

export interface FreeFireSyncResult {
  success: boolean;
  gameCodes: string[];
  denominationsSynced: number;
  productsMapped: number;
  details: any[];
}

interface SyncedGameData {
  gameCode: string;
  gameName: string;
  fields: string[];
  items: Array<{ id: number; name: string; amount: number }>;
}

/**
 * Authoritative Free Fire Top-up Synchronization Service
 * Dynamically queries G2Bulk API for Free Fire game codes and catalogues,
 * links supplier costs and offer IDs to existing KIROPRO Free Fire products,
 * strictly keeping customer selling prices intact while updating supplier costs.
 */
export async function syncFreeFireTopupCatalog(): Promise<FreeFireSyncResult> {
  console.log('[FreeFireSync] Starting dynamic Free Fire catalogue discovery...');

  // 1. Discover game code from G2Bulk GET /v1/games
  const allGamesRes = await g2BulkClient.getGames();
  const allGames = allGamesRes.games || [];

  const ffGames = allGames.filter(g => 
    g.code.toLowerCase().startsWith('freefire') || 
    g.name.toLowerCase().includes('free fire') ||
    g.name.toLowerCase().includes('freefire')
  );

  console.log(`[FreeFireSync] Discovered ${ffGames.length} Free Fire game regions in G2Bulk:`, ffGames.map(g => g.code));

  // Focus on freefire_me (Middle East) as primary top-up provider for KIROPRO ME customers
  const meGame = ffGames.find(g => g.code === 'freefire_me');
  const globalGame = ffGames.find(g => g.code === 'freefire_global');

  // We process freefire_global first, then freefire_me will authoritatively take priority for ME products
  const targets = [globalGame, meGame].filter(Boolean) as typeof ffGames;
  const gamesData: SyncedGameData[] = [];

  for (const game of targets) {
    try {
      console.log(`[FreeFireSync] Querying catalogue for ${game.code}...`);
      const catRes = await g2BulkClient.getCatalogue(game.code);
      const items = catRes.catalogues || [];
      
      let fields: string[] = ['userid'];
      try {
        const fieldsRes = await g2BulkClient.getGameFields(game.code);
        if (fieldsRes?.info?.fields) {
          fields = fieldsRes.info.fields;
        }
      } catch (fErr: any) {
        console.warn(`[FreeFireSync] Non-critical fields check warning for ${game.code}:`, fErr.message);
      }

      gamesData.push({
        gameCode: game.code,
        gameName: game.name,
        fields,
        items
      });
      console.log(`[FreeFireSync] Fetched ${items.length} denominations for ${game.code}`);
    } catch (gErr: any) {
      console.warn(`[FreeFireSync] Failed to query catalogue for ${game.code}:`, gErr.message);
    }
  }

  let totalDenominations = 0;
  let totalMapped = 0;
  const syncDetails: any[] = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure G2Bulk orders_enabled in provider_settings
    await client.query(`
      INSERT INTO "provider_settings" ("provider", "orders_enabled", "catalog_sync_enabled", "health_check_enabled", "updated_at")
      VALUES ('G2BULK', true, true, true, NOW())
      ON CONFLICT ("provider") DO UPDATE SET "orders_enabled" = true, "updated_at" = NOW()
    `);

    // Ensure GAMESDROP settings in provider_settings
    await client.query(`
      INSERT INTO "provider_settings" ("provider", "orders_enabled", "catalog_sync_enabled", "health_check_enabled", "updated_at")
      VALUES ('GAMESDROP', true, true, true, NOW())
      ON CONFLICT ("provider") DO UPDATE SET "updated_at" = NOW()
    `);

    // Fetch active Free Fire products to map
    const activeProductsRes = await client.query(`
      SELECT id, "productName", "offerName", "providerOfferId", "customerPriceUsd", "gamesDropCostUsd"
      FROM "Product"
      WHERE "isActive" = true AND (
        LOWER("productName") LIKE '%free%' OR LOWER("productName") LIKE '%fire%' OR LOWER("gameCategoryId") LIKE '%free%'
      )
    `);
    const activeProducts = activeProductsRes.rows;
    console.log(`[FreeFireSync] Found ${activeProducts.length} active Free Fire products in KIROPRO`);

    for (const gData of gamesData) {
      totalDenominations += gData.items.length;

      for (const item of gData.items) {
        const denomName = String(item.name || '').trim();
        const costUsd = Number(item.amount || 0);
        const catalogueId = item.id;

        // Skip non-standard bundles when matching standard diamond topup
        const isSpecialBundle = /level\s*up|pass|membership|evo/i.test(denomName);

        // Extract standalone numbers from denomName (e.g. "110", "231", "583", "1188", "2420")
        const numMatch = denomName.match(/^\d+$/);
        const exactDiamonds = numMatch ? Number(numMatch[0]) : null;

        // Find matching active products
        const matchedProducts = activeProducts.filter(prod => {
          const combined = `${prod.productName} ${prod.offerName}`.toLowerCase();
          
          if (exactDiamonds !== null) {
            // Strict standalone number regex matching to prevent "20" matching "2420"
            const regex = new RegExp(`\\b${exactDiamonds}\\b`);
            if (isSpecialBundle) return false;
            return regex.test(combined);
          }
          
          if (isSpecialBundle) {
            return combined.includes(denomName.toLowerCase());
          }
          return false;
        });

        for (const prod of matchedProducts) {
          const gdOfferId = String(prod.providerOfferId || '');
          if (gdOfferId && gdOfferId !== '0') {
            await client.query(`
              INSERT INTO "product_provider_mappings" (
                id, "productId", "provider", "providerProductId", "providerCostUsd",
                "isActive", "isPrimary", "isFallback", "providerMetadata", "createdAt", "updatedAt"
              ) VALUES ($1, $2, 'GAMESDROP', $3, $4, true, true, false, $5, NOW(), NOW())
              ON CONFLICT ("productId", "provider", "providerProductId") DO UPDATE SET
                "isPrimary" = true,
                "isFallback" = false,
                "isActive" = true,
                "updatedAt" = NOW()
            `, [
              uuidv4(),
              prod.id,
              gdOfferId,
              Number(prod.gamesDropCostUsd || 0),
              JSON.stringify({ offerName: prod.offerName, source: 'gamesdrop_catalog' })
            ]);
          }

          const metadata = {
            gameCode: gData.gameCode,
            gameName: gData.gameName,
            catalogueId: catalogueId,
            denomName: denomName,
            requiredFields: gData.fields,
            lastSyncAt: new Date().toISOString()
          };

          // Clear any conflicting fallback on this product to respect uq_product_single_fallback
          await client.query(`
            UPDATE "product_provider_mappings"
            SET "isFallback" = false, "isPrimary" = false
            WHERE "productId" = $1 AND "provider" = 'G2BULK' AND "providerProductId" != $2
          `, [prod.id, denomName]);

          await client.query(`
            INSERT INTO "product_provider_mappings" (
              id, "productId", "provider", "providerProductId", "providerCostUsd",
              "isActive", "isPrimary", "isFallback", "providerMetadata", "createdAt", "updatedAt"
            ) VALUES ($1, $2, 'G2BULK', $3, $4, true, false, true, $5, NOW(), NOW())
            ON CONFLICT ("productId", "provider", "providerProductId") DO UPDATE SET
              "providerCostUsd" = EXCLUDED."providerCostUsd",
              "isActive" = true,
              "isPrimary" = false,
              "isFallback" = true,
              "providerMetadata" = EXCLUDED."providerMetadata",
              "updatedAt" = NOW()
          `, [
            uuidv4(),
            prod.id,
            denomName,
            costUsd,
            JSON.stringify(metadata)
          ]);

          // Update Product fallback flags without touching retail price
          await client.query(`
            UPDATE "Product"
            SET 
              "primaryProvider" = 'GAMESDROP',
              "fallbackProvider" = 'G2BULK',
              "fallbackEnabled" = true,
              "providerCostUsd" = COALESCE("gamesDropCostUsd", $1),
              "lastProviderSyncAt" = NOW(),
              "updatedAt" = NOW()
            WHERE id = $2
          `, [costUsd, prod.id]);

          totalMapped++;
          syncDetails.push({
            productId: prod.id,
            productName: prod.productName,
            offerName: prod.offerName,
            gameCode: gData.gameCode,
            g2bulkDenom: denomName,
            g2bulkCostUsd: costUsd,
            gamesDropOfferId: gdOfferId
          });
        }
      }
    }

    await client.query('COMMIT');
    console.log(`[FreeFireSync] Successfully linked ${totalMapped} product mappings.`);

    return {
      success: true,
      gameCodes: gamesData.map(g => g.gameCode),
      denominationsSynced: totalDenominations,
      productsMapped: totalMapped,
      details: syncDetails
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[FreeFireSync] Error during Free Fire sync transaction:', err);
    throw err;
  } finally {
    client.release();
  }
}
