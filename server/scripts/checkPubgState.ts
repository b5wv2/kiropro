import pool from '../src/db';

async function test() {
  const res = await pool.query(`
    SELECT m.*, p."productName", p."offerName"
    FROM "product_provider_mappings" m
    JOIN "Product" p ON m."productId" = p.id
    WHERE p."gameCategoryId" = 'pubg-mobile' OR p."productName" ILIKE '%pubg%'
  `);
  console.log('Existing PUBG mappings in DB:', res.rows.length);
  res.rows.forEach(r => {
    console.log(`${r.id} | ${r.productName} (${r.offerName}) | prov: ${r.provider} | pId: ${r.providerProductId} | cost: $${r.providerCostUsd} | prim: ${r.isPrimary} | fall: ${r.isFallback} | active: ${r.isActive}`);
  });
  await pool.end();
}

test().catch(console.error);
