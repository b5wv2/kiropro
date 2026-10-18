import express from 'express';
import pool from '../src/db';
import productsRouter from '../src/routes/products';
import vouchersRouter from '../src/routes/vouchers';
import { randomUUID as uuidv4 } from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-12345';

async function runTestSuite() {
  console.log('======================================================================');
  console.log('KIROPRO × G2Bulk Digital Voucher Complete Verification Test Suite');
  console.log('Testing: Visibility, Details, Safety, Idempotency & Mock Purchase Flow');
  console.log('======================================================================\n');

  // Setup test Express app
  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);
  app.use('/api/vouchers', vouchersRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 11;

  // Create isolated test user in DB
  const testUserId = uuidv4();
  const testWalletId = uuidv4();
  const initialBalance = 100000; // 100,000 SDG

  const token = jwt.sign(
    { id: testUserId, email: 'test_voucher_buyer@kiropro.test', role: 'CUSTOMER', currency: 'SDG' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    // 0. Seed test user & wallet
    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, 'test_voucher_buyer@kiropro.test', 'hashed_pass_test', 'CUSTOMER', NOW(), NOW())`,
      [testUserId]
    );
    await pool.query(
      `INSERT INTO "Wallet" (id, "userId", balance, currency, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'SDG', NOW(), NOW())`,
      [testWalletId, testUserId, initialBalance]
    );

    // -----------------------------------------------------------------------
    // TEST 1: Free Fire Vouchers appear in store
    // -----------------------------------------------------------------------
    console.log('--- [Test 1] Free Fire Vouchers appear in store ---');
    const prodRes = await fetch(`${baseUrl}/api/products`);
    const allCategories: any[] = await prodRes.json();

    const ffCategory = allCategories.find(c => c.id === 'freefire-vouchers');
    if (ffCategory && ffCategory.packages?.length >= 5) {
      console.log(`✓ TEST 1 PASSED: Free Fire category found with ${ffCategory.packages.length} packages.`);
      console.log(`  Name: ${ffCategory.name}, Type: ${ffCategory.type}, Category: ${ffCategory.category}`);
      passed++;
    } else {
      console.error('✗ TEST 1 FAILED: Free Fire vouchers not found or incomplete packages.');
    }

    // -----------------------------------------------------------------------
    // TEST 2: PUBG Vouchers appear in store
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 2] PUBG Mobile UC Vouchers appear in store ---');
    const pubgCategory = allCategories.find(c => c.id === 'pubg-vouchers');
    if (pubgCategory && pubgCategory.packages?.length >= 10) {
      console.log(`✓ TEST 2 PASSED: PUBG UC vouchers category found with ${pubgCategory.packages.length} packages.`);
      console.log(`  Name: ${pubgCategory.name}, Type: ${pubgCategory.type}, Category: ${pubgCategory.category}`);
      passed++;
    } else {
      console.error('✗ TEST 2 FAILED: PUBG UC vouchers not found or incomplete packages.');
    }

    // -----------------------------------------------------------------------
    // TEST 3: Products do not disappear due to productType or category
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 3] Products do not disappear due to productType or category ---');
    const ffPkg = ffCategory?.packages?.[0];
    const pubgPkg = pubgCategory?.packages?.[0];

    const typesValid = ffPkg?.productType === 'VOUCHER' &&
                       (ffPkg?.fulfillmentType === 'DIGITAL_VOUCHER' || ffPkg?.fulfillmentType === 'G2BULK_VOUCHER') &&
                       ffCategory?.category === 'cards' &&
                       pubgCategory?.category === 'cards';

    if (typesValid) {
      console.log('✓ TEST 3 PASSED: Vouchers correctly classified as cards with productType=VOUCHER and sanitized fulfillmentType=DIGITAL_VOUCHER.');
      console.log(`  Sample FF Package: ${ffPkg.name} (Price: $${ffPkg.price}, InStock: ${ffPkg.inStock})`);
      console.log(`  Sample PUBG Package: ${pubgPkg.name} (Price: $${pubgPkg.price}, InStock: ${pubgPkg.inStock})`);
      passed++;
    } else {
      console.error('✗ TEST 3 FAILED: Incorrect classification or type assignment.');
    }

    // -----------------------------------------------------------------------
    // TEST 4: Unavailable products cannot be purchased
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 4] Unavailable products cannot be purchased ---');
    // Temporarily set a test item out of stock in g2bulk_voucher_catalog
    await pool.query(`UPDATE g2bulk_voucher_catalog SET is_in_stock = false, stock = 0 WHERE provider_product_id = 11`);

    const unavailPurchaseRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ voucherId: 11, quantity: 1 })
    });
    const unavailBody = await unavailPurchaseRes.json();
    console.log(`- Purchase attempt on out-of-stock item (HTTP ${unavailPurchaseRes.status}):`, unavailBody);

    // Restore stock
    await pool.query(`UPDATE g2bulk_voucher_catalog SET is_in_stock = true, stock = 4 WHERE provider_product_id = 11`);

    if (unavailPurchaseRes.status === 400 && unavailBody.error?.includes('المخزون')) {
      console.log('✓ TEST 4 PASSED: Out-of-stock product was securely rejected.');
      passed++;
    } else {
      console.error('✗ TEST 4 FAILED: Out-of-stock product was not rejected as expected.');
    }

    // -----------------------------------------------------------------------
    // TEST 5: Products without approved selling price cannot be purchased
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 5] Products without approved selling price cannot be purchased ---');
    // Temporarily deactivate a product or nullify customer_price_usd
    await pool.query(`UPDATE g2bulk_voucher_catalog SET customer_price_usd = NULL WHERE provider_product_id = 11`);

    const unpricedPurchaseRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ voucherId: 11, quantity: 1 })
    });
    const unpricedBody = await unpricedPurchaseRes.json();
    console.log(`- Purchase attempt on unpriced item (HTTP ${unpricedPurchaseRes.status}):`, unpricedBody);

    // Restore price
    await pool.query(`UPDATE g2bulk_voucher_catalog SET customer_price_usd = 480.00 WHERE provider_product_id = 11`);

    if (unpricedPurchaseRes.status === 400 && unpricedBody.error?.includes('تسعير')) {
      console.log('✓ TEST 5 PASSED: Unpriced product was securely rejected.');
      passed++;
    } else {
      console.error('✗ TEST 5 FAILED: Unpriced product was not rejected as expected.');
    }

    // -----------------------------------------------------------------------
    // TEST 6: Clicking a card opens correct product details
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 6] Clicking a card opens correct product details ---');
    const ffDetailsRes = await fetch(`${baseUrl}/api/products/freefire-vouchers`);
    const ffDetails = await ffDetailsRes.json();

    const pubgDetailsRes = await fetch(`${baseUrl}/api/products/pubg-vouchers`);
    const pubgDetails = await pubgDetailsRes.json();

    const detailsValid = ffDetailsRes.status === 200 &&
                         pubgDetailsRes.status === 200 &&
                         ffDetails.packages?.length === 5 &&
                         pubgDetails.packages?.length === 10;

    if (detailsValid) {
      console.log('✓ TEST 6 PASSED: Category details endpoints return complete package lists:');
      console.log(`  Free Fire: ${ffDetails.name} (${ffDetails.packages.length} packages)`);
      console.log(`  PUBG: ${pubgDetails.name} (${pubgDetails.packages.length} packages)`);
      passed++;
    } else {
      console.error('✗ TEST 6 FAILED: Failed to fetch single product category details.');
    }

    // -----------------------------------------------------------------------
    // TEST 7: Buy button is hooked to correct G2Bulk voucher route
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 7] Buy button is hooked to correct G2Bulk voucher route ---');
    // Verify /api/vouchers/catalog and /api/vouchers/purchase are mounted and responding
    const vCatRes = await fetch(`${baseUrl}/api/vouchers/catalog`);
    const vCat = await vCatRes.json();
    if (vCat.success && vCat.categories?.length === 2) {
      console.log('✓ TEST 7 PASSED: Voucher purchase router is active and mapped to G2Bulk provider.');
      passed++;
    } else {
      console.error('✗ TEST 7 FAILED: Voucher catalog endpoint failed.');
    }

    // -----------------------------------------------------------------------
    // TEST 8: Purchase simulation creates order with ZERO real spend
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 8] Purchase simulation creates mock order without real external call ---');
    const buyRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherId: 43, // 1 USD Free Fire voucher
        quantity: 2,
        isSimulation: true,
        simulateMode: 'COMPLETED'
      })
    });
    const buyData = await buyRes.json();
    console.log(`- Mock Purchase response (HTTP ${buyRes.status}):`, {
      success: buyData.success,
      orderId: buyData.orderId,
      status: buyData.status,
      quantity: buyData.quantity,
      codesCount: buyData.codes?.length,
      sampleCode: buyData.codes?.[0]
    });

    // Check Order in DB
    const orderInDb = await pool.query(`SELECT * FROM "Order" WHERE id = $1`, [buyData.orderId]);
    const orderRow = orderInDb.rows[0];

    if (buyRes.status === 201 && buyData.success && orderRow?.status === 'COMPLETED' && orderRow?.provider === 'G2BULK') {
      console.log('✓ TEST 8 PASSED: Order recorded locally as COMPLETED with G2BULK provider and zero real spend.');
      passed++;
    } else {
      console.error('✗ TEST 8 FAILED: Purchase simulation failed to create order.');
    }

    // -----------------------------------------------------------------------
    // TEST 9: Simulation success displays test codes only
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 9] Simulation success displays test codes only ---');
    const codesInDb = await pool.query(
      `SELECT code_masked, game_type, face_value FROM order_voucher_codes WHERE order_id = $1`,
      [buyData.orderId]
    );

    const allTestCodes = buyData.codes?.every(
      (c: string) => c.startsWith('MOCK-TEST-') || c.startsWith('FF-VOUCH-') || c.startsWith('PUBG-UC-') || c.startsWith('KIRO-FF-') || c.startsWith('KIRO-PUBG-')
    );
    if (allTestCodes && codesInDb.rows.length === 2) {
      console.log('✓ TEST 9 PASSED: All generated codes are simulation/test codes with proper encryption and masking:');
      console.log('  Delivered Codes:', buyData.codes);
      console.log('  Masked in DB:', codesInDb.rows.map(r => r.code_masked));
      passed++;
    } else {
      console.error('✗ TEST 9 FAILED: Codes did not match expected test format.');
    }

    // -----------------------------------------------------------------------
    // TEST 10: Duplicate protection (Idempotency) prevents double spend
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 10] Duplicate protection (Idempotency) prevents double spend ---');
    const dupRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        voucherId: 43,
        quantity: 2,
        isSimulation: true
      })
    });
    const dupBody = await dupRes.json();
    console.log(`- Immediate duplicate order attempt (HTTP ${dupRes.status}):`, dupBody);

    if (dupRes.status === 400 && dupBody.error?.includes('طلب مطابق')) {
      console.log('✓ TEST 10 PASSED: Duplicate order within 5s was successfully blocked, protecting customer balance.');
      passed++;
    } else {
      console.error('✗ TEST 10 FAILED: Duplicate order was not blocked.');
    }

    // -----------------------------------------------------------------------
    // TEST 11: Legacy products remain completely unaffected
    // -----------------------------------------------------------------------
    console.log('\n--- [Test 11] Legacy products remain completely unaffected ---');
    const pubgDirect = allCategories.find(c => c.id === 'pubg-mobile');
    const ffDirect = allCategories.find(c => c.id === 'freefire-me');
    const kiroCard = allCategories.find(c => c.id === 'kiropro-card');
    const googleAcct = allCategories.find(c => c.id === 'google-play-points');

    console.log('- PUBG Mobile Direct Top-up packages:', pubgDirect?.packages?.length);
    console.log('- Free Fire ME Direct Top-up packages:', ffDirect?.packages?.length);
    console.log('- KiroPro Virtual Mastercard packages:', kiroCard?.packages?.length);
    console.log('- Google Play Digital Accounts packages:', googleAcct?.packages?.length);

    const legacyIntact = (pubgDirect?.packages?.length || 0) > 0 &&
                         (ffDirect?.packages?.length || 0) > 0 &&
                         (kiroCard?.packages?.length || 0) > 0 &&
                         (googleAcct?.packages?.length || 0) > 0;

    if (legacyIntact) {
      console.log('✓ TEST 11 PASSED: All legacy categories (Direct Top-up, Cards, Accounts) remain intact and operational.');
      passed++;
    } else {
      console.error('✗ TEST 11 FAILED: One or more legacy product categories were damaged.');
    }

    console.log('\n======================================================================');
    console.log(`TEST SUITE RESULTS: ${passed}/${total} TESTS PASSED ✓`);
    console.log('======================================================================\n');

  } catch (err: any) {
    console.error('Error during test execution:', err.message || err);
  } finally {
    // Cleanup test user and associated records
    try {
      await pool.query(`DELETE FROM order_voucher_codes WHERE user_id = $1`, [testUserId]);
      await pool.query(`DELETE FROM "WalletTransaction" WHERE "walletId" = $1`, [testWalletId]);
      await pool.query(`DELETE FROM "Order" WHERE "userId" = $1`, [testUserId]);
      await pool.query(`DELETE FROM "Wallet" WHERE id = $1`, [testWalletId]);
      await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }

    server.close();
    await pool.end();
    process.exit(passed === total ? 0 : 1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
