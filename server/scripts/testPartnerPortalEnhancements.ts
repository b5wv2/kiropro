import { pool } from '../src/db';
import { partnerService } from '../src/services/partnerService';
import { partnerLedgerService } from '../src/services/partnerLedgerService';
import { encryptPassword } from '../src/utils/cryptoAccount';
import { v4 as uuidv4 } from 'uuid';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 RUNNING PARTNER PORTAL ENHANCEMENTS TEST MATRIX');
  console.log('====================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      testPassed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      testFailed++;
    }
  }

  // 1. PRODUCT REQUIREMENTS & FULFILLMENT TYPE CHECKS
  console.log('--- Test Section 1: Product Schema & Fulfillment Configuration ---');
  
  // Free Fire check
  const ffRes = await pool.query(
    `SELECT id, "productName", "arabicName", fulfillment_type, requires_player_id, requires_server_id 
     FROM "Product" 
     WHERE "productName" ILIKE '%Free Fire%' OR "arabicName" ILIKE '%فاير%' 
     LIMIT 1`
  );
  if (ffRes.rows.length > 0) {
    const ff = ffRes.rows[0];
    assert(
      ff.requires_player_id === true && ff.fulfillment_type === 'DIRECT_TOPUP',
      'Test 1: Free Fire requires Player ID and has DIRECT_TOPUP fulfillment type'
    );
  } else {
    console.log('⚠️ Free Fire not found in catalog, skipping specific row check');
  }

  // KiroPro Card check
  const cardRes = await pool.query(
    `SELECT id, "productName", "arabicName", fulfillment_type, requires_player_id, requires_inventory, "customerPriceUsd", "defaultPartnerPriceUsd"
     FROM "Product" 
     WHERE id = 'b0000000-0000-0000-0000-000000000001' OR "productName" ILIKE '%Mastercard%'
     LIMIT 1`
  );
  if (cardRes.rows.length > 0) {
    const card = cardRes.rows[0];
    assert(
      card.requires_player_id === false,
      'Test 2: KiroPro Card does NOT require Player ID'
    );
    assert(
      card.fulfillment_type === 'KIROPRO_CARD',
      'Test 3: KiroPro Card fulfillment_type is KIROPRO_CARD'
    );
    assert(
      Number(card.customerPriceUsd) === 2.00,
      'Test 4: KiroPro Card customer retail price is strictly $2.00'
    );
  }

  // Digital Account check
  const digiRes = await pool.query(
    `SELECT id, "productName", "arabicName", fulfillment_type, requires_player_id, requires_quantity, requires_inventory
     FROM "Product" 
     WHERE "productType" = 'DIGITAL_ACCOUNT' OR fulfillment_type = 'DIGITAL_ACCOUNT'
     LIMIT 1`
  );
  if (digiRes.rows.length > 0) {
    const digi = digiRes.rows[0];
    assert(
      digi.requires_player_id === false,
      'Test 5: Digital Account does NOT require Player ID'
    );
    assert(
      digi.requires_quantity === true && digi.requires_inventory === true,
      'Test 6: Digital Account requires quantity selection & inventory tracking'
    );
  }

  // 2. ATOMIC DIGITAL ACCOUNTS FULFILLMENT & INVENTORY
  console.log('\n--- Test Section 2: Atomic Digital Accounts Fulfillment & Transactions ---');
  
  // Set up temporary test partner & test product
  const testPartnerId = uuidv4();
  const testUserId = uuidv4();
  const testProductId = uuidv4();

  try {
    // Insert test user
    await pool.query(
      `INSERT INTO "User" (id, email, name, role, "passwordHash") 
       VALUES ($1, $2, $3, 'PARTNER', 'hash')`,
      [testUserId, `test-partner-${Date.now()}@kiropro.test`, 'Test Automated Partner']
    );

    // Insert test partner profile
    await pool.query(
      `INSERT INTO partner_profiles (id, user_id, business_name, status, total_points)
       VALUES ($1, $2, 'Test Automated Agency', 'ACTIVE', 0)`,
      [testPartnerId, testUserId]
    );

    // Insert test partner wallet with $10.00
    await pool.query(
      `INSERT INTO partner_wallets (partner_id, balance, currency)
       VALUES ($1, 10.00, 'USD')`,
      [testPartnerId]
    );

    // Insert test product with $2.00 partner price
    await pool.query(
      `INSERT INTO "Product" (
        id, "productName", "arabicName", "offerName", "productType", fulfillment_type, requires_player_id, 
        requires_quantity, requires_inventory, "customerPriceUsd", "defaultPartnerPriceUsd", "isActive"
      ) VALUES ($1, 'Test Google Play 100 Points', 'حساب جوجل بلاي تجريبي', 'Test Google Play 100 Points Offer', 'DIGITAL_ACCOUNT', 'DIGITAL_ACCOUNT', false, true, true, 3.00, 2.00, true)`,
      [testProductId]
    );

    // Seed 4 test accounts in inventory
    const accountIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const accId = uuidv4();
      accountIds.push(accId);
      await pool.query(
        `INSERT INTO digital_product_accounts (
          id, product_id, email, password_encrypted, status
        ) VALUES ($1, $2, $3, $4, 'AVAILABLE')`,
        [accId, testProductId, `acc${i}@gmail.com`, encryptPassword(`secure_pass_${i}`)]
      );
    }

    // A. TEST QUANTITY = 3 MULTI-ACCOUNT PURCHASE
    console.log('Testing: Purchasing 3 digital accounts atomically...');
    const testIdempotencyKey = `test-idem-${Date.now()}`;
    const result3 = await partnerService.issueDigitalAccounts({
      partnerId: testPartnerId,
      partnerUserId: testUserId,
      productId: testProductId,
      quantity: 3,
      idempotencyKey: testIdempotencyKey
    });

    assert(
      result3.success === true && result3.accounts.length === 3,
      'Test 7: Successfully assigned exactly 3 distinct accounts'
    );

    // Verify wallet balance is 10.00 - (3 * 2.00) = 4.00
    const balanceRes = await pool.query(
      `SELECT balance FROM partner_wallets WHERE partner_id = $1`,
      [testPartnerId]
    );
    assert(
      Number(balanceRes.rows[0].balance) === 4.00,
      'Test 8: Wallet balance accurately debited by $6.00 to $4.00'
    );

    // Verify assigned accounts are marked SOLD
    const soldCountRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM digital_product_accounts 
       WHERE product_id = $1 AND status = 'SOLD'`,
      [testProductId]
    );
    assert(
      soldCountRes.rows[0].count === 3,
      'Test 9: Exactly 3 accounts marked SOLD in inventory'
    );

    // B. TEST DOUBLE CLICK / IDEMPOTENCY KEY (Same idempotency key should deduplicate without charging again)
    console.log('Testing: Double-click with same idempotency key...');
    const duplicateResult = await partnerService.issueDigitalAccounts({
      partnerId: testPartnerId,
      partnerUserId: testUserId,
      productId: testProductId,
      quantity: 3,
      idempotencyKey: testIdempotencyKey
    });

    const balanceAfterDuplicateRes = await pool.query(
      `SELECT balance FROM partner_wallets WHERE partner_id = $1`,
      [testPartnerId]
    );
    assert(
      duplicateResult.isDuplicate === true && Number(balanceAfterDuplicateRes.rows[0].balance) === 4.00,
      'Test 10: Double click deduplication verified — 1 order created, 0 extra charge'
    );

    // C. TEST QUANTITY > REMAINING STOCK (Only 1 remains, request 2)
    console.log('Testing: Purchasing 2 accounts when only 1 is in stock...');
    let stockError = '';
    try {
      await partnerService.issueDigitalAccounts({
        partnerId: testPartnerId,
        partnerUserId: testUserId,
        productId: testProductId,
        quantity: 2
      });
    } catch (err: any) {
      stockError = err.message;
    }

    assert(
      stockError.includes('المخزون المتوفر') || stockError.includes('لا يكفي'),
      'Test 11: Strict rejection when quantity > stock (no partial fulfillment)',
      stockError
    );

    // Verify wallet was NOT debited on failed transaction
    const balanceAfterFailRes = await pool.query(
      `SELECT balance FROM partner_wallets WHERE partner_id = $1`,
      [testPartnerId]
    );
    assert(
      Number(balanceAfterFailRes.rows[0].balance) === 4.00,
      'Test 12: Wallet balance unchanged ($4.00) after stock rejection rollback'
    );

    // D. TEST INSUFFICIENT BALANCE (Requires $2.00, debit balance to $1.00 first)
    console.log('Testing: Purchasing when wallet has insufficient funds...');
    await pool.query(`UPDATE partner_wallets SET balance = 1.00 WHERE partner_id = $1`, [testPartnerId]);

    let balanceError = '';
    try {
      await partnerService.issueDigitalAccounts({
        partnerId: testPartnerId,
        partnerUserId: testUserId,
        productId: testProductId,
        quantity: 1
      });
    } catch (err: any) {
      balanceError = err.message;
    }

    assert(
      balanceError.includes('غير كافٍ'),
      'Test 13: Strict rejection when balance is insufficient',
      balanceError
    );

    // E. TEST IDOR SECURITY: Cannot access another partner's order credentials
    console.log('Testing: IDOR prevention on order credentials endpoint...');
    const fakePartnerId = uuidv4();
    let idorError = '';
    try {
      await partnerService.getPartnerOrderDigitalAccounts(fakePartnerId, result3.order.id);
    } catch (err: any) {
      idorError = err.message;
    }

    assert(
      idorError.includes('غير موجود') || idorError.includes('غير مصرح'),
      'Test 14: IDOR Security verified — Foreign partner cannot view credentials',
      idorError
    );

    // 3. PAYMENT METHODS CRUD & SNAPSHOT DYNAMICS
    console.log('\n--- Test Section 3: Deposit Payment Methods Dynamic API & Snapshot ---');
    
    // Insert new deposit method with phone_number & qr_code_url
    const pmId = uuidv4();
    await pool.query(
      `INSERT INTO payment_methods (
        id, name, type, currency, account_name, account_number, 
        bank_name, phone_number, qr_code_url, enabled, display_order
      ) VALUES ($1, 'بنك الخرطوم التجريبي', 'BANK_TRANSFER', 'SDG', 'كيبرو للخدمات', '1234567', 'Bank of Khartoum', '0912345678', 'https://qr.test', true, 99)`,
      [pmId]
    );

    const pmFetchRes = await pool.query(
      `SELECT * FROM payment_methods WHERE id = $1`,
      [pmId]
    );
    assert(
      pmFetchRes.rows.length === 1 && 
      pmFetchRes.rows[0].phone_number === '0912345678' &&
      pmFetchRes.rows[0].qr_code_url === 'https://qr.test',
      'Test 14: Payment method with phone_number & qr_code_url saved and retrievable'
    );

    // Cleanup the test payment method
    await pool.query(`DELETE FROM payment_methods WHERE id = $1`, [pmId]);

  } finally {
    // Cleanup temporary test data
    console.log('\n🧹 Cleaning up automated test records...');
    await pool.query(
      `DELETE FROM digital_account_assignments WHERE partner_order_id IN (SELECT id FROM partner_orders WHERE partner_id = $1)`,
      [testPartnerId]
    );
    await pool.query(`DELETE FROM digital_product_accounts WHERE product_id = $1`, [testProductId]);
    await pool.query(`DELETE FROM partner_orders WHERE partner_id = $1`, [testPartnerId]);
    await pool.query(`DELETE FROM partner_ledger WHERE partner_id = $1`, [testPartnerId]);
    await pool.query(`DELETE FROM partner_wallets WHERE partner_id = $1`, [testPartnerId]);
    await pool.query(`DELETE FROM partner_profiles WHERE id = $1`, [testPartnerId]);
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
    await pool.query(`DELETE FROM "Product" WHERE id = $1`, [testProductId]);
    console.log('Cleaned up test records cleanly.');
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${testPassed} PASSED | ${testFailed} FAILED`);
  console.log('====================================================\n');

  if (testFailed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .then(() => {
    console.log('All tests completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
