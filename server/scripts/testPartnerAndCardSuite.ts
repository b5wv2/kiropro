import pool from '../src/db';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { partnerService, PartnerAccountError } from '../src/services/partnerService';
import { sanitizeEmail } from '../src/utils/sanitizeEmail';
import { partnerLedgerService } from '../src/services/partnerLedgerService';
import { encryptCardData } from '../src/utils/cryptoCard';

const REAL_PROD_CARD_ID = 'aa339a57-4f25-43e7-a2b3-6230d6221db8';

async function runTestSuite() {
  console.log('=====================================================');
  console.log('🚀 RUNNING COMPREHENSIVE PARTNER & CARD TEST SUITE');
  console.log('=====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Verify Real Production Card is present & safe
  const prodCardCheck = await pool.query(
    'SELECT id, status, card_last4 FROM kiropro_cards_inventory WHERE id = $1',
    [REAL_PROD_CARD_ID]
  );
  if (prodCardCheck.rows.length === 0 || prodCardCheck.rows[0].status !== 'AVAILABLE') {
    throw new Error(`Real prod card ${REAL_PROD_CARD_ID} not in expected AVAILABLE state! Aborting tests.`);
  }
  console.log(`🔒 Confirmed Real Prod Card is safe and AVAILABLE: ${REAL_PROD_CARD_ID} (last4: ${prodCardCheck.rows[0].card_last4})`);

  // Temporarily hold real prod card to guarantee zero chance of it being consumed in test
  await pool.query(
    "UPDATE kiropro_cards_inventory SET status = 'DISABLED' WHERE id = $1",
    [REAL_PROD_CARD_ID]
  );
  console.log('🔒 Temporarily isolated real production card during test suite execution.');

  const createdUserIds: string[] = [];
  const createdCardIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Email Sanitization
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Email Sanitization (Zero-width, BOM, spaces) ---');
    const dirtyEmail1 = '\uFEFF  Test.User\u200B@ExAmPlE.CoM\u00A0 ';
    const cleanEmail1 = sanitizeEmail(dirtyEmail1);
    assert(cleanEmail1 === 'test.user@example.com', 'Strips BOM, zero-width, non-breaking space, trims and lowercases');

    const dirtyEmail2 = '  Customer\u200C\u200D@KiroPro.Store\u202F ';
    const cleanEmail2 = sanitizeEmail(dirtyEmail2);
    assert(cleanEmail2 === 'customer@kiropro.store', 'Strips ZWNJ, ZWJ, narrow NBSP and lowercases');

    // -------------------------------------------------------------------------
    // TEST 2: Partner Creation with New Email
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Create Partner Account with New Email ---');
    const testNewEmail = `test_partner_${Date.now()}@kirotest.com`;
    const newPartnerResult = await partnerService.createPartnerAccount({
      name: 'Test Partner New',
      email: testNewEmail,
      businessName: 'Apex Store',
      phone: '+1234567890',
      status: 'ACTIVE'
    });
    createdUserIds.push(newPartnerResult.userId);

    assert(Boolean(newPartnerResult.partnerId), 'Partner ID generated');
    assert(newPartnerResult.email === testNewEmail, 'Partner email matches');
    assert(Boolean(newPartnerResult.setupUrl), 'One-time setup URL created (no cleartext password in DB)');

    // Verify User role in DB
    const userRoleCheck = await pool.query('SELECT role FROM "User" WHERE id = $1', [newPartnerResult.userId]);
    assert(userRoleCheck.rows[0]?.role === 'PARTNER', 'User role is PARTNER in database');

    // Verify Partner Wallet
    const walletCheck = await pool.query('SELECT balance FROM partner_wallets WHERE partner_id = $1', [newPartnerResult.partnerId]);
    assert(Number(walletCheck.rows[0]?.balance) === 0, 'Partner wallet initialized with 0.00 USD');

    // -------------------------------------------------------------------------
    // TEST 3: Existing Customer Email -> Stops Creation (EMAIL_IS_CUSTOMER)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Existing Customer Email -> Stops Creation ---');
    const customerEmail = `customer_${Date.now()}@kirotest.com`;
    const customerPasswordHash = await bcrypt.hash('SecretCustomerPass123!', 10);
    const customerUserRes = await pool.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'CUSTOMER', NOW(), NOW())
      RETURNING id, email, "passwordHash"
    `, [uuidv4(), customerEmail, customerPasswordHash, 'Existing Customer']);
    const customerUserId = customerUserRes.rows[0].id;
    createdUserIds.push(customerUserId);

    let customerErrorThrown = false;
    let customerErrorCode = '';
    try {
      await partnerService.createPartnerAccount({
        name: 'Attempt Duplicate',
        email: customerEmail
      });
    } catch (err: any) {
      customerErrorThrown = true;
      customerErrorCode = err.code;
    }
    assert(customerErrorThrown, 'Partner creation stopped for existing customer');
    assert(customerErrorCode === 'EMAIL_IS_CUSTOMER', 'Returned error code EMAIL_IS_CUSTOMER');

    // Verify customer is still CUSTOMER and has no partner profile
    const verifyCustomerUnchanged = await pool.query('SELECT role, "passwordHash" FROM "User" WHERE id = $1', [customerUserId]);
    assert(verifyCustomerUnchanged.rows[0].role === 'CUSTOMER', 'Customer role NOT automatically changed');
    assert(verifyCustomerUnchanged.rows[0].passwordHash === customerPasswordHash, 'Customer password remained intact');

    // -------------------------------------------------------------------------
    // TEST 4: Customer -> Partner Upgrade (After Explicit Admin Confirmation)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Customer -> Partner Explicit Upgrade ---');
    const systemAdminRes = await pool.query('SELECT id FROM "User" WHERE role = \'ADMIN\' LIMIT 1');
    const systemAdminId = systemAdminRes.rows[0]?.id;
    const upgradedResult = await partnerService.upgradeCustomerToPartner({
      customerUserId,
      businessName: 'Upgraded Merchant Store',
      notes: 'Upgraded after admin explicit confirmation',
      adminId: systemAdminId
    });

    assert(upgradedResult.role === 'PARTNER', 'Role updated to PARTNER');
    assert(Boolean(upgradedResult.partnerId), 'Partner profile created for upgraded customer');

    // Verify Password untouched
    const verifyPasswordStillSame = await pool.query('SELECT "passwordHash", role FROM "User" WHERE id = $1', [customerUserId]);
    assert(verifyPasswordStillSame.rows[0].passwordHash === customerPasswordHash, 'Password hash preserved exactly without modification');
    assert(verifyPasswordStillSame.rows[0].role === 'PARTNER', 'Database role verified as PARTNER');

    // Verify Partner Wallet exists
    const upgradedWallet = await pool.query('SELECT balance FROM partner_wallets WHERE partner_id = $1', [upgradedResult.partnerId]);
    assert(upgradedWallet.rows.length === 1, 'Partner wallet created for upgraded account');

    // Verify AuditLog
    const auditLogCheck = await pool.query(
      'SELECT action, "targetUserId" FROM "AuditLog" WHERE action = \'UPGRADE_CUSTOMER_TO_PARTNER\' AND "targetUserId" = $1',
      [customerUserId]
    );
    assert(auditLogCheck.rows.length > 0, 'AuditLog created with action UPGRADE_CUSTOMER_TO_PARTNER');

    // -------------------------------------------------------------------------
    // TEST 5: Existing Partner Email -> EMAIL_ALREADY_PARTNER
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Existing Partner Email Check ---');
    let partnerErrorThrown = false;
    let partnerErrorCode = '';
    try {
      await partnerService.createPartnerAccount({
        name: 'Another Attempt',
        email: customerEmail // now upgraded to partner
      });
    } catch (err: any) {
      partnerErrorThrown = true;
      partnerErrorCode = err.code;
    }
    assert(partnerErrorThrown, 'Partner creation stopped for existing partner');
    assert(partnerErrorCode === 'EMAIL_ALREADY_PARTNER', 'Returned error code EMAIL_ALREADY_PARTNER');

    // -------------------------------------------------------------------------
    // TEST 6: Existing Admin Email -> EMAIL_IS_ADMIN
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Admin Email Check ---');
    const adminEmail = `admin_${Date.now()}@kirotest.com`;
    const adminUserRes = await pool.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, 'ADMIN', NOW(), NOW())
      RETURNING id
    `, [uuidv4(), adminEmail, 'hashedadminpass', 'System Admin']);
    createdUserIds.push(adminUserRes.rows[0].id);

    let adminErrorThrown = false;
    let adminErrorCode = '';
    try {
      await partnerService.createPartnerAccount({
        name: 'Admin Attempt',
        email: adminEmail
      });
    } catch (err: any) {
      adminErrorThrown = true;
      adminErrorCode = err.code;
    }
    assert(adminErrorThrown, 'Partner creation rejected for admin email');
    assert(adminErrorCode === 'EMAIL_IS_ADMIN', 'Returned error code EMAIL_IS_ADMIN');

    // -------------------------------------------------------------------------
    // TEST 7: Partner Card Info ($2.00 Retail, $1.13 Partner)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Partner Card Pricing & Stock Info ---');
    const cardInfo = await partnerService.getPartnerCardInfo(upgradedResult.partnerId);
    assert(cardInfo.customerPriceUsd === 2.00, 'Customer retail price remains $2.00 USD');
    assert(cardInfo.partnerPriceUsd === 1.13, 'Partner price is $1.13 USD');
    assert(typeof cardInfo.availableStock === 'number', 'Available stock count is numeric');

    // -------------------------------------------------------------------------
    // TEST 8: Insufficient Balance Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Insufficient Balance Rejection ---');
    // Partner has 0.00 USD
    let insufficientThrown = false;
    try {
      await partnerService.issueKiroProCard({
        partnerId: upgradedResult.partnerId,
        partnerUserId: customerUserId
      });
    } catch (err: any) {
      insufficientThrown = true;
      assert(err.message.includes('غير كافٍ'), 'Rejected with insufficient balance error');
    }
    assert(insufficientThrown, 'Issuance prevented when wallet balance is lower than $1.13');

    // -------------------------------------------------------------------------
    // TEST 9: Card Issuance at $1.13 (Atomic Transaction)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Successful Card Issuance at $1.13 ---');
    // Top up partner wallet to $5.00
    await pool.query(
      'UPDATE partner_wallets SET balance = 5.00 WHERE partner_id = $1',
      [upgradedResult.partnerId]
    );

    // Insert a dedicated test card in kiropro_cards_inventory
    const testCardId1 = uuidv4();
    const encCard = encryptCardData('5300123456789991');
    const encCvv = encryptCardData('123');
    await pool.query(`
      INSERT INTO kiropro_cards_inventory (
        id, product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status, created_at, updated_at
      ) VALUES (
        $1, 'b0000000-0000-0000-0000-000000000001', $2, '9991', '12/28', $3, 1.00, 'AVAILABLE', NOW(), NOW()
      )
    `, [testCardId1, encCard, encCvv]);
    createdCardIds.push(testCardId1);

    const idempotencyKey1 = `test_key_${Date.now()}`;
    const issueResult = await partnerService.issueKiroProCard({
      partnerId: upgradedResult.partnerId,
      partnerUserId: customerUserId,
      idempotencyKey: idempotencyKey1
    });

    assert(Boolean(issueResult.order), 'Partner order created');
    assert(Number(issueResult.order.partnerPriceUsd) === 1.13, 'Order amount is exactly $1.13 USD');
    const walletAfterIssue = await pool.query('SELECT balance FROM partner_wallets WHERE partner_id = $1', [upgradedResult.partnerId]);
    assert(Number(walletAfterIssue.rows[0].balance) === 3.87, 'Wallet balance reduced from $5.00 to $3.87 ($1.13 deduction)');
    assert(issueResult.order.cardLast4 === '9991', 'Card 9991 assigned to partner');

    // Verify card in DB is CLAIMED and assigned to partner
    const cardDbCheck = await pool.query(
      'SELECT status, assigned_to_user_id FROM kiropro_cards_inventory WHERE id = $1',
      [testCardId1]
    );
    assert(cardDbCheck.rows[0].status === 'CLAIMED', 'Card marked CLAIMED in database');
    assert(cardDbCheck.rows[0].assigned_to_user_id === customerUserId, 'Card assigned_to_user_id matches partner user');

    // -------------------------------------------------------------------------
    // TEST 10: Double Click / Idempotency Protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Double Click / Idempotency Key ---');
    const duplicateIssueResult = await partnerService.issueKiroProCard({
      partnerId: upgradedResult.partnerId,
      partnerUserId: customerUserId,
      idempotencyKey: idempotencyKey1 // SAME KEY
    });

    assert(duplicateIssueResult.isDuplicate === true, 'Recognized duplicate request via idempotency_key');
    assert(duplicateIssueResult.order.id === issueResult.order.id, 'Returned original order without double-charging');
    
    // Verify wallet was NOT charged a second time
    const balanceAfterDuplicate = await pool.query(
      'SELECT balance FROM partner_wallets WHERE partner_id = $1',
      [upgradedResult.partnerId]
    );
    assert(Number(balanceAfterDuplicate.rows[0].balance) === 3.87, 'Balance remained $3.87 (zero double-deduction)');

    // -------------------------------------------------------------------------
    // TEST 11: Out of Stock
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Out of Stock Protection ---');
    // Ensure all test cards are CLAIMED (and real card is still TEMP_TEST_HOLD)
    let outOfStockThrown = false;
    try {
      await partnerService.issueKiroProCard({
        partnerId: upgradedResult.partnerId,
        partnerUserId: customerUserId,
        idempotencyKey: `new_key_${Date.now()}`
      });
    } catch (err: any) {
      outOfStockThrown = true;
      assert(err.message.includes('مخزون') || err.message.includes('نفد'), 'Returned out of stock error message');
    }
    assert(outOfStockThrown, 'Issuance stopped when no cards are AVAILABLE');

    // -------------------------------------------------------------------------
    // TEST 12: Concurrent Card Issuance Race Condition Test
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: Concurrent Card Issuance (SKIP LOCKED / ACID) ---');
    // Insert EXACTLY ONE available test card
    const testCardId2 = uuidv4();
    await pool.query(`
      INSERT INTO kiropro_cards_inventory (
        id, product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status, created_at, updated_at
      ) VALUES (
        $1, 'b0000000-0000-0000-0000-000000000001', $2, '9992', '12/28', $3, 1.00, 'AVAILABLE', NOW(), NOW()
      )
    `, [testCardId2, encCard, encCvv]);
    createdCardIds.push(testCardId2);

    // Give partner $10.00
    await pool.query('UPDATE partner_wallets SET balance = 10.00 WHERE partner_id = $1', [upgradedResult.partnerId]);

    // Send 2 concurrent issuance requests at the exact same millisecond
    const concurrent1 = partnerService.issueKiroProCard({
      partnerId: upgradedResult.partnerId,
      partnerUserId: customerUserId,
      idempotencyKey: `race_key_1_${Date.now()}`
    });
    const concurrent2 = partnerService.issueKiroProCard({
      partnerId: upgradedResult.partnerId,
      partnerUserId: customerUserId,
      idempotencyKey: `race_key_2_${Date.now()}`
    });

    const [res1, res2] = await Promise.allSettled([concurrent1, concurrent2]);

    const successes = [res1, res2].filter(r => r.status === 'fulfilled');
    const failures = [res1, res2].filter(r => r.status === 'rejected');

    assert(successes.length === 1, 'Exactly ONE request succeeded in claiming the single available card');
    assert(failures.length === 1, 'Exactly ONE request failed gracefully (zero duplicate assignment)');

    // -------------------------------------------------------------------------
    // TEST 13: IDOR Defense (Strict Card Ownership Verification)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 13: IDOR Security Defense ---');
    // Create a Second Partner (Partner B)
    const partnerBEmail = `partner_b_${Date.now()}@kirotest.com`;
    const partnerB = await partnerService.createPartnerAccount({
      name: 'Partner B Hacker Attempt',
      email: partnerBEmail,
      status: 'ACTIVE'
    });
    createdUserIds.push(partnerB.userId);

    // Partner B tries to fetch credentials for Partner A's card (testCardId1)
    let idorCaught = false;
    try {
      await partnerService.getPartnerCardCredentials(partnerB.partnerId, partnerB.userId, testCardId1);
    } catch (err: any) {
      idorCaught = true;
      assert(err.message.includes('غير مصرح'), 'IDOR rejected with unauthorized message');
    }
    assert(idorCaught, 'Partner B cannot access credentials of card issued to Partner A');

    // Legitimate owner (Partner A) CAN access credentials
    const validCreds = await partnerService.getPartnerCardCredentials(upgradedResult.partnerId, customerUserId, testCardId1);
    assert(validCreds.cardNumber === '5300123456789991', 'Decrypted PAN verified for legitimate owner');
    assert(validCreds.cvv === '123', 'Decrypted CVV verified for legitimate owner');
    assert(validCreds.cardLast4 === '9991', 'Last4 verified for legitimate owner');

    console.log('\n=====================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('=====================================================\n');

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP & PRODUCTION INTEGRITY RESTORATION
    // -------------------------------------------------------------------------
    console.log('🧹 Cleaning up test artifacts...');
    
    // Delete test cards
    if (createdCardIds.length > 0) {
      await pool.query('DELETE FROM kiropro_cards_inventory WHERE id = ANY($1)', [createdCardIds]);
    }

    // Delete test partner orders
    if (createdUserIds.length > 0) {
      const partnerIdsRes = await pool.query(
        'SELECT id FROM partner_profiles WHERE user_id = ANY($1)',
        [createdUserIds]
      );
      const partnerIds = partnerIdsRes.rows.map(r => r.id);
      if (partnerIds.length > 0) {
        await pool.query('DELETE FROM partner_orders WHERE partner_id = ANY($1)', [partnerIds]);
        await pool.query('DELETE FROM partner_ledger WHERE partner_id = ANY($1)', [partnerIds]);
        await pool.query('DELETE FROM partner_wallets WHERE partner_id = ANY($1)', [partnerIds]);
        await pool.query('DELETE FROM partner_profiles WHERE id = ANY($1)', [partnerIds]);
      }

      await pool.query('DELETE FROM "AuditLog" WHERE "targetUserId" = ANY($1)', [createdUserIds]);
      await pool.query('DELETE FROM "User" WHERE id = ANY($1)', [createdUserIds]);
    }

    // RESTORE THE REAL PRODUCTION CARD TO 'AVAILABLE'
    await pool.query(
      "UPDATE kiropro_cards_inventory SET status = 'AVAILABLE', assigned_to_user_id = NULL WHERE id = $1",
      [REAL_PROD_CARD_ID]
    );

    const finalProdCheck = await pool.query(
      'SELECT id, status, card_last4, assigned_to_user_id FROM kiropro_cards_inventory WHERE id = $1',
      [REAL_PROD_CARD_ID]
    );

    console.log('✅ Real Production Card verified intact:');
    console.log(finalProdCheck.rows[0]);

    await pool.end();
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
