import pool from '../src/db.js';

async function testCustomerProductsApi() {
  const result = await pool.query(`
    SELECT 
      p.id, p."providerOfferId", p."productName", p."offerName", p.category,
      p."arabicName", p.description, p."subCategory", p."productType",
      p."platformCode", p."platformName", p."regionCode", p."regionName",
      p."customerPriceUsd" as price, p."inStock", p."imageUrl" as "productImageUrl",
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
      COALESCE(dpa.available_count, 0)::int as "availableStock"
    FROM "Product" p
    LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
    LEFT JOIN (
      SELECT product_id, COUNT(*)::int as available_count
      FROM digital_product_accounts
      WHERE status = 'AVAILABLE'
      GROUP BY product_id
    ) dpa ON p.id = dpa.product_id
    WHERE p."isActive" = true
    ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
  `);

  console.log('TOTAL ACTIVE PRODUCTS FROM DB QUERY:', result.rows.length);

  const kiroRow = result.rows.find(r => r.id === 'b0000000-0000-0000-0000-000000000001');
  console.log('KIRO ROW IN QUERY RESULT:', kiroRow);

  // Group items by curated game / category
  const groupedMap = new Map<string, any>();
  for (const row of result.rows) {
    const explicitCat = (row.gameCategoryId || '').trim();
    let groupKey: string | null = null;
    const text = `${row.productName || ''} ${row.offerName || ''}`.toLowerCase();

    if (text.includes('telegram') || text.includes('stars') || text.includes('نجوم') || explicitCat.startsWith('telegram')) {
      if (text.includes('premium') || text.includes('بريميوم') || explicitCat === 'telegram-premium') {
        groupKey = 'telegram-premium';
      } else {
        groupKey = 'telegram-stars';
      }
    } else if (text.includes('likee') || explicitCat === 'likee') {
      groupKey = 'likee';
    } else if (text.includes('blood strike') || text.includes('bloodstrike') || explicitCat.startsWith('blood-strike')) {
      groupKey = text.includes('global') || text.includes('عالمي') ? 'blood-strike-global' : 'blood-strike-me';
    } else if (text.includes('pubg') || explicitCat === 'pubg-mobile') {
      groupKey = 'pubg-mobile';
    } else if (explicitCat === 'freefire-me' || text.includes('freefire') || text.includes('free fire')) {
      groupKey = 'freefire-me';
    } else if (explicitCat) {
      groupKey = explicitCat;
    }

    if (groupKey) {
      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          id: groupKey,
          name: row.categoryArabicName || row.categoryName,
          category: row.categoryPlatform || 'games',
          packages: []
        });
      }
      groupedMap.get(groupKey).packages.push({
        id: row.id,
        name: row.arabicName || row.offerName,
        price: row.price
      });
    }
  }

  console.log('GROUPED KEYS RETURNED TO CUSTOMER:', Array.from(groupedMap.keys()));
  console.log('KIROPRO-CARD IN GROUPED MAP:', groupedMap.get('kiropro-card'));

  process.exit(0);
}

testCustomerProductsApi().catch(console.error);
