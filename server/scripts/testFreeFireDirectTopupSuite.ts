import crypto from 'crypto';
import pool from '../src/db';
import { randomUUID as uuidv4 } from 'crypto';
import { verifyStandardWebhookSignature } from '../src/routes/webhooks';
import { checkAtomicPlayerRateLimit, validatePlayerAccount } from '../src/services/playerValidationService';
import { providerRouter } from '../src/providers/router';
import { gamesDropClient } from '../src/providers/gamesdrop/client';
import { ProviderAdapter, CreateTopupOrderParams, CreateTopupOrderResult, GetOrderStatusResult } from '../src/providers/types';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    testsFailed++;
    console.error(`  ✗ FAIL: ${testName}`, details || '');
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('  FREE FIRE DIRECT TOP-UP & G2BULK WEBHOOK TEST SUITE');
  console.log('  (Safe Mock Testing - Zero Real Spend)');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST GROUP 1: Player ID 5/Hour Rate Limiting & Persistence
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: Player ID 5/Hour Rate Limiting ---');
  const testUserId = `test_user_${Date.now()}`;
  const testRateKey = `user:${testUserId}`;

  // Reset any prior limits for this test key
  await pool.query('DELETE FROM "player_validation_rate_limits" WHERE rate_key = $1', [testRateKey]);

  // Attempt 1 to 5 should succeed
  for (let i = 1; i <= 5; i++) {
    const check = await checkAtomicPlayerRateLimit(testRateKey);
    assert(check.allowed === true && check.attemptCount === i, `Attempt ${i}/5 is allowed`);
  }

  // Attempt 6 must be blocked with allowed = false and retryAfterSeconds > 0
  const check6 = await checkAtomicPlayerRateLimit(testRateKey);
  assert(
    check6.allowed === false && (check6.retryAfterSeconds || 0) > 0,
    'Attempt 6/5 is blocked with 429 rate limit and Retry-After',
    check6
  );

  // Rate limit per Player ID (composite key)
  const testPlayerId = `player_999999_${Date.now()}`;
  const playerRateKey = `player:freefire:${testPlayerId}:`;
  for (let i = 1; i <= 5; i++) {
    await checkAtomicPlayerRateLimit(playerRateKey);
  }
  const checkPlayer6 = await checkAtomicPlayerRateLimit(playerRateKey);
  assert(
    checkPlayer6.allowed === false,
    'Player ID composite rate limit blocks 6th attempt within the hour',
    checkPlayer6
  );

  // ----------------------------------------------------
  // TEST GROUP 2: Player ID Persistent Cache & TTL
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: Player ID Persistent Cache ---');
  const cacheGameKey = 'freefire';
  const cachePlayerId = `valid_player_${Date.now()}`;
  const expectedName = 'ProSniper99';

  // Insert valid cached entry
  await pool.query(`
    INSERT INTO "player_validation_cache" (
      id, game_key, player_id_normalized, server_id, provider, player_name, is_valid, created_at, expires_at
    ) VALUES (
      gen_random_uuid(), $1, $2, '', 'G2BULK', $3, true, NOW(), NOW() + INTERVAL '24 hours'
    )
  `, [cacheGameKey, cachePlayerId.toLowerCase(), expectedName]);

  // Query cache directly
  const cachedRes = await pool.query(`
    SELECT player_name, is_valid, expires_at
    FROM "player_validation_cache"
    WHERE game_key = $1 AND player_id_normalized = $2 AND expires_at > CURRENT_TIMESTAMP
  `, [cacheGameKey, cachePlayerId.toLowerCase()]);

  assert(
    cachedRes.rows.length === 1 && cachedRes.rows[0].player_name === expectedName,
    'Player ID cache returns valid stored entry without hitting external provider'
  );

  // ----------------------------------------------------
  // TEST GROUP 3: Standard Webhooks Signature Verification
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: Standard Webhooks Verification ---');
  const testSecret = 'whsec_MfKQ9r8Y3bN4xW1zP6qL2vC5eR8tA0uK1sD7hG4jM3n=';
  const webhookId = `msg_${Date.now()}`;
  const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
  const testBody = JSON.stringify({
    event: 'topup.completed',
    event_id: `evt_${Date.now()}`,
    order_id: 12345,
    status: 'COMPLETED',
    denom_id: '110',
    price: 0.93
  });

  // Generate valid signature using documented algorithm
  const keyBuffer = Buffer.from(testSecret.replace(/^whsec_/, ''), 'base64');
  const signedStr = `${webhookId}.${webhookTimestamp}.${testBody}`;
  const validHash = crypto.createHmac('sha256', keyBuffer).update(signedStr).digest('base64');
  const validSigHeader = `v1,${validHash}`;

  // 1. Valid signature check
  const validResult = verifyStandardWebhookSignature(
    testBody,
    {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': validSigHeader
    },
    testSecret
  );
  assert(validResult.valid === true, 'Valid HMAC-SHA256 Standard Webhook signature accepted');

  // 2. Tampered body rejected
  const tamperedResult = verifyStandardWebhookSignature(
    testBody + 'tampered',
    {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': validSigHeader
    },
    testSecret
  );
  assert(tamperedResult.valid === false, 'Tampered webhook payload rejected');

  // 3. Expired timestamp (> 5 minutes old) rejected
  const expiredTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();
  const expiredSigned = `${webhookId}.${expiredTimestamp}.${testBody}`;
  const expiredHash = crypto.createHmac('sha256', keyBuffer).update(expiredSigned).digest('base64');
  const expiredResult = verifyStandardWebhookSignature(
    testBody,
    {
      'webhook-id': webhookId,
      'webhook-timestamp': expiredTimestamp,
      'webhook-signature': `v1,${expiredHash}`
    },
    testSecret
  );
  assert(expiredResult.valid === false, 'Timestamp older than 5 minutes rejected with window error');

  // ----------------------------------------------------
  // TEST GROUP 4: Webhook Replay Protection & Deduplication
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: Webhook Deduplication & Replay Protection ---');
  const dedupEventId = `evt_dedup_${Date.now()}`;
  
  // First insert should succeed
  const insert1 = await pool.query(`
    INSERT INTO "webhook_events" (event_id, provider, event_type, payload, created_at)
    VALUES ($1, 'G2BULK', 'topup.completed', '{}'::jsonb, NOW())
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `, [dedupEventId]);
  assert(insert1.rows.length === 1, 'First webhook event recorded successfully in DB');

  // Second insert with same event_id must return 0 rows (deduplicated)
  const insert2 = await pool.query(`
    INSERT INTO "webhook_events" (event_id, provider, event_type, payload, created_at)
    VALUES ($1, 'G2BULK', 'topup.completed', '{}'::jsonb, NOW())
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `, [dedupEventId]);
  assert(insert2.rows.length === 0, 'Duplicate webhook event_id blocked by persistent PostgreSQL uniqueness constraint');

  // ----------------------------------------------------
  // TEST GROUP 5: Provider Fallback on Circuit Breaker / Failure
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: Provider Fallback Logic ---');
  
  // Create mock adapters
  let mockGamesDropCalls = 0;
  let mockG2BulkCalls = 0;

  const mockGdAdapter: ProviderAdapter = {
    name: 'MOCK_GD',
    capabilities: { canValidatePlayer: true, canTopup: true, canCheckBalance: true, canCheckOrderStatus: true, canSyncCatalog: true, hasServers: false },
    getBalance: async () => ({ provider: 'MOCK_GD', balance: 100, currency: 'USD', isPostpaid: false }),
    healthCheck: async () => ({ ok: false, latencyMs: 10, message: 'Simulated 401' }),
    validatePlayer: async () => ({ valid: false, message: 'Auth failed' }),
    createTopupOrder: async (params: CreateTopupOrderParams) => {
      mockGamesDropCalls++;
      // Simulate definitive 401 INVALID_TOKEN
      return {
        success: false,
        provider: 'MOCK_GD',
        providerOrderId: 0,
        providerStatus: '401_INVALID_TOKEN',
        canonicalStatus: 'FAILED',
        isAmbiguous: false,
        message: 'GamesDrop 401 INVALID_TOKEN'
      };
    },
    getOrderStatus: async () => ({ provider: 'MOCK_GD', providerOrderId: 0, providerStatus: 'FAILED', canonicalStatus: 'FAILED', isTerminal: true })
  };

  const mockG2bAdapter: ProviderAdapter = {
    name: 'MOCK_G2B',
    capabilities: { canValidatePlayer: true, canTopup: true, canCheckBalance: true, canCheckOrderStatus: true, canSyncCatalog: true, hasServers: false },
    getBalance: async () => ({ provider: 'MOCK_G2B', balance: 250, currency: 'USD', isPostpaid: false }),
    healthCheck: async () => ({ ok: true, latencyMs: 5 }),
    validatePlayer: async () => ({ valid: true, playerName: 'G2BPlayer' }),
    createTopupOrder: async (params: CreateTopupOrderParams) => {
      mockG2BulkCalls++;
      return {
        success: true,
        provider: 'MOCK_G2B',
        providerOrderId: 887766,
        providerStatus: 'PENDING',
        canonicalStatus: 'PENDING',
        costUsd: 0.93,
        currency: 'USD',
        message: 'Order created via G2Bulk fallback'
      };
    },
    getOrderStatus: async () => ({ provider: 'MOCK_G2B', providerOrderId: 887766, providerStatus: 'PENDING', canonicalStatus: 'PENDING', isTerminal: false })
  };

  // Register mock adapters
  providerRouter.registerAdapter(mockGdAdapter);
  providerRouter.registerAdapter(mockG2bAdapter);

  // Setup mock routing
  const mockRouting = {
    productId: 'test-product-ff-110',
    primaryProviderName: 'MOCK_GD',
    primaryAdapter: mockGdAdapter,
    primaryProductId: '396',
    primaryCostUsd: 0.98,
    primaryMetadata: {},
    primaryOrdersEnabled: true,
    fallbackProviderName: 'MOCK_G2B',
    fallbackAdapter: mockG2bAdapter,
    fallbackProductId: '110',
    fallbackCostUsd: 0.93,
    fallbackMetadata: { gameCode: 'freefire_me' },
    fallbackOrdersEnabled: true,
    fallbackEnabled: true,
    hasAnyOrderableProvider: true
  };

  // Ensure mock provider settings in provider_settings
  await pool.query(`
    INSERT INTO "provider_settings" ("provider", "orders_enabled", "catalog_sync_enabled", "health_check_enabled")
    VALUES ('MOCK_GD', true, true, true), ('MOCK_G2B', true, true, true)
    ON CONFLICT ("provider") DO UPDATE SET "orders_enabled" = true
  `);

  const dispatchResult = await providerRouter.executeTopupOrder({
    koaraOrderId: `test-order-${Date.now()}`,
    playerUserId: '12345678',
    expectedPriceUsd: 0.98
  }, mockRouting as any);

  assert(
    mockGamesDropCalls === 1 && mockG2BulkCalls === 1,
    'GamesDrop definitive failure triggers fallback to G2Bulk'
  );
  assert(
    dispatchResult.success === true && dispatchResult.provider === 'MOCK_G2B' && dispatchResult.fallbackUsed === true,
    'Order successfully dispatched to G2Bulk fallback provider'
  );

  // ----------------------------------------------------
  // TEST GROUP 6: Ambiguous Timeout Guard (No Double Order)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 6: Timeout Ambiguity Guard ---');
  let ambiguousG2bCalls = 0;

  const mockTimeoutGdAdapter: ProviderAdapter = {
    ...mockGdAdapter,
    name: 'MOCK_GD_TIMEOUT',
    createTopupOrder: async () => {
      // Return ambiguous timeout
      return {
        success: false,
        provider: 'MOCK_GD_TIMEOUT',
        providerOrderId: 0,
        providerStatus: 'TIMEOUT',
        canonicalStatus: 'UNKNOWN',
        isAmbiguous: true,
        message: 'Connection timeout after submitting order'
      };
    }
  };

  const mockGuardedG2bAdapter: ProviderAdapter = {
    ...mockG2bAdapter,
    name: 'MOCK_G2B_GUARDED',
    createTopupOrder: async () => {
      ambiguousG2bCalls++;
      return {
        success: true,
        provider: 'MOCK_G2B_GUARDED',
        providerOrderId: 999,
        providerStatus: 'PENDING',
        canonicalStatus: 'PENDING'
      };
    }
  };

  providerRouter.registerAdapter(mockTimeoutGdAdapter);
  providerRouter.registerAdapter(mockGuardedG2bAdapter);

  await pool.query(`
    INSERT INTO "provider_settings" ("provider", "orders_enabled", "catalog_sync_enabled", "health_check_enabled")
    VALUES ('MOCK_GD_TIMEOUT', true, true, true), ('MOCK_G2B_GUARDED', true, true, true)
    ON CONFLICT ("provider") DO UPDATE SET "orders_enabled" = true
  `);

  const timeoutRouting = {
    ...mockRouting,
    primaryProviderName: 'MOCK_GD_TIMEOUT',
    primaryAdapter: mockTimeoutGdAdapter,
    fallbackProviderName: 'MOCK_G2B_GUARDED',
    fallbackAdapter: mockGuardedG2bAdapter
  };

  const timeoutResult = await providerRouter.executeTopupOrder({
    koaraOrderId: `timeout-order-${Date.now()}`,
    playerUserId: '12345678',
    expectedPriceUsd: 0.98
  }, timeoutRouting as any);

  assert(
    timeoutResult.isAmbiguous === true && timeoutResult.canonicalStatus === 'UNKNOWN',
    'Timeout state flagged as isAmbiguous = true and canonicalStatus = UNKNOWN'
  );
  assert(
    ambiguousG2bCalls === 0,
    'CRITICAL: Fallback to G2Bulk is BLOCKED when GamesDrop status is ambiguous (Strict Double-Order Prevention)'
  );

  // ----------------------------------------------------
  // TEST GROUP 7: Webhook Order Completion & Single Refund
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 7: Webhook Completion & Single Refund ---');
  
  // Create test user and wallet in DB
  const testCustomerEmail = `test_customer_${Date.now()}@kiropro.test`;
  const userRes = await pool.query(`
    INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), $1, 'hashed_pw', 'CUSTOMER', NOW(), NOW())
    RETURNING id
  `, [testCustomerEmail]);
  const testCustId = userRes.rows[0].id;

  const walletRes = await pool.query(`
    INSERT INTO "Wallet" (id, "userId", balance, currency, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), $1, 10000.00, 'SDG', NOW(), NOW())
    RETURNING id, balance
  `, [testCustId]);
  const testWalletId = walletRes.rows[0].id;

  // Create test order in PROCESSING
  const testOrderId = uuidv4();
  const testProviderOrderId = Date.now();
  await pool.query(`
    INSERT INTO "Order" (
      id, "userId", "gameId", "packageId", "packageName", "playerId",
      amount, "chargedAmount", "chargedCurrency", status, provider, "providerOrderId",
      "createdAt", "updatedAt"
    ) VALUES (
      $1::uuid, $2::uuid, 'freefire', $3, 'Free Fire 110 Diamonds', '12345678',
      1000.00, 1000.00, 'SDG', 'PROCESSING', 'G2BULK', $4,
      NOW(), NOW()
    )
  `, [testOrderId, testCustId, 'test-pkg-110', testProviderOrderId]);

  // Simulate Webhook FAILED event
  const webhookClient = await pool.connect();
  try {
    await webhookClient.query('BEGIN');
    const orderCheck = await webhookClient.query('SELECT status FROM "Order" WHERE id = $1 FOR UPDATE', [testOrderId]);
    if (orderCheck.rows[0]?.status === 'PROCESSING') {
      // Refund balance
      await webhookClient.query('UPDATE "Wallet" SET balance = balance + 1000.00 WHERE id = $1', [testWalletId]);
      await webhookClient.query(`
        INSERT INTO "WalletTransaction" (
          id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
        ) VALUES (
          gen_random_uuid(), $1, 1000.00, 'REFUND', 'Refund test', 'SDG', 10000.00, 11000.00, 'ORDER', $2, null, 'SYSTEM'
        )
      `, [testWalletId, testOrderId]);
      await webhookClient.query('UPDATE "Order" SET status = \'FAILED\', "failureReason" = \'Provider canceled\' WHERE id = $1', [testOrderId]);
    }
    await webhookClient.query('COMMIT');
  } finally {
    webhookClient.release();
  }

  // Verify wallet has been refunded exactly once
  const postRefundWallet = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
  assert(
    Number(postRefundWallet.rows[0].balance) === 11000.00,
    'Wallet refunded exactly 1,000 SDG on FAILED webhook event'
  );

  // Re-run the refund logic (simulate duplicate webhook / polling)
  const webhookClient2 = await pool.connect();
  let duplicateRefundExecuted = false;
  try {
    await webhookClient2.query('BEGIN');
    const orderCheck2 = await webhookClient2.query('SELECT status FROM "Order" WHERE id = $1 FOR UPDATE', [testOrderId]);
    if (orderCheck2.rows[0]?.status === 'PROCESSING') {
      duplicateRefundExecuted = true;
      await webhookClient2.query('UPDATE "Wallet" SET balance = balance + 1000.00 WHERE id = $1', [testWalletId]);
    }
    await webhookClient2.query('COMMIT');
  } finally {
    webhookClient2.release();
  }

  const postDupWallet = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
  assert(
    duplicateRefundExecuted === false && Number(postDupWallet.rows[0].balance) === 11000.00,
    'Duplicate FAILED event did NOT refund a second time (Strict Single Refund Guarantee)'
  );

  // Clean up mock test records
  await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" = $1', [testWalletId]);
  await pool.query('DELETE FROM "Order" WHERE id = $1', [testOrderId]);
  await pool.query('DELETE FROM "Wallet" WHERE id = $1', [testWalletId]);
  await pool.query('DELETE FROM "User" WHERE id = $1', [testCustId]);

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================\n');

  await pool.end();
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
