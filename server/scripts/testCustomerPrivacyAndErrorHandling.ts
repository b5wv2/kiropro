import { pool } from '../src/db';
import { validatePlayerAccount } from '../src/services/playerValidationService';
import { 
  sanitizeCustomerErrorMessage, 
  sanitizeCustomerOrderDto, 
  resolvePlayerValidationError,
  generateCorrelationId 
} from '../src/utils/providerErrorHandler';
import { g2BulkClient } from '../src/providers/g2bulk/client';
import { gamesDropProvider } from '../src/providers/gamesdrop';
import { providerRouter } from '../src/providers/router';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, details || '');
    testsFailed++;
  }
}

function assertNoProviderNames(text: string | any, contextName: string) {
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  const leaked = /\b(g2bulk|gamesdrop|fivesim|5sim|provider|المزود|مورد)\b/i.test(str);
  assert(!leaked, `No provider names or internal leak in [${contextName}]: "${str.slice(0, 80)}"`);
}

async function runTestSuite() {
  console.log('\n====================================================');
  console.log('  CUSTOMER PRIVACY & ERROR SANITIZATION TEST SUITE');
  console.log('====================================================\n');

  // Fetch an active Free Fire product from the DB for testing
  const prodRes = await pool.query(`
    SELECT id, "gameCategoryId", "productName" 
    FROM "Product" 
    WHERE "isActive" = true AND ("gameCategoryId" = 'freefire-me' OR "productName" ILIKE '%free fire%')
    LIMIT 1
  `);
  
  if (prodRes.rows.length === 0) {
    throw new Error('No active Free Fire product found in DB to run tests.');
  }

  const testProduct = prodRes.rows[0];
  console.log(`Using test product: ${testProduct.productName} (${testProduct.id})\n`);

  // ----------------------------------------------------
  console.log('--- TEST CASE 1: Provider returns 400 with invalid player ID ---');
  // ----------------------------------------------------
  // Mock g2BulkClient.checkPlayerId returning invalid status
  const originalCheckPlayerId = g2BulkClient.checkPlayerId.bind(g2BulkClient);
  (g2BulkClient as any).checkPlayerId = async () => ({
    name: '',
    valid: 'invalid'
  });

  const res1 = await validatePlayerAccount({
    productId: testProduct.id,
    gameUserId: `invalid_user_${Date.now()}`,
    ip: `198.51.100.${Math.floor(Math.random() * 200)}`
  });

  assert(res1.valid === false, 'Result is invalid (valid: false)');
  assert(res1.isUnavailable === false, 'Accurately recognized as invalid player, NOT provider outage (isUnavailable: false)');
  assert(
    res1.message === 'تعذّر التحقق من معرّف اللاعب. تأكد من صحة المعرّف وحاول مرة أخرى.',
    'Customer message matches exact expected Arabic text for invalid ID'
  );
  assertNoProviderNames(res1.message, 'Case 1 message');
  assertNoProviderNames(res1, 'Case 1 whole object');

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 2: Provider returns 400 with raw technical error ---');
  // ----------------------------------------------------
  (g2BulkClient as any).checkPlayerId = async () => {
    throw {
      status: 400,
      message: 'Upstream service error (400)',
      raw: { valid: 'invalid', message: 'Game and user_id are required' }
    };
  };

  const res2 = await validatePlayerAccount({
    productId: testProduct.id,
    gameUserId: `bad_param_${Date.now()}`,
    ip: `198.51.100.${Math.floor(Math.random() * 200)}`
  });

  assert(res2.valid === false, 'Handled 400 exception gracefully (valid: false)');
  assert(
    res2.message === 'تعذّر التحقق من معرّف اللاعب. تأكد من صحة المعرّف وحاول مرة أخرى.',
    'Raw 400 error converted to customer-friendly Arabic message'
  );
  assertNoProviderNames(res2.message, 'Case 2 message');
  assert(!res2.message?.includes('400'), 'HTTP status code 400 does not appear in customer message');

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 3: Provider returns 401 or 403 (Auth Failure) ---');
  // ----------------------------------------------------
  (g2BulkClient as any).checkPlayerId = async () => {
    throw {
      status: 401,
      message: 'API key is not configured in environment variables.',
      isAuthError: true
    };
  };

  const res3 = await validatePlayerAccount({
    productId: testProduct.id,
    gameUserId: `auth_test_${Date.now()}`,
    ip: `198.51.100.${Math.floor(Math.random() * 200)}`
  });

  assert(res3.valid === false, 'Auth error returns valid: false');
  assert(res3.isUnavailable === true, 'Accurately identified as service outage (isUnavailable: true)');
  assert(
    res3.message === 'خدمة التحقق غير متاحة حالياً، يرجى المحاولة لاحقاً.',
    'Customer message matches exact expected Arabic outage message'
  );
  assertNoProviderNames(res3.message, 'Case 3 message');
  assertNoProviderNames(res3, 'Case 3 whole object');
  assert(!JSON.stringify(res3).includes('API_KEY'), 'No API key or token leaked to customer');

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 4: Connection Timeout (504 / timeoutMs) ---');
  // ----------------------------------------------------
  (g2BulkClient as any).checkPlayerId = async () => {
    throw {
      status: 504,
      message: 'Upstream request timed out after 25000ms.',
      isTimeout: true
    };
  };

  const res4 = await validatePlayerAccount({
    productId: testProduct.id,
    gameUserId: `timeout_test_${Date.now()}`,
    ip: `198.51.100.${Math.floor(Math.random() * 200)}`
  });

  assert(res4.valid === false, 'Timeout returns valid: false');
  assert(res4.isUnavailable === true, 'Timeout identified as isUnavailable: true');
  assert(
    res4.message === 'خدمة التحقق غير متاحة حالياً، يرجى المحاولة لاحقاً.',
    'Timeout message is customer-friendly outage message'
  );
  assertNoProviderNames(res4.message, 'Case 4 message');
  assert(!res4.message?.includes('25000') && !res4.message?.includes('timeout'), 'No technical timeout numbers or words in response');

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 5: Primary Fails and Fallback Succeeds ---');
  // ----------------------------------------------------
  // GamesDrop throws 401 (fails), G2Bulk succeeds with player name
  (g2BulkClient as any).checkPlayerId = async () => ({
    name: 'TopHeroKiro',
    valid: 'valid'
  });

  const res5 = await validatePlayerAccount({
    productId: testProduct.id,
    gameUserId: `valid_player_${Date.now()}`,
    ip: `198.51.100.${Math.floor(Math.random() * 200)}`
  });

  assert(res5.valid === true, 'Fallback successfully verified player (valid: true)');
  assert(res5.playerName === 'TopHeroKiro', 'Player name accurately returned');
  assert(res5.message === 'تم التحقق من الحساب بنجاح', 'Message is clean without mentioning "المزود البديل"');
  assertNoProviderNames(res5.message, 'Case 5 message');

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 6: Both Providers Fail Simultaneously ---');
  // ----------------------------------------------------
  (g2BulkClient as any).checkPlayerId = async () => {
    throw {
      status: 503,
      message: 'Service Unavailable',
      raw: { error: 'Both down' }
    };
  };

  const res6 = await validatePlayerAccount({
    productId: testProduct.id,
    gameUserId: `both_fail_${Date.now()}`,
    ip: `198.51.100.${Math.floor(Math.random() * 200)}`
  });

  assert(res6.valid === false, 'Both providers failing returns valid: false');
  assert(res6.isUnavailable === true, 'Both failing accurately flagged as service outage (isUnavailable: true)');
  assert(
    res6.message === 'خدمة التحقق غير متاحة حالياً، يرجى المحاولة لاحقاً.',
    'Message is service unavailable, NOT invalid player ID'
  );
  assertNoProviderNames(res6.message, 'Case 6 message');

  // Restore original checkPlayerId
  (g2BulkClient as any).checkPlayerId = originalCheckPlayerId;

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 7: Rate Limiting Message Sanitization ---');
  // ----------------------------------------------------
  const uniqueIp = `198.51.200.${Math.floor(Math.random() * 200)}`;
  const ratePlayerId = `rate_user_${Date.now()}`;

  // Execute 5 rapid attempts
  for (let i = 0; i < 5; i++) {
    await validatePlayerAccount({
      productId: testProduct.id,
      gameUserId: ratePlayerId,
      ip: uniqueIp
    });
  }

  // 6th attempt must be rate-limited
  const res7 = await validatePlayerAccount({
    productId: testProduct.id,
    gameUserId: ratePlayerId,
    ip: uniqueIp
  });

  assert(res7.valid === false, '6th attempt is blocked (valid: false)');
  assert(res7.rateLimited === true, 'Flagged as rateLimited: true');
  assert(
    res7.message?.includes('تم تجاوز الحد المسموح لمحاولات فحص'),
    'Rate limit message is clean Arabic text'
  );
  assertNoProviderNames(res7.message, 'Case 7 message');

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 8: Order Error Message Sanitization ---');
  // ----------------------------------------------------
  const dirtyErrors = [
    'GamesDrop 401 INVALID_TOKEN',
    'G2Bulk error (400)',
    'Error connecting to provider G2Bulk: timeout',
    'المزود الأساسي (GAMESDROP) معطل حالياً',
    'Provider communication failed'
  ];

  for (const dirty of dirtyErrors) {
    const cleanMsg = sanitizeCustomerErrorMessage(dirty);
    assertNoProviderNames(cleanMsg, `Sanitizing: "${dirty}"`);
  }

  // ----------------------------------------------------
  console.log('\n--- TEST CASE 9: Customer Order DTO Sanitization ---');
  // ----------------------------------------------------
  const internalOrder = {
    id: 'ord_12345678',
    userId: 'usr_abc',
    gameId: 'freefire',
    packageId: 'pkg_110',
    packageName: 'Free Fire 110 Diamonds',
    playerId: '987654321',
    amount: 1000,
    status: 'COMPLETED',
    provider: 'G2BULK',
    providerOrderId: 998877,
    providerOfferId: '847',
    providerPrice: 0.93,
    providerCurrency: 'USD',
    providerCostUsd: 0.93,
    providerStatus: 'SUCCESS',
    orderType: 'G2BULK_VOUCHER',
    failureReason: 'G2Bulk error (400): Invalid account on G2Bulk provider'
  };

  const customerOrder = sanitizeCustomerOrderDto(internalOrder);

  assert((customerOrder as any).provider === undefined, 'provider field is completely stripped');
  assert((customerOrder as any).providerOrderId === undefined, 'providerOrderId field is completely stripped');
  assert((customerOrder as any).providerCostUsd === undefined, 'providerCostUsd field is completely stripped');
  assert((customerOrder as any).providerPrice === undefined, 'providerPrice field is completely stripped');
  assert((customerOrder as any).providerStatus === undefined, 'providerStatus field is completely stripped');
  assert(customerOrder.orderType === 'DIGITAL_VOUCHER', 'orderType G2BULK_VOUCHER mapped to DIGITAL_VOUCHER');
  assertNoProviderNames(customerOrder.failureReason, 'failureReason sanitized from any provider names');
  assertNoProviderNames(customerOrder, 'Whole customer order object');

  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================\n');

  await pool.end();

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
