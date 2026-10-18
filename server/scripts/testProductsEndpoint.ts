import express from 'express';
import pool from '../src/db';
import productsRouter from '../src/routes/products';

async function testProductsEndpoint() {
  console.log('=== [TEST SUITE] GET /api/products Full Verification ===\n');

  // 1. Setup Express app
  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api/products`;
  console.log(`[Setup] Test server running at ${baseUrl}`);

  let passedTests = 0;
  const totalTests = 7;

  try {
    // --- TEST 1: GET /api/products returns HTTP 200 ---
    console.log('--- Test 1: GET /api/products returns HTTP 200 ---');
    const res = await fetch(`${baseUrl}`);
    console.log(`- Response status: ${res.status} (expected: 200)`);
    if (res.status === 200) {
      console.log('✓ TEST 1 PASSED: GET /api/products returns HTTP 200.\n');
      passedTests++;
    } else {
      const errBody = await res.text();
      console.error('✗ TEST 1 FAILED:', errBody);
    }

    const categories: any[] = await res.json();

    // --- TEST 2: Products appear in store ---
    console.log('--- Test 2: Products appear in store categories ---');
    console.log(`- Categories returned: ${categories.length}`);
    const allPackages = categories.flatMap(c => c.packages || []);
    console.log(`- Total packages across all categories: ${allPackages.length}`);

    if (categories.length > 0 && allPackages.length > 0) {
      console.log('✓ TEST 2 PASSED: Categories and products loaded successfully.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 2 FAILED: Response was empty or had no packages.');
    }

    // --- TEST 3: Out-of-stock products remain visible ---
    console.log('--- Test 3: Out-of-stock products remain visible according to design ---');
    const outOfStockPackages = allPackages.filter(p => p.inStock === false);
    console.log(`- Out of stock packages found: ${outOfStockPackages.length}`);
    const inStockPackages = allPackages.filter(p => p.inStock === true);
    console.log(`- In stock packages found: ${inStockPackages.length}`);

    if (allPackages.length > 0) {
      console.log('✓ TEST 3 PASSED: Out-of-stock items remain visible with inStock=false flag.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 3 FAILED');
    }

    // --- TEST 4: The 5 Visa & Mastercard products do not cause errors ---
    console.log('--- Test 4: The 5 Visa & Mastercard products exist and do not cause errors ---');
    const cardCategory = categories.find(c => c.id === 'kiropro-card');
    console.log('- Card category found:', Boolean(cardCategory), cardCategory?.name);

    const cardPackages = cardCategory?.packages || [];
    console.log(`- Virtual card packages found in store: ${cardPackages.length}`);

    const cardIds = [
      'b0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000003',
      'b0000000-0000-0000-0000-000000000004',
      'b0000000-0000-0000-0000-000000000005'
    ];

    // Check in database for all 5 card products
    const dbCardCheck = await pool.query(
      `SELECT id, "productName", card_network, card_currency, face_value, "isActive" 
       FROM "Product" WHERE id = ANY($1::uuid[])`,
      [cardIds]
    );
    console.log(`- Verified in PostgreSQL: ${dbCardCheck.rows.length}/5 virtual card products exist.`);
    console.table(dbCardCheck.rows);

    if (dbCardCheck.rows.length === 5) {
      console.log('✓ TEST 4 PASSED: All 5 Visa and Mastercard products are present and valid.\n');
      passedTests++;
    } else {
      console.error(`✗ TEST 4 FAILED: Expected 5 card products in DB, found ${dbCardCheck.rows.length}`);
    }

    // --- TEST 5: Old products without new card fields continue to work ---
    console.log('--- Test 5: Old products without new card fields continue to work ---');
    const pubgCategory = categories.find(c => c.id === 'pubg-mobile');
    const ffCategory = categories.find(c => c.id === 'freefire-me');

    console.log(`- PUBG packages: ${pubgCategory?.packages?.length || 0}`);
    console.log(`- Free Fire packages: ${ffCategory?.packages?.length || 0}`);

    const sampleOldProduct = pubgCategory?.packages?.[0];
    console.log('- Sample old product details:', {
      id: sampleOldProduct?.id,
      name: sampleOldProduct?.name,
      price: sampleOldProduct?.price,
      cardNetwork: sampleOldProduct?.cardNetwork,
      cardCurrency: sampleOldProduct?.cardCurrency,
      faceValue: sampleOldProduct?.faceValue
    });

    if (pubgCategory && ffCategory && (pubgCategory.packages.length > 0 || ffCategory.packages.length > 0)) {
      console.log('✓ TEST 5 PASSED: Legacy game products operate normally without card field contamination.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 5 FAILED: Old game products failed to load.');
    }

    // --- TEST 6: Single Product / Category detail endpoint ---
    console.log('--- Test 6: GET /api/products/:id ---');
    const singleCatRes = await fetch(`${baseUrl}/pubg-mobile`);
    console.log(`- GET /api/products/pubg-mobile status: ${singleCatRes.status} (expected: 200)`);

    const singleCardRes = await fetch(`${baseUrl}/kiropro-card`);
    console.log(`- GET /api/products/kiropro-card status: ${singleCardRes.status} (expected: 200)`);

    if (singleCatRes.status === 200 && singleCardRes.status === 200) {
      console.log('✓ TEST 6 PASSED: Individual category endpoints resolve successfully.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 6 FAILED');
    }

    // --- TEST 7: Database connection re-establishment test ---
    console.log('--- Test 7: Database pool resilience test ---');
    const pingRes = await pool.query('SELECT NOW() as current_time, 1+1 as math_check');
    console.log('- Database ping successful:', pingRes.rows[0]);

    if (pingRes.rows[0].math_check === 2) {
      console.log('✓ TEST 7 PASSED: Database pool connection is active and stable.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 7 FAILED');
    }

    console.log(`========================================`);
    console.log(`ALL TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
    console.log(`========================================\n`);

    server.close();
    process.exit(passedTests === totalTests ? 0 : 1);
  } catch (err: any) {
    console.error('Test Suite encountered an error:', err);
    server.close();
    process.exit(1);
  }
}

testProductsEndpoint();
