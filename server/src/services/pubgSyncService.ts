import pool from '../db';
import { g2BulkClient } from '../providers/g2bulk/client';
import { randomUUID as uuidv4 } from 'crypto';

export interface PubgSyncResult {
  success: boolean;
  gameCode: string;
  denominationsSynced: number;
  productsMapped: number;
  details: any[];
}

interface SyncedG2BulkItem {
  id: number;
  name: string;
  amount: number;
}

/**
 * Authoritative PUBG Mobile Top-up Synchronization Service
 * Queries G2Bulk API for pubgm game catalogue & fields,
 * maps supplier costs and offer IDs to existing KIROPRO PUBG Mobile products,
 * strictly keeping customer selling prices intact while updating supplier costs.
 */
export async function syncPubgTopupCatalog(): Promise<PubgSyncResult> {
  console.log('[PubgSync] Starting authoritative PUBG Mobile catalogue synchronization...');

  // 1. Fetch live pubgm catalogue from G2Bulk
  const catRes = await g2BulkClient.getCatalogue('pubgm');
  const items: SyncedG2BulkItem[] = (catRes as any).catalogues || [];
  console.log(`[PubgSync] Fetched ${items.length} live denominations for pubgm from G2Bulk.`);

  let requiredFields: string[] = ['userid'];
  try {
    const fieldsRes = await g2BulkClient.getGameFields('pubgm');
    if (fieldsRes?.info?.fields) {
      requiredFields = fieldsRes.info.fields;
    }
  } catch (fErr: any) {
    console.warn('[PubgSync] Non-critical fields check warning for pubgm:', fErr.message);
  }

  const client = await pool.connect();
  let totalMapped = 0;
  const syncDetails: any[] = [];

  try {
    await client.query('BEGIN');

    // Ensure provider settings exist for G2BULK and GAMESDROP
    await client.query(`
      INSERT INTO "provider_settings" ("provider", "orders_enabled", "catalog_sync_enabled", "health_check_enabled", "updated_at")
      VALUES ('G2BULK', true, true, true, NOW())
      ON CONFLICT ("provider") DO UPDATE SET "orders_enabled" = true, "updated_at" = NOW()
    `);

    await client.query(`
      INSERT INTO "provider_settings" ("provider", "orders_enabled", "catalog_sync_enabled", "health_check_enabled", "updated_at")
      VALUES ('GAMESDROP', true, true, true, NOW())
      ON CONFLICT ("provider") DO UPDATE SET "updated_at" = NOW()
    `);

    // Fetch existing PUBG products from DB
    const pubgProductsRes = await client.query(`
      SELECT id, "productName", "offerName", "providerOfferId", "customerPriceUsd", "gamesDropCostUsd", "isActive"
      FROM "Product"
      WHERE "gameCategoryId" = 'pubg-mobile' OR LOWER("productName") LIKE '%pubg%'
      ORDER BY "customerPriceUsd" ASC
    `);
    const pubgProducts = pubgProductsRes.rows;
    console.log(`[PubgSync] Found ${pubgProducts.length} PUBG Mobile products in database.`);

    for (const prod of pubgProducts) {
      const pName = `${prod.productName || ''} ${prod.offerName || ''}`.toLowerCase();
      const gdOfferId = String(prod.providerOfferId || '').trim();

      // Skip FIAT packs (they are deactivated)
      if (pName.includes('fiat')) {
        await client.query(`UPDATE "Product" SET "isActive" = false, "updatedAt" = NOW() WHERE id = $1`, [prod.id]);
        continue;
      }

      // 1. Link Primary GamesDrop mapping if offerId exists
      if (gdOfferId && gdOfferId !== '0') {
        await client.query(`
          INSERT INTO "product_provider_mappings" (
            id, "productId", "provider", "providerProductId", "providerCostUsd",
            "isActive", "isPrimary", "isFallback", "providerMetadata", "createdAt", "updatedAt"
          ) VALUES ($1, $2, 'GAMESDROP', $3, $4, true, true, false, $5, NOW(), NOW())
          ON CONFLICT ("productId", "provider", "providerProductId") DO UPDATE SET
            "providerCostUsd" = EXCLUDED."providerCostUsd",
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

      // 2. Find matching G2Bulk denomination
      const matchedItem = items.find((item) => {
        const iName = String(item.name || '').toLowerCase().trim();

        // Standard UC denomination matching
        const ucMatch = pName.match(/\b(\d+)\s*uc\b/);
        if (ucMatch && !pName.includes('wow')) {
          const uc = ucMatch[1];
          if (iName === uc) return true;
          if (iName === `${uc} uc (discounted)`) return true;
        }

        // WOW Coins matching
        const wowMatch = pName.match(/\b(\d+)\s*wow\b/);
        if (wowMatch) {
          const wow = wowMatch[1];
          if (iName === `${wow} wow coins`) return true;
        }

        // Subscriptions & Passes matching
        if (pName.includes('prime plus (1 month)')) return iName.includes('prime plus (1 month)');
        if (pName.includes('prime plus (3 months)')) return iName.includes('prime plus (3 months)');
        if (pName.includes('prime plus (6 months)')) return iName.includes('prime plus (6 months)');
        if (pName.includes('prime plus (12 months)')) return iName.includes('prime plus (12 months)');
        if (pName.includes('prime (1 month)') && !pName.includes('plus')) return iName === 'prime (1 month)';
        if (pName.includes('prime (3 months)') && !pName.includes('plus')) return iName === 'prime (3 months)';
        if (pName.includes('prime (6 months)') && !pName.includes('plus')) return iName === 'prime (6 months)';
        if (pName.includes('prime (12 months)') && !pName.includes('plus')) return iName === 'prime (12 months)';
        if (pName.includes('elite pass plus lv1-100')) return iName.includes('elite pass plus lv1-100');
        if (pName.includes('elite pass lv1-100') && !pName.includes('plus')) return iName.includes('elite pass lv1-100');
        if (pName.includes('elite pass lv1-50')) return iName.includes('elite pass lv1-50');

        return false;
      });

      if (matchedItem) {
        const g2bCostUsd = Number(matchedItem.amount || 0);
        const metadata = {
          gameCode: 'pubgm',
          gameName: 'PUBG Mobile',
          catalogueId: matchedItem.id,
          denomName: matchedItem.name,
          requiredFields: requiredFields,
          lastSyncAt: new Date().toISOString()
        };

        // Clear any conflicting fallback on this product
        await client.query(`
          UPDATE "product_provider_mappings"
          SET "isFallback" = false, "isPrimary" = false
          WHERE "productId" = $1 AND "provider" = 'G2BULK' AND "providerProductId" != $2
        `, [prod.id, String(matchedItem.id)]);

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
          String(matchedItem.id),
          g2bCostUsd,
          JSON.stringify(metadata)
        ]);

        // Update Product: enable fallback, keep customer retail price untouched!
        await client.query(`
          UPDATE "Product"
          SET
            "primaryProvider" = 'GAMESDROP',
            "fallbackProvider" = 'G2BULK',
            "fallbackEnabled" = true,
            "providerCostUsd" = COALESCE("gamesDropCostUsd", $1),
            "isActive" = true,
            "inStock" = true,
            "requiresGameUserId" = true,
            "requiresGameServerId" = false,
            "lastProviderSyncAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = $2
        `, [g2bCostUsd, prod.id]);

        totalMapped++;
        syncDetails.push({
          productId: prod.id,
          productName: prod.productName,
          offerName: prod.offerName,
          customerPriceUsd: prod.customerPriceUsd,
          gamesDropOfferId: gdOfferId,
          gamesDropCostUsd: prod.gamesDropCostUsd,
          g2bulkCatalogueId: matchedItem.id,
          g2bulkDenom: matchedItem.name,
          g2bulkCostUsd: g2bCostUsd,
          fallbackEnabled: true,
          isActive: true
        });
      } else {
        // Requirement 8: If denomination is incomplete, non-standard, or unverifiable,
        // keep it disabled from store display so customers cannot order unfulfillable packs.
        await client.query(`
          UPDATE "Product"
          SET
            "fallbackEnabled" = false,
            "isActive" = false,
            "updatedAt" = NOW()
          WHERE id = $1
        `, [prod.id]);

        syncDetails.push({
          productId: prod.id,
          productName: prod.productName,
          offerName: prod.offerName,
          customerPriceUsd: prod.customerPriceUsd,
          gamesDropOfferId: gdOfferId,
          gamesDropCostUsd: prod.gamesDropCostUsd,
          g2bulkCatalogueId: null,
          fallbackEnabled: false,
          isActive: false,
          reason: 'No matching G2Bulk denomination; kept disabled for safety.'
        });
      }
    }

    await client.query('COMMIT');
    console.log(`[PubgSync] Successfully synced PUBG Mobile: ${totalMapped} products mapped with verified G2Bulk fallback.`);

    return {
      success: true,
      gameCode: 'pubgm',
      denominationsSynced: items.length,
      productsMapped: totalMapped,
      details: syncDetails
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[PubgSync] Error during PUBG Mobile sync transaction:', err);
    throw err;
  } finally {
    client.release();
  }
}
