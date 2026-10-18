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
  private get catalogFilePath(): string {
    if (process.env.VERCEL) {
      return path.join('/tmp', 'data/g2bulk-voucher-catalog.json');
    }
    return path.join(__dirname, '../../data/g2bulk-voucher-catalog.json');
  }

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

      try {
        const dataDir = path.dirname(this.catalogFilePath);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        // Atomic write using temporary file
        const tempPath = `${this.catalogFilePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(catalogData, null, 2), 'utf8');
        fs.renameSync(tempPath, this.catalogFilePath);

        console.log(`[G2BulkVoucherService] Catalog file saved successfully at ${this.catalogFilePath} with ${fetchedProducts.length} products.`);
      } catch (fileErr: any) {
        console.warn(`[G2BulkVoucherService] Local catalog file write notice (database sync will proceed):`, fileErr.message);
      }

      // 6. Update database tables (g2bulk_voucher_catalog & Product)
      const { approvedCount } = await this.syncProductsToDatabase(fetchedProducts, nowIso);

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
   * Synchronizes products into PostgreSQL (g2bulk_voucher_catalog and Product tables).
   * Supports both live sync and local catalog sync.
   */
  public async syncProductsToDatabase(
    products: G2BulkVoucherItem[],
    syncTimeIso?: string
  ): Promise<{ approvedCount: number }> {
    const nowIso = syncTimeIso || new Date().toISOString();
    const client = await pool.connect();
    let approvedCount = 0;

    const defaultApprovedPrices: Record<number, number> = {
      43: 0.95,
      44: 1.99,
      45: 4.99,
      46: 9.95,
      47: 19.80,
      2: 0.95,
      3: 4.75,
      4: 9.45,
      5: 23.80,
      6: 47.50,
      7: 93.50,
      8: 192.00,
      9: 285.00,
      10: 385.00,
      11: 480.00
    };

    const defaultArabicTitles: Record<number, string> = {
      43: 'قسيمة 100+10 جوهرة فري فاير (1 USD)',
      44: 'قسيمة 210+21 جوهرة فري فاير (2 USD)',
      45: 'قسيمة 530+53 جوهرة فري فاير (5 USD)',
      46: 'قسيمة 1080+108 جوهرة فري فاير (10 USD)',
      47: 'قسيمة 2200+220 جوهرة فري فاير (20 USD)',
      2: 'بطاقة 60 شدة ببجي (60 UC Voucher)',
      3: 'بطاقة 325 شدة ببجي (325 UC Voucher)',
      4: 'بطاقة 660 شدة ببجي (660 UC Voucher)',
      5: 'بطاقة 1800 شدة ببجي (1800 UC Voucher)',
      6: 'بطاقة 3850 شدة ببجي (3850 UC Voucher)',
      7: 'بطاقة 8100 شدة ببجي (8100 UC Voucher)',
      8: 'بطاقة 16200 شدة ببجي (16200 UC Voucher)',
      9: 'بطاقة 24300 شدة ببجي (24300 UC Voucher)',
      10: 'بطاقة 32400 شدة ببجي (32400 UC Voucher)',
      11: 'بطاقة 40500 شدة ببجي (40500 UC Voucher)'
    };

    const defaultFaceValues: Record<number, number> = {
      43: 1,
      44: 2,
      45: 5,
      46: 10,
      47: 20,
      2: 60,
      3: 325,
      4: 660,
      5: 1800,
      6: 3850,
      7: 8100,
      8: 16200,
      9: 24300,
      10: 32400,
      11: 40500
    };

    try {
      await client.query('BEGIN');

      for (const item of products) {
        const fallbackPrice = defaultApprovedPrices[item.provider_product_id] || (item.unit_price > 0 ? Math.round(item.unit_price * 1.06 * 100) / 100 : null);
        const fallbackTitle = defaultArabicTitles[item.provider_product_id] || item.title;
        const fallbackFaceValue = item.face_value !== null ? item.face_value : (defaultFaceValues[item.provider_product_id] || null);

        // Upsert into g2bulk_voucher_catalog
        // Preserves existing custom pricing, active state, and images set by Admin!
        const catalogUpsertRes = await client.query(
          `INSERT INTO g2bulk_voucher_catalog (
             provider_category_id, provider_product_id, title, description,
             category_title, game_key, unit_price, face_value, stock,
             custom_image_url, currency, is_in_stock, customer_price_usd, is_active, arabic_title, synced_at, updated_at
           ) VALUES (
             $1, $2, $3, $4,
             $5, $6, $7, $8, $9,
             NULL, $10, $11, $12, true, $13, $14, NOW()
           )
           ON CONFLICT (provider_product_id) DO UPDATE SET
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             category_title = EXCLUDED.category_title,
             unit_price = EXCLUDED.unit_price,
             face_value = COALESCE(g2bulk_voucher_catalog.face_value, EXCLUDED.face_value),
             stock = EXCLUDED.stock,
             is_in_stock = EXCLUDED.is_in_stock,
             customer_price_usd = COALESCE(g2bulk_voucher_catalog.customer_price_usd, EXCLUDED.customer_price_usd),
             arabic_title = COALESCE(g2bulk_voucher_catalog.arabic_title, EXCLUDED.arabic_title),
             synced_at = EXCLUDED.synced_at,
             updated_at = NOW()
           RETURNING id, customer_price_usd, is_active, custom_image_url, arabic_title, face_value`,
          [
            item.provider_category_id,
            item.provider_product_id,
            item.title,
            item.description,
            item.category_title,
            item.game_key,
            item.unit_price,
            fallbackFaceValue,
            item.stock,
            item.currency,
            item.stock > 0,
            fallbackPrice,
            fallbackTitle,
            nowIso
          ]
        );

        const savedRow = catalogUpsertRes.rows[0];
        const effectiveCustomerPrice = savedRow.customer_price_usd !== null ? Number(savedRow.customer_price_usd) : fallbackPrice;
        const effectiveIsActive = savedRow.is_active !== null ? Boolean(savedRow.is_active) : true;
        const effectiveArabicTitle = savedRow.arabic_title || fallbackTitle;
        const effectiveFaceValue = savedRow.face_value !== null ? Number(savedRow.face_value) : fallbackFaceValue;

        if (effectiveIsActive && effectiveCustomerPrice) {
          approvedCount++;
        }

        // Mirror into "Product" table for unified catalog visibility
        const deterministicId = this.generateDeterministicProductId(item.provider_product_id);
        const targetGameCategoryId = item.game_key === 'freefire' ? 'freefire-vouchers' : 'pubg-vouchers';
        const defaultCover = item.game_key === 'freefire' 
          ? '/uploads/products/prod_1789435947312_54dc7dd7.webp' 
          : '/uploads/products/PUGB-Mobile-Logo-1024x576.jpg';

        await client.query(
          `INSERT INTO "Product" (
             id, "productName", "offerName", "arabicName", "gameCategoryId", "productType",
             fulfillment_type, provider, "providerCostUsd", "customerPriceUsd",
             "inStock", "isActive", "imageUrl", description, "requires_player_id",
             "requires_server_id", "requires_inventory", "face_value", "card_currency",
             "providerOfferId", "createdAt", "updatedAt"
           ) VALUES (
             $1, $2, $2, $3, $4, 'VOUCHER',
             'G2BULK_VOUCHER', 'G2BULK', $5, $6,
             $7, $8, $9, $10, false,
             false, false, $11, 'USD',
             $12, NOW(), NOW()
           )
           ON CONFLICT (id) DO UPDATE SET
             "productName" = EXCLUDED."productName",
             "offerName" = EXCLUDED."offerName",
             "arabicName" = EXCLUDED."arabicName",
             "providerCostUsd" = EXCLUDED."providerCostUsd",
             "customerPriceUsd" = EXCLUDED."customerPriceUsd",
             "inStock" = EXCLUDED."inStock",
             "isActive" = EXCLUDED."isActive",
             "face_value" = EXCLUDED."face_value",
             "card_currency" = 'USD',
             "providerOfferId" = EXCLUDED."providerOfferId",
             "gameCategoryId" = EXCLUDED."gameCategoryId",
             "requires_player_id" = false,
             "requires_server_id" = false,
             "requires_inventory" = false,
             "updatedAt" = NOW()`,
          [
            deterministicId,
            item.title,
            effectiveArabicTitle,
            targetGameCategoryId,
            item.unit_price,
            effectiveCustomerPrice,
            item.stock > 0,
            effectiveIsActive,
            savedRow.custom_image_url || defaultCover,
            item.description,
            effectiveFaceValue,
            item.provider_product_id
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
            effectiveIsActive,
            JSON.stringify({
              title: item.title,
              category_id: item.provider_category_id,
              game_key: item.game_key,
              stock: item.stock
            })
          ]
        );
      }

      await client.query('COMMIT');
      return { approvedCount };
    } catch (dbErr: any) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  }

  /**
   * Synchronizes voucher products directly from local catalog JSON file.
   * Completely safe: ZERO external API calls, ZERO purchase calls, ZERO money spent.
   */
  public async syncFromLocalCatalogFile(): Promise<{ success: boolean; stats: VoucherSyncStats; error?: string }> {
    console.log('[G2BulkVoucherService] Synchronizing from local catalog file...');
    const nowIso = new Date().toISOString();

    if (!fs.existsSync(this.catalogFilePath)) {
      return {
        success: false,
        stats: {
          last_sync_at: nowIso,
          freefire_categories_count: 0,
          pubg_categories_count: 0,
          products_count: 0,
          products_in_stock_count: 0,
          products_approved_count: 0,
          last_error: `Local catalog file not found at ${this.catalogFilePath}`
        },
        error: `ملف الكتالوج المحلي غير موجود في المسار: ${this.catalogFilePath}`
      };
    }

    try {
      const rawContent = fs.readFileSync(this.catalogFilePath, 'utf8');
      const catalogData: G2BulkVoucherCatalogFile = JSON.parse(rawContent);
      const products = catalogData.products || [];

      if (products.length === 0) {
        throw new Error('ملف الكتالوج المحلي لا يحتوي على أي منتجات.');
      }

      const { approvedCount } = await this.syncProductsToDatabase(products, nowIso);

      const stats: VoucherSyncStats = {
        last_sync_at: nowIso,
        freefire_categories_count: catalogData.categories?.freefire ? 1 : 0,
        pubg_categories_count: catalogData.categories?.pubg ? 1 : 0,
        products_count: products.length,
        products_in_stock_count: products.filter(p => p.stock > 0).length,
        products_approved_count: approvedCount,
        last_error: null
      };

      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ('g2bulk_voucher_sync_stats', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(stats)]
      );

      console.log(`[G2BulkVoucherService] Local catalog synced successfully! ${products.length} products processed (${approvedCount} approved).`);
      return { success: true, stats };
    } catch (err: any) {
      console.error('[G2BulkVoucherService] Failed syncing from local catalog file:', err.message);
      return {
        success: false,
        stats: {
          last_sync_at: nowIso,
          freefire_categories_count: 0,
          pubg_categories_count: 0,
          products_count: 0,
          products_in_stock_count: 0,
          products_approved_count: 0,
          last_error: err.message
        },
        error: err.message
      };
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

      try {
        const dataDir = path.dirname(this.catalogFilePath);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(this.catalogFilePath, JSON.stringify(fileData, null, 2), 'utf8');
      } catch (fileErr: any) {
        console.warn(`[G2BulkVoucherService] Local catalog restore write notice:`, fileErr.message);
      }
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
