import { pool } from '../src/db.js';

async function testProducts() {
  console.log('Testing GET /api/products handler logic...');
  try {
    const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    console.log('1. platform_settings query success, rateSettingRes rows:', rateSettingRes.rows.length);
    const rateConfig = rateSettingRes.rows[0]?.value || { rate: 7600 };
    const exchangeRate = Number(rateConfig.rate) || 7600;
    console.log('   Exchange rate:', exchangeRate);

    console.log('2. Testing primary products query...');
    let result;
    try {
      result = await pool.query(`
        SELECT 
          p.id, p."providerOfferId", p."productName", p."offerName", p.category,
          p."arabicName", p.description, p."subCategory", p."productType", p.fulfillment_type,
          p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
          p."primaryProvider", p."fallbackProvider", p."fallbackEnabled",
          p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
          p."gameCategoryId",
          c."imageUrl" as "categoryImageUrl",
          c."name" as "categoryName",
          c."arabicName" as "categoryArabicName",
          c.platform as "categoryPlatform",
          c.badge as "categoryBadge",
          c."deliveryTime" as "categoryDeliveryTime",
          c."idFieldLabel" as "categoryIdFieldLabel",
          c."idPlaceholder" as "categoryIdPlaceholder",
          COALESCE(dpa.available_count, kci.available_count, 0)::int as "availableStock"
        FROM "Product" p
        LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM digital_product_accounts
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) dpa ON p.id = dpa.product_id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM kiropro_cards_inventory
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) kci ON p.id = kci.product_id
        WHERE p."isActive" = true
        ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
      `);
      console.log('   Primary query SUCCESS! Rows returned:', result.rows.length);
    } catch (primaryErr: any) {
      console.error('   Primary query FAILED:', primaryErr.message);
      console.log('   Testing fallback query...');
      result = await pool.query(`
        SELECT 
          p.id, p."providerOfferId", p."productName", p."offerName", p.category,
          p."arabicName", p.description, p."subCategory", p."productType", p.fulfillment_type,
          p."platformCode", p."platformName", p."regionCode", p."regionName",
          p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
          'GAMESDROP' as "primaryProvider", NULL as "fallbackProvider", false as "fallbackEnabled",
          p."requiresGameUserId", p."requiresGameServerId", p."displayOrder",
          p."gameCategoryId",
          c."imageUrl" as "categoryImageUrl",
          c."name" as "categoryName",
          c."arabicName" as "categoryArabicName",
          c.platform as "categoryPlatform",
          c.badge as "categoryBadge",
          c."deliveryTime" as "categoryDeliveryTime",
          c."idFieldLabel" as "categoryIdFieldLabel",
          c."idPlaceholder" as "categoryIdPlaceholder",
          COALESCE(dpa.available_count, kci.available_count, 0)::int as "availableStock"
        FROM "Product" p
        LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM digital_product_accounts
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) dpa ON p.id = dpa.product_id
        LEFT JOIN (
          SELECT product_id, COUNT(*)::int as available_count
          FROM kiropro_cards_inventory
          WHERE status = 'AVAILABLE'
          GROUP BY product_id
        ) kci ON p.id = kci.product_id
        WHERE p."isActive" = true
        ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
      `);
      console.log('   Fallback query SUCCESS! Rows returned:', result.rows.length);
    }

    console.log('3. Testing getProviderOrdersEnabledMap...');
    const map = new Map<string, boolean>();
    try {
      const res = await pool.query('SELECT provider, orders_enabled FROM provider_settings');
      for (const r of res.rows) {
        map.set(r.provider.toUpperCase(), Boolean(r.orders_enabled));
      }
      console.log('   provider_settings success, entries:', map.size);
    } catch (e: any) {
      console.warn('   provider_settings query failed (expected if not migrated):', e.message);
    }

    console.log('4. Testing row processing loop with', result.rows.length, 'rows...');
    // Execute the exact loop from products.ts
    const groupedMap = new Map<string, any>();
    const resolveCardCategory = (row: any): string | null => {
      const explicitCat = (row.gameCategoryId || '').trim();
      const text = `${row.productName || ''} ${row.offerName || ''}`.toLowerCase();
      if (text.includes('telegram') || text.includes('stars') || text.includes('نجوم') || explicitCat.startsWith('telegram')) {
        if (text.includes('premium') || text.includes('بريميوم') || explicitCat === 'telegram-premium') {
          return 'telegram-premium';
        }
        return 'telegram-stars';
      }
      if (text.includes('likee') || explicitCat === 'likee') return 'likee';
      if (text.includes('blood strike') || text.includes('bloodstrike') || explicitCat.startsWith('blood-strike')) {
        if (text.includes('global') || text.includes('عالمي') || explicitCat === 'blood-strike-global') return 'blood-strike-global';
        return 'blood-strike-me';
      }
      if (text.includes('pubg') || explicitCat === 'pubg-mobile') return 'pubg-mobile';
      if (explicitCat === 'freefire-me' || text.includes('freefire') || text.includes('free fire')) return 'freefire-me';
      if (explicitCat) return explicitCat;
      return null;
    };

    let processedCount = 0;
    for (const row of result.rows) {
      const groupKey = resolveCardCategory(row);
      if (!groupKey) continue;
      processedCount++;
    }
    console.log('   Rows processed successfully:', processedCount);
    console.log('=== GET /api/products test PASSED completely on local DB! ===');
  } catch (err: any) {
    console.error('FATAL ERROR in GET /api/products test:', err);
  } finally {
    await pool.end();
  }
}

testProducts();
