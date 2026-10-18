import express from 'express';
import pool from '../src/db';
import productsRouter from '../src/routes/products';
import vouchersRouter from '../src/routes/vouchers';
import ordersRouter from '../src/routes/orders';
import { randomUUID as uuidv4 } from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-12345';

async function runCustomerExperienceTests() {
  console.log('========================================================================');
  console.log('KIROPRO — Customer Voucher Experience & Supplier Privacy Verification');
  console.log('========================================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);
  app.use('/api/vouchers', vouchersRouter);
  app.use('/api/orders', ordersRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testUserId = uuidv4();
  const testWalletId = uuidv4();
  const adminUserId = uuidv4();
  const initialBalance = 500000.00; // 500,000 SDG

  const customerToken = jwt.sign(
    { id: testUserId, email: 'customer_vip@kiropro.test', role: 'CUSTOMER', currency: 'SDG' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { id: adminUserId, email: 'admin_audit@kiropro.test', role: 'ADMIN', currency: 'SDG' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const customerHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${customerToken}`
  };

  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  const results: { test: number; description: string; passed: boolean; details?: any }[] = [];

  try {
    // Setup test users
    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, 'customer_vip@kiropro.test', 'hash123', 'CUSTOMER', NOW(), NOW())`,
      [testUserId]
    );
    await pool.query(
      `INSERT INTO "Wallet" (id, "userId", balance, currency, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'SDG', NOW(), NOW())`,
      [testWalletId, testUserId, initialBalance]
    );

    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, 'admin_audit@kiropro.test', 'hashadmin', 'ADMIN', NOW(), NOW())`,
      [adminUserId]
    );

    // -------------------------------------------------------------------------
    // TEST 1: Integration disabled -> Customer cannot buy, zero deduction, zero order
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Disabled Integration Customer Purchase Guard ---');
    const liveAttemptRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        voucherId: 43,
        quantity: 1,
        isSimulation: false // Real customer request
      })
    });
    const liveAttemptData = await liveAttemptRes.json();
    console.log('Response (HTTP ' + liveAttemptRes.status + '):', liveAttemptData);

    const walletCheck1 = await pool.query(`SELECT balance FROM "Wallet" WHERE id = $1`, [testWalletId]);
    const balanceUntouched = Number(walletCheck1.rows[0].balance) === initialBalance;

    const ordersCheck1 = await pool.query(`SELECT COUNT(*) FROM "Order" WHERE "userId" = $1`, [testUserId]);
    const zeroOrdersCreated = parseInt(ordersCheck1.rows[0].count, 10) === 0;

    const t1Passed = liveAttemptRes.status === 400 &&
      liveAttemptData.error === 'هذه البطاقة غير متاحة للشراء مؤقتاً. يرجى المحاولة لاحقاً.' &&
      balanceUntouched &&
      zeroOrdersCreated;

    results.push({
      test: 1,
      description: 'Disabled Integration: neutral error message, zero wallet deduction, zero phantom orders',
      passed: t1Passed,
      details: { status: liveAttemptRes.status, error: liveAttemptData.error, balanceUntouched, zeroOrdersCreated }
    });
    console.log(t1Passed ? '✓ PASSED' : '✗ FAILED', '\n');

    // -------------------------------------------------------------------------
    // TEST 2: Supplier name G2Bulk is strictly hidden from Customer and Public API
    // -------------------------------------------------------------------------
    console.log('--- TEST 2: Zero Supplier Leaks in Public APIs & Customer DTOs ---');
    const catRes = await fetch(`${baseUrl}/api/vouchers/catalog`);
    const catText = await catRes.text();
    const catJson = JSON.parse(catText);

    const prodRes = await fetch(`${baseUrl}/api/products`);
    const prodText = await prodRes.text();

    const noLeakInCatalog = !catText.toLowerCase().includes('g2bulk') && !catText.includes('المزود');
    const noLeakInProducts = !prodText.toLowerCase().includes('g2bulk') && !prodText.includes('المزود');

    // Ensure isPurchasable is exposed so frontend can cleanly disable button
    const ffCat = catJson.categories?.find((c: any) => c.gameKey === 'freefire');
    const sampleVoucher = ffCat?.items?.[0];
    const hasPurchasableFlag = sampleVoucher !== undefined && typeof sampleVoucher.isPurchasable === 'boolean';

    const t2Passed = noLeakInCatalog && noLeakInProducts && hasPurchasableFlag;
    results.push({
      test: 2,
      description: 'Zero Supplier Leaks in Public APIs & isPurchasable flag provided',
      passed: t2Passed,
      details: { noLeakInCatalog, noLeakInProducts, hasPurchasableFlag, isPurchasable: sampleVoucher?.isPurchasable }
    });
    console.log(t2Passed ? '✓ PASSED' : '✗ FAILED', '\n');

    // -------------------------------------------------------------------------
    // TEST 3: Appropriate pending state when provider returns Pending
    // -------------------------------------------------------------------------
    console.log('--- TEST 3: Pending Order Handling (No Code Leaked, Clean Message) ---');
    const pendingPurchaseRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        voucherId: 43,
        quantity: 1,
        isSimulation: true,
        simulateMode: 'PENDING'
      })
    });
    const pendingData = await pendingPurchaseRes.json();
    console.log('Pending purchase response (HTTP ' + pendingPurchaseRes.status + '):', pendingData);

    const pendingOrderId = pendingData.orderId;
    const t3CodesEmpty = Array.isArray(pendingData.codes) && pendingData.codes.length === 0;
    const t3NoSupplierInMsg = !pendingData.message?.includes('المزود') && !pendingData.message?.toLowerCase().includes('g2bulk');
    const t3NoInternalKeys = pendingData.providerOrderId === undefined && pendingData.pollUrl === undefined;

    // Check polling endpoint
    const pollRes = await fetch(`${baseUrl}/api/vouchers/orders/${pendingOrderId}/status`, {
      headers: customerHeaders
    });
    const pollData = await pollRes.json();
    console.log('Polling status response (HTTP ' + pollRes.status + '):', pollData);

    const t3Passed = pendingPurchaseRes.status === 202 &&
      pendingData.status === 'PROCESSING' &&
      t3CodesEmpty &&
      t3NoSupplierInMsg &&
      t3NoInternalKeys &&
      pollData.status === 'COMPLETED' && // Polling simulated completion
      pollData.codes?.length > 0;

    results.push({
      test: 3,
      description: 'Pending orders return clean processing state without codes, then resolve on poll',
      passed: t3Passed,
      details: { pendingStatus: pendingData.status, t3CodesEmpty, t3NoSupplierInMsg, t3NoInternalKeys, pollStatus: pollData.status }
    });
    console.log(t3Passed ? '✓ PASSED' : '✗ FAILED', '\n');

    // -------------------------------------------------------------------------
    // TEST 4: No success screen / no code if provider returns empty codes
    // -------------------------------------------------------------------------
    console.log('--- TEST 4: Empty Codes Guard (Never Invent Synthetic Codes) ---');
    const emptyCodesRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        voucherId: 43,
        quantity: 1,
        isSimulation: true,
        simulateMode: 'EMPTY_CODES'
      })
    });
    const emptyCodesData = await emptyCodesRes.json();
    console.log('Empty codes response (HTTP ' + emptyCodesRes.status + '):', emptyCodesData);

    const t4Passed = emptyCodesRes.status === 202 &&
      emptyCodesData.status === 'PROCESSING' &&
      (!emptyCodesData.codes || emptyCodesData.codes.length === 0);

    results.push({
      test: 4,
      description: 'Empty codes from provider never trigger false success or synthetic code generation',
      passed: t4Passed,
      details: emptyCodesData
    });
    console.log(t4Passed ? '✓ PASSED' : '✗ FAILED', '\n');

    // -------------------------------------------------------------------------
    // TEST 5: Delivered codes saved, encrypted, and displayed cleanly
    // -------------------------------------------------------------------------
    console.log('--- TEST 5: Legitimate Codes Delivery & Customer Security ---');
    const compPurchaseRes = await fetch(`${baseUrl}/api/vouchers/purchase`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        voucherId: 43,
        quantity: 2,
        isSimulation: true,
        simulateMode: 'COMPLETED'
      })
    });
    const compData = await compPurchaseRes.json();
    console.log('Completed purchase response (HTTP ' + compPurchaseRes.status + '):', {
      success: compData.success,
      orderId: compData.orderId,
      status: compData.status,
      codes: compData.codes,
      maskedCodes: compData.maskedCodes
    });

    // Verify DB encryption
    const dbCodes = await pool.query(
      `SELECT code_encrypted, code_masked FROM order_voucher_codes WHERE order_id = $1`,
      [compData.orderId]
    );

    const allEncrypted = dbCodes.rows.every(r => r.code_encrypted && !r.code_encrypted.startsWith('MOCK-TEST-'));
    const allMasked = dbCodes.rows.every(r => r.code_masked && (r.code_masked.includes('•') || r.code_masked.includes('*')));

    // Verify Customer order vouchers endpoint
    const fetchCodesRes = await fetch(`${baseUrl}/api/orders/${compData.orderId}/voucher-codes`, {
      headers: customerHeaders
    });
    const fetchCodesData = await fetchCodesRes.json();

    const t5Passed = compPurchaseRes.status === 201 &&
      compData.status === 'COMPLETED' &&
      compData.codes.length === 2 &&
      allEncrypted &&
      allMasked &&
      fetchCodesData.codes.length === 2 &&
      fetchCodesData.codes[0].code === compData.codes[0];

    results.push({
      test: 5,
      description: 'Delivered codes are stored encrypted, masked in DB, and decrypted only for authorized user',
      passed: t5Passed,
      details: { allEncrypted, allMasked, codeCount: compData.codes?.length }
    });
    console.log(t5Passed ? '✓ PASSED' : '✗ FAILED', '\n');

    // -------------------------------------------------------------------------
    // TEST 6: Email failure decoupling & resend does not charge twice
    // -------------------------------------------------------------------------
    console.log('--- TEST 6: Email Decoupling & Safe Resend ---');
    const completedOrderId = compData.orderId;
    const walletBeforeResend = await pool.query(`SELECT balance FROM "Wallet" WHERE id = $1`, [testWalletId]);

    const resendRes = await fetch(`${baseUrl}/api/vouchers/orders/${completedOrderId}/resend-email`, {
      method: 'POST',
      headers: customerHeaders
    });
    const resendData = await resendRes.json();
    console.log('Resend email response (HTTP ' + resendRes.status + '):', resendData);

    const walletAfterResend = await pool.query(`SELECT balance FROM "Wallet" WHERE id = $1`, [testWalletId]);
    const balanceUntouchedAfterResend = Number(walletBeforeResend.rows[0].balance) === Number(walletAfterResend.rows[0].balance);

    const t6Passed = balanceUntouchedAfterResend && (resendRes.status === 200 || resendRes.status === 502);
    results.push({
      test: 6,
      description: 'Email dispatch is decoupled from order completion and resend does not debit wallet',
      passed: t6Passed,
      details: { balanceUntouchedAfterResend, resendStatus: resendRes.status }
    });
    console.log(t6Passed ? '✓ PASSED' : '✗ FAILED', '\n');

    // -------------------------------------------------------------------------
    // TEST 7: Provider information strictly preserved for Admins only
    // -------------------------------------------------------------------------
    console.log('--- TEST 7: Admin Retains Full Supplier Diagnostic Visibility ---');
    // Customer orders call: must NOT have provider or providerCostUsd
    const custOrdersRes = await fetch(`${baseUrl}/api/orders/my-orders`, {
      headers: customerHeaders
    });
    const custOrdersData = await custOrdersRes.json();
    const customerOrderSample = custOrdersData[0];
    const customerHasNoProviderField = customerOrderSample.provider === undefined;
    const customerHasNoCostField = customerOrderSample.providerCostUsd === undefined;
    const customerOrderTypeSanitized = customerOrderSample.orderType === 'DIGITAL_VOUCHER';

    // Admin orders call: MUST have provider and internal diagnostics
    const adminOrdersRes = await fetch(`${baseUrl}/api/orders`, {
      headers: adminHeaders
    });
    const adminOrdersData = await adminOrdersRes.json();
    const adminOrderSample = (adminOrdersData.orders || adminOrdersData).find((o: any) => o.id === completedOrderId);

    const adminHasProviderField = adminOrderSample?.provider === 'G2BULK';
    const adminHasOrderType = adminOrderSample?.orderType === 'G2BULK_VOUCHER';

    const t7Passed = customerHasNoProviderField &&
      customerHasNoCostField &&
      customerOrderTypeSanitized &&
      adminHasProviderField &&
      adminHasOrderType;

    results.push({
      test: 7,
      description: 'Admin retains full supplier diagnostics while customer sees sanitized DTO',
      passed: t7Passed,
      details: {
        customerOrderType: customerOrderSample?.orderType,
        customerHasNoProviderField,
        adminProvider: adminOrderSample?.provider,
        adminOrderType: adminOrderSample?.orderType
      }
    });
    console.log(t7Passed ? '✓ PASSED' : '✗ FAILED', '\n');

    // -------------------------------------------------------------------------
    // TEST 8: Other store products remain 100% unaffected
    // -------------------------------------------------------------------------
    console.log('--- TEST 8: Other Store Products (Games, Accounts, Cards) Unaffected ---');
    const allProdRes = await fetch(`${baseUrl}/api/products`);
    const allCategories = await allProdRes.json();

    const normalGames = allCategories.filter((c: any) => c.category === 'games' && !c.id.includes('voucher'));
    const cardsCategory = allCategories.find((c: any) => c.id === 'kiropro-card');

    const t8Passed = normalGames.length >= 3 && cardsCategory !== undefined;
    results.push({
      test: 8,
      description: 'Standard games, virtual cards, and digital accounts are unaffected',
      passed: t8Passed,
      details: { normalGamesCount: normalGames.length, hasKiroproCard: Boolean(cardsCategory) }
    });
    console.log(t8Passed ? '✓ PASSED' : '✗ FAILED', '\n');

  } finally {
    // Cleanup test users and orders
    await pool.query(`DELETE FROM order_voucher_codes WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM "WalletTransaction" WHERE "walletId" = $1`, [testWalletId]);
    await pool.query(`DELETE FROM "Order" WHERE "userId" = $1`, [testUserId]);
    await pool.query(`DELETE FROM "Wallet" WHERE id = $1`, [testWalletId]);
    await pool.query(`DELETE FROM "User" WHERE id IN ($1, $2)`, [testUserId, adminUserId]);

    server.close();
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log('TEST SUMMARY RESULTS:');
  console.log('========================================================================');
  let allPassed = true;
  for (const r of results) {
    const symbol = r.passed ? '✓ PASSED' : '✗ FAILED';
    if (!r.passed) allPassed = false;
    console.log(`[Test ${r.test}] ${symbol}: ${r.description}`);
    if (!r.passed) {
      console.log('   Details:', r.details);
    }
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log(`\nTOTAL: ${passedCount}/${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}%)`);

  if (!allPassed) {
    process.exit(1);
  }
}

runCustomerExperienceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
