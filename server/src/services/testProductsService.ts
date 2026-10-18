import pool from '../db';
import { g2BulkVoucherService } from './g2bulkVoucherService';
import crypto, { randomUUID as uuidv4 } from 'crypto';

export interface TestProductsSetupResult {
  success: boolean;
  testTopup: {
    productId: string;
    productName: string;
    externalProviderId: number;
    provider: string;
    supplierCostUsd: number;
    customerPriceUsd: number;
    deliveryRoute: string;
    requiredFields: string[];
    isActive: boolean;
  };
  testGiftCard: {
    productId: string;
    voucherId: number;
    title: string;
    provider: string;
    supplierCostUsd: number;
    customerPriceUsd: number;
    stock: number;
    deliveryRoute: string;
    isActive: boolean;
  };
}

/**
 * Service to register and configure the 2 temporary test products:
 * 1. [اختبار مؤقت] Test Top-up (Game Code: 'test', Item: 5111, Cost: $0.005)
 * 2. [اختبار مؤقت] Test Gift Card (Voucher ID: 73, Category: 11, Cost: $0.01)
 */
export async function setupTemporaryTestProducts(): Promise<TestProductsSetupResult> {
  console.log('[TestProducts] Setting up temporary test products...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure GameCategory for Test Top-up
    await client.query(`
      INSERT INTO "GameCategory" (
        id, name, "arabicName", platform, badge, "deliveryTime", "idFieldLabel", "idPlaceholder", "displayOrder"
      ) VALUES (
        'test-topup',
        'Test Top-up',
        '[اختبار مؤقت] شحن تجريبي',
        'games',
        'اختبار مؤقت',
        'فوري',
        'معرّف الحساب التجريبي',
        'أدخل أي معرّف تجريبي للاختبار',
        999
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        "arabicName" = EXCLUDED."arabicName",
        badge = EXCLUDED.badge
    `);

    // Ensure GameCategory for Test Vouchers
    await client.query(`
      INSERT INTO "GameCategory" (
        id, name, "arabicName", platform, badge, "deliveryTime", "idFieldLabel", "idPlaceholder", "displayOrder"
      ) VALUES (
        'test-vouchers',
        'Test Vouchers',
        '[اختبار مؤقت] بطاقات تجريبية',
        'cards',
        'اختبار مؤقت',
        'فوري',
        'البريد الإلكتروني',
        'يتم تسليم الكود في صفحة الطلب فوراً',
        1000
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        "arabicName" = EXCLUDED."arabicName",
        badge = EXCLUDED.badge
    `);

    // 2. Setup Product 1: Test Top-up
    const topupHash = crypto.createHash('md5').update('kiropro-test-topup-unit').digest('hex');
    const topupProductId = `${topupHash.slice(0, 8)}-${topupHash.slice(8, 12)}-${topupHash.slice(12, 16)}-${topupHash.slice(16, 20)}-${topupHash.slice(20, 32)}`;
    const topupSupplierCost = 0.005; // G2Bulk live cost for item 5111
    const topupCustomerPrice = 0.02; // Selling price: $0.02 USD (positive margin, covers cost)

    await client.query(`
      INSERT INTO "Product" (
        id, "productName", "offerName", "arabicName", description,
        "gameCategoryId", "productType", fulfillment_type,
        provider, "primaryProvider", "fallbackEnabled",
        "providerOfferId", "providerCostUsd", "customerPriceUsd",
        "requiresGameUserId", "requiresGameServerId",
        "inStock", "isActive", "displayOrder", "createdAt", "updatedAt"
      ) VALUES (
        $1,
        '[اختبار مؤقت] Test Top-up',
        '1 Unit Test Top-up',
        '[اختبار مؤقت] شحن تجريبي (Test Top-up)',
        'منتج تجريبي مؤقت لاختبار دورة الشحن المباشر وربط المزود والتسليم',
        'test-topup',
        'DIRECT_TOPUP',
        'DIRECT_TOPUP',
        'G2BULK',
        'G2BULK',
        false,
        5111,
        $2,
        $3,
        true,
        false,
        true,
        true,
        1,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        "productName" = EXCLUDED."productName",
        "offerName" = EXCLUDED."offerName",
        "arabicName" = EXCLUDED."arabicName",
        "description" = EXCLUDED."description",
        "gameCategoryId" = EXCLUDED."gameCategoryId",
        "productType" = EXCLUDED."productType",
        "fulfillment_type" = EXCLUDED."fulfillment_type",
        "primaryProvider" = EXCLUDED."primaryProvider",
        "providerOfferId" = EXCLUDED."providerOfferId",
        "providerCostUsd" = EXCLUDED."providerCostUsd",
        "customerPriceUsd" = EXCLUDED."customerPriceUsd",
        "requiresGameUserId" = true,
        "requiresGameServerId" = false,
        "inStock" = true,
        "isActive" = true,
        "updatedAt" = NOW()
    `, [topupProductId, topupSupplierCost, topupCustomerPrice]);

    // Product Provider Mapping for Test Top-up
    await client.query(`
      INSERT INTO "product_provider_mappings" (
        id, "productId", provider, "providerProductId", "providerCostUsd",
        "isActive", "isPrimary", "isFallback", "providerMetadata", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'G2BULK', '5111', $3,
        true, true, false, $4, NOW(), NOW()
      )
      ON CONFLICT ("productId", provider, "providerProductId") DO UPDATE SET
        "providerCostUsd" = EXCLUDED."providerCostUsd",
        "isActive" = true,
        "isPrimary" = true,
        "isFallback" = false,
        "providerMetadata" = EXCLUDED."providerMetadata",
        "updatedAt" = NOW()
    `, [
      uuidv4(),
      topupProductId,
      topupSupplierCost,
      JSON.stringify({
        gameCode: 'test',
        gameName: 'test',
        catalogueId: 5111,
        denomName: 'test',
        requiredFields: ['userid'],
        isTestProduct: true,
        registeredAt: new Date().toISOString()
      })
    ]);

    // 3. Setup Product 2: Test Gift Card / Voucher (ID: 73 in G2Bulk)
    const voucherSupplierCost = 0.01; // G2Bulk live unit_price for product 73
    const voucherCustomerPrice = 0.05; // Selling price: $0.05 USD (positive margin, covers cost)
    const voucherStock = 420; // Live stock from G2Bulk
    const voucherDeterministicId = g2BulkVoucherService.generateDeterministicProductId(73);

    // Upsert in g2bulk_voucher_catalog
    await client.query(`
      INSERT INTO g2bulk_voucher_catalog (
        provider_category_id, provider_product_id, title, description,
        category_title, game_key, unit_price, face_value, stock,
        currency, is_in_stock, customer_price_usd, is_active, arabic_title, synced_at, updated_at
      ) VALUES (
        11, 73,
        '[اختبار مؤقت] Test Gift Card',
        'بطاقة رقمية تجريبية مؤقتة لاختبار مسار شراء البطاقات وتشفير واستلام الأكواد الفعلية',
        'Test Category',
        'test',
        $1, 1, $2,
        'USD', true, $3, true,
        '[اختبار مؤقت] بطاقة هدايا تجريبية (Test Gift Card)',
        NOW(), NOW()
      )
      ON CONFLICT (provider_product_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category_title = EXCLUDED.category_title,
        game_key = EXCLUDED.game_key,
        unit_price = EXCLUDED.unit_price,
        face_value = 1,
        stock = EXCLUDED.stock,
        is_in_stock = true,
        customer_price_usd = EXCLUDED.customer_price_usd,
        arabic_title = EXCLUDED.arabic_title,
        is_active = true,
        updated_at = NOW()
    `, [voucherSupplierCost, voucherStock, voucherCustomerPrice]);

    // Mirror in Product table
    await client.query(`
      INSERT INTO "Product" (
        id, "productName", "offerName", "arabicName", description,
        "gameCategoryId", "productType", fulfillment_type,
        provider, "primaryProvider", "fallbackEnabled",
        "providerOfferId", "providerCostUsd", "customerPriceUsd",
        "face_value", "card_currency",
        "requiresGameUserId", "requiresGameServerId",
        "inStock", "isActive", "displayOrder", "createdAt", "updatedAt"
      ) VALUES (
        $1,
        '[اختبار مؤقت] Test Gift Card',
        'Test Gift Card 1 Unit',
        '[اختبار مؤقت] بطاقة هدايا تجريبية (Test Gift Card)',
        'بطاقة رقمية تجريبية مؤقتة لاختبار مسار شراء البطاقات وتشفير واستلام الأكواد الفعلية',
        'test-vouchers',
        'VOUCHER',
        'G2BULK_VOUCHER',
        'G2BULK',
        'G2BULK',
        false,
        NULL,
        $2,
        $3,
        1,
        'USD',
        false,
        false,
        true,
        true,
        2,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        "productName" = EXCLUDED."productName",
        "offerName" = EXCLUDED."offerName",
        "arabicName" = EXCLUDED."arabicName",
        "description" = EXCLUDED."description",
        "gameCategoryId" = EXCLUDED."gameCategoryId",
        "productType" = EXCLUDED."productType",
        "fulfillment_type" = EXCLUDED."fulfillment_type",
        "primaryProvider" = EXCLUDED."primaryProvider",
        "providerCostUsd" = EXCLUDED."providerCostUsd",
        "customerPriceUsd" = EXCLUDED."customerPriceUsd",
        "inStock" = true,
        "isActive" = true,
        "updatedAt" = NOW()
    `, [voucherDeterministicId, voucherSupplierCost, voucherCustomerPrice]);

    // Product Provider Mapping for Test Voucher
    await client.query(`
      INSERT INTO "product_provider_mappings" (
        id, "productId", provider, "providerProductId", "providerCostUsd",
        "isActive", "isPrimary", "isFallback", "providerMetadata", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'G2BULK', '73', $3,
        true, true, false, $4, NOW(), NOW()
      )
      ON CONFLICT ("productId", provider, "providerProductId") DO UPDATE SET
        "providerCostUsd" = EXCLUDED."providerCostUsd",
        "isActive" = true,
        "isPrimary" = true,
        "isFallback" = false,
        "providerMetadata" = EXCLUDED."providerMetadata",
        "updatedAt" = NOW()
    `, [
      uuidv4(),
      voucherDeterministicId,
      voucherSupplierCost,
      JSON.stringify({
        title: 'test 1',
        category_id: 11,
        game_key: 'test',
        face_value: 1,
        stock: voucherStock,
        isTestProduct: true,
        registeredAt: new Date().toISOString()
      })
    ]);

    await client.query('COMMIT');
    console.log('[TestProducts] Temporary test products successfully configured in database.');

    return {
      success: true,
      testTopup: {
        productId: topupProductId,
        productName: '[اختبار مؤقت] Test Top-up',
        externalProviderId: 5111,
        provider: 'G2BULK',
        supplierCostUsd: topupSupplierCost,
        customerPriceUsd: topupCustomerPrice,
        deliveryRoute: 'DIRECT_TOPUP (G2Bulk createTopupOrder)',
        requiredFields: ['userid'],
        isActive: true
      },
      testGiftCard: {
        productId: voucherDeterministicId,
        voucherId: 73,
        title: '[اختبار مؤقت] Test Gift Card',
        provider: 'G2BULK',
        supplierCostUsd: voucherSupplierCost,
        customerPriceUsd: voucherCustomerPrice,
        stock: voucherStock,
        deliveryRoute: 'G2BULK_VOUCHER (g2bulkVoucherService -> createVoucherOrder)',
        isActive: true
      }
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[TestProducts] Error setting up test products:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Helper to disable both test products cleanly after testing is finished
 */
export async function disableTemporaryTestProducts(): Promise<{ disabled: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const topupHash = crypto.createHash('md5').update('kiropro-test-topup-unit').digest('hex');
    const topupProductId = `${topupHash.slice(0, 8)}-${topupHash.slice(8, 12)}-${topupHash.slice(12, 16)}-${topupHash.slice(16, 20)}-${topupHash.slice(20, 32)}`;

    await client.query(`UPDATE "Product" SET "isActive" = false, "updatedAt" = NOW() WHERE id IN ($1, $2)`, [
      topupProductId,
      g2BulkVoucherService.generateDeterministicProductId(73)
    ]);
    await client.query(`UPDATE g2bulk_voucher_catalog SET is_active = false, updated_at = NOW() WHERE provider_product_id = 73`);
    await client.query(`UPDATE product_provider_mappings SET "isActive" = false, "updatedAt" = NOW() WHERE "providerProductId" IN ('5111', '73') AND provider = 'G2BULK'`);
    await client.query('COMMIT');
    return { disabled: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
