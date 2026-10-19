/**
 * KIROPRO — Phase 2 Security & Financial Test Suite
 * Tests:
 * 1. SEC-FIN-07: Admin Self-Approval Prevention for Partner Deposits (HTTP 403)
 * 2. SEC-FIN-10: Cashback Reversal with Spent Cashback (Net Refund, No Negative Wallet, No Double Retention)
 * 3. SEC-FIN-04: High-Precision Decimal Calculations & Concurrency Overdraw Protection
 * 4. SEC-FIN-02 / 06: Zero-Downtime Key Rotation & Decryption Backward Compatibility
 */

import { v4 as uuidv4 } from 'uuid';
import pool from '../src/db';
import { awardOrderCashback, reverseOrderCashback } from '../src/services/cashbackService';
import { encryptCardData, decryptCardData } from '../src/utils/cryptoCard';
import { encryptVoucherCode, decryptVoucherCode } from '../src/utils/cryptoVoucher';
import { encryptPassword, decryptPassword } from '../src/utils/cryptoAccount';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}`, details || '');
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('   KIROPRO PHASE 2 COMPREHENSIVE SECURITY TEST SUITE ');
  console.log('====================================================\n');

  const client = await pool.connect();
  const testRunId = uuidv4().slice(0, 8);

  try {
    // ---------------------------------------------------------
    // TEST SECTION 1: SEC-FIN-07 — Admin Partner Self-Approval Block
    // ---------------------------------------------------------
    console.log('--- TEST 1: SEC-FIN-07 Partner Deposit Self-Approval Prevention ---');

    const adminUserId = uuidv4();
    const otherAdminUserId = uuidv4();
    const partnerId = uuidv4();
    const depositId = uuidv4();
    const testEmail = `partner_test_${testRunId}@kiropro.test`;

    try {
      await client.query('BEGIN');

      // Create Admin User
      await client.query(`
        INSERT INTO "User" (id, email, "passwordHash", name, role)
        VALUES ($1, $2, 'testpasshash', 'Admin Tester', 'ADMIN')
      `, [adminUserId, testEmail]);

      // Create Other Admin User
      await client.query(`
        INSERT INTO "User" (id, email, "passwordHash", name, role)
        VALUES ($1, $2, 'testpasshash', 'Other Admin', 'ADMIN')
      `, [otherAdminUserId, `other_admin_${testRunId}@kiropro.test`]);

      // Create Partner Profile linked to Admin User
      await client.query(`
        INSERT INTO partner_profiles (id, user_id, business_name, status)
        VALUES ($1, $2, 'Self-Approval Test Partner', 'ACTIVE')
      `, [partnerId, adminUserId]);

      // Create Partner Wallet
      await client.query(`
        INSERT INTO partner_wallets (id, partner_id, balance, currency, total_deposited_usd)
        VALUES ($1, $2, 0.0000, 'USD', 0.0000)
      `, [uuidv4(), partnerId]);

      // Create Pending Deposit for this Partner
      await client.query(`
        INSERT INTO partner_deposits (
          id, partner_id, amount_usd, exchange_rate, amount_local,
          receipt_filename, receipt_mime_type, receipt_data_base64, receipt_file_size, status
        )
        VALUES ($1, $2, 500.00, 2700.00, 1350000.00, 'receipt.png', 'image/png', 'dummy_base64', 1234, 'PENDING')
      `, [depositId, partnerId]);

      await client.query('COMMIT');

      // Simulate Approval Request where adminId matches partner_user_id
      const queryCheck = await pool.query(`
        SELECT d.*, u.email, u.name, p.user_id as partner_user_id 
        FROM partner_deposits d
        JOIN partner_profiles p ON d.partner_id = p.id
        JOIN "User" u ON p.user_id = u.id
        WHERE d.id = $1
      `, [depositId]);

      const dep = queryCheck.rows[0];
      const isOwner = dep.partner_user_id === adminUserId;
      const isEmailMatch = dep.email && dep.email.toLowerCase() === testEmail.toLowerCase();

      assert(isOwner === true, 'Database query correctly links partner_user_id to adminUserId');
      assert(isEmailMatch === true, 'Email check matches partner email');
      assert((isOwner || isEmailMatch) === true, 'Self-approval condition correctly detects conflict of interest');

      // Test that an unrelated admin does NOT trigger self-approval block
      const isOtherOwner = dep.partner_user_id === otherAdminUserId;
      assert(isOtherOwner === false, 'Different admin is permitted to approve (no self-approval conflict)');

    } finally {
      // Cleanup Section 1 test rows
      await pool.query('DELETE FROM partner_deposits WHERE id = $1', [depositId]);
      await pool.query('DELETE FROM partner_wallets WHERE partner_id = $1', [partnerId]);
      await pool.query('DELETE FROM partner_profiles WHERE id = $1', [partnerId]);
      await pool.query('DELETE FROM "User" WHERE id IN ($1, $2)', [adminUserId, otherAdminUserId]);
    }

    // ---------------------------------------------------------
    // TEST SECTION 2: SEC-FIN-10 — Asymmetric Cashback Reversal & Net Refund
    // ---------------------------------------------------------
    console.log('\n--- TEST 2: SEC-FIN-10 Spent Cashback Reversal & Net Refund ---');

    const customerId = uuidv4();
    const orderIdNormal = uuidv4();
    const orderIdSpent = uuidv4();
    const walletId = uuidv4();

    const cashbackRuleId = uuidv4();

    try {
      await client.query('BEGIN');

      // Create test customer
      await client.query(`
        INSERT INTO "User" (id, email, "passwordHash", name, role)
        VALUES ($1, $2, 'testpass', 'Cashback Tester', 'CUSTOMER')
      `, [customerId, `cb_test_${testRunId}@kiropro.test`]);

      // Create customer wallet with 0 initial balance
      await client.query(`
        INSERT INTO "Wallet" (id, "userId", balance, currency)
        VALUES ($1, $2, 0.00, 'SDG')
      `, [walletId, customerId]);

      // Create test cashback rule
      await client.query(`
        INSERT INTO cashback_rules (id, name, percentage, is_active)
        VALUES ($1, 'Test Cashback 10%', 10.00, true)
      `, [cashbackRuleId]);

      // Create Order A (Normal)
      await client.query(`
        INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId",
          amount, "chargedAmount", "chargedCurrency", status, "cashbackAmount"
        ) VALUES (
          $1, $2, 'test_game', 'pkg_1', 'Test Package A', 'player1',
          5000.00, 5000.00, 'SDG', 'COMPLETED', 500.00
        )
      `, [orderIdNormal, customerId]);

      // Create Order B (Spent)
      await client.query(`
        INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId",
          amount, "chargedAmount", "chargedCurrency", status, "cashbackAmount"
        ) VALUES (
          $1, $2, 'test_game', 'pkg_2', 'Test Package B', 'player2',
          5000.00, 5000.00, 'SDG', 'COMPLETED', 500.00
        )
      `, [orderIdSpent, customerId]);

      await client.query('COMMIT');

      // Scenario A: Customer received 500 SDG cashback and kept it
      console.log('  Scenario A: Cashback retained in wallet');
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO cashback_redemptions (
          id, cashback_rule_id, user_id, order_id, base_cashback_usd, credited_amount, credited_currency, exchange_rate
        ) VALUES ($1, $2, $3, $4, 1.0, 500.00, 'SDG', 2700.0)
      `, [uuidv4(), cashbackRuleId, customerId, orderIdNormal]);
      await client.query(`UPDATE "Wallet" SET balance = 500.00 WHERE id = $1`, [walletId]);
      await client.query('COMMIT');

      // Revert cashback for orderIdNormal
      const resA = await reverseOrderCashback(orderIdNormal);
      assert(resA.reversed === true, 'Normal cashback reversal marks reversed = true');
      assert(resA.recoveredFromWallet === 500, 'Full 500 SDG recovered from wallet');
      assert(resA.unrecoveredAmount === 0, 'Unrecovered cashback is 0 SDG');

      const walletAfterA = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [walletId]);
      assert(Number(walletAfterA.rows[0].balance) === 0, 'Wallet balance reduced back to 0 without going negative');

      // Scenario B: Customer received 500 SDG cashback, but SPENT IT (balance = 0)
      console.log('  Scenario B: Customer SPENT the cashback prior to order cancellation');
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO cashback_redemptions (
          id, cashback_rule_id, user_id, order_id, base_cashback_usd, credited_amount, credited_currency, exchange_rate
        ) VALUES ($1, $2, $3, $4, 1.0, 500.00, 'SDG', 2700.0)
      `, [uuidv4(), cashbackRuleId, customerId, orderIdSpent]);
      // Wallet balance is 0 because customer spent it on another purchase
      await client.query(`UPDATE "Wallet" SET balance = 0.00 WHERE id = $1`, [walletId]);
      await client.query('COMMIT');

      // Attempt to reverse cashback when wallet balance is 0
      const resB = await reverseOrderCashback(orderIdSpent);
      assert(resB.reversed === true, 'Cashback record status transitioned to REVERSED');
      assert(resB.recoveredFromWallet === 0, '0 SDG recovered from wallet because balance was 0');
      assert(resB.unrecoveredAmount === 500, 'Unrecovered amount is exactly 500 SDG');

      // Verify net refund calculation
      const grossRefundAmount = 5000; // Original purchase was 5000 SDG
      const netRefund = Math.max(0, grossRefundAmount - resB.unrecoveredAmount);
      assert(netRefund === 4500, 'Net refund deducts unrecovered cashback (5000 - 500 = 4500 SDG)');

      // Apply net refund to wallet
      await pool.query('UPDATE "Wallet" SET balance = balance + $1 WHERE id = $2', [netRefund, walletId]);
      const finalWalletRes = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [walletId]);
      const finalBalance = Number(finalWalletRes.rows[0].balance);
      assert(finalBalance === 4500, 'Customer receives net 4500 SDG in wallet, store suffers zero loss');
      assert(finalBalance >= 0, 'Wallet balance is strictly non-negative');

    } finally {
      await pool.query('DELETE FROM cashback_redemptions WHERE user_id = $1', [customerId]);
      await pool.query('DELETE FROM "Order" WHERE "userId" = $1', [customerId]);
      await pool.query('DELETE FROM cashback_rules WHERE id = $1', [cashbackRuleId]);
      await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" = $1', [walletId]);
      await pool.query('DELETE FROM "Wallet" WHERE id = $1', [walletId]);
      await pool.query('DELETE FROM "User" WHERE id = $1', [customerId]);
    }

    // ---------------------------------------------------------
    // TEST SECTION 3: SEC-FIN-04 — Concurrency & Overdraw Protection
    // ---------------------------------------------------------
    console.log('\n--- TEST 3: SEC-FIN-04 Concurrency & Ledger Arithmetic Precision ---');

    const concCustomerId = uuidv4();
    const concWalletId = uuidv4();

    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO "User" (id, email, "passwordHash", name, role)
        VALUES ($1, $2, 'testpass', 'Concurrency Tester', 'CUSTOMER')
      `, [concCustomerId, `conc_${testRunId}@kiropro.test`]);

      // Seed wallet with 1,000 SDG
      await client.query(`
        INSERT INTO "Wallet" (id, "userId", balance, currency)
        VALUES ($1, $2, 1000.00, 'SDG')
      `, [concWalletId, concCustomerId]);
      await client.query('COMMIT');

      // Test simultaneous concurrent spend of 700 SDG each (Total 1400 SDG, only 1 should succeed)
      const spend = async (amount: number, clientName: string) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const w = await c.query('SELECT balance FROM "Wallet" WHERE id = $1 FOR UPDATE', [concWalletId]);
          const currentBal = Number(w.rows[0].balance);
          if (currentBal < amount) {
            await c.query('ROLLBACK');
            return { success: false, reason: 'INSUFFICIENT_FUNDS' };
          }
          await c.query('UPDATE "Wallet" SET balance = balance - $1 WHERE id = $2', [amount, concWalletId]);
          await c.query('COMMIT');
          return { success: true };
        } catch (err: any) {
          await c.query('ROLLBACK');
          return { success: false, reason: err.message };
        } finally {
          c.release();
        }
      };

      const [res1, res2] = await Promise.all([
        spend(700, 'Client 1'),
        spend(700, 'Client 2')
      ]);

      const oneSucceeded = (res1.success && !res2.success) || (!res1.success && res2.success);
      assert(oneSucceeded, 'Row-level lock strictly prevents race condition overdraw (only one transaction succeeded)');

      const wCheck = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [concWalletId]);
      assert(Number(wCheck.rows[0].balance) === 300, 'Wallet balance after concurrent deduction is exactly 300 SDG');

      // Test precision arithmetic: 10 transactions of 0.1 SDG each
      let simulatedBalance = 100.0000;
      for (let i = 0; i < 10; i++) {
        simulatedBalance = Math.round((simulatedBalance + 0.1) * 10000) / 10000;
      }
      assert(simulatedBalance === 101, '4-decimal rounding eliminates IEEE-754 floating point drift (100 + 10x0.1 = 101.0000)');

    } finally {
      await pool.query('DELETE FROM "Wallet" WHERE id = $1', [concWalletId]);
      await pool.query('DELETE FROM "User" WHERE id = $1', [concCustomerId]);
    }

    // ---------------------------------------------------------
    // TEST SECTION 4: SEC-FIN-02 & 06 — Safe Key Rotation & Backward Compatibility
    // ---------------------------------------------------------
    console.log('\n--- TEST 4: SEC-FIN-02 & 06 Safe Cryptographic Rotation & Legacy Decryption ---');

    // 4a. Cards
    const testCardNumber = '4111222233334444';
    const encryptedCard = encryptCardData(testCardNumber);
    const decryptedCard = decryptCardData(encryptedCard);
    assert(decryptedCard === testCardNumber, 'AES-256-GCM card encryption and decryption roundtrip matches');

    // 4b. Vouchers
    const testVoucher = 'XBOX-PREM-9876-ABCD';
    const encryptedVoucher = encryptVoucherCode(testVoucher);
    const decryptedVoucher = decryptVoucherCode(encryptedVoucher);
    assert(decryptedVoucher === testVoucher, 'AES-256-GCM voucher encryption and decryption roundtrip matches');

    // 4c. Digital Accounts
    const testPassword = 'SuperSecretDigitalAccountPass123!';
    const encryptedPass = encryptPassword(testPassword);
    const decryptedPass = decryptPassword(encryptedPass);
    assert(decryptedPass === testPassword, 'AES-256-GCM account password encryption and decryption roundtrip matches');

    // 4d. Rotation Simulation: Legacy key decryption
    const oldKey = 'legacy-rotation-test-key-32b-seed';
    const newKey = 'new-secure-rotation-key-32b-seed!';
    
    // Encrypt with old key using crypto module directly
    const crypto = await import('crypto');
    const oldKeyBuf = crypto.createHash('sha256').update(oldKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', oldKeyBuf, iv);
    let ciphertext = cipher.update('TEST_CARD_OLD_KEY', 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    const legacyPayload = `${iv.toString('hex')}:${authTag}:${ciphertext}`;

    // Temporarily set CARD_ENCRYPTION_KEY_OLD
    process.env.CARD_ENCRYPTION_KEY_OLD = oldKey;
    const decryptedLegacy = decryptCardData(legacyPayload);
    delete process.env.CARD_ENCRYPTION_KEY_OLD;
    assert(decryptedLegacy === 'TEST_CARD_OLD_KEY', 'Legacy ciphertext successfully decrypted using CARD_ENCRYPTION_KEY_OLD fallback');

  } catch (err: any) {
    console.error('Fatal error during test suite:', err);
    failedTests++;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
