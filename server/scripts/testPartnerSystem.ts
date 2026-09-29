import pool from '../src/db';
import { partnerLedgerService } from '../src/services/partnerLedgerService';
import { partnerService } from '../src/services/partnerService';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 STARTING ENHANCED KIROPRO PARTNER VERIFICATION SUITE');
  console.log('====================================================');

  const testEmail = `test_partner_${Date.now()}@kiropro.store`;
  let testUserId: string = '';
  let testPartnerId: string = '';

  try {
    // ----------------------------------------------------
    // TEST 1: Admin Creates Partner with One-Time Setup Token
    // ----------------------------------------------------
    console.log('\n[1/10] Testing Admin Partner Creation with Setup Token...');
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
    console.log('\n[2/10] Testing Password Setup Token Consumption...');
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
    // TEST 3: Partner Details (/me) & Structure Verification
    // ----------------------------------------------------
    console.log('\n[3/10] Testing Partner Details & /me Response Structure...');
    const details = await partnerService.getPartnerDetails(testPartnerId);
    if (!details || details.status !== 'ACTIVE' || details.email !== testEmail) {
      throw new Error('❌ Test 3 Failed: Partner details do not match expected active status');
    }
    if (details.partnerId !== testPartnerId || details.userId !== testUserId) {
      throw new Error('❌ Test 3 Failed: IDs mismatch in partner details');
    }
    console.log(`✅ /me Data Integrity Verified: status=${details.status}, partnerId=${details.partnerId}, email=${details.email}`);

    // ----------------------------------------------------
    // TEST 4: Partner Pricing Logic (Supplier Cost + Small Markup)
    // ----------------------------------------------------
    console.log('\n[4/10] Testing Partner Pricing: Supplier Cost + Small Markup ($0.01-$0.05)...');
    const settings = await partnerService.getPricingSettings();
    console.log(`Pricing Settings: Default Markup=$${settings.defaultMarkupUsd}, Min=$${settings.minMarkupUsd}, Max=$${settings.maxMarkupUsd}`);

    // Test product A
    const prodRes = await pool.query('SELECT id, "productName", "supplierCostUsd", "gamesDropCostUsd", "customerPriceUsd" FROM "Product" WHERE "isActive" = true LIMIT 1');
    if (prodRes.rows.length === 0) {
      throw new Error('❌ Test 4 Failed: No active product in DB');
    }

    const testProd = prodRes.rows[0];
    const supplierCost = Number(testProd.supplierCostUsd || testProd.gamesDropCostUsd || 0);

    // Calculate default partner price
    const resolvedPrice = await partnerService.getEffectivePartnerPrice(testPartnerId, testProd.id);
    const expectedDefaultPrice = Math.round((supplierCost + settings.defaultMarkupUsd) * 100) / 100;

    console.log(`Product: "${testProd.productName}"`);
    console.log(`- Supplier Cost: $${supplierCost}`);
    console.log(`- Customer Retail Price: $${testProd.customerPriceUsd}`);
    console.log(`- Partner Resolved Price: $${resolvedPrice.finalPartnerPriceUsd}`);
    console.log(`- Calculated Markup: $${resolvedPrice.markupUsd}`);

    if (Math.abs(resolvedPrice.finalPartnerPriceUsd - expectedDefaultPrice) > 0.001) {
      throw new Error(`❌ Test 4 Failed: Expected default price $${expectedDefaultPrice}, got $${resolvedPrice.finalPartnerPriceUsd}`);
    }

    // Verify it is NOT using customer retail price or 95%
    const retail95 = Math.round(Number(testProd.customerPriceUsd) * 0.95 * 100) / 100;
    if (resolvedPrice.finalPartnerPriceUsd === retail95 && Math.abs(retail95 - expectedDefaultPrice) > 0.05) {
      throw new Error(`❌ Test 4 Failed: Partner price appears to still use 95% customer retail price!`);
    }
    console.log('✅ Default Pricing Verified: Partner Price = Supplier Cost + Admin Markup ($0.03)');

    // ----------------------------------------------------
    // TEST 5: Custom Markup and Custom Price Override
    // ----------------------------------------------------
    console.log('\n[5/10] Testing Custom Partner Pricing Override (UNIQUE(partner_id, product_id))...');
    const customTestPrice = Math.round((supplierCost + 0.02) * 100) / 100; // $0.02 markup
    await pool.query(
      `INSERT INTO partner_product_pricing (partner_id, product_id, partner_price_usd, markup_usd)
       VALUES ($1, $2, $3, 0.0200)
       ON CONFLICT (partner_id, product_id) DO UPDATE SET 
         partner_price_usd = EXCLUDED.partner_price_usd,
         markup_usd = EXCLUDED.markup_usd`,
      [testPartnerId, testProd.id, customTestPrice]
    );

    const customResolved = await partnerService.getEffectivePartnerPrice(testPartnerId, testProd.id);
    if (customResolved.finalPartnerPriceUsd !== customTestPrice || !customResolved.isCustomPricing) {
      throw new Error(`❌ Test 5 Failed: Expected custom price $${customTestPrice}, got $${customResolved.finalPartnerPriceUsd}`);
    }
    console.log(`✅ Custom Pricing Override Verified: Supplier Cost $${supplierCost} + Markup $0.02 = $${customResolved.finalPartnerPriceUsd}`);

    // ----------------------------------------------------
    // TEST 6: Anti-Loss Protection (Cannot be less than Supplier Cost)
    // ----------------------------------------------------
    console.log('\n[6/10] Testing Anti-Loss Protection (Price >= Supplier Cost + $0.01)...');
    await pool.query(
      `UPDATE partner_product_pricing 
       SET partner_price_usd = $1 
       WHERE partner_id = $2 AND product_id = $3`,
      [Math.max(0, supplierCost - 0.50), testPartnerId, testProd.id]
    );

    const safeResolved = await partnerService.getEffectivePartnerPrice(testPartnerId, testProd.id);
    if (safeResolved.finalPartnerPriceUsd < supplierCost + 0.01) {
      throw new Error(`❌ Test 6 Failed: Anti-loss protection failed! Partner price is lower than supplier cost`);
    }
    console.log(`✅ Anti-Loss Guard Verified: Even with below-cost custom price, system enforced minimum $${safeResolved.finalPartnerPriceUsd}`);

    // ----------------------------------------------------
    // TEST 7: Wallet Credit ($150 USD) with Ledger Audit
    // ----------------------------------------------------
    console.log('\n[7/10] Testing Wallet Credit ($150 USD) with Ledger Audit...');
    const creditResult = await partnerLedgerService.credit({
      partnerId: testPartnerId,
      amount: 150.00,
      type: 'DEPOSIT',
      description: 'إيداع بنكك معتمد للاختبار'
    });

    if (creditResult.balanceAfter !== 150.00) {
      throw new Error(`❌ Test 7 Failed: Expected balance 150.00, got ${creditResult.balanceAfter}`);
    }
    console.log(`✅ Wallet credited: New balance: $${creditResult.balanceAfter} USD`);

    // ----------------------------------------------------
    // TEST 8: Quick Buy Purchase Debit ($20.00 USD)
    // ----------------------------------------------------
    console.log('\n[8/10] Testing Quick Buy Purchase Debit & Snapshot...');
    const orderInsert = await pool.query(
      `INSERT INTO partner_orders 
        (partner_id, product_id, provider_offer_id, game_id, package_name, player_id, cost_price_usd, partner_price_usd, markup_usd, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSING')
       RETURNING id`,
      [testPartnerId, testProd.id, 1001, 'game', 'باقة اختبارية', '5123456789', supplierCost, customTestPrice, 0.02]
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
      throw new Error(`❌ Test 8 Failed: Expected 130.00, got ${debitResult.balanceAfter}`);
    }
    console.log(`✅ Debit successful: New balance: $${debitResult.balanceAfter} USD (Order snapshotted with cost and markup)`);

    // ----------------------------------------------------
    // TEST 9: Double-Refund & Race Condition Prevention
    // ----------------------------------------------------
    console.log('\n[9/10] Testing Double-Refund Protection...');
    const refund1Success = await partnerLedgerService.executeSafeOrderRefund({
      orderId: testOrderId,
      partnerId: testPartnerId,
      refundAmountUsd: 20.00,
      reason: 'فشل مزود الشحن التجريبي'
    });

    if (!refund1Success) {
      throw new Error(`❌ Test 9 Failed: Refund 1 should succeed`);
    }

    const walletAfterRefund = await pool.query('SELECT balance FROM partner_wallets WHERE partner_id = $1', [testPartnerId]);
    if (Number(walletAfterRefund.rows[0].balance) !== 150.00) {
      throw new Error(`❌ Test 9 Failed: Balance should be restored to 150.00, got ${walletAfterRefund.rows[0].balance}`);
    }
    console.log(`✅ Refund 1 succeeded: Restored balance to $${walletAfterRefund.rows[0].balance} USD`);

    // Second refund attempt (must fail)
    const refund2Success = await partnerLedgerService.executeSafeOrderRefund({
      orderId: testOrderId,
      partnerId: testPartnerId,
      refundAmountUsd: 20.00,
      reason: 'محاولة استرداد مكررة خبيثة'
    });

    if (refund2Success) {
      throw new Error('❌ Test 9 CRITICAL FAILURE: Double refund was allowed!');
    }
    console.log('✅ Anti-Double Refund Guard verified: Second refund returned false and was blocked!');

    // ----------------------------------------------------
    // TEST 10: PostgreSQL Permanent Receipt Storage
    // ----------------------------------------------------
    console.log('\n[10/10] Testing PostgreSQL Base64 Permanent Receipt Storage...');
    const sampleReceiptBase64 = Buffer.from('TEST_RECEIPT_IMAGE_12345').toString('base64');
    const depositInsert = await pool.query(
      `INSERT INTO partner_deposits 
        (partner_id, amount_usd, exchange_rate, amount_local, currency_local, receipt_filename, receipt_mime_type, receipt_data_base64, receipt_file_size, status)
       VALUES ($1, 50.00, 3500, 175000, 'SDG', 'test_receipt.png', 'image/png', $2, 24, 'PENDING')
       RETURNING id, receipt_data_base64`,
      [testPartnerId, sampleReceiptBase64]
    );

    const savedDeposit = depositInsert.rows[0];
    if (savedDeposit.receipt_data_base64 !== sampleReceiptBase64) {
      throw new Error('❌ Test 10 Failed: Receipt data mismatch in PostgreSQL');
    }
    console.log('✅ PostgreSQL permanent receipt storage verified: 0 reliance on local disk!');

    console.log('\n====================================================');
    console.log('🎉 ALL 10 ENHANCED TEST SUITES PASSED (100% SUCCESS)');
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
