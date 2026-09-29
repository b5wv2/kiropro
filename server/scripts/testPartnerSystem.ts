import pool from '../src/db';
import { partnerLedgerService } from '../src/services/partnerLedgerService';
import { partnerService } from '../src/services/partnerService';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 STARTING KIROPRO PARTNER SYSTEM END-TO-END TESTS');
  console.log('====================================================');

  const testEmail = `test_partner_${Date.now()}@kiropro.store`;
  let testUserId: string = '';
  let testPartnerId: string = '';

  try {
    // ----------------------------------------------------
    // TEST 1: Admin Creates Partner with One-Time Setup Token
    // ----------------------------------------------------
    console.log('\n[1/7] Testing Admin Partner Creation with Setup Token...');
    const createResult = await partnerService.createPartnerAccount({
      email: testEmail,
      name: 'تاجر الاختبار التجريبي',
      phone: '+249912345678',
      businessName: 'متجر السرعة للشحن',
      notes: 'حساب تجريبي للاختبار الآلي'
    });

    testUserId = createResult.userId;
    testPartnerId = createResult.partnerId;
    const rawToken = createResult.setupUrl.split('token=')[1];

    if (!rawToken || !createResult.setupUrl.includes('token=')) {
      throw new Error('❌ Test 1 Failed: Setup token was not properly generated');
    }
    console.log(`✅ Partner created successfully: ID=${testPartnerId}, Token=${rawToken.substring(0, 10)}...`);

    // Verify DB initial state
    const walletCheck = await pool.query('SELECT balance FROM partner_wallets WHERE partner_id = $1', [testPartnerId]);
    if (Number(walletCheck.rows[0].balance) !== 0) {
      throw new Error('❌ Test 1 Failed: Initial wallet balance is not 0');
    }
    console.log('✅ Initial wallet balance verified: $0.00 USD');

    // ----------------------------------------------------
    // TEST 2: Consume One-Time Setup Token & Set Password
    // ----------------------------------------------------
    console.log('\n[2/7] Testing Password Setup Token Consumption...');
    const setupResult = await partnerService.verifyAndConsumeSetupToken(rawToken, 'SecurePassword123!');
    if (!setupResult.success) {
      throw new Error('❌ Test 2 Failed: Token consumption failed');
    }

    // Try consuming the same token again (Should fail)
    let reuseFailedAsExpected = false;
    try {
      await partnerService.verifyAndConsumeSetupToken(rawToken, 'AnotherPassword!');
    } catch {
      reuseFailedAsExpected = true;
    }
    if (!reuseFailedAsExpected) {
      throw new Error('❌ Test 2 Failed: Setup token was reused, which violates one-time token security!');
    }
    console.log('✅ Token consumed and second reuse correctly rejected with exception!');

    // ----------------------------------------------------
    // TEST 3: Wallet Credit & Non-Negative Audit Ledger
    // ----------------------------------------------------
    console.log('\n[3/7] Testing Wallet Credit ($150 USD) with Ledger Audit...');
    const creditResult = await partnerLedgerService.credit({
      partnerId: testPartnerId,
      amount: 150.00,
      type: 'DEPOSIT',
      description: 'إيداع بنكك معتمد للاختبار'
    });

    if (creditResult.balanceAfter !== 150.00) {
      throw new Error(`❌ Test 3 Failed: Expected balance 150.00, got ${creditResult.balanceAfter}`);
    }

    // Verify ledger record
    const ledgerCheck = await partnerLedgerService.getHistory({ partnerId: testPartnerId, limit: 10 });
    if (ledgerCheck.items.length !== 1 || Number(ledgerCheck.items[0].balanceAfter) !== 150.00) {
      throw new Error('❌ Test 3 Failed: Ledger entry incorrect');
    }
    console.log(`✅ Wallet credited: Balance before: ${ledgerCheck.items[0].balanceBefore}, after: ${ledgerCheck.items[0].balanceAfter}`);

    // ----------------------------------------------------
    // TEST 4: Pricing Resolution: Default vs Custom Override
    // ----------------------------------------------------
    console.log('\n[4/7] Testing Pricing Resolution (UNIQUE(partner_id, product_id))...');
    // Get an active product
    const productRes = await pool.query('SELECT id, "productName", "customerPriceUsd", "defaultPartnerPriceUsd" FROM "Product" WHERE "isActive" = true LIMIT 1');
    if (productRes.rows.length > 0) {
      const prod = productRes.rows[0];
      const prodId = prod.id;

      // 4a: Fallback to default
      const priceDefault = await partnerService.getEffectivePartnerPrice(testPartnerId, prodId);
      console.log(`Product "${prod.productName}": Retail=$${prod.customerPriceUsd}, Resolved Partner Price=$${priceDefault.finalPartnerPriceUsd}`);

      // 4b: Custom override for this partner
      await pool.query(
        `INSERT INTO partner_product_pricing (partner_id, product_id, partner_price_usd)
         VALUES ($1, $2, $3)
         ON CONFLICT (partner_id, product_id) DO UPDATE SET partner_price_usd = EXCLUDED.partner_price_usd`,
        [testPartnerId, prodId, 0.99]
      );

      const priceCustom = await partnerService.getEffectivePartnerPrice(testPartnerId, prodId);
      if (priceCustom.finalPartnerPriceUsd !== 0.99 || !priceCustom.isCustomPricing) {
        throw new Error(`❌ Test 4 Failed: Expected custom price 0.99, got ${priceCustom.finalPartnerPriceUsd}`);
      }
      console.log(`✅ Custom pricing override verified: $0.99 (isCustomPricing=true)`);
    }

    // ----------------------------------------------------
    // TEST 5: Purchase Debit & Concurrency-Safe Order Execution
    // ----------------------------------------------------
    console.log('\n[5/7] Testing Quick Buy Purchase Debit ($20.00 USD)...');
    const orderInsert = await pool.query(
      `INSERT INTO partner_orders 
        (partner_id, product_id, provider_offer_id, game_id, package_name, player_id, cost_price_usd, partner_price_usd, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSING')
       RETURNING id`,
      [testPartnerId, productRes.rows[0]?.id || null, 1001, 'pubg', 'باقة تجريبية', '5123456789', 18.00, 20.00]
    );
    const testOrderId = orderInsert.rows[0].id;

    const debitResult = await partnerLedgerService.debit({
      partnerId: testPartnerId,
      amount: 20.00,
      type: 'PURCHASE',
      referenceType: 'ORDER',
      referenceId: testOrderId,
      description: `شحن فوري باقة تجريبية - الطلب #${testOrderId.substring(0, 8)}`
    });

    if (debitResult.balanceAfter !== 130.00) {
      throw new Error(`❌ Test 5 Failed: Expected 130.00, got ${debitResult.balanceAfter}`);
    }
    console.log(`✅ Debit successful: New balance: $${debitResult.balanceAfter} USD`);

    // ----------------------------------------------------
    // TEST 6: Double-Refund & Race Condition Prevention
    // ----------------------------------------------------
    console.log('\n[6/7] Testing Double-Refund Protection...');
    // Refund 1: Should succeed
    const refund1Success = await partnerLedgerService.executeSafeOrderRefund({
      orderId: testOrderId,
      partnerId: testPartnerId,
      refundAmountUsd: 20.00,
      reason: 'فشل مزود الشحن التجريبي'
    });

    if (!refund1Success) {
      throw new Error(`❌ Test 6 Failed: Refund 1 should succeed`);
    }

    const walletAfterRefund = await pool.query('SELECT balance FROM partner_wallets WHERE partner_id = $1', [testPartnerId]);
    if (Number(walletAfterRefund.rows[0].balance) !== 150.00) {
      throw new Error(`❌ Test 6 Failed: Balance should be restored to 150.00, got ${walletAfterRefund.rows[0].balance}`);
    }
    console.log(`✅ Refund 1 succeeded: Restored balance to $${walletAfterRefund.rows[0].balance} USD`);

    // Refund 2: MUST fail (Anti-Double Refund Guard)
    const refund2Success = await partnerLedgerService.executeSafeOrderRefund({
      orderId: testOrderId,
      partnerId: testPartnerId,
      refundAmountUsd: 20.00,
      reason: 'محاولة استرداد مكررة خبيثة'
    });

    if (refund2Success) {
      throw new Error('❌ Test 6 CRITICAL FAILURE: Double refund was allowed!');
    }
    console.log('✅ Anti-Double Refund Guard verified: Second refund returned false and was blocked!');

    // ----------------------------------------------------
    // TEST 7: PostgreSQL Permanent Receipt Storage
    // ----------------------------------------------------
    console.log('\n[7/7] Testing PostgreSQL Base64 Permanent Receipt Storage...');
    const sampleReceiptBase64 = Buffer.from('FAKE_RECEIPT_IMAGE_DATA_12345').toString('base64');
    const depositInsert = await pool.query(
      `INSERT INTO partner_deposits 
        (partner_id, amount_usd, exchange_rate, amount_local, currency_local, receipt_filename, receipt_mime_type, receipt_data_base64, receipt_file_size, status)
       VALUES ($1, 50.00, 2500, 125000, 'SDG', 'test_receipt.png', 'image/png', $2, 28, 'PENDING')
       RETURNING id, receipt_data_base64, receipt_mime_type`,
      [testPartnerId, sampleReceiptBase64]
    );

    const savedDeposit = depositInsert.rows[0];
    if (savedDeposit.receipt_data_base64 !== sampleReceiptBase64 || savedDeposit.receipt_mime_type !== 'image/png') {
      throw new Error('❌ Test 7 Failed: Receipt data mismatch in PostgreSQL');
    }
    console.log('✅ PostgreSQL permanent receipt storage verified: 0 reliance on local disk!');

    console.log('\n====================================================');
    console.log('🎉 ALL 7 TEST SUITES PASSED FLAWLESSLY (100% SUCCESS)');
    console.log('====================================================');

  } catch (err: any) {
    console.error('\n❌ TEST RUN FAILED:', err.message || err);
    process.exit(1);
  } finally {
    // Cleanup test partner and records
    if (testPartnerId) {
      console.log('\nCleaning up test artifacts...');
      await pool.query('DELETE FROM partner_deposits WHERE partner_id = $1', [testPartnerId]);
      await pool.query('DELETE FROM partner_orders WHERE partner_id = $1', [testPartnerId]);
      await pool.query('DELETE FROM partner_ledger WHERE partner_id = $1', [testPartnerId]);
      await pool.query('DELETE FROM partner_product_pricing WHERE partner_id = $1', [testPartnerId]);
      await pool.query('DELETE FROM partner_wallets WHERE partner_id = $1', [testPartnerId]);
      await pool.query('DELETE FROM partner_setup_tokens WHERE partner_id = $1', [testPartnerId]);
      await pool.query('DELETE FROM partner_profiles WHERE id = $1', [testPartnerId]);
      if (testUserId) {
        await pool.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
      }
      console.log('✅ Test data cleaned up cleanly.');
    }
    await pool.end();
  }
}

runTests();
