import { pool } from '../src/db';
import { g2BulkVoucherPurchaseProvider } from '../src/providers/g2bulk/voucherPurchaseProvider';
import { g2BulkClient } from '../src/providers/g2bulk/client';
import { gamesDropClient } from '../src/providers/gamesdrop/client';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

interface TestReportItem {
  id: number;
  scenario: string;
  passed: boolean;
  internalReason: string;
  details: any;
}

const report: TestReportItem[] = [];

async function runSection6Suite() {
  console.log('======================================================================');
  console.log('🧪 G2BULK READINESS, MOCK MODE & SAFETY VERIFICATION SUITE');
  console.log('======================================================================\n');

  // Verify safe environment
  if (process.env.ALLOW_REAL_G2BULK_PURCHASE === 'true') {
    throw new Error('CRITICAL SAFETY ABORT: ALLOW_REAL_G2BULK_PURCHASE must NOT be true during test suite!');
  }

  // Backup original env vars
  const origMockMode = process.env.VOUCHERS_MOCK_MODE;
  const origRealPurchase = process.env.ALLOW_REAL_G2BULK_PURCHASE;
  const origApiKey = process.env.API_G2BULK;
  const origG2BulkKey = process.env.G2BULK_API_KEY;

  let outboundPurchaseCallsCount = 0;
  // Monkey-patch g2BulkClient.purchaseProduct to spy and ensure ZERO external calls are made
  const originalPurchaseProduct = g2BulkClient.purchaseProduct;
  (g2BulkClient as any).purchaseProduct = async (...args: any[]) => {
    outboundPurchaseCallsCount++;
    throw new Error('FATAL: An outbound purchase call to G2Bulk was attempted during tests!');
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: زر شراء القسائم في وضع المحاكاة (VOUCHERS_MOCK_MODE=true)
    // -------------------------------------------------------------------------
    console.log('--- [Test 1] Voucher Purchase Button & Flow in Safe Mock Mode ---');
    process.env.VOUCHERS_MOCK_MODE = 'true';
    process.env.ALLOW_REAL_G2BULK_PURCHASE = 'false';

    const test1Readiness = g2BulkVoucherPurchaseProvider.checkVoucherReadiness({
      providerProductId: 43,
      isActive: true,
      inStock: true,
      stock: 100,
      g2bulkOrdersEnabled: true
    });

    const test1Purchase = await g2BulkVoucherPurchaseProvider.purchaseVoucher({
      providerProductId: 43,
      quantity: 2,
      idempotencyKey: uuidv4(),
      productTitle: '1 USD Free Fire Voucher',
      gameKey: 'freefire'
    });

    const test1Passed = test1Readiness.isAllowed === true &&
                        test1Readiness.reason === 'READY' &&
                        test1Readiness.isMock === true &&
                        test1Purchase.success === true &&
                        test1Purchase.isMock === true &&
                        test1Purchase.deliveryItems.length === 2 &&
                        test1Purchase.deliveryItems.every(c => c.startsWith('MOCK-TEST-VOUCHER'));

    report.push({
      id: 1,
      scenario: 'زر شراء القسائم في وضع المحاكاة (VOUCHERS_MOCK_MODE=true)',
      passed: test1Passed,
      internalReason: test1Readiness.reason,
      details: {
        isAllowed: test1Readiness.isAllowed,
        isMock: test1Readiness.isMock,
        deliveredCodesCount: test1Purchase.deliveryItems.length,
        sampleCode: test1Purchase.deliveryItems[0]
      }
    });
    console.log(`Result: ${test1Passed ? '✓ PASSED' : '✗ FAILED'} (Button active, Mock codes delivered, 0 real spend)\n`);

    // -------------------------------------------------------------------------
    // TEST 2: منع الشراء الحقيقي عندما يكون القفل مفعلاً (ALLOW_REAL_G2BULK_PURCHASE !== 'true')
    // -------------------------------------------------------------------------
    console.log('--- [Test 2] Real Purchase Blocked When Real Spend Locked ---');
    delete process.env.VOUCHERS_MOCK_MODE;
    process.env.ALLOW_REAL_G2BULK_PURCHASE = 'false';

    const test2Readiness = g2BulkVoucherPurchaseProvider.checkVoucherReadiness({
      providerProductId: 43,
      isActive: true,
      inStock: true,
      stock: 100,
      g2bulkOrdersEnabled: true
    });

    let test2Blocked = false;
    try {
      await g2BulkVoucherPurchaseProvider.purchaseVoucher({
        providerProductId: 43,
        quantity: 1,
        idempotencyKey: uuidv4(),
        isSimulation: false // Live customer request
      });
    } catch (err: any) {
      test2Blocked = true;
    }

    const test2Passed = test2Readiness.isAllowed === false &&
                        test2Readiness.reason === 'REAL_PURCHASES_LOCKED' &&
                        test2Blocked;

    report.push({
      id: 2,
      scenario: 'منع الشراء الحقيقي عندما يكون القفل مفعلاً',
      passed: test2Passed,
      internalReason: test2Readiness.reason,
      details: {
        isAllowed: test2Readiness.isAllowed,
        reason: test2Readiness.reason,
        customerMessage: test2Readiness.customerMessage,
        purchaseThrewError: test2Blocked
      }
    });
    console.log(`Result: ${test2Passed ? '✓ PASSED' : '✗ FAILED'} (Blocked with internal reason REAL_PURCHASES_LOCKED)\n`);

    // -------------------------------------------------------------------------
    // TEST 3: منع الشراء عند غياب مفتاح المزود (API_G2BULK Missing)
    // -------------------------------------------------------------------------
    console.log('--- [Test 3] Purchase Blocked When Provider API Key Missing ---');
    delete process.env.VOUCHERS_MOCK_MODE;
    process.env.ALLOW_REAL_G2BULK_PURCHASE = 'true'; // Even if someone unlocks spend, missing key MUST block
    delete process.env.API_G2BULK;
    delete process.env.G2BULK_API_KEY;

    const test3Readiness = g2BulkVoucherPurchaseProvider.checkVoucherReadiness({
      providerProductId: 43,
      isActive: true,
      inStock: true,
      stock: 100,
      g2bulkOrdersEnabled: true
    });

    const test3Passed = test3Readiness.isAllowed === false &&
                        test3Readiness.reason === 'PROVIDER_API_KEY_MISSING';

    report.push({
      id: 3,
      scenario: 'منع الشراء عند غياب مفتاح المزود',
      passed: test3Passed,
      internalReason: test3Readiness.reason,
      details: {
        isAllowed: test3Readiness.isAllowed,
        reason: test3Readiness.reason,
        customerMessage: test3Readiness.customerMessage
      }
    });
    console.log(`Result: ${test3Passed ? '✓ PASSED' : '✗ FAILED'} (Blocked with internal reason PROVIDER_API_KEY_MISSING)\n`);

    // -------------------------------------------------------------------------
    // TEST 4: منع الشراء عند تعطيل الطلبات في قاعدة البيانات (orders_enabled = false)
    // -------------------------------------------------------------------------
    console.log('--- [Test 4] Purchase Blocked When Orders Disabled in DB ---');
    // Restore API key for this test
    if (origApiKey) process.env.API_G2BULK = origApiKey;
    if (origG2BulkKey) process.env.G2BULK_API_KEY = origG2BulkKey;

    const test4Readiness = g2BulkVoucherPurchaseProvider.checkVoucherReadiness({
      providerProductId: 43,
      isActive: true,
      inStock: true,
      stock: 100,
      g2bulkOrdersEnabled: false // Admin turned off orders in provider_settings
    });

    const test4Passed = test4Readiness.isAllowed === false &&
                        test4Readiness.reason === 'PROVIDER_ORDERS_DISABLED';

    report.push({
      id: 4,
      scenario: 'منع الشراء عند تعطيل الطلبات في قاعدة البيانات',
      passed: test4Passed,
      internalReason: test4Readiness.reason,
      details: {
        isAllowed: test4Readiness.isAllowed,
        reason: test4Readiness.reason,
        customerMessage: test4Readiness.customerMessage
      }
    });
    console.log(`Result: ${test4Passed ? '✓ PASSED' : '✗ FAILED'} (Blocked with internal reason PROVIDER_ORDERS_DISABLED)\n`);

    // -------------------------------------------------------------------------
    // TEST 5: عدم ظهور أكواد اصطناعية على أنها أكواد حقيقية
    // -------------------------------------------------------------------------
    console.log('--- [Test 5] Zero Synthetic Codes to Real Customers ---');
    delete process.env.VOUCHERS_MOCK_MODE;
    process.env.ALLOW_REAL_G2BULK_PURCHASE = 'false';

    let test5LeakedSynthetic = false;
    try {
      const res = await g2BulkVoucherPurchaseProvider.purchaseVoucher({
        providerProductId: 43,
        quantity: 1,
        idempotencyKey: uuidv4(),
        isSimulation: false
      });
      // If purchase returned anything without real spend, that's a fake code leak!
      if (res && res.deliveryItems && res.deliveryItems.length > 0) {
        test5LeakedSynthetic = true;
      }
    } catch {
      // Expected: cleanly threw error instead of returning synthetic codes
      test5LeakedSynthetic = false;
    }

    const test5Passed = !test5LeakedSynthetic;
    report.push({
      id: 5,
      scenario: 'عدم ظهور أكواد اصطناعية على أنها أكواد حقيقية',
      passed: test5Passed,
      internalReason: 'ZERO_LOCAL_SYNTHESIS',
      details: {
        leakedSyntheticToLiveCustomer: test5LeakedSynthetic,
        protectionActive: true
      }
    });
    console.log(`Result: ${test5Passed ? '✓ PASSED' : '✗ FAILED'} (Strictly rejected live purchase instead of inventing fake codes)\n`);

    // -------------------------------------------------------------------------
    // TEST 6: تأكيد عدم إرسال أي طلب شراء إلى G2Bulk أثناء الاختبارات
    // -------------------------------------------------------------------------
    console.log('--- [Test 6] Zero Outbound Purchase Requests to G2Bulk ---');
    const test6Passed = outboundPurchaseCallsCount === 0;
    report.push({
      id: 6,
      scenario: 'عدم إرسال أي طلب شراء إلى G2Bulk أثناء الاختبارات',
      passed: test6Passed,
      internalReason: 'SPY_VERIFICATION',
      details: {
        totalOutboundPurchaseCalls: outboundPurchaseCallsCount,
        realSpendUsd: 0.00
      }
    });
    console.log(`Result: ${test6Passed ? '✓ PASSED' : '✗ FAILED'} (Outbound purchase calls = ${outboundPurchaseCallsCount})\n`);

    // -------------------------------------------------------------------------
    // TEST 7: GamesDrop 401 Circuit Breaker Throttling
    // -------------------------------------------------------------------------
    console.log('--- [Test 7] GamesDrop 401 Circuit Breaker / Throttling ---');
    gamesDropClient.resetAuthThrottle();
    let firstCallFailedWith401 = false;
    let secondCallThrottled = false;

    try {
      await gamesDropClient.request('/api/v1/balance', { method: 'GET' });
    } catch (e1: any) {
      firstCallFailedWith401 = e1.status === 401;
    }

    try {
      await gamesDropClient.request('/api/v1/balance', { method: 'GET' });
    } catch (e2: any) {
      secondCallThrottled = e2.details?.throttled === true;
    }

    const test7Passed = firstCallFailedWith401 && secondCallThrottled;
    report.push({
      id: 7,
      scenario: 'حماية سجلات GamesDrop ومنع تكرار طلبات الرصيد عند 401',
      passed: test7Passed,
      internalReason: 'CIRCUIT_BREAKER_ACTIVE',
      details: {
        firstCallFailedWith401,
        secondCallThrottledFast: secondCallThrottled
      }
    });
    console.log(`Result: ${test7Passed ? '✓ PASSED' : '✗ FAILED'} (Second call throttled fast without network request)\n`);

  } finally {
    // Restore client monkey-patch
    (g2BulkClient as any).purchaseProduct = originalPurchaseProduct;

    // Restore environment
    if (origMockMode !== undefined) process.env.VOUCHERS_MOCK_MODE = origMockMode;
    else delete process.env.VOUCHERS_MOCK_MODE;

    if (origRealPurchase !== undefined) process.env.ALLOW_REAL_G2BULK_PURCHASE = origRealPurchase;
    else delete process.env.ALLOW_REAL_G2BULK_PURCHASE;

    if (origApiKey !== undefined) process.env.API_G2BULK = origApiKey;
    if (origG2BulkKey !== undefined) process.env.G2BULK_API_KEY = origG2BulkKey;

    await pool.end();
  }

  console.log('======================================================================');
  console.log('📊 SECTION 6 COMPREHENSIVE SUITE RESULTS');
  console.log('======================================================================');
  for (const r of report) {
    console.log(`[${r.passed ? '✓ PASSED' : '✗ FAILED'}] Scenario ${r.id}: ${r.scenario} -> [${r.internalReason}]`);
  }

  const allPassed = report.every(r => r.passed);
  console.log('======================================================================');
  console.log(`Overall: ${report.filter(r => r.passed).length}/${report.length} PASSED (${allPassed ? '100%' : 'INCOMPLETE'})`);
  console.log('======================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runSection6Suite().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
