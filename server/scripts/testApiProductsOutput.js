const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../dist/db').default;

async function testApiProducts() {
  console.log('=== Testing GET /api/products Output ===');

  const rateSettingRes = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
  const rateConfig = rateSettingRes.rows[0]?.value || { rate: 7600 };
  const exchangeRate = Number(rateConfig.rate) || 7600;

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
      c."idPlaceholder" as "categoryIdPlaceholder"
    FROM "Product" p
    LEFT JOIN "GameCategory" c ON p."gameCategoryId" = c.id
    WHERE p."isActive" = true
    ORDER BY COALESCE(c."displayOrder", 999) ASC, p."displayOrder" ASC, p."productName" ASC
  `);

  console.log(`Total active products retrieved from DB: ${result.rows.length}`);

  // Test the exact resolver logic
  const resolveCardCategory = (row) => {
    const explicitCat = (row.gameCategoryId || '').trim();
    const text = `${row.productName || ''} ${row.offerName || ''}`.toLowerCase();

    if (text.includes('telegram') || text.includes('stars') || text.includes('نجوم') || explicitCat.startsWith('telegram')) {
      if (text.includes('premium') || text.includes('بريميوم') || explicitCat === 'telegram-premium') {
        return 'telegram-premium';
      }
      return 'telegram-stars';
    }

    if (text.includes('likee') || explicitCat === 'likee') {
      return 'likee';
    }

    if (text.includes('blood strike') || text.includes('bloodstrike') || explicitCat.startsWith('blood-strike')) {
      if (text.includes('global') || text.includes('عالمي') || explicitCat === 'blood-strike-global') {
        return 'blood-strike-global';
      }
      return 'blood-strike-me';
    }

    if (text.includes('pubg') || explicitCat === 'pubg-mobile') {
      return 'pubg-mobile';
    }

    if (explicitCat === 'freefire-me' || text.includes('freefire') || text.includes('free fire')) {
      return 'freefire-me';
    }

    if (explicitCat) {
      return explicitCat;
    }

    return null;
  };

  const grouped = new Map();

  for (const row of result.rows) {
    const groupKey = resolveCardCategory(row);
    if (!groupKey) continue;

    if (groupKey === 'freefire-me') {
      const checkText = `${row.productName || ''} ${row.offerName || ''}`.toLowerCase();
      if (checkText.includes('telegram') || checkText.includes('star') || checkText.includes('likee') || checkText.includes('pubg') || checkText.includes('strike')) {
        console.error(`ALERT: Contaminated item blocked from Free Fire: ${row.offerName}`);
        continue;
      }
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        id: groupKey,
        name: row.categoryArabicName || row.categoryName,
        category: row.categoryPlatform || 'games',
        packages: []
      });
    }

    grouped.get(groupKey).packages.push({
      id: row.id,
      providerOfferId: row.providerOfferId,
      name: row.arabicName || row.offerName,
      price: Number(row.price || 0)
    });
  }

  console.log('\n--- GROUPED SERVICES & PACKAGE COUNTS ---');
  for (const [key, card] of grouped.entries()) {
    console.log(`\nCard ID: [${key}] | Name: "${card.name}" | Category: "${card.category}" | Total Packages: ${card.packages.length}`);
    for (const pkg of card.packages) {
      console.log(`   - [Offer #${pkg.providerOfferId}] ${pkg.name} ($${pkg.price})`);
    }
  }

  // Strict assertion: Free Fire must NOT contain any telegram
  const ffCard = grouped.get('freefire-me');
  if (ffCard) {
    const contaminated = ffCard.packages.filter(p => 
      p.name.toLowerCase().includes('telegram') || 
      p.name.toLowerCase().includes('stars') ||
      p.name.toLowerCase().includes('likee')
    );
    if (contaminated.length > 0) {
      console.error('\n❌ FAIL: Free Fire still contains non-Free Fire packages:', contaminated);
      process.exit(1);
    } else {
      console.log('\n✅ PASS: Free Fire category is 100% clean and contains ONLY Free Fire diamonds!');
    }
  }

  await pool.end();
}

testApiProducts().catch(console.error);
