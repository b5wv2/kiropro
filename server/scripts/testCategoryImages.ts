import pool from '../src/db';

async function main() {
  console.log('--- TEST: Category Images & Priority Architecture ---');

  // 1. Fetch categories from DB directly
  const catRes = await pool.query(`
    SELECT 
      c.id, 
      c.name, 
      c."arabicName", 
      c."imageUrl", 
      COUNT(p.id) FILTER (WHERE p."isActive" = true)::int as "activeProductCount"
    FROM "GameCategory" c
    LEFT JOIN "Product" p ON p."gameCategoryId" = c.id
    GROUP BY c.id
    ORDER BY c."displayOrder" ASC
  `);

  console.log('Categories count:', catRes.rows.length);
  catRes.rows.forEach(c => {
    console.log(`- [${c.id}] ${c.name} (${c.arabicName}): ${c.activeProductCount} active packages, image: ${c.imageUrl}`);
  });

  // 2. Fetch Customer API
  const res = await fetch('http://localhost:5000/api/products');
  const games = await res.json();
  console.log('\n--- Customer API /api/products ---');
  console.log('Returned games:', games.length);
  games.forEach((g: any) => {
    console.log(`\nGame: ${g.id} (${g.name})`);
    console.log(`- Card Cover Image: ${g.image}`);
    console.log(`- Packages Count: ${g.packages.length}`);
    console.log(`- Sample Package [0]:`, {
      name: g.packages[0].name,
      imageUrl: g.packages[0].imageUrl,
      price: g.packages[0].price
    });
  });

  // 3. Verify that zero packages have missing/undefined imageUrl
  let totalPkgs = 0;
  let pkgsWithImage = 0;
  games.forEach((g: any) => {
    g.packages.forEach((p: any) => {
      totalPkgs++;
      if (p.imageUrl && p.imageUrl.startsWith('http')) {
        pkgsWithImage++;
      }
    });
  });

  console.log(`\nImage inheritance check: ${pkgsWithImage}/${totalPkgs} packages successfully inherited category images.`);

  await pool.end();
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
