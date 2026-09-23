const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const assert = require('assert');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runTestSuite() {
  const client = await pool.connect();
  console.log('=== STARTING EMERGENCY INCIDENT VERIFICATION SUITE ===\n');

  try {
    // ----------------------------------------------------
    // TEST 1: Register with referral code does NOT credit wallet
    // ----------------------------------------------------
    console.log('[TEST 1] Testing registration with referral code (STRICT NO BONUS ON REGISTER)...');
    await client.query('BEGIN');

    // Create mock referrer
    const referrerId = uuidv4();
    const refCode = 'TEST' + Math.random().toString(36).substring(2, 6).toUpperCase();
    await client.query(`
      INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified", "referral_code", "preferred_currency")
      VALUES ($1, $2, 'Referrer Test', 'hash', 'CUSTOMER', true, $3, 'SDG')
    `, [referrerId, `referrer_${Date.now()}@test.com`, refCode]);
    await client.query(`INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, 0, 'SDG')`, [uuidv4(), referrerId]);

    // Create mock referee
    const refereeId = uuidv4();
    const refereeWalletId = uuidv4();
    const refereeEmail = `referee_unverified_${Date.now()}@test.com`;
    await client.query(`
      INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified", "referral_code", "preferred_currency")
      VALUES ($1, $2, 'Referee Test', 'hash', 'CUSTOMER', false, $3, 'SDG')
    `, [refereeId, refereeEmail, 'REF' + Date.now().toString(36).toUpperCase()]);
    await client.query(`INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, 0, 'SDG')`, [refereeWalletId, refereeId]);

    // Import referralService functions
    const { recordPendingReferralOnRegister, processRefereeRewardOnVerification, bindReferralCode } = require('../dist/services/referralService');

    // Simulate registration with referral code
    const regResult = await recordPendingReferralOnRegister(refereeId, refCode, client);
    assert.strictEqual(regResult.success, true, 'Pending referral recorded successfully');

    // Check referee wallet balance MUST BE 0!
    const wCheck1 = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [refereeWalletId]);
    assert.strictEqual(Number(wCheck1.rows[0].balance), 0, 'Referee wallet balance MUST be 0 on register!');

    // Check WalletTransactions count MUST BE 0!
    const txCheck1 = await client.query('SELECT count(*) FROM "WalletTransaction" WHERE "walletId" = $1', [refereeWalletId]);
    assert.strictEqual(Number(txCheck1.rows[0].count), 0, 'Must have 0 WalletTransactions on register!');

    // Check referrals table record is PENDING and referee_reward_paid is false
    const refRow1 = await client.query('SELECT status, referee_reward_paid FROM "referrals" WHERE referee_id = $1', [refereeId]);
    assert.strictEqual(refRow1.rows[0].status, 'PENDING', 'Referral status must be PENDING');
    assert.strictEqual(refRow1.rows[0].referee_reward_paid, false, 'referee_reward_paid must be FALSE');
    console.log('✓ TEST 1 PASSED: Registration with referral code creates pending link with 0 balance and 0 bonus transactions.\n');

    // ----------------------------------------------------
    // TEST 2: Attempting to bind code for unverified account via bindReferralCode is REJECTED
    // ----------------------------------------------------
    console.log('[TEST 2] Testing bindReferralCode for unverified account (MUST BE REJECTED)...');
    let rejected = false;
    try {
      await bindReferralCode(refereeId, refCode, client, true);
    } catch (err) {
      rejected = true;
      assert(err.message.includes('يجب تأكيد بريدك الإلكتروني') || err.message.includes('مسبقاً'), 'Correct error message thrown');
    }
    assert.strictEqual(rejected, true, 'Unverified user binding must be rejected');
    console.log('✓ TEST 2 PASSED: Unverified account binding is rejected by backend enforcement.\n');

    // ----------------------------------------------------
    // TEST 3: Verification with REFERRAL_REWARDS_ENABLED = false leaves reward frozen/pending
    // ----------------------------------------------------
    console.log('[TEST 3] Testing email verification during payout freeze (FEATURE FLAG ENFORCEMENT)...');
    // Mark user as emailVerified
    await client.query('UPDATE "User" SET "emailVerified" = true WHERE id = $1', [refereeId]);

    const verifyRewardRes = await processRefereeRewardOnVerification(refereeId, client);
    assert.strictEqual(verifyRewardRes.awarded, false, 'Reward must not be awarded when payouts are frozen');
    assert.strictEqual(verifyRewardRes.reason, 'REFERRAL_REWARDS_FROZEN', 'Reason must be REFERRAL_REWARDS_FROZEN');

    const wCheck2 = await client.query('SELECT balance FROM "Wallet" WHERE id = $1', [refereeWalletId]);
    assert.strictEqual(Number(wCheck2.rows[0].balance), 0, 'Wallet balance remains 0 during payout freeze');
    console.log('✓ TEST 3 PASSED: Feature flag cleanly blocks automatic payouts while keeping referral record safe.\n');

    // ----------------------------------------------------
    // TEST 4: Database Unique Constraint prevents duplicate referral bonus
    // ----------------------------------------------------
    console.log('[TEST 4] Testing Database-level Unique Constraint (uq_wallet_tx_referral_bonus)...');
    const referralRecord = await client.query('SELECT id FROM "referrals" WHERE referee_id = $1', [refereeId]);
    const refRecordId = referralRecord.rows[0].id;

    // Insert first bonus transaction
    await client.query(`
      INSERT INTO "WalletTransaction" (
        id, "walletId", amount, type, description, 
        currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
      ) VALUES ($1, $2, 1000, 'REFERRAL_BONUS', 'Test Bonus 1', 'SDG', 0, 1000, 'REFERRAL', $3, null, 'SYSTEM')
    `, [uuidv4(), refereeWalletId, refRecordId]);

    // Attempt to insert duplicate bonus transaction for same referral record
    let dupFailed = false;
    try {
      await client.query(`
        INSERT INTO "WalletTransaction" (
          id, "walletId", amount, type, description, 
          currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
        ) VALUES ($1, $2, 1000, 'REFERRAL_BONUS', 'Test Bonus Duplicate', 'SDG', 1000, 2000, 'REFERRAL', $3, null, 'SYSTEM')
      `, [uuidv4(), refereeWalletId, refRecordId]);
    } catch (err) {
      dupFailed = true;
      assert(err.message.includes('uq_wallet_tx_referral_bonus'), 'Failed on uq_wallet_tx_referral_bonus constraint');
    }
    assert.strictEqual(dupFailed, true, 'Duplicate bonus must be rejected by Database Constraint!');
    console.log('✓ TEST 4 PASSED: Database Unique Constraint completely blocks duplicate bonus transactions.\n');

    await client.query('ROLLBACK');
    console.log('=== ALL TESTS PASSED SUCCESSFULLY! (Transaction cleanly rolled back) ===');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Test suite failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runTestSuite();
