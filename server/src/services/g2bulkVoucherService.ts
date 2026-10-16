import fs from 'fs';
import path from 'path';
import pool from '../db';
import { g2BulkClient } from '../providers/g2bulk/client';
import crypto from 'crypto';

export interface G2BulkVoucherItem {
  provider: 'G2BULK';
  synced_at: string;
  provider_category_id: number;
  provider_product_id: number;
  title: string;
  description: string;
  category_title: string;
  game_key: 'freefire' | 'pubg';
  unit_price: number;
  face_value: number | null;
  stock: number;
  image_url: null; // Strictly null: provider image is NEVER used
  currency: 'USD';
  active: boolean;
}

export interface G2BulkVoucherCatalogFile {
  provider: 'G2BULK';
  synced_at: string;
  total_categories: number;
  total_products: number;
  categories: {
    freefire: { id: number; title: string; product_count: number };
    pubg: { id: number; title: string; product_count: number };
  };
  products: G2BulkVoucherItem[];
}

export interface VoucherSyncStats {
  last_sync_at: string;
  freefire_categories_count: number;
  pubg_categories_count: number;
  products_count: number;
  products_in_stock_count: number;
  products_approved_count: number;
  last_error: string | null;
}

export class G2BulkVoucherService {
  private readonly catalogFilePath = path.join(__dirname, '../../data/g2bulk-voucher-catalog.json');

  /**
   * Generates a stable deterministic UUID for a voucher product
   */
  public generateDeterministicProductId(providerProductId: number | string): string {
    const hash = crypto.createHash('md5').update(`kiropro-voucher-g2bulk-${providerProductId}`).digest('hex');
    // Format as 8-4-4-4-12 UUID
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  /**
   * Safe fetch and synchronization of digital vouchers catalog.
   * Only targets Free Fire Vouchers and PUBG Mobile UC Vouchers.
   */
  public async syncCatalog(): Promise<{ success: boolean; stats: VoucherSyncStats; error?: string }> {
    console.log('[G2BulkVoucherService] Starting Voucher Catalog Sync from G2Bulk...');
    const nowIso = new Date().toISOString();

    try {
      // 1. Fetch public categories from G2Bulk (Read-only)
      const catRes = await g2BulkClient.request('/category', { requiresAuth: false });
      const allCategories: any[] = catRes.categories || [];

      // 2. Discover Free Fire and PUBG Voucher categories dynamically
      const ffCategory = allCategories.find((c: any) => 
        /free fire|garena/i.test(c.title || '') && /voucher/i.test(c.title || '')
      ) || allCategories.find((c: any) => c.id === 6);

      const pubgCategory = allCategories.find((c: any) => 
        /pubg/i.test(c.title || '') && /uc.*voucher/i.test(c.title || '')
      ) || allCategories.find((c: any) => c.id === 1);

      if (!ffCategory && !pubgCategory) {
        throw new Error('لم يتم العثور على فئات بطاقات Free Fire أو PUBG UC لدى المزود.');
      }

      console.log(`[G2BulkVoucherService] Discovered Categories: Free Fire ID=${ffCategory?.id} (${ffCategory?.title}), PUBG ID=${pubgCategory?.id} (${pubgCategory?.title})`);

      const fetchedProducts: G2BulkVoucherItem[] = [];

      // 3. Fetch Free Fire Voucher products
      if (ffCategory) {
        try {
          const ffRes = await g2BulkClient.request(`/category/${ffCategory.id}`, { requiresAuth: false });
          const ffProds = ffRes.products || [];
          for (const p of ffProds) {
            fetchedProducts.push({
              provider: 'G2BULK',
              synced_at: nowIso,
              provider_category_id: ffCategory.id,
              provider_product_id: p.id,
              title: p.title || `Free Fire Diamond Voucher (${p.id})`,
              description: p.description || '',
              category_title: ffCategory.title || 'Garena Free Fire Vouchers(Official)',
              game_key: 'freefire',
              unit_price: Number(p.unit_price || 0),
              face_value: p.face_value !== undefined && p.face_value !== null ? Number(p.face_value) : null,
              stock: Number(p.stock || 0),
              image_url: null, // Strictly null: provider image is NEVER used
              currency: 'USD',
              active: Number(p.stock || 0) > 0
            });
          }
        } catch (ffErr: any) {
          console.warn('[G2BulkVoucherService] Warning fetching Free Fire products:', ffErr.message);
        }
      }

      // 4. Fetch PUBG UC Voucher products
      if (pubgCategory) {
        try {
          const pubgRes = await g2BulkClient.request(`/category/${pubgCategory.id}`, { requiresAuth: false });
          const pubgProds = pubgRes.products || [];
          for (const p of pubgProds) {
            fetchedProducts.push({
              provider: 'G2BULK',
              synced_at: nowIso,
              provider_category_id: pubgCategory.id,
              provider_product_id: p.id,
              title: p.title || `PUBG Mobile UC Voucher (${p.id})`,
              description: p.description || '',
              category_title: pubgCategory.title || 'PUBG MOBILE UC Vouchers',
              game_key: 'pubg',
              unit_price: Number(p.unit_price || 0),
              face_value: p.face_value !== undefined && p.face_value !== null ? Number(p.face_value) : null,
              stock: Number(p.stock || 0),
              image_url: null, // Strictly null: provider image is NEVER used
              currency: 'USD',
              active: Number(p.stock || 0) > 0
            });
          }
        } catch (pubgErr: any) {
          console.warn('[G2BulkVoucherService] Warning fetching PUBG UC products:', pubgErr.message);
        }
      }

      if (fetchedProducts.length === 0) {
        throw new Error('تعذر جلب أي منتجات بطاقات هدايا من المزود.');
      }

      // 5. Write local JSON file atomically (Guarantee previous file is not wiped on failure)
      const catalogData: G2BulkVoucherCatalogFile = {
        provider: 'G2BULK',
        synced_at: nowIso,
        total_categories: (ffCategory ? 1 : 0) + (pubgCategory ? 1 : 0),
        total_products: fetchedProducts.length,
        categories: {
          freefire: {
            id: ffCategory?.id || 6,
            title: ffCategory?.title || 'Garena Free Fire Vouchers(Official)',
            product_count: fetchedProducts.filter(p => p.game_key === 'freefire').length
          },
          pubg: {
            id: pubgCategory?.id || 1,
            title: pubgCategory?.title || 'PUBG MOBILE UC Vouchers',
            product_count: fetchedProducts.filter(p => p.game_key === 'pubg').length
          }
        },
        products: fetchedProducts
      };

      const dataDir = path.dirname(this.catalogFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Atomic write using temporary file
      const tempPath = `${this.catalogFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(catalogData, null, 2), 'utf8');
      fs.renameSync(tempPath, this.catalogFilePath);

      console.log(`[G2BulkVoucherService] Catalog file saved successfully at ${this.catalogFilePath} with ${fetchedProducts.length} products.`);

      // 6. Update database tables (g2bulk_voucher_catalog & Product)
      const client = await pool.connect();
      let approvedCount = 0;

      try {
        await client.query('BEGIN');

        for (const item of fetchedProducts) {
          // Upsert into g2bulk_voucher_catalog
          // Preserves existing customer_price_usd, custom_image_url, and is_active!
          const catalogUpsertRes = await client.query(
            `INSERT INTO g2bulk_voucher_catalog (
               provider_category_id, provider_product_id, title, description,
               category_title, game_key, unit_price, face_value, stock,
               custom_image_url, currency, is_in_stock, synced_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12, NOW())
             ON CONFLICT (provider_product_id) DO UPDATE SET
               title = EXCLUDED.title,
               description = EXCLUDED.description,
               category_title = EXCLUDED.category_title,
               unit_price = EXCLUDED.unit_price,
               face_value = EXCLUDED.face_value,
               stock = EXCLUDED.stock,
               is_in_stock = EXCLUDED.is_in_stock,
               synced_at = EXCLUDED.synced_at,
               updated_at = NOW()
             RETURNING id, customer_price_usd, is_active, custom_image_url, arabic_title`,
            [
              item.provider_category_id,
              item.provider_product_id,
              item.title,
              item.description,
              item.category_title,
              item.game_key,
              item.unit_price,
              item.face_value,
              item.stock,
              item.currency,
              item.stock > 0,
              nowIso
            ]
          );

          const savedRow = catalogUpsertRes.rows[0];
          if (savedRow?.is_active && savedRow?.customer_price_usd) {
            approvedCount++;
          }

          // Mirror into "Product" table for unified catalog visibility
          const deterministicId = this.generateDeterministicProductId(item.provider_product_id);
          const targetGameCategoryId = item.game_key === 'freefire' ? 'freefire-vouchers' : 'pubg-vouchers';
          
          // Generate default Arabic name if not set
          const arabicTitle = savedRow.arabic_title || (
            item.game_key === 'freefire'
              ? `قسيمة فري فاير ${item.face_value ? `$${item.face_value}` : ''} (${item.title})`
              : `بطاقة ببجي ${item.title}`
          );

          await client.query(
            `INSERT INTO "Product" (
               id, "productName", "offerName", "arabicName", "gameCategoryId", "productType",
               fulfillment_type, provider, "providerCostUsd", "customerPriceUsd",
               "inStock", "isActive", "imageUrl", description, "requires_player_id",
               "requires_server_id", "requires_inventory", "face_value", "createdAt", "updatedAt"
             ) VALUES (
               $1, $2, $2, $3, $4, 'VOUCHER',
               'G2BULK_VOUCHER', 'G2BULK', $5, $6,
               $7, $8, $9, $10, false,
               false, true, $11, NOW(), NOW()
             )
             ON CONFLICT (id) DO UPDATE SET
               "productName" = EXCLUDED."productName",
               "offerName" = EXCLUDED."offerName",
               "providerCostUsd" = EXCLUDED."providerCostUsd",
               "inStock" = EXCLUDED."inStock",
               "face_value" = EXCLUDED."face_value",
               "requires_player_id" = false,
               "requires_server_id" = false,
               "updatedAt" = NOW()`,
            [
              deterministicId,
              item.title,
              arabicTitle,
              targetGameCategoryId,
              item.unit_price,
              savedRow.customer_price_usd, // Retain Admin set customer price
              item.stock > 0,
              savedRow.is_active, // Retain Admin active toggle
              savedRow.custom_image_url || (item.game_key === 'freefire' ? '/uploads/products/prod_1789435947312_54dc7dd7.webp' : '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg'),
              item.description,
              item.face_value
            ]
          );

          // Maintain mapping in product_provider_mappings
          await client.query(
            `INSERT INTO product_provider_mappings (
               "productId", provider, "providerProductId", "providerCostUsd",
               "isActive", "isPrimary", "isFallback", "providerMetadata", "createdAt", "updatedAt"
             ) VALUES ($1, 'G2BULK', $2, $3, $4, true, false, $5, NOW(), NOW())
             ON CONFLICT ("productId", provider, "providerProductId") DO UPDATE SET
               "providerCostUsd" = EXCLUDED."providerCostUsd",
               "isActive" = EXCLUDED."isActive",
               "updatedAt" = NOW()`,
            [
              deterministicId,
              String(item.provider_product_id),
              item.unit_price,
              savedRow.is_active,
              JSON.stringify({
                title: item.title,
                category_id: item.provider_category_id,
                game_key: item.game_key,
                stock: item.stock
              })
            ]
          );
        }

        // Mark disappeared products as out of stock (Do NOT delete)
        const currentProviderIds = fetchedProducts.map(p => p.provider_product_id);
        await client.query(
          `UPDATE g2bulk_voucher_catalog 
           SET is_in_stock = false, updated_at = NOW() 
           WHERE provider_product_id != ALL($1::int[])`,
          [currentProviderIds]
        );

        await client.query('COMMIT');
      } catch (dbErr: any) {
        await client.query('ROLLBACK');
        throw dbErr;
      } finally {
        client.release();
      }

      const stats: VoucherSyncStats = {
        last_sync_at: nowIso,
        freefire_categories_count: ffCategory ? 1 : 0,
        pubg_categories_count: pubgCategory ? 1 : 0,
        products_count: fetchedProducts.length,
        products_in_stock_count: fetchedProducts.filter(p => p.stock > 0).length,
        products_approved_count: approvedCount,
        last_error: null
      };

      // 7. Save sync stats in platform_settings
      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ('g2bulk_voucher_sync_stats', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(stats)]
      );

      console.log('[G2BulkVoucherService] Sync completed successfully! Stats:', stats);
      return { success: true, stats };
    } catch (err: any) {
      console.error('[G2BulkVoucherService] Sync failed:', err.message);

      // Record error in stats without wiping previous data
      const statsError: VoucherSyncStats = {
        last_sync_at: nowIso,
        freefire_categories_count: 0,
        pubg_categories_count: 0,
        products_count: 0,
        products_in_stock_count: 0,
        products_approved_count: 0,
        last_error: err.message || 'Unknown sync error'
      };

      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ('g2bulk_voucher_sync_stats', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET 
           value = jsonb_set(COALESCE(platform_settings.value, '{}'::jsonb), '{last_error}', $2::jsonb),
           updated_at = NOW()`,
        [JSON.stringify(statsError), JSON.stringify(err.message)]
      ).catch(() => {});

      return { success: false, stats: statsError, error: err.message };
    }
  }

  /**
   * Retrieves current local catalog.
   * If local file is missing (e.g. after container redeploy), regenerates it from DB.
   */
  public async getLocalCatalog(): Promise<G2BulkVoucherCatalogFile | null> {
    if (fs.existsSync(this.catalogFilePath)) {
      try {
        const raw = fs.readFileSync(this.catalogFilePath, 'utf8');
        return JSON.parse(raw);
      } catch (readErr) {
        console.warn('[G2BulkVoucherService] Error reading local catalog file, falling back to DB:', readErr);
      }
    }

    // Regenerate from database
    return this.restoreCatalogFileFromDb();
  }

  /**
   * Restores local JSON file from PostgreSQL
   */
  public async restoreCatalogFileFromDb(): Promise<G2BulkVoucherCatalogFile | null> {
    try {
      const res = await pool.query(
        `SELECT provider_category_id, provider_product_id, title, description,
                category_title, game_key, unit_price, face_value, stock, currency,
                synced_at
         FROM g2bulk_voucher_catalog
         ORDER BY game_key ASC, unit_price ASC`
      );

      if (res.rows.length === 0) return null;

      const products: G2BulkVoucherItem[] = res.rows.map(r => ({
        provider: 'G2BULK',
        synced_at: r.synced_at ? new Date(r.synced_at).toISOString() : new Date().toISOString(),
        provider_category_id: r.provider_category_id,
        provider_product_id: r.provider_product_id,
        title: r.title,
        description: r.description || '',
        category_title: r.category_title,
        game_key: r.game_key,
        unit_price: Number(r.unit_price),
        face_value: r.face_value !== null ? Number(r.face_value) : null,
        stock: Number(r.stock),
        image_url: null,
        currency: 'USD',
        active: Number(r.stock) > 0
      }));

      const ffProds = products.filter(p => p.game_key === 'freefire');
      const pubgProds = products.filter(p => p.game_key === 'pubg');

      const fileData: G2BulkVoucherCatalogFile = {
        provider: 'G2BULK',
        synced_at: products[0]?.synced_at || new Date().toISOString(),
        total_categories: 2,
        total_products: products.length,
        categories: {
          freefire: {
            id: ffProds[0]?.provider_category_id || 6,
            title: ffProds[0]?.category_title || 'Garena Free Fire Vouchers(Official)',
            product_count: ffProds.length
          },
          pubg: {
            id: pubgProds[0]?.provider_category_id || 1,
            title: pubgProds[0]?.category_title || 'PUBG MOBILE UC Vouchers',
            product_count: pubgProds.length
          }
        },
        products
      };

      const dataDir = path.dirname(this.catalogFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.catalogFilePath, JSON.stringify(fileData, null, 2), 'utf8');
      return fileData;
    } catch (err: any) {
      console.error('[G2BulkVoucherService] Failed restoring catalog file from DB:', err.message);
      return null;
    }
  }

  /**
   * Retrieves sync stats for Admin dashboard
   */
  public async getSyncStats(): Promise<VoucherSyncStats | null> {
    try {
      const res = await pool.query(
        `SELECT value FROM platform_settings WHERE key = 'g2bulk_voucher_sync_stats' LIMIT 1`
      );
      if (res.rows.length > 0) {
        return res.rows[0].value as VoucherSyncStats;
      }
      return null;
    } catch (err: any) {
      console.warn('[G2BulkVoucherService] Warning fetching sync stats:', err.message);
      return null;
    }
  }
}

export const g2BulkVoucherService = new G2BulkVoucherService();
