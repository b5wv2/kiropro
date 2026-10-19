import { pool } from '../src/db.js';
import express from 'express';
import adminRouter from '../src/routes/admin.js';
import topupRouter from '../src/routes/topup.js';
import { v4 as uuidv4 } from 'uuid';
import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config.js';
import { createSession } from '../src/services/sessionService.js';
import { ClientInfo } from '../src/services/clientInfoService.js';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);
app.use('/api', topupRouter);

async function runTests() {
  console.log('================================================================');
  console.log('🧪 KIROPRO WALLET MINIMUM LIMIT & SECURITY VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const testPass = (msg: string) => {
    console.log(`  [PASS] ${msg}`);
    passed++;
  };

  const testFail = (msg: string, err?: any) => {
    console.error(`  [FAIL] ${msg}`, err || '');
    failed++;
  };

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const adminId = uuidv4();
  const customerId = uuidv4();
  const walletId = uuidv4();
  const adminEmail = `admin_limit_${Date.now()}@kiropro.com`;
  const customerEmail = `cust_limit_${Date.now()}@kiropro.com`;

  try {
    // 1. Setup Test Admin and Test Customer in DB
    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", name, role, preferred_currency) 
       VALUES ($1, $2, 'hashedpass', 'Test Admin', 'ADMIN', 'SDG')`,
      [adminId, adminEmail]
    );

    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", name, role, preferred_currency) 
       VALUES ($1, $2, 'hashedpass', 'Test Customer', 'CUSTOMER', 'SDG')`,
      [customerId, customerEmail]
    );

    // Initial wallet with 100 SDG
    await pool.query(
      `INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, 100, 'SDG')`,
      [walletId, customerId]
    );

    const clientInfo: ClientInfo = {
      ip: '127.0.0.1',
      userAgent: 'test-suite',
      browser: 'Node',
      browserVersion: '24',
      os: 'Windows',
      osVersion: '10',
      deviceType: 'Desktop',
      language: 'ar',
      timezone: 'Africa/Khartoum',
      deviceId: 'dev_test_suite_123'
    };

    const adminSessionId = await createSession({ userId: adminId, clientInfo });
    const adminToken = jwt.sign(
      { id: adminId, email: adminEmail, role: 'ADMIN', sessionId: adminSessionId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    };

    const customerSessionId = await createSession({ userId: customerId, clientInfo });
    const customerToken = jwt.sign(
      { id: customerId, email: customerEmail, role: 'CUSTOMER', sessionId: customerSessionId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('>>> TEST 1: Admin Credit - Security Boundary & Arbitrary Amount Verification');

    // 1.1: Reject negative amount
    const resNegative = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: -50, currency: 'SDG', reason: 'Test Negative' })
    });
    assert.strictEqual(resNegative.status, 400);
    testPass('Admin credit rejects negative amounts (-50 SDG) with HTTP 400');

    // 1.2: Reject zero amount
    const resZero = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 0, currency: 'SDG', reason: 'Test Zero' })
    });
    assert.strictEqual(resZero.status, 400);
    testPass('Admin credit rejects zero amount (0 SDG) with HTTP 400');

    // 1.3: Reject boundary amount <= 1 SDG (Exactly 1 SDG)
    const resOne = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 1, currency: 'SDG', reason: 'Test 1 SDG' })
    });
    const bodyOne = await resOne.json();
    assert.strictEqual(resOne.status, 400);
    assert.match(bodyOne.error, /أكبر من 1/);
    testPass('Admin credit strictly rejects 1.00 SDG (boundary <= 1) with HTTP 400');

    // 1.4: Reject fractional amount <= 1 SDG (0.75 SDG)
    const resFractionalSmall = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 0.75, currency: 'SDG', reason: 'Test 0.75 SDG' })
    });
    assert.strictEqual(resFractionalSmall.status, 400);
    testPass('Admin credit strictly rejects fractional amounts <= 1 SDG (0.75 SDG)');

    // 1.5: Reject more than 2 decimal places
    const resThreeDecimals = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 5.123, currency: 'SDG', reason: 'Test 3 decimals' })
    });
    assert.strictEqual(resThreeDecimals.status, 400);
    testPass('Admin credit rejects amounts with > 2 decimal places (precision attack protection)');

    // 1.6: Accept 2 SDG (strictly > 1 SDG)
    const resTwo = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 2, currency: 'SDG', reason: 'Test 2 SDG credit' })
    });
    const bodyTwo = await resTwo.json();
    assert.strictEqual(resTwo.status, 200);
    assert.strictEqual(Number(bodyTwo.balance), 102);
    testPass('Admin credit accepts 2.00 SDG (> 1 SDG) and updates balance from 100 to 102 SDG');

    // 1.7: Accept arbitrary custom amount: 10 SDG
    const resTen = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 10, currency: 'SDG', reason: 'Test 10 SDG credit' })
    });
    const bodyTen = await resTen.json();
    assert.strictEqual(resTen.status, 200);
    assert.strictEqual(Number(bodyTen.balance), 112);
    testPass('Admin credit accepts 10.00 SDG (previously rejected under old 910 SDG minimum)');

    // 1.8: Accept arbitrary custom amount: 50 SDG
    const resFifty = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 50, currency: 'SDG', reason: 'Test 50 SDG credit' })
    });
    const bodyFifty = await resFifty.json();
    assert.strictEqual(resFifty.status, 200);
    assert.strictEqual(Number(bodyFifty.balance), 162);
    testPass('Admin credit accepts 50.00 SDG successfully');

    // 1.9: Reject currency mismatch
    const resMismatch = await fetch(`${baseUrl}/api/admin/users/${customerId}/wallet/credit`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount: 50, currency: 'USD', reason: 'Test Currency Mismatch' })
    });
    assert.strictEqual(resMismatch.status, 400);
    testPass('Admin credit rejects currency mismatch (USD on SDG customer wallet)');

    console.log('\n>>> TEST 2: Customer Topup Request Validation & Settings');

    // 2.1: Verify exchange rate settings endpoint returns new limits
    const resSettings = await fetch(`${baseUrl}/api/settings/exchange-rate`);
    const bodySettings = await resSettings.json();
    assert.strictEqual(resSettings.status, 200);
    assert.strictEqual(Number(bodySettings.min_topup), 0.01);
    assert.strictEqual(Number(bodySettings.min_topup_sdg), 2);
    testPass('GET /api/settings/exchange-rate returns min_topup: 0.01 USD & min_topup_sdg: 2');

    // Valid PNG byte buffer for receipt
    const validPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    // 2.2: Customer submits 1 SDG -> strictly rejected (boundary <= 1)
    const formDataOne = new FormData();
    formDataOne.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    formDataOne.append('requested_amount', '1');
    formDataOne.append('requested_currency', 'SDG');

    const resCustOne = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: formDataOne
    });
    const bodyCustOne = await resCustOne.json();
    assert.strictEqual(resCustOne.status, 400);
    assert.match(bodyCustOne.error, /أكبر من 1/);
    testPass('Customer topup rejects 1.00 SDG (boundary <= 1) with HTTP 400');

    // 2.3: Customer submits 0.5 SDG -> strictly rejected
    const formDataHalf = new FormData();
    formDataHalf.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    formDataHalf.append('requested_amount', '0.5');
    formDataHalf.append('requested_currency', 'SDG');

    const resCustHalf = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: formDataHalf
    });
    assert.strictEqual(resCustHalf.status, 400);
    testPass('Customer topup rejects 0.5 SDG with HTTP 400');

    // 2.4: Customer submits 2 SDG (> 1) -> accepted
    const formDataTwo = new FormData();
    formDataTwo.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    formDataTwo.append('requested_amount', '2');
    formDataTwo.append('requested_currency', 'SDG');

    const resCustTwo = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: formDataTwo
    });
    const bodyCustTwo = await resCustTwo.json();
    assert.strictEqual(resCustTwo.status, 201);
    assert.strictEqual(Number(bodyCustTwo.amount_sdg), 2);
    testPass('Customer topup accepts 2.00 SDG (> 1 SDG) successfully with HTTP 201');

    // 2.5: Customer submits 500 SDG (previously rejected under old 1 USD = 9,100 SDG limit)
    const formData500 = new FormData();
    formData500.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    formData500.append('requested_amount', '500');
    formData500.append('requested_currency', 'SDG');

    const resCust500 = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: formData500
    });
    const bodyCust500 = await resCust500.json();
    assert.strictEqual(resCust500.status, 201);
    assert.strictEqual(Number(bodyCust500.amount_sdg), 500);
    testPass('Customer topup accepts 500.00 SDG (previously rejected under old 1 USD = 9,100 SDG minimum)');

    // 2.6: Customer submits 1,000 SDG
    const formData1000 = new FormData();
    formData1000.append('receipt', new Blob([validPngBytes], { type: 'image/png' }), 'receipt.png');
    formData1000.append('requested_amount', '1000');
    formData1000.append('requested_currency', 'SDG');

    const resCust1000 = await fetch(`${baseUrl}/api/topups`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${customerToken}` },
      body: formData1000
    });
    const bodyCust1000 = await resCust1000.json();
    assert.strictEqual(resCust1000.status, 201);
    assert.strictEqual(Number(bodyCust1000.amount_sdg), 1000);
    testPass('Customer topup accepts 1,000.00 SDG successfully');

    console.log('\n>>> TEST 3: Top-up Approval & Financial Ledger Integrity');

    const topup500Id = bodyCust500.id;

    const resApprove = await fetch(`${baseUrl}/api/admin/topups/${topup500Id}/approve`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ admin_note: 'Approved 500 SDG test' })
    });
    assert.strictEqual(resApprove.status, 200);
    testPass('Admin successfully approves 500 SDG top-up request');

    // Verify user wallet balance updated atomically: 162 + 500 = 662 SDG
    const checkWallet = await pool.query('SELECT balance, currency FROM "Wallet" WHERE "userId" = $1', [customerId]);
    assert.strictEqual(Number(checkWallet.rows[0].balance), 662);
    testPass('Customer wallet balance accurately reflects approved 500 SDG credit (Total: 662.00 SDG)');

    // Verify double-entry ledger in WalletTransaction
    const txCheck = await pool.query(
      'SELECT amount, "balanceBefore", "balanceAfter", type FROM "WalletTransaction" WHERE "referenceId" = $1',
      [topup500Id]
    );
    assert.strictEqual(txCheck.rows.length, 1);
    assert.strictEqual(Number(txCheck.rows[0].amount), 500);
    assert.strictEqual(Number(txCheck.rows[0].balanceBefore), 162);
    assert.strictEqual(Number(txCheck.rows[0].balanceAfter), 662);
    testPass('WalletTransaction record exists with exact before/after balances matching audit trail');

    // Clean up test data
    await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" = $1', [walletId]);
    await pool.query('DELETE FROM "topup_requests" WHERE user_id = $1', [customerId]);
    await pool.query('DELETE FROM "user_sessions" WHERE user_id IN ($1, $2)', [adminId, customerId]);
    await pool.query('DELETE FROM "Wallet" WHERE "userId" = $1', [customerId]);
    await pool.query('DELETE FROM "User" WHERE id IN ($1, $2)', [adminId, customerId]);

    console.log('\n================================================================');
    console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

  } catch (err: any) {
    testFail('Unexpected test suite error', err);
  } finally {
    server.close();
    await pool.end();
  }
}

runTests().catch(console.error);
