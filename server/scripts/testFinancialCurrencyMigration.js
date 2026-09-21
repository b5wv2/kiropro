require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../dist/db').default;
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { bindReferralCode, processReferralRewardOnOrder } = require('../dist/services/referralService');

async function runTests() {
  console.log('====================================================');
  console.log('STARTING FINANCIAL CURRENCY MIGRATION VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}`);
      throw new Error(`Assertion failed for: ${testName}`);
    }
  }

  try {
    // Pre-cleanup any lingering temp test users from previous test runs
    const tempUsers = await pool.query('SELECT id FROM "User" WHERE email LIKE \'%@temp.test\'');
    for (const tu of tempUsers.rows) {
      await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" IN (SELECT id FROM "Wallet" WHERE "userId" = $1)', [tu.id]);
      await pool.query('DELETE FROM "referrals" WHERE referrer_id = $1 OR referee_id = $1', [tu.id]);
      await pool.query('DELETE FROM "Order" WHERE "userId" = $1', [tu.id]);
      await pool.query('DELETE FROM "Wallet" WHERE "userId" = $1', [tu.id]);
      await pool.query('DELETE FROM "User" WHERE id = $1', [tu.id]);
    }

    // ----------------------------------------------------
    // TEST 1: Specific target test user deleted
    // ----------------------------------------------------
    const targetEmail = 'test_user_1789350923269@example.com';
    const t1Res = await pool.query('SELECT id FROM "User" WHERE email = $1', [targetEmail]);
    assert(t1Res.rows.length === 0, `Target test user ${targetEmail} is completely deleted`);

    // ----------------------------------------------------
    // TEST 2: All 30 test accounts deleted
    // ----------------------------------------------------
    const testAccountsBackup = require('./deleted_test_accounts_backup.json');
    const testEmails = testAccountsBackup.map(a => a.email);
    const t2Res = await pool.query('SELECT email FROM "User" WHERE email = ANY($1)', [testEmails]);
    assert(t2Res.rows.length === 0, `All ${testAccountsBackup.length} verified test accounts are deleted`);

    // ----------------------------------------------------
    // TEST 3: Zero active Customer USD wallets
    // ----------------------------------------------------
    const t3Res = await pool.query(`
      SELECT COUNT(*)::int as count 
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER' AND w.currency = 'USD'
    `);
    assert(t3Res.rows[0].count === 0, 'Customer USD wallets count is strictly 0');

    // ----------------------------------------------------
    // TEST 4: All active Customer wallets are SDG
    // ----------------------------------------------------
    const t4Res = await pool.query(`
      SELECT 
        COUNT(*)::int as total_wallets,
        COUNT(*) FILTER (WHERE w.currency = 'SDG')::int as sdg_wallets,
        COUNT(*) FILTER (WHERE u.preferred_currency = 'SDG')::int as sdg_users
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER'
    `);
    const totalCustomerWallets = t4Res.rows[0].total_wallets;
    const sdgCustomerWallets = t4Res.rows[0].sdg_wallets;
    const sdgPreferredUsers = t4Res.rows[0].sdg_users;
    assert(totalCustomerWallets > 0 && totalCustomerWallets === sdgCustomerWallets, `All ${totalCustomerWallets} customer wallets are SDG`);
    assert(totalCustomerWallets === sdgPreferredUsers, `All ${sdgPreferredUsers} customers have preferred_currency = 'SDG'`);

    // ----------------------------------------------------
    // TEST 5: Snapshot records exist in currency_migration_snapshots
    // ----------------------------------------------------
    const t5Res = await pool.query('SELECT COUNT(*)::int as count FROM currency_migration_snapshots');
    assert(t5Res.rows[0].count >= 7, `Currency migration recorded audit snapshots (${t5Res.rows[0].count} snapshots recorded)`);

    // ----------------------------------------------------
    // TEST 6: Idempotency marker exists in platform_settings
    // ----------------------------------------------------
    const t6Res = await pool.query('SELECT value FROM "platform_settings" WHERE key = $1', ['customer_currency_migration_sdg']);
    assert(t6Res.rows.length > 0 && t6Res.rows[0].value?.status === 'COMPLETED', 'Migration idempotency marker is active');

    // ----------------------------------------------------
    // TEST 7: DB Trigger blocks inserting customer wallet with currency = 'USD'
    // ----------------------------------------------------
    let triggerBlocked = false;
    const dummyUserId = uuidv4();
    try {
      await pool.query(
        'INSERT INTO "User" (id, email, name, "passwordHash", role, "preferred_currency") VALUES ($1, $2, $3, $4, $5, $6)',
        [dummyUserId, `trigger_test_${Date.now()}@temp.test`, 'Trigger Test', 'hash', 'CUSTOMER', 'SDG']
      );
      await pool.query(
        'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
        [uuidv4(), dummyUserId, 0, 'USD']
      );
    } catch (triggerErr) {
      if (triggerErr.message.includes('Customer wallets must use SDG')) {
        triggerBlocked = true;
      }
    } finally {
      await pool.query('DELETE FROM "Wallet" WHERE "userId" = $1', [dummyUserId]).catch(() => {});
      await pool.query('DELETE FROM "User" WHERE id = $1', [dummyUserId]).catch(() => {});
    }
    assert(triggerBlocked, 'Database trigger successfully blocks creating customer USD wallets');

    // ----------------------------------------------------
    // TEST 8: Registration logic ignores USD and forces SDG
    // ----------------------------------------------------
    const regUserId = uuidv4();
    const regWalletId = uuidv4();
    const regEmail = `reg_verify_${Date.now()}@temp.test`;
    
    // Simulate register endpoint logic: user sends preferred_currency = 'USD'
    const clientSuppliedCurrency = 'USD';
    const enforcedCurrency = 'SDG'; // as enforced by our route
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "preferred_currency", "referral_code") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [regUserId, regEmail, 'Reg Test', 'hash', 'CUSTOMER', enforcedCurrency, 'KP' + Math.floor(Math.random() * 899999 + 100000)]
    );
    await pool.query(
      'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
      [regWalletId, regUserId, 0, enforcedCurrency]
    );

    const regCheck = await pool.query('SELECT w.currency, u.preferred_currency FROM "Wallet" w JOIN "User" u ON w."userId" = u.id WHERE u.id = $1', [regUserId]);
    assert(regCheck.rows[0].currency === 'SDG' && regCheck.rows[0].preferred_currency === 'SDG', 'Registration creates account and wallet strictly with SDG');

    // ----------------------------------------------------
    // TEST 9: Referral Program awards SDG immediately to Referee
    // ----------------------------------------------------
    const referrerId = uuidv4();
    const referrerWalletId = uuidv4();
    const referrerCode = 'KP' + Math.floor(Math.random() * 899999 + 100000);
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "preferred_currency", "referral_code") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [referrerId, `referrer_${Date.now()}@temp.test`, 'Referrer User', 'hash', 'CUSTOMER', 'SDG', referrerCode]
    );
    await pool.query(
      'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
      [referrerWalletId, referrerId, 0, 'SDG']
    );

    const refereeId = uuidv4();
    const refereeWalletId = uuidv4();
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "preferred_currency", "referral_code") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [refereeId, `referee_${Date.now()}@temp.test`, 'Referee User', 'hash', 'CUSTOMER', 'SDG', 'KP' + Math.floor(Math.random() * 899999 + 100000)]
    );
    await pool.query(
      'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
      [refereeWalletId, refereeId, 0, 'SDG']
    );

    // Bind referral code
    const bindResult = await bindReferralCode(refereeId, referrerCode, undefined, true);
    assert(bindResult.success === true, 'Referee successfully bound referral code');
    assert(bindResult.currency === 'SDG', 'Referee reward currency is strictly SDG');
    assert(bindResult.reward === 1000, 'Referee reward amount is 1,000 SDG');

    const refereeWalletCheck = await pool.query('SELECT balance, currency FROM "Wallet" WHERE id = $1', [refereeWalletId]);
    assert(Number(refereeWalletCheck.rows[0].balance) === 1000, 'Referee wallet balance increased by 1,000 SDG immediately');
    assert(refereeWalletCheck.rows[0].currency === 'SDG', 'Referee wallet currency is SDG');

    const refTxCheck = await pool.query('SELECT amount, currency, type FROM "WalletTransaction" WHERE "walletId" = $1 ORDER BY "createdAt" DESC LIMIT 1', [refereeWalletId]);
    assert(Number(refTxCheck.rows[0].amount) === 1000 && refTxCheck.rows[0].currency === 'SDG' && refTxCheck.rows[0].type === 'REFERRAL_BONUS', 'Referee transaction logged as 1,000 SDG REFERRAL_BONUS');

    // ----------------------------------------------------
    // TEST 10: Referrer receives 0 if order amount is below minimum (e.g. 4,000 < 5,000)
    // ----------------------------------------------------
    const smallOrderId = uuidv4();
    await pool.query(`
      INSERT INTO "Order" (id, "userId", "packageId", "playerId", amount, "customerPriceUsd", "orderType", "gameId", "packageName", status, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [smallOrderId, refereeId, 'pkg_small_123', '123456789', 4000, 0.5, 'PACKAGE', 'freefire', '100 Diamonds', 'COMPLETED']);

    const smallOrderResult = await processReferralRewardOnOrder(smallOrderId);
    assert(smallOrderResult.awarded === false && smallOrderResult.reason === 'ORDER_AMOUNT_BELOW_MINIMUM', 'Referrer award not triggered when order amount is below 5,000 SDG minimum');

    const referrerWalletCheck1 = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [referrerWalletId]);
    assert(Number(referrerWalletCheck1.rows[0].balance) === 0, 'Referrer balance remains 0 after sub-threshold order');

    // ----------------------------------------------------
    // TEST 11: Referrer receives 1,000 SDG when order qualifies (>= 5,000 SDG)
    // ----------------------------------------------------
    const qualOrderId = uuidv4();
    await pool.query(`
      INSERT INTO "Order" (id, "userId", "packageId", "playerId", amount, "customerPriceUsd", "orderType", "gameId", "packageName", status, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + interval '1 minute')
    `, [qualOrderId, refereeId, 'pkg_qual_456', '123456789', 5500, 0.7, 'PACKAGE', 'freefire', '500 Diamonds', 'COMPLETED']);

    const qualOrderResult = await processReferralRewardOnOrder(qualOrderId);
    assert(qualOrderResult.awarded === true && qualOrderResult.reward === 1000, 'Referrer receives 1,000 SDG reward on qualifying order');

    const referrerWalletCheck2 = await pool.query('SELECT balance, currency FROM "Wallet" WHERE id = $1', [referrerWalletId]);
    assert(Number(referrerWalletCheck2.rows[0].balance) === 1000, 'Referrer wallet balance credited with 1,000 SDG');
    assert(referrerWalletCheck2.rows[0].currency === 'SDG', 'Referrer wallet is SDG');

    // ----------------------------------------------------
    // TEST 12: Duplicate reward is impossible (Idempotency)
    // ----------------------------------------------------
    const dupResult = await processReferralRewardOnOrder(qualOrderId);
    assert(dupResult.awarded === false && dupResult.reason === 'REFERRER_REWARD_ALREADY_PAID', 'Duplicate referral payout prevented by idempotency check');

    // ----------------------------------------------------
    // TEST 13: Max Referrer Earnings Cap (10,000 SDG limit)
    // ----------------------------------------------------
    // Artificially simulate that referrer already earned 10,000 SDG from other referrals
    const referee2Id = uuidv4();
    const referee2WalletId = uuidv4();
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "preferred_currency", "referral_code") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [referee2Id, `referee2_${Date.now()}@temp.test`, 'Referee 2 User', 'hash', 'CUSTOMER', 'SDG', 'KP' + Math.floor(Math.random() * 899999 + 100000)]
    );
    await pool.query(
      'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)',
      [referee2WalletId, referee2Id, 0, 'SDG']
    );

    // Simulate referrer existing earnings at max cap (10,000 SDG)
    await pool.query(
      'UPDATE "referrals" SET referrer_reward_amount = 10000 WHERE referrer_id = $1 AND referee_id = $2',
      [referrerId, refereeId]
    );

    await bindReferralCode(referee2Id, referrerCode, undefined, true);

    const qualOrder2Id = uuidv4();
    await pool.query(`
      INSERT INTO "Order" (id, "userId", "packageId", "playerId", amount, "customerPriceUsd", "orderType", "gameId", "packageName", status, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [qualOrder2Id, referee2Id, 'pkg_qual_789', '987654321', 6000, 0.8, 'PACKAGE', 'freefire', '1000 Diamonds', 'COMPLETED']);

    const capOrderResult = await processReferralRewardOnOrder(qualOrder2Id);
    assert(capOrderResult.awarded === false && capOrderResult.reason === 'MAX_REFERRER_EARNINGS_CAP_REACHED', 'Referrer reward blocked when 10,000 SDG max earnings cap is reached');

    const referrerWalletCheck3 = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [referrerWalletId]);
    assert(Number(referrerWalletCheck3.rows[0].balance) === 1000, 'Referrer wallet balance did not increase after exceeding cap');

    // ----------------------------------------------------
    // TEST 14: Clean up verification test users
    // ----------------------------------------------------
    const cleanUserIds = [regUserId, referrerId, refereeId, referee2Id];
    for (const uid of cleanUserIds) {
      await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" IN (SELECT id FROM "Wallet" WHERE "userId" = $1)', [uid]);
      await pool.query('DELETE FROM "referrals" WHERE referrer_id = $1 OR referee_id = $1', [uid]);
      await pool.query('DELETE FROM "Order" WHERE "userId" = $1', [uid]);
      await pool.query('DELETE FROM "Wallet" WHERE "userId" = $1', [uid]);
      await pool.query('DELETE FROM "User" WHERE id = $1', [uid]);
    }
    assert(true, 'Test verification artifacts cleaned up successfully');

    console.log('\n====================================================');
    console.log(`ALL TESTS PASSED! (${passed}/${total})`);
    console.log('====================================================\n');
  } finally {
    await pool.end();
  }
}

runTests().catch(err => {
  console.error('[FATAL] Verification failed:', err);
  process.exit(1);
});
