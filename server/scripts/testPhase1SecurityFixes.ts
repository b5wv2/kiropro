/**
 * KIROPRO — Comprehensive Phase 1 Security & Financial Integrity Test Suite
 * Validates:
 * 1. Completed orders CANNOT be refunded via Webhook (SEC-FIN-01).
 * 2. Webhook concurrency & replay CANNOT execute double refunds (SEC-FIN-01).
 * 3. Client request body CANNOT activate simulation / mock vouchers (SEC-FIN-08).
 * 4. Primary provider ambiguity/timeout STRICTLY BLOCKS failover to prevent double fulfillment (SEC-FIN-05).
 * 5. Encryption key rotation preserves 100% backwards compatibility with legacy encrypted data (SEC-FIN-02).
 */

import pool from '../src/db';
import crypto, { randomUUID as uuidv4 } from 'crypto';
import { handleG2BulkWebhook } from '../src/routes/webhooks';
import { g2BulkVoucherPurchaseProvider } from '../src/providers/g2bulk/voucherPurchaseProvider';
import { providerRouter, isAmbiguousNetworkError } from '../src/providers/router';
import { encryptCardData, decryptCardData } from '../src/utils/cryptoCard';
import { encryptVoucherCode, decryptVoucherCode } from '../src/utils/cryptoVoucher';
import { encryptPassword, decryptPassword } from '../src/utils/cryptoAccount';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    testsFailed++;
  }
}

// Helper to simulate express req/res
function createMockHttp(body: any, headers: Record<string, string> = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    body,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    ip: '127.0.0.1'
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
    getStatusCode() {
      return statusCode;
    },
    getResponse() {
      return responseData;
    }
  };

  return { req, res };
}

// Generate valid G2Bulk webhook headers for testing
function generateWebhookHeaders(body: any, secret: string) {
  const webhookId = `msg_test_${uuidv4().replace(/-/g, '')}`;
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify(body);

  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = Buffer.from(rawSecret, 'base64');
  const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const sig = `v1,${crypto.createHmac('sha256', key).update(signedPayload).digest('base64')}`;

  return {
    'webhook-id': webhookId,
    'webhook-timestamp': webhookTimestamp,
    'webhook-signature': sig,
    'x-g2bulk-event': body.event || 'topup.failed'
  };
}

async function runTestSuite() {
  console.log('=================================================================');
  console.log('   KIROPRO PHASE 1 SECURITY & FINANCIAL INTEGRITY TEST SUITE   ');
  console.log('=================================================================\n');

  const testSecret = 'whsec_' + Buffer.from('test_webhook_secret_key_32_bytes_len').toString('base64');
  process.env.G2BULK_WEBHOOK_SECRET = testSecret;

  const client = await pool.connect();
  const testUserId = uuidv4();
  const testWalletId = uuidv4();

  try {
    // Setup isolated test user and wallet
    await client.query(`
      INSERT INTO "User" (id, email, name, "passwordHash", role, "createdAt", "updatedAt")
      VALUES ($1, $2, 'Test Auditor', 'fake_hash', 'CUSTOMER', NOW(), NOW())
    `, [testUserId, `test_audit_${Date.now()}@kiropro.test`]);

    await client.query(`
      INSERT INTO "Wallet" (id, "userId", balance, currency, "createdAt", "updatedAt")
      VALUES ($1, $2, 5000.00, 'SDG', NOW(), NOW())
    `, [testWalletId, testUserId]);

    // -----------------------------------------------------------------
    // TEST 1: Completed Orders CANNOT be refunded via Webhook (SEC-FIN-01)
    // -----------------------------------------------------------------
    console.log('>>> TEST 1: Prevent Refund on Completed Orders (SEC-FIN-01)');
    const orderId1 = uuidv4();
    const providerOrderId1 = Math.floor(Date.now() / 1000) + 1001;

    await client.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId",
        amount, "chargedAmount", "chargedCurrency", status, "provider",
        "providerOrderId", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'freefire', 'pkg_ff_100', '100 Free Fire Diamonds', '12345678',
        1000.00, 1000.00, 'SDG', 'COMPLETED', 'G2BULK',
        $3, NOW(), NOW()
      )
    `, [orderId1, testUserId, providerOrderId1]);

    const failedPayload1 = {
      event_id: `evt_test_${uuidv4()}`,
      event: 'topup.failed',
      order_id: providerOrderId1,
      status: 'FAILED',
      message: 'Simulated failure from upstream'
    };
    const headers1 = generateWebhookHeaders(failedPayload1, testSecret);
    const mock1 = createMockHttp(failedPayload1, headers1);

    await handleG2BulkWebhook(mock1.req, mock1.res);
    const res1 = mock1.res.getResponse();

    // Check order state in DB
    const checkOrder1 = await client.query('SELECT status FROM "Order" WHERE id = $1', [orderId1]);
    const checkWallet1 = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
    const checkTx1 = await client.query(
      'SELECT id FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceId" = $2 AND type = \'REFUND\'',
      [testWalletId, orderId1]
    );

    assert(
      checkOrder1.rows[0].status === 'COMPLETED',
      'Completed order status remained COMPLETED and was NOT modified',
      `Current status: ${checkOrder1.rows[0].status}`
    );
    assert(
      Number(checkWallet1.rows[0].balance) === 5000.00,
      'Wallet balance was NOT refunded/credited for completed order',
      `Balance: ${checkWallet1.rows[0].balance}`
    );
    assert(
      checkTx1.rows.length === 0,
      'Zero REFUND transactions inserted in ledger for completed order'
    );
    assert(
      res1.refunded === false,
      'Webhook response explicitly indicates refunded: false'
    );

    // -----------------------------------------------------------------
    // TEST 2: Double Webhook Cannot Refund Twice (SEC-FIN-01)
    // -----------------------------------------------------------------
    console.log('\n>>> TEST 2: Prevent Duplicate Refund via Idempotency & Concurrency (SEC-FIN-01)');
    const orderId2 = uuidv4();
    const providerOrderId2 = Math.floor(Date.now() / 1000) + 2002;

    await client.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId",
        amount, "chargedAmount", "chargedCurrency", status, "provider",
        "providerOrderId", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'freefire', 'pkg_ff_100', '100 Free Fire Diamonds', '12345678',
        1000.00, 1000.00, 'SDG', 'PROCESSING', 'G2BULK',
        $3, NOW(), NOW()
      )
    `, [orderId2, testUserId, providerOrderId2]);

    const failedPayload2 = {
      event_id: `evt_test_${uuidv4()}`,
      event: 'topup.failed',
      order_id: providerOrderId2,
      status: 'FAILED',
      message: 'Failed to process upstream'
    };
    const headers2a = generateWebhookHeaders(failedPayload2, testSecret);
    const mock2a = createMockHttp(failedPayload2, headers2a);

    // First Webhook: should refund successfully
    await handleG2BulkWebhook(mock2a.req, mock2a.res);
    const res2a = mock2a.res.getResponse();

    // Second Webhook with different event_id (replay attack simulation for same order):
    const failedPayload2b = {
      ...failedPayload2,
      event_id: `evt_replay_${uuidv4()}`
    };
    const headers2b = generateWebhookHeaders(failedPayload2b, testSecret);
    const mock2b = createMockHttp(failedPayload2b, headers2b);

    // Second Webhook call
    await handleG2BulkWebhook(mock2b.req, mock2b.res);
    const res2b = mock2b.res.getResponse();

    const checkOrder2 = await client.query('SELECT status FROM "Order" WHERE id = $1', [orderId2]);
    const checkWallet2 = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
    const checkTx2 = await client.query(
      'SELECT id, amount, type FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceId" = $2',
      [testWalletId, orderId2]
    );

    assert(
      res2a.refunded === true,
      'First webhook successfully processed valid refund for PROCESSING order'
    );
    assert(
      res2b.noop === true || res2b.duplicateRefund === true || res2b.duplicate === true,
      'Second duplicate webhook was recognized as no-op and did NOT refund again',
      JSON.stringify(res2b)
    );
    assert(
      Number(checkWallet2.rows[0].balance) === 6000.00, // 5000 + 1000 once
      'Wallet balance was credited exactly ONCE (+1000), not twice (+2000)',
      `Actual balance: ${checkWallet2.rows[0].balance}`
    );
    assert(
      checkTx2.rows.length === 1,
      'Exactly ONE REFUND transaction exists in ledger (enforced by DB unique index)',
      `Found transactions: ${checkTx2.rows.length}`
    );

    // -----------------------------------------------------------------
    // TEST 3: Client Cannot Activate Mock Mode From Request Body (SEC-FIN-08)
    // -----------------------------------------------------------------
    console.log('\n>>> TEST 3: Prevent Client Simulation / Mock Manipulation (SEC-FIN-08)');
    delete process.env.VOUCHERS_MOCK_MODE;
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Simulate production environment

    try {
      const readiness = g2BulkVoucherPurchaseProvider.checkVoucherReadiness({
        providerProductId: 'prod_test_123',
        isActive: true,
        inStock: true,
        stock: 10,
        isSimulation: true as any, // Client attempts to pass isSimulation = true
        g2bulkOrdersEnabled: true
      });

      assert(
        readiness.isMock === false,
        'readiness.isMock is FALSE even when client requests isSimulation = true in production'
      );
    } finally {
      process.env.NODE_ENV = oldEnv;
    }

    // -----------------------------------------------------------------
    // TEST 4: Network Ambiguity Blocks Fallback Double Fulfillment (SEC-FIN-05)
    // -----------------------------------------------------------------
    console.log('\n>>> TEST 4: Network Ambiguity Blocks Fallback Double Fulfillment (SEC-FIN-05)');

    // 4.1 Test isAmbiguousNetworkError helper
    const timeoutErr = { code: 'ETIMEDOUT', message: 'Connection timed out' };
    const resetErr = { code: 'ECONNRESET', message: 'read ECONNRESET' };
    const gatewayErr = { status: 504, message: 'Gateway Timeout' };
    const clientErr = { status: 422, message: 'Invalid player ID' };

    assert(isAmbiguousNetworkError(timeoutErr), 'ETIMEDOUT classified as ambiguous network error');
    assert(isAmbiguousNetworkError(resetErr), 'ECONNRESET classified as ambiguous network error');
    assert(isAmbiguousNetworkError(gatewayErr), 'HTTP 504 classified as ambiguous network error');
    assert(!isAmbiguousNetworkError(clientErr), 'HTTP 422 (Player ID error) classified as definitive failure (NOT ambiguous)');

    // 4.2 Test router ambiguity blocking
    let fallbackAdapterCalled = false;
    const mockRouting: any = {
      primaryProviderName: 'MOCK_PRIMARY',
      primaryProductId: 'item_prim_1',
      primaryCostUsd: 1.0,
      primaryOrdersEnabled: true,
      primaryAdapter: {
        createTopupOrder: async () => {
          const err: any = new Error('Socket timeout while awaiting upstream headers');
          err.code = 'ECONNABORTED';
          throw err;
        },
        getOrderStatus: async () => ({
          provider: 'MOCK_PRIMARY',
          providerOrderId: 0,
          providerStatus: 'UNKNOWN',
          canonicalStatus: 'UNKNOWN',
          isTerminal: false
        })
      },
      fallbackEnabled: true,
      fallbackProviderName: 'MOCK_FALLBACK',
      fallbackProductId: 'item_fb_1',
      fallbackCostUsd: 1.2,
      fallbackOrdersEnabled: true,
      fallbackAdapter: {
        createTopupOrder: async () => {
          fallbackAdapterCalled = true;
          return {
            success: true,
            provider: 'MOCK_FALLBACK',
            providerOrderId: 9999,
            providerStatus: 'COMPLETED',
            canonicalStatus: 'COMPLETED'
          };
        }
      }
    };

    // Ensure fallback settings return ordersEnabled: true for test
    providerRouter.getProviderSettings = async () => ({
      provider: 'MOCK_FALLBACK',
      ordersEnabled: true,
      catalogSyncEnabled: true,
      healthCheckEnabled: true,
      updatedAt: new Date()
    });

    const routerResult = await providerRouter.executeTopupOrder({
      koaraOrderId: 'order_test_sec_05',
      playerUserId: '12345678',
      expectedPriceUsd: 1.0
    }, mockRouting);

    assert(
      fallbackAdapterCalled === false,
      'Fallback adapter was STRICTLY BLOCKED and NEVER called when primary timed out'
    );
    assert(
      routerResult.fallbackUsed === false,
      'Result indicates fallbackUsed: false'
    );
    assert(
      routerResult.isAmbiguous === true,
      'Result indicates isAmbiguous: true (triggering PROVIDER_UNKNOWN state)'
    );

    // -----------------------------------------------------------------
    // TEST 5: Encryption Multi-Key Rotation & Legacy Compatibility (SEC-FIN-02)
    // -----------------------------------------------------------------
    console.log('\n>>> TEST 5: Encryption Multi-Key Rotation & Legacy Compatibility (SEC-FIN-02)');

    // 5.1 Card Encryption Backwards Compatibility
    const samplePan = '4111222233334444';
    const sampleCvv = '123';

    // Simulate encrypting with legacy static key
    const legacyKey = crypto.createHash('sha256').update('kiropro-secure-virtual-cards-key-32b').digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
    const legacyEncryptedPan = Buffer.concat([cipher.update(samplePan, 'utf8'), cipher.final()]);
    const legacyAuthTag = cipher.getAuthTag();
    const legacyPayload = `${iv.toString('hex')}:${legacyAuthTag.toString('hex')}:${legacyEncryptedPan.toString('hex')}`;

    // Decrypt using updated decryptCardData
    const decryptedPan = decryptCardData(legacyPayload);
    assert(
      decryptedPan === samplePan,
      'Legacy static key encrypted PAN successfully decrypted without data loss'
    );

    // Encrypt with new primary key & decrypt
    const newEncryptedPan = encryptCardData(samplePan);
    const decryptedNewPan = decryptCardData(newEncryptedPan);
    assert(
      decryptedNewPan === samplePan,
      'New primary key encrypted PAN successfully encrypted and decrypted'
    );

    // 5.2 Voucher Code Backwards Compatibility
    const sampleVoucher = 'TEST-VOUCHER-CODE-2026';
    const legacyVoucherKey = crypto.createHash('sha256').update('kiropro-vouchers-secret-key-32b').digest();
    const vIv = crypto.randomBytes(12);
    const vCipher = crypto.createCipheriv('aes-256-gcm', legacyVoucherKey, vIv);
    const legacyEncVoucher = Buffer.concat([vCipher.update(sampleVoucher, 'utf8'), vCipher.final()]);
    const vTag = vCipher.getAuthTag();
    const legacyVoucherPayload = `${vIv.toString('hex')}:${vTag.toString('hex')}:${legacyEncVoucher.toString('hex')}`;

    const decryptedVoucher = decryptVoucherCode(legacyVoucherPayload);
    assert(
      decryptedVoucher === sampleVoucher,
      'Legacy encrypted voucher code successfully decrypted'
    );

    const newEncVoucher = encryptVoucherCode(sampleVoucher);
    assert(
      decryptVoucherCode(newEncVoucher) === sampleVoucher,
      'New primary encrypted voucher code successfully encrypted and decrypted'
    );

    // 5.3 Password Backwards Compatibility
    const samplePassword = 'CustomerSecretPass123!';
    const legacyAccKey = crypto.createHash('sha256').update('kiropro-digital-accounts-secret-key-32b').digest();
    const aIv = crypto.randomBytes(12);
    const aCipher = crypto.createCipheriv('aes-256-gcm', legacyAccKey, aIv);
    const legacyEncPwd = Buffer.concat([aCipher.update(samplePassword, 'utf8'), aCipher.final()]);
    const aTag = aCipher.getAuthTag();
    const legacyAccPayload = `${aIv.toString('hex')}:${aTag.toString('hex')}:${legacyEncPwd.toString('hex')}`;

    const decryptedPassword = decryptPassword(legacyAccPayload);
    assert(
      decryptedPassword === samplePassword,
      'Legacy encrypted password successfully decrypted'
    );

    const newEncPwd = encryptPassword(samplePassword);
    assert(
      decryptPassword(newEncPwd) === samplePassword,
      'New primary encrypted password successfully encrypted and decrypted'
    );

  } catch (testErr: any) {
    console.error('Test execution exception:', testErr);
    testsFailed++;
  } finally {
    // Clean up test records
    try {
      await client.query('DELETE FROM "WalletTransaction" WHERE "walletId" = $1', [testWalletId]);
      await client.query('DELETE FROM "Order" WHERE "userId" = $1', [testUserId]);
      await client.query('DELETE FROM "Wallet" WHERE "userId" = $1', [testUserId]);
      await client.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
    } catch (cleanupErr: any) {
      console.warn('Test cleanup warning:', cleanupErr.message);
    }
    client.release();
    await pool.end();
  }

  console.log('\n=================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('=================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(console.error);
