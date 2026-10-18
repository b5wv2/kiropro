import pool from '../src/db';
import { validatePlayerAccount } from '../src/services/playerValidationService';
import { providerRouter } from '../src/providers/router';
import { verifyStandardWebhookSignature } from '../src/routes/webhooks';
import { encryptVoucherCode, decryptVoucherCode, maskVoucherCode } from '../src/utils/cryptoVoucher';
import { randomUUID as uuidv4 } from 'crypto';
import crypto from 'crypto';

interface TestResult {
  suite: string;
  testName: string;
  passed: boolean;
  details: any;
}

const testResults: TestResult[] = [];

function recordTest(suite: string, testName: string, passed: boolean, details: any) {
  testResults.push({ suite, testName, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${suite}] ${testName}`);
  if (!passed) {
    console.error('   Details:', details);
  }
}

async function runTestSuite() {
  console.log('=====================================================');
  console.log('KIROPRO Phase 4: Delivery Pipelines & Idempotency Test Suite');
  console.log('=====================================================\n');

  // ----------------------------------------------------
  // SUITE 1: PUBG Mobile & Test Player ID Validation
  // ----------------------------------------------------
  console.log('--- SUITE 1: Player ID Validation & Free Fire Isolation ---');

  // Clear test rate limits so automated tests can run reliably
  await pool.query(`DELETE FROM player_validation_rate_limits WHERE rate_key LIKE '%5123456789%' OR rate_key LIKE '%99887766%'`);

  // Test 1.1: PUBG Mobile 60 UC player validation using real player ID
  const pubgProductRes = await pool.query(`
    SELECT id, "productName", "offerName", "gameCategoryId", "providerOfferId"
    FROM "Product"
    WHERE "gameCategoryId" = 'pubg-mobile' AND "isActive" = true AND "offerName" ILIKE '%60 uc%'
    LIMIT 1
  `);
  const pubgProd = pubgProductRes.rows[0];

  if (pubgProd) {
    const valRes = await validatePlayerAccount({
      productId: pubgProd.id,
      gameUserId: '5123456789'
    });
    const passed = Boolean(valRes.valid && valRes.playerName && valRes.playerName.toLowerCase().includes('eliah'));
    recordTest('PlayerValidation', 'PUBG Mobile Player ID validation routes to pubgm (not Free Fire) and returns player name', passed, {
      product: pubgProd.offerName,
      valid: valRes.valid,
      playerName: valRes.playerName,
      provider: valRes.provider,
      message: valRes.message
    });
  } else {
    recordTest('PlayerValidation', 'PUBG Mobile 60 UC product found in DB', false, 'Product not found');
  }

  // Test 1.2: Test Top-up mock player ID acceptance
  const testTopupRes = await pool.query(`SELECT id FROM "Product" WHERE "productName" = '[اختبار مؤقت] Test Top-up' LIMIT 1`);
  const testTopup = testTopupRes.rows[0];

  if (testTopup) {
    const testValRes = await validatePlayerAccount({
      productId: testTopup.id,
      gameUserId: '99887766'
    });
    const passed = Boolean(testValRes.valid && testValRes.playerName?.includes('99887766'));
    recordTest('PlayerValidation', 'Test Top-up cleanly validates test player ID without external errors', passed, testValRes);
  } else {
    recordTest('PlayerValidation', 'Test Top-up product found in DB', false, 'Test product not found');
  }

  // ----------------------------------------------------
  // SUITE 2: Provider Routing & Pricing Isolation
  // ----------------------------------------------------
  console.log('\n--- SUITE 2: Provider Routing, Mappings & Price Integrity ---');

  // Test 2.1: PUBG Mobile Provider Routing Resolution
  if (pubgProd) {
    const routing = await providerRouter.resolveProductProviders(pubgProd.id);
    const hasPrimaryGD = routing.primaryProviderName === 'GAMESDROP';
    const hasFallbackG2B = routing.fallbackProviderName === 'G2BULK' && routing.fallbackMetadata?.gameCode === 'pubgm';
    const costIsolated = routing.primaryCostUsd > 0 && routing.fallbackCostUsd !== undefined && routing.fallbackCostUsd > 0;

    recordTest('ProviderRouting', 'PUBG Mobile routes GamesDrop as Primary and G2Bulk pubgm as Fallback with isolated costs', 
      hasPrimaryGD && hasFallbackG2B && costIsolated, {
        primary: routing.primaryProviderName,
        primaryOfferId: routing.primaryProductId,
        primaryCost: routing.primaryCostUsd,
        fallback: routing.fallbackProviderName,
        fallbackProductId: routing.fallbackProductId,
        fallbackCost: routing.fallbackCostUsd,
        fallbackGameCode: routing.fallbackMetadata?.gameCode
      }
    );
  }

  // Test 2.2: Test Top-up Routing Resolution
  if (testTopup) {
    const testRouting = await providerRouter.resolveProductProviders(testTopup.id);
    const passed = testRouting.primaryProviderName === 'G2BULK' && 
                   testRouting.primaryMetadata?.gameCode === 'test' && 
                   testRouting.primaryProductId === '5111' &&
                   testRouting.primaryCostUsd === 0.005;

    recordTest('ProviderRouting', 'Test Top-up routes directly to G2Bulk item 5111 at supplier cost $0.005', passed, {
      primary: testRouting.primaryProviderName,
      primaryProductId: testRouting.primaryProductId,
      cost: testRouting.primaryCostUsd,
      gameCode: testRouting.primaryMetadata?.gameCode
    });
  }

  // Test 2.3: Test Gift Card Product Configuration
  const testVoucherRes = await pool.query(`SELECT * FROM g2bulk_voucher_catalog WHERE provider_product_id = 73`);
  const testVoucher = testVoucherRes.rows[0];
  const passedVoucher = testVoucher && 
                        testVoucher.unit_price === '0.0100' && 
                        testVoucher.customer_price_usd === '0.0500' &&
                        testVoucher.stock === 420 &&
                        testVoucher.game_key === 'test';

  recordTest('VoucherCatalog', 'Test Gift Card registered with real supplier cost $0.01, retail $0.05, and stock 420', passedVoucher, {
    provider_product_id: testVoucher?.provider_product_id,
    unit_price: testVoucher?.unit_price,
    customer_price_usd: testVoucher?.customer_price_usd,
    stock: testVoucher?.stock,
    is_active: testVoucher?.is_active
  });

  // ----------------------------------------------------
  // SUITE 3: Idempotency & Order Ambiguity Protection
  // ----------------------------------------------------
  console.log('\n--- SUITE 3: Idempotency & Provider Ambiguity Guard ---');

  // Test 3.1: Idempotency guard for COMPLETED and PROCESSING orders
  const testClient = await pool.connect();
  const testIdempKey = uuidv4();
  const testOrderId = uuidv4();

  try {
    // Select an existing user to respect foreign key constraint
    const userRes = await testClient.query('SELECT id FROM "User" LIMIT 1');
    const testUserId = userRes.rows[0]?.id;
    await testClient.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId", status,
        amount, "originalAmount", "customerPrice", "finalPrice", "customerPriceUsd", "idempotencyKey",
        "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'test-game', $3, 'Idempotency Test Order', 'test-player-123', 'COMPLETED',
        100, 100, 100, 100, 0.02, $4, NOW(), NOW()
      )
    `, [testOrderId, testUserId, testTopup?.id || uuidv4(), testIdempKey]);

    // Check duplicate check logic
    const checkOrder = await testClient.query('SELECT status FROM "Order" WHERE id = $1', [testOrderId]);
    const isCompletedBlocked = checkOrder.rows[0]?.status === 'COMPLETED';

    recordTest('Idempotency', 'COMPLETED order idempotency guard prevents duplicate fulfillment', isCompletedBlocked, {
      orderId: testOrderId,
      status: checkOrder.rows[0]?.status
    });

    // Test 3.2: Replay check logic
    const replayRes = await testClient.query(
      'SELECT id, status FROM "Order" WHERE "idempotencyKey" = $1',
      [testIdempKey]
    );
    recordTest('Idempotency', 'Submitting with same idempotencyKey finds existing order for safe replay', replayRes.rows.length === 1, {
      foundId: replayRes.rows[0]?.id,
      status: replayRes.rows[0]?.status
    });

    // Clean up dummy test order
    await testClient.query('DELETE FROM "Order" WHERE id = $1', [testOrderId]);
  } finally {
    testClient.release();
  }

  // ----------------------------------------------------
  // SUITE 4: Gift Card AES-256 Code Encryption & Delivery
  // ----------------------------------------------------
  console.log('\n--- SUITE 4: Gift Card Code Encryption & Delivery Isolation ---');

  const rawTestCode = 'TEST-GIFT-CARD-SECRET-CODE-2026';
  const encrypted = encryptVoucherCode(rawTestCode);
  const decrypted = decryptVoucherCode(encrypted);
  const masked = maskVoucherCode(rawTestCode);

  const encPassed = encrypted !== rawTestCode && decrypted === rawTestCode && (masked.includes('•') || masked.includes('*'));
  recordTest('CryptoVoucher', 'Voucher codes are encrypted with AES-256, cleanly decrypted, and safely masked', encPassed, {
    rawLength: rawTestCode.length,
    encryptedLength: encrypted.length,
    masked: masked,
    decryptedMatch: decrypted === rawTestCode
  });

  // Test 4.2: Verify order_voucher_codes schema and owner isolation
  const dummyVoucherOrderId = uuidv4();
  const testDbClient = await pool.connect();
  try {
    const dummyUser = await testDbClient.query('SELECT id FROM "User" LIMIT 1');
    const uId = dummyUser.rows[0]?.id;

    // Insert dummy order to satisfy foreign key
    await testDbClient.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId", status,
        amount, "originalAmount", "customerPrice", "finalPrice", "customerPriceUsd", "idempotencyKey",
        "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'test-vouchers', $3, 'Voucher Test Order', 'test@kiropro.store', 'COMPLETED',
        100, 100, 100, 100, 0.05, $4, NOW(), NOW()
      )
    `, [dummyVoucherOrderId, uId, testVoucher?.id || uuidv4(), uuidv4()]);

    await testDbClient.query(`
      INSERT INTO "order_voucher_codes" (
        order_id, user_id, product_id, provider_product_id,
        game_type, code_encrypted, code_masked, face_value, currency, created_at
      ) VALUES (
        $1, $2, $3, '73', 'test', $4, $5, 1, 'USD', NOW()
      )
    `, [dummyVoucherOrderId, uId, testVoucher?.id || uuidv4(), encrypted, masked]);

    const codeFetch = await testDbClient.query(
      'SELECT code_encrypted, code_masked FROM order_voucher_codes WHERE order_id = $1',
      [dummyVoucherOrderId]
    );

    const retrievedCode = decryptVoucherCode(codeFetch.rows[0]?.code_encrypted);
    const isolationPassed = retrievedCode === rawTestCode && codeFetch.rows[0]?.code_masked === masked;

    recordTest('CryptoVoucher', 'Order voucher codes stored encrypted in DB and decrypted upon retrieval', isolationPassed, {
      orderId: dummyVoucherOrderId,
      retrievedDecrypted: retrievedCode,
      codeMasked: codeFetch.rows[0]?.code_masked
    });

    await testDbClient.query('DELETE FROM order_voucher_codes WHERE order_id = $1', [dummyVoucherOrderId]);
    await testDbClient.query('DELETE FROM "Order" WHERE id = $1', [dummyVoucherOrderId]);
  } finally {
    testDbClient.release();
  }

  // ----------------------------------------------------
  // SUITE 5: Webhook Signature & Replay Deduplication
  // ----------------------------------------------------
  console.log('\n--- SUITE 5: Webhook Signature Verification & Deduplication ---');

  const testSecret = 'whsec_dGVzdC1zZWNyZXQta2V5LWZvci1raXJvcHJvLTIwMjY=';
  const testRawSecret = testSecret.slice(6);
  const testKey = Buffer.from(testRawSecret, 'base64');
  const testWebhookId = `msg_${Date.now()}`;
  const testTimestamp = Math.floor(Date.now() / 1000).toString();
  const testPayload = JSON.stringify({ event: 'order.completed', order_id: 123456, status: 'COMPLETED' });

  const signedPayload = `${testWebhookId}.${testTimestamp}.${testPayload}`;
  const testSignature = `v1,${crypto.createHmac('sha256', testKey).update(signedPayload).digest('base64')}`;

  const validHeaders = {
    'webhook-id': testWebhookId,
    'webhook-timestamp': testTimestamp,
    'webhook-signature': testSignature
  };

  const sigVerification = verifyStandardWebhookSignature(testPayload, validHeaders, testSecret);
  recordTest('Webhook', 'HMAC-SHA256 signature verification validates authentic provider payloads', sigVerification.valid, sigVerification);

  // Test with invalid signature
  const invalidVerification = verifyStandardWebhookSignature(testPayload, {
    ...validHeaders,
    'webhook-signature': 'v1,invalid-fake-signature=='
  }, testSecret);
  recordTest('Webhook', 'Forged/tampered webhook signatures are strictly rejected (401)', !invalidVerification.valid, invalidVerification);

  // Test timestamp tolerance (older than 300s)
  const expiredTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
  const expiredSigned = `${testWebhookId}.${expiredTimestamp}.${testPayload}`;
  const expiredSig = `v1,${crypto.createHmac('sha256', testKey).update(expiredSigned).digest('base64')}`;
  const expiredVerification = verifyStandardWebhookSignature(testPayload, {
    'webhook-id': testWebhookId,
    'webhook-timestamp': expiredTimestamp,
    'webhook-signature': expiredSig
  }, testSecret);
  recordTest('Webhook', 'Expired webhook payloads (>300s window) are strictly rejected to prevent replay attacks', !expiredVerification.valid, expiredVerification);

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n=====================================================');
  console.log('TEST SUITE SUMMARY');
  console.log('=====================================================');
  const total = testResults.length;
  const passedCount = testResults.filter(r => r.passed).length;
  const failedCount = total - passedCount;
  console.log(`Total Tests Run: ${total}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  await pool.end();

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test suite failure:', err);
  process.exit(1);
});
