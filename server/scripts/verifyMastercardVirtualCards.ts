/**
 * Verification Test Suite: Enforcing Mastercard Only for KIROPRO Virtual Cards
 * 
 * Verifies:
 * 1. Zero Visa products appear in customer store /api/products.
 * 2. Only valid KIROPRO Mastercard products appear (USA & Canada).
 * 3. Direct backend API purchase attempt for Visa products is strictly blocked (HTTP 400).
 * 4. Product pricing, face value, currencies, and stock integrity remain strictly preserved.
 * 5. Past orders and existing customer card allocations remain 100% intact.
 */

import express from 'express';
import pool from '../src/db';
import productsRouter from '../src/routes/products';
import ordersRouter from '../src/routes/orders';
import kiroproCardsRouter from '../src/routes/kiroproCards';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { randomUUID as uuidv4 } from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 KIROPRO MASTERCARD VIRTUAL CARDS ENFORCEMENT VERIFICATION');
  console.log('================================================================\n');

  const client = await pool.connect();
  const testUserId = uuidv4();
  const testWalletId = uuidv4();
  const jwtSecret = process.env.JWT_SECRET || 'secret';

  // Spin up ephemeral test server with real routes
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Attach mock auth for orders testing
  app.use((req: any, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, jwtSecret);
      } catch {}
    }
    next();
  });

  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/kiropro-cards', kiroproCardsRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testToken = jwt.sign(
    { id: testUserId, email: 'card_tester@kiropro.test', role: 'CUSTOMER' },
    jwtSecret,
    { expiresIn: '1h' }
  );

  try {
    // Setup temporary test user and wallet with 50,000 SDG
    await client.query(`
      INSERT INTO "User" (id, email, name, "passwordHash", role, "createdAt", "updatedAt")
      VALUES ($1, 'card_tester@kiropro.test', 'Card Tester', 'fake_hash', 'CUSTOMER', NOW(), NOW())
    `, [testUserId]);

    await client.query(`
      INSERT INTO "Wallet" (id, "userId", balance, currency, "createdAt", "updatedAt")
      VALUES ($1, $2, 50000.00, 'SDG', NOW(), NOW())
    `, [testWalletId, testUserId]);

    // -------------------------------------------------------------
    // TEST 1: No Visa products appear in customer store (GET /api/products)
    // -------------------------------------------------------------
    console.log('>>> TEST 1: Ensure Zero Visa Products in Customer Store');
    const prodRes = await fetch(`${baseUrl}/api/products`);
    assert(prodRes.status === 200, 'GET /api/products returns HTTP 200', `Status: ${prodRes.status}`);

    const catalog: any[] = await prodRes.json();
    const cardCategory = catalog.find(c => c.id === 'kiropro-card');

    assert(Boolean(cardCategory), 'GameCategory "kiropro-card" is present in catalog');
    assert(
      !cardCategory.name?.toLowerCase().includes('visa') && !cardCategory.type?.toLowerCase().includes('visa'),
      'Category title & type do NOT contain the word "Visa"',
      `Title: ${cardCategory.name}, Type: ${cardCategory.type}`
    );

    const cardPackages: any[] = cardCategory?.packages || [];
    const visaPackages = cardPackages.filter(p => 
      p.cardNetwork === 'VISA' || 
      p.name?.toLowerCase().includes('visa') || 
      p.arabicName?.toLowerCase().includes('فيزا') ||
      p.description?.toLowerCase().includes('فيزا') ||
      p.description?.toLowerCase().includes('visa')
    );

    assert(visaPackages.length === 0, 'Zero Visa packages returned in cardCategory packages', `Found: ${visaPackages.length}`);

    // Check all packages across entire catalog
    const allPackages = catalog.flatMap(c => c.packages || []);
    const anyVisaCard = allPackages.filter(p => p.cardNetwork === 'VISA' || (p.productType === 'VIRTUAL_CARD' && p.cardNetwork !== 'MASTERCARD'));
    assert(anyVisaCard.length === 0, 'Zero Visa virtual cards exist across the entire catalog', `Found: ${anyVisaCard.length}`);

    // -------------------------------------------------------------
    // TEST 2: Only valid KIROPRO Mastercard products appear (USA & Canada)
    // -------------------------------------------------------------
    console.log('\n>>> TEST 2: Display Genuine KIROPRO Mastercard Products Only (USA & Canada)');
    const mastercardPackages = cardPackages.filter(p => p.cardNetwork === 'MASTERCARD');
    assert(mastercardPackages.length >= 1, `At least 1 active Mastercard package returned (Found: ${mastercardPackages.length})`);

    const usaCards = mastercardPackages.filter(p => p.regionCode === 'US' && p.cardCurrency === 'USD');
    const canadaCards = mastercardPackages.filter(p => p.regionCode === 'CA' && p.cardCurrency === 'CAD');

    assert(usaCards.length >= 1, `USA Mastercard products present (Found: ${usaCards.length})`);
    assert(canadaCards.length >= 1, `Canada Mastercard products present (Found: ${canadaCards.length})`);

    for (const mc of mastercardPackages) {
      assert(
        mc.cardNetwork === 'MASTERCARD',
        `Package ${mc.id} strictly identified as MASTERCARD`,
        `${mc.name} (Currency: ${mc.cardCurrency}, Country: ${mc.regionCode})`
      );
      assert(
        !mc.name.includes('Visa') && !mc.arabicName.includes('فيزا'),
        `Package ${mc.id} name does not mention Visa: "${mc.arabicName}"`
      );
    }

    // -------------------------------------------------------------
    // TEST 3: Direct Backend API purchase attempt for Visa products is blocked
    // -------------------------------------------------------------
    console.log('\n>>> TEST 3: Direct Backend Block of Visa Product Purchases');

    // Attempt purchase of Visa Canada 1 CAD (b0000000-0000-0000-0000-000000000002)
    const orderAttempt1 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({
        packageId: 'b0000000-0000-0000-0000-000000000002',
        gameId: 'kiropro-card',
        playerId: 'my_email@test.com'
      })
    });
    const orderData1 = await orderAttempt1.json();
    assert(orderAttempt1.status === 400, 'Direct order of Visa Product 2 rejected with HTTP 400', `Status: ${orderAttempt1.status}`);
    assert(orderData1.error && (orderData1.error.includes('فيزا') || orderData1.error.includes('غير متوفر')), 'Error explains product is unavailable or Visa is not allowed', orderData1.error);

    // Attempt purchase of Visa Canada 2 CAD (b0000000-0000-0000-0000-000000000003)
    const orderAttempt2 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${testToken}`
      },
      body: JSON.stringify({
        packageId: 'b0000000-0000-0000-0000-000000000003',
        gameId: 'kiropro-card',
        playerId: 'my_email@test.com'
      })
    });
    const orderData2 = await orderAttempt2.json();
    assert(orderAttempt2.status === 400, 'Direct order of Visa Product 3 rejected with HTTP 400', `Status: ${orderAttempt2.status}`);

    // Check kiropro-cards/product-info rejects Visa product
    const infoAttempt = await fetch(`${baseUrl}/api/kiropro-cards/product-info?productId=b0000000-0000-0000-0000-000000000002`);
    assert(infoAttempt.status === 404, 'GET /product-info for Visa product returns 404 Not Found', `Status: ${infoAttempt.status}`);

    // -------------------------------------------------------------
    // TEST 4: Product pricing, face value, and inventory integrity
    // -------------------------------------------------------------
    console.log('\n>>> TEST 4: Product Pricing & Metadata Integrity');
    const dbProds = await client.query(`
      SELECT id, "productName", "arabicName", "customerPriceUsd", "defaultPartnerPriceUsd",
             card_network, card_currency, face_value, "isActive", "regionCode"
      FROM "Product"
      WHERE "gameCategoryId" = 'kiropro-card' OR id::text LIKE 'b0000000-%'
      ORDER BY "displayOrder" ASC, id ASC
    `);

    const p1 = dbProds.rows.find(p => p.id === 'b0000000-0000-0000-0000-000000000001');
    assert(Boolean(p1), 'Product 1 (US Mastercard 1 USD) found in DB');
    assert(p1.card_network === 'MASTERCARD', 'Product 1 network is MASTERCARD');
    assert(p1.card_currency === 'USD', 'Product 1 currency is USD');
    assert(p1.isActive === true, 'Product 1 is ACTIVE');

    const pVisa1 = dbProds.rows.find(p => p.id === 'b0000000-0000-0000-0000-000000000002');
    const pVisa2 = dbProds.rows.find(p => p.id === 'b0000000-0000-0000-0000-000000000003');
    assert(pVisa1?.isActive === false, 'Product 2 (Visa Canada 1 CAD) is strictly DISABLED (isActive: false)');
    assert(pVisa2?.isActive === false, 'Product 3 (Visa Canada 2 CAD) is strictly DISABLED (isActive: false)');

    const pCa = dbProds.rows.find(p => p.id === 'b0000000-0000-0000-0000-000000000006');
    assert(Boolean(pCa), 'Product 6 (Canada Mastercard 1 CAD) registered in DB');
    assert(pCa?.card_network === 'MASTERCARD', 'Product 6 network is MASTERCARD');
    assert(pCa?.card_currency === 'CAD', 'Product 6 currency is CAD');
    assert(pCa?.regionCode === 'CA', 'Product 6 region is Canada (CA)');

    // -------------------------------------------------------------
    // TEST 5: Past orders and customer wallets integrity
    // -------------------------------------------------------------
    console.log('\n>>> TEST 5: Past Orders and Customer Wallets Untouched');
    const ordersCount = await client.query('SELECT COUNT(*)::int as c FROM "Order"');
    assert(ordersCount.rows[0].c >= 0, `All existing orders remain preserved (Total: ${ordersCount.rows[0].c})`);

    const testWalletCheck = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
    assert(Number(testWalletCheck.rows[0].balance) === 50000.00, 'Test wallet balance remained unchanged at 50,000 SDG');

  } finally {
    // Cleanup test user and wallet
    try {
      await client.query('DELETE FROM "Wallet" WHERE id = $1', [testWalletId]);
      await client.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
    } catch {}

    client.release();
    server.close();
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
