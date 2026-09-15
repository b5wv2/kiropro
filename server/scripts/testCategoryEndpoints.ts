import 'dotenv/config';
import pool from '../src/db';

async function main() {
  console.log('Testing Category Customer Endpoints Simulation...\n');

  // Activate 1 global and 1 me product for testing
  await pool.query(`UPDATE "Product" SET "isActive" = true, "customerPriceUsd" = 1.00 WHERE "providerOfferId" = 2732`);
  await pool.query(`UPDATE "Product" SET "isActive" = true, "customerPriceUsd" = 0.50 WHERE "providerOfferId" = 2749`);

  try {
    const res = await fetch('http://localhost:5000/api/products');
    const cards: any[] = await res.json();

    const globalCard = cards.find(c => c.id === 'blood-strike-global');
    const meCard = cards.find(c => c.id === 'blood-strike-me');

    console.log('Global Card found:', Boolean(globalCard));
    if (globalCard) {
      console.log(`- Name: "${globalCard.name}"`);
      console.log(`- Packages Count: ${globalCard.packages.length}`);
      console.log(`- Package Name: "${globalCard.packages[0]?.name}"`);
    }

    console.log('\nMiddle East Card found:', Boolean(meCard));
    if (meCard) {
      console.log(`- Name: "${meCard.name}"`);
      console.log(`- Packages Count: ${meCard.packages.length}`);
      console.log(`- Package Name: "${meCard.packages[0]?.name}"`);
    }

    // Test specific category endpoint
    const catGlobalRes = await fetch('http://localhost:5000/api/products/blood-strike-global');
    const catGlobalData = await catGlobalRes.json();
    console.log('\nGET /api/products/blood-strike-global response:');
    console.log(`- Status: ${catGlobalRes.status}`);
    console.log(`- Name: "${catGlobalData.name}"`);
    console.log(`- Packages count: ${catGlobalData.packages?.length}`);

    const catMeRes = await fetch('http://localhost:5000/api/products/blood-strike-me');
    const catMeData = await catMeRes.json();
    console.log('\nGET /api/products/blood-strike-me response:');
    console.log(`- Status: ${catMeRes.status}`);
    console.log(`- Name: "${catMeData.name}"`);
    console.log(`- Packages count: ${catMeData.packages?.length}`);
  } finally {
    // Revert back to isActive = false
    await pool.query(`UPDATE "Product" SET "isActive" = false WHERE "providerOfferId" IN (2732, 2749)`);
    console.log('\nRestored all Blood Strike products to isActive = false.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
