/**
 * KIROPRO — Comprehensive G2Bulk Webhook Test Suite (10 Required Scenarios)
 * 
 * Tests the real HTTP server endpoints with full Express middleware stack:
 * 1. Valid signature with Test/Ping event (200 OK, isTest: true).
 * 2. Invalid signature (401 Unauthorized).
 * 3. Missing signature / headers (401 Unauthorized).
 * 4. Expired timestamp > 300s (401 Unauthorized).
 * 5. Replay / Duplicate event (200 OK, duplicate: true, idempotent no-op).
 * 6. Non-existent order ID (200 OK, Order not found, event recorded).
 * 7. Failure event for COMPLETED order (200 OK, refunded: false, status stays COMPLETED).
 * 8. Duplicate failure events on PROCESSING order (exactly 1 REFUND transaction in ledger, balance credited once).
 * 9. Concurrent Webhook and Polling execution (atomic locking, zero double refund).
 * 10. No-redirect check on POST /webhook/provider and POST /webhook/prvidr (direct response, not 301/302).
 */

import crypto, { randomUUID as uuidv4 } from 'crypto';
import pool from '../src/db';

// Ensure index.ts doesn't bind to default PORT=5000 so we can spin up an ephemeral server
process.env.VERCEL = '1';

const testSecret = 'whsec_' + Buffer.from('g2bulk_test_webhook_secret_key_32_bytes!').toString('base64');
process.env.G2BULK_WEBHOOK_SECRET = testSecret;

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

// Generate valid Standard Webhook headers for G2Bulk
function generateWebhookHeaders(
  bodyString: string,
  secret: string,
  options?: {
    customId?: string;
    customTimestamp?: number | string;
    corruptSignature?: boolean;
    omitSignature?: boolean;
    omitHeaders?: boolean;
    eventType?: string;
  }
): Record<string, string> {
  if (options?.omitHeaders) {
    return { 'content-type': 'application/json' };
  }

  const webhookId = options?.customId || `msg_${uuidv4().replace(/-/g, '')}`;
  const webhookTimestamp = String(options?.customTimestamp !== undefined ? options.customTimestamp : Math.floor(Date.now() / 1000));

  if (options?.omitSignature) {
    return {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'x-g2bulk-event': options?.eventType || 'topup.completed'
    };
  }

  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = Buffer.from(rawSecret, 'base64');
  const signedPayload = `${webhookId}.${webhookTimestamp}.${bodyString}`;
  let sig = `v1,${crypto.createHmac('sha256', key).update(signedPayload).digest('base64')}`;

  if (options?.corruptSignature) {
    sig = 'v1,invalid_forged_base64_signature_here_value==';
  }

  return {
    'content-type': 'application/json',
    'webhook-id': webhookId,
    'webhook-timestamp': webhookTimestamp,
    'webhook-signature': sig,
    'x-g2bulk-event': options?.eventType || 'topup.completed'
  };
}

async function runSuite() {
  console.log('======================================================================');
  console.log('       KIROPRO — G2BULK WEBHOOKS & FINANCIAL INTEGRITY TEST SUITE     ');
  console.log('======================================================================\n');

  // Dynamically load Express app
  const appModule = await import('../src/index');
  const app = appModule.default;

  // Start ephemeral server
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  const client = await pool.connect();
  const testUserId = uuidv4();
  const testWalletId = uuidv4();

  try {
    // 0. Setup test user and wallet
    await client.query(`
      INSERT INTO "User" (id, email, name, "passwordHash", role, "createdAt", "updatedAt")
      VALUES ($1, $2, 'Webhook Test Auditor', 'hash_test', 'CUSTOMER', NOW(), NOW())
    `, [testUserId, `webhook_test_${Date.now()}@kiropro.test`]);

    await client.query(`
      INSERT INTO "Wallet" (id, "userId", balance, currency, "createdAt", "updatedAt")
      VALUES ($1, $2, 500.00, 'SDG', NOW(), NOW())
    `, [testWalletId, testUserId]);

    // -----------------------------------------------------------------------
    // SCENARIO 1: Valid signature with Test/Ping event
    // -----------------------------------------------------------------------
    console.log('>>> SCENARIO 1: Valid signature with Test/Ping event');
    {
      const pingId = `evt_suite_ping_${uuidv4()}`;
      const pingBody = JSON.stringify({
        event_id: pingId,
        event: 'ping',
        timestamp: Math.floor(Date.now() / 1000)
      });
      const headers = generateWebhookHeaders(pingBody, testSecret, { customId: pingId, eventType: 'ping' });

      const res = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body: pingBody
      });
      const data = await res.json();

      assert(res.status === 200, 'HTTP 200 OK returned for valid ping event', `Status: ${res.status}`);
      assert(data.success === true && data.isTest === true, 'Response acknowledges test/ping event', JSON.stringify(data));

      // Also verify alias /webhook/prvidr
      const pingId2 = `evt_suite_ping2_${uuidv4()}`;
      const pingBody2 = JSON.stringify({
        event_id: pingId2,
        event: 'test',
        timestamp: Math.floor(Date.now() / 1000)
      });
      const headers2 = generateWebhookHeaders(pingBody2, testSecret, { customId: pingId2, eventType: 'test' });
      const res2 = await fetch(`${baseUrl}/webhook/prvidr`, {
        method: 'POST',
        headers: headers2,
        body: pingBody2
      });
      const data2 = await res2.json();
      assert(res2.status === 200, 'HTTP 200 OK returned on alias /webhook/prvidr', `Status: ${res2.status}`);
      assert(data2.isTest === true, 'Alias /webhook/prvidr correctly routes to handler', JSON.stringify(data2));
    }

    // -----------------------------------------------------------------------
    // SCENARIO 2: Invalid signature
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 2: Invalid signature rejection');
    {
      const evtId = `evt_suite_forged_${uuidv4()}`;
      const body = JSON.stringify({
        event_id: evtId,
        event: 'topup.completed',
        order_id: 999999
      });
      const headers = generateWebhookHeaders(body, testSecret, {
        customId: evtId,
        corruptSignature: true
      });

      const res = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body
      });
      const data = await res.json();

      assert(res.status === 401, 'HTTP 401 Unauthorized returned for forged signature', `Status: ${res.status}`);
      assert(data.error && data.error.includes('signature verification failed'), 'Error message clarifies verification failure', data.error);
    }

    // -----------------------------------------------------------------------
    // SCENARIO 3: Missing signature / headers
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 3: Missing signature / headers rejection');
    {
      const body = JSON.stringify({ event: 'ping' });
      // Missing signature header entirely
      const headersNoSig = generateWebhookHeaders(body, testSecret, { omitSignature: true });
      const resNoSig = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers: headersNoSig,
        body
      });
      const dataNoSig = await resNoSig.json();

      assert(resNoSig.status === 401, 'HTTP 401 Unauthorized returned when webhook-signature header is missing', `Status: ${resNoSig.status}`);
      assert(dataNoSig.error && dataNoSig.error.includes('Missing required webhook headers'), 'Rejects missing headers', dataNoSig.error);

      // Missing all webhook headers
      const resNoHeaders = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      });
      assert(resNoHeaders.status === 401, 'HTTP 401 returned when all webhook headers are missing', `Status: ${resNoHeaders.status}`);
    }

    // -----------------------------------------------------------------------
    // SCENARIO 4: Expired timestamp (> 300 seconds)
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 4: Expired timestamp rejection (Replay protection)');
    {
      const expiredTs = Math.floor(Date.now() / 1000) - 350; // 350 seconds ago (> 300s tolerance)
      const evtId = `evt_suite_expired_${uuidv4()}`;
      const body = JSON.stringify({
        event_id: evtId,
        event: 'topup.completed',
        order_id: 123456
      });
      const headers = generateWebhookHeaders(body, testSecret, {
        customId: evtId,
        customTimestamp: expiredTs
      });

      const res = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body
      });
      const data = await res.json();

      assert(res.status === 401, 'HTTP 401 Unauthorized returned for expired timestamp', `Status: ${res.status}`);
      assert(data.error && data.error.includes('5-minute tolerance window'), 'Response cites timestamp tolerance window', data.error);
    }

    // -----------------------------------------------------------------------
    // SCENARIO 5: Replay / Duplicate event handling
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 5: Replay / Duplicate event handling (Idempotency)');
    {
      const dupEvtId = `evt_suite_dup_${uuidv4()}`;
      const body = JSON.stringify({
        event_id: dupEvtId,
        event: 'ping',
        order_id: null
      });
      const headers = generateWebhookHeaders(body, testSecret, { customId: dupEvtId });

      // First delivery
      const res1 = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body
      });
      const data1 = await res1.json();
      assert(res1.status === 200, 'First delivery returns 200 OK', `Status: ${res1.status}`);

      // Second delivery (exact same event_id)
      const res2 = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body
      });
      const data2 = await res2.json();

      assert(res2.status === 200, 'Duplicate delivery returns 200 OK (no 500 error)', `Status: ${res2.status}`);
      // Either marked test or duplicate: true
      assert(data2.success === true, 'Duplicate delivery acknowledged safely', JSON.stringify(data2));

      // Test duplicate on a non-test event with order
      const dupOrderEvtId = `evt_suite_dup_ord_${uuidv4()}`;
      const bodyOrder = JSON.stringify({
        event_id: dupOrderEvtId,
        event: 'topup.completed',
        order_id: '999999999'
      });
      const headersOrder = generateWebhookHeaders(bodyOrder, testSecret, { customId: dupOrderEvtId });
      await fetch(`${baseUrl}/webhook/provider`, { method: 'POST', headers: headersOrder, body: bodyOrder });
      const resDup = await fetch(`${baseUrl}/webhook/provider`, { method: 'POST', headers: headersOrder, body: bodyOrder });
      const dataDup = await resDup.json();
      assert(dataDup.duplicate === true, 'Non-test duplicate event flagged duplicate: true', JSON.stringify(dataDup));
    }

    // -----------------------------------------------------------------------
    // SCENARIO 6: Event referencing non-existent order
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 6: Non-existent order ID event');
    {
      const nonExistentEvtId = `evt_suite_notfound_${uuidv4()}`;
      const body = JSON.stringify({
        event_id: nonExistentEvtId,
        event: 'topup.completed',
        order_id: '888888888888',
        status: 'COMPLETED'
      });
      const headers = generateWebhookHeaders(body, testSecret, { customId: nonExistentEvtId });

      const res = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body
      });
      const data = await res.json();

      assert(res.status === 200, 'HTTP 200 OK returned for unknown order (prevents upstream retry storms)', `Status: ${res.status}`);
      assert(data.message && data.message.includes('not found'), 'Response indicates order not found in KIROPRO', data.message);

      // Check event is logged in webhook_events
      const evtCheck = await client.query('SELECT event_id FROM webhook_events WHERE event_id = $1', [nonExistentEvtId]);
      assert(evtCheck.rows.length === 1, 'Event was logged into webhook_events audit table');
    }

    // -----------------------------------------------------------------------
    // SCENARIO 7: Failure event for COMPLETED order
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 7: Failure event for COMPLETED order (Strictly Blocks Rollback & Refund)');
    {
      const compOrderId = uuidv4();
      const compProviderOrderId = Math.floor(Date.now() / 1000) + 7001;

      await client.query(`
        INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId",
          amount, "chargedAmount", "chargedCurrency", status, "provider",
          "providerOrderId", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, 'freefire', 'pkg_ff_700', '700 FF Diamonds', '99887766',
          150.00, 150.00, 'SDG', 'COMPLETED', 'G2BULK',
          $3, NOW(), NOW()
        )
      `, [compOrderId, testUserId, compProviderOrderId]);

      const failEvtId = `evt_suite_fail_on_comp_${uuidv4()}`;
      const body = JSON.stringify({
        event_id: failEvtId,
        event: 'topup.failed',
        order_id: compProviderOrderId,
        status: 'FAILED',
        message: 'Forged/late failure message'
      });
      const headers = generateWebhookHeaders(body, testSecret, { customId: failEvtId });

      const res = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body
      });
      const data = await res.json();

      // Verify order status stayed COMPLETED
      const orderCheck = await client.query('SELECT status FROM "Order" WHERE id = $1', [compOrderId]);
      const walletCheck = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
      const txCheck = await client.query('SELECT id FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceId" = $2', [testWalletId, compOrderId]);

      assert(res.status === 200, 'HTTP 200 OK returned to G2Bulk', `Status: ${res.status}`);
      assert(data.refunded === false, 'Webhook response explicitly confirms refunded: false', JSON.stringify(data));
      assert(orderCheck.rows[0].status === 'COMPLETED', 'Order status STRICTLY remained COMPLETED', `Status: ${orderCheck.rows[0].status}`);
      assert(Number(walletCheck.rows[0].balance) === 500.00, 'Wallet balance remained 500.00 (Zero refund issued)', `Balance: ${walletCheck.rows[0].balance}`);
      assert(txCheck.rows.length === 0, 'Zero refund transactions created in ledger for completed order');
    }

    // -----------------------------------------------------------------------
    // SCENARIO 8: Duplicate failure events on PROCESSING order (Single Refund Guarantee)
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 8: Duplicate failure events on PROCESSING order (Single Refund Guarantee)');
    {
      const procOrderId = uuidv4();
      const procProviderOrderId = Math.floor(Date.now() / 1000) + 8001;

      await client.query(`
        INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId",
          amount, "chargedAmount", "chargedCurrency", status, "provider",
          "providerOrderId", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, 'pubgm', 'pkg_pubg_60', '60 PUBG UC', '512345678',
          100.00, 100.00, 'SDG', 'PROCESSING', 'G2BULK',
          $3, NOW(), NOW()
        )
      `, [procOrderId, testUserId, procProviderOrderId]);

      // 1st failure event
      const failEvtId1 = `evt_suite_fail1_${uuidv4()}`;
      const body1 = JSON.stringify({
        event_id: failEvtId1,
        event: 'topup.failed',
        order_id: procProviderOrderId,
        status: 'FAILED',
        message: 'Account not found upstream'
      });
      const headers1 = generateWebhookHeaders(body1, testSecret, { customId: failEvtId1 });

      const res1 = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers: headers1,
        body: body1
      });
      const data1 = await res1.json();

      assert(res1.status === 200, '1st failure webhook returns 200 OK', `Status: ${res1.status}`);

      const orderCheck1 = await client.query('SELECT status FROM "Order" WHERE id = $1', [procOrderId]);
      const walletCheck1 = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
      const txCheck1 = await client.query(
        'SELECT id, amount, type FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceId" = $2',
        [testWalletId, procOrderId]
      );

      assert(orderCheck1.rows[0].status === 'FAILED', 'Order status transitioned to FAILED', `Status: ${orderCheck1.rows[0].status}`);
      assert(Number(walletCheck1.rows[0].balance) === 600.00, 'Wallet balance credited +100.00 SDG (500 -> 600)', `Balance: ${walletCheck1.rows[0].balance}`);
      assert(txCheck1.rows.length === 1 && txCheck1.rows[0].type === 'REFUND', 'Exactly 1 REFUND transaction in ledger');

      // 2nd failure event with NEW event_id (simulates replay or dual delivery)
      const failEvtId2 = `evt_suite_fail2_${uuidv4()}`;
      const body2 = JSON.stringify({
        event_id: failEvtId2,
        event: 'topup.failed',
        order_id: procProviderOrderId,
        status: 'FAILED',
        message: 'Account not found upstream (retry)'
      });
      const headers2 = generateWebhookHeaders(body2, testSecret, { customId: failEvtId2 });

      const res2 = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers: headers2,
        body: body2
      });
      const data2 = await res2.json();

      const walletCheck2 = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
      const txCheck2 = await client.query(
        'SELECT id, amount, type FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceId" = $2',
        [testWalletId, procOrderId]
      );

      assert(res2.status === 200, '2nd failure webhook returns 200 OK', `Status: ${res2.status}`);
      assert(data2.noop === true || data2.duplicateRefund === true, '2nd webhook handled as no-op without double refund', JSON.stringify(data2));
      assert(Number(walletCheck2.rows[0].balance) === 600.00, 'Wallet balance remains strictly 600.00 (NOT 700.00)', `Balance: ${walletCheck2.rows[0].balance}`);
      assert(txCheck2.rows.length === 1, 'Still exactly 1 REFUND transaction in ledger (prevented by unique index uq_wallet_tx_order_refund)');
    }

    // -----------------------------------------------------------------------
    // SCENARIO 9: Concurrent Webhook and Polling execution
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 9: Concurrent Webhook and Polling execution (Zero Race Double Settlement)');
    {
      const concOrderId = uuidv4();
      const concProviderOrderId = Math.floor(Date.now() / 1000) + 9001;

      await client.query(`
        INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId",
          amount, "chargedAmount", "chargedCurrency", status, "provider",
          "providerOrderId", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, 'pubgm', 'pkg_pubg_60', '60 PUBG UC', '512345678',
          100.00, 100.00, 'SDG', 'PROCESSING', 'G2BULK',
          $3, NOW(), NOW()
        )
      `, [concOrderId, testUserId, concProviderOrderId]);

      const initialWallet = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
      const initialBalance = Number(initialWallet.rows[0].balance); // 600.00

      // Simulate Polling Worker logic simultaneously with Webhook
      const simulatePollingResolution = async () => {
        const pollClient = await pool.connect();
        try {
          await pollClient.query('BEGIN');
          // Row-level lock FOR UPDATE
          const orderRes = await pollClient.query(
            'SELECT id, status, "userId", "chargedAmount", amount FROM "Order" WHERE id = $1 FOR UPDATE',
            [concOrderId]
          );
          const o = orderRes.rows[0];
          if (!o || o.status !== 'PROCESSING') {
            await pollClient.query('ROLLBACK');
            return { executed: false, reason: 'Already finalized by webhook' };
          }

          // Fetch wallet FOR UPDATE
          const wRes = await pollClient.query('SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [o.userId]);
          const w = wRes.rows[0];

          // Check duplicate refund
          const exTx = await pollClient.query(
            'SELECT id FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceId" = $2 AND type = \'REFUND\'',
            [w.id, o.id]
          );
          if (exTx.rows.length > 0) {
            await pollClient.query('ROLLBACK');
            return { executed: false, reason: 'Duplicate refund' };
          }

          await pollClient.query('UPDATE "Order" SET status = \'FAILED\', "updatedAt" = NOW() WHERE id = $1 AND status = \'PROCESSING\'', [o.id]);
          const refAmt = Number(o.chargedAmount || o.amount || 0);
          const nBal = Number(w.balance) + refAmt;
          await pollClient.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [nBal, w.id]);
          await pollClient.query(`
            INSERT INTO "WalletTransaction" 
              (id, "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type") 
            VALUES ($1, $2, $3, 'REFUND', 'Polling refund', 'SDG', $4, $5, 'ORDER', $6, null, 'SYSTEM')
          `, [uuidv4(), w.id, refAmt, Number(w.balance), nBal, o.id]);

          await pollClient.query('COMMIT');
          return { executed: true };
        } catch (err: any) {
          await pollClient.query('ROLLBACK');
          return { executed: false, error: err.message };
        } finally {
          pollClient.release();
        }
      };

      // Webhook payload
      const concEvtId = `evt_suite_conc_${uuidv4()}`;
      const concBody = JSON.stringify({
        event_id: concEvtId,
        event: 'topup.failed',
        order_id: concProviderOrderId,
        status: 'FAILED',
        message: 'Concurrent race failure test'
      });
      const concHeaders = generateWebhookHeaders(concBody, testSecret, { customId: concEvtId });

      // Run Webhook HTTP request and Polling worker concurrently
      const [webhookRes, pollingRes] = await Promise.all([
        fetch(`${baseUrl}/webhook/provider`, {
          method: 'POST',
          headers: concHeaders,
          body: concBody
        }).then(r => r.json()),
        simulatePollingResolution()
      ]);

      const concOrder = await client.query('SELECT status FROM "Order" WHERE id = $1', [concOrderId]);
      const concWallet = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
      const concTx = await client.query(
        'SELECT id, amount, type FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceId" = $2',
        [testWalletId, concOrderId]
      );

      assert(concOrder.rows[0].status === 'FAILED', 'Order status is FAILED after concurrent settlement', `Status: ${concOrder.rows[0].status}`);
      assert(Number(concWallet.rows[0].balance) === initialBalance + 100.00, `Wallet balance credited exactly once (+100.00 SDG: ${initialBalance} -> ${initialBalance + 100})`, `Actual: ${concWallet.rows[0].balance}`);
      assert(concTx.rows.length === 1, 'Exactly ONE REFUND transaction was recorded (Zero duplicate settlement)', `Found: ${concTx.rows.length}`);
    }

    // -----------------------------------------------------------------------
    // SCENARIO 10: No-redirect check on POST /webhook/provider & POST /webhook/prvidr
    // -----------------------------------------------------------------------
    console.log('\n>>> SCENARIO 10: No-redirect check on POST /webhook/provider and POST /webhook/prvidr');
    {
      const pingId = `evt_suite_redir_${uuidv4()}`;
      const pingBody = JSON.stringify({
        event_id: pingId,
        event: 'ping'
      });
      const headers = generateWebhookHeaders(pingBody, testSecret, { customId: pingId });

      // Check /webhook/provider with redirect: 'manual'
      const resProvider = await fetch(`${baseUrl}/webhook/provider`, {
        method: 'POST',
        headers,
        body: pingBody,
        redirect: 'manual'
      });

      assert(
        resProvider.status === 200,
        'POST /webhook/provider responds directly with 200 (Not 301/302 Redirect)',
        `Status: ${resProvider.status}`
      );
      assert(
        !resProvider.headers.get('location'),
        'POST /webhook/provider has no Location header (zero redirect)',
        resProvider.headers.get('location') || 'None'
      );

      // Check /webhook/prvidr with redirect: 'manual'
      const pingId2 = `evt_suite_redir2_${uuidv4()}`;
      const pingBody2 = JSON.stringify({
        event_id: pingId2,
        event: 'ping'
      });
      const headers2 = generateWebhookHeaders(pingBody2, testSecret, { customId: pingId2 });
      const resPrvidr = await fetch(`${baseUrl}/webhook/prvidr`, {
        method: 'POST',
        headers: headers2,
        body: pingBody2,
        redirect: 'manual'
      });

      assert(
        resPrvidr.status === 200,
        'POST /webhook/prvidr responds directly with 200 (Not 301/302 Redirect)',
        `Status: ${resPrvidr.status}`
      );
      assert(
        !resPrvidr.headers.get('location'),
        'POST /webhook/prvidr has no Location header (zero redirect)',
        resPrvidr.headers.get('location') || 'None'
      );

      // Check Public GET probe for uptime checkers & inspection
      const resGet = await fetch(`${baseUrl}/webhook/provider`, { method: 'GET', redirect: 'manual' });
      const dataGet = await resGet.json();
      assert(resGet.status === 200, 'GET /webhook/provider returns 200 OK for uptime monitoring', `Status: ${resGet.status}`);
      assert(dataGet.canonicalUrl === 'https://api.kiropro.store/webhook/provider', 'Probe verifies canonical webhook URL', dataGet.canonicalUrl);
    }

  } finally {
    // Cleanup test data
    console.log('\n[Cleanup] Cleaning up isolated test entities from database...');
    try {
      await client.query('DELETE FROM "WalletTransaction" WHERE "walletId" = $1', [testWalletId]);
      await client.query('DELETE FROM "Order" WHERE "userId" = $1', [testUserId]);
      await client.query('DELETE FROM "Wallet" WHERE id = $1', [testWalletId]);
      await client.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
      await client.query('DELETE FROM "webhook_events" WHERE event_id LIKE \'evt_suite_%\'');
      console.log('[Cleanup] Completed cleanly.');
    } catch (cleanErr: any) {
      console.warn('[Cleanup] Warning during cleanup:', cleanErr.message);
    }

    client.release();
    server.close();
    await pool.end();
  }

  console.log('\n======================================================================');
  console.log(`TEST SUITE SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('======================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('[TestSuite Fatal Error]:', err);
  process.exit(1);
});
