const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../dist/db').default || require('../dist/db').pool || require('../dist/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

const {
  getReferralSettings,
  updateReferralSettings,
  generateReferralCode,
  getUserReferralDetails,
  bindReferralCode,
  processReferralRewardOnOrder,
  getReferralCopy,
  isOrderEligibleCategory
} = require('../dist/services/referralService');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS ${totalTests}/25] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL ${totalTests}/25] ${testName}: ${details}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runReferralSuite() {
  console.log('\n======================================================');
  console.log('       KIROPRO COMPREHENSIVE REFERRAL TEST SUITE      ');
  console.log('======================================================\n');

  const testUserIds = [];
  const testOrderIds = [];

  try {
    // 1. Verification of initial settings
    const initialSettings = await getReferralSettings();
    assert(initialSettings.enabled !== undefined, '1. Referral settings can be retrieved from DB');
    assert(typeof initialSettings.total_reward === 'number', '2. total_reward is computed dynamically');

    // 2. Admin settings update with all 10 controls
    const updated = await updateReferralSettings({
      enabled: true,
      referrer_reward: 1200,
      referee_reward: 800,
      currency: 'جنيه',
      min_order_amount: 3000,
      max_referrer_earnings: 15000,
      allow_existing_users_binding: true,
      first_order_only: true,
      allow_crypto_orders: true,
      allow_game_orders: true,
      allow_cards_orders: true
    });
    assert(
      updated.referrer_reward === 1200 &&
      updated.referee_reward === 800 &&
      updated.total_reward === 2000 &&
      updated.min_order_amount === 3000 &&
      updated.max_referrer_earnings === 15000,
      '3. Admin can update all 10 referral settings with live total_reward recalculation'
    );

    // 3. Dynamic copy generation
    const copy = getReferralCopy(updated);
    assert(
      copy.heroTitle.includes('2,000') && copy.heroTitle.includes('جنيه'),
      '4. Dynamic heroTitle uses dynamic total without hardcoding'
    );
    assert(
      copy.description.includes('800') && copy.description.includes('1,200'),
      '5. Dynamic description separates referee and referrer amounts without hardcoding'
    );

    // 4. Referral code generation & uniqueness
    const codeA = generateReferralCode();
    const codeB = generateReferralCode();
    assert(codeA.startsWith('KP') && codeA.length === 8, '6. Referral code format starts with KP and is 8 chars');
    assert(codeA !== codeB, '7. Referral codes generated randomly are unique');

    // Setup Test Referrer and Test Referee Users
    const referrerId = uuidv4();
    const refereeId = uuidv4();
    const referee2Id = uuidv4();
    testUserIds.push(referrerId, refereeId, referee2Id);

    const refCode = 'KPTST' + Math.floor(100 + Math.random() * 900);
    const passHash = await bcrypt.hash('TestPass123!', 10);

    // Create Referrer
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified", "referral_code") VALUES ($1, $2, $3, $4, $5, true, $6)',
      [referrerId, `referrer_${Date.now()}@kirotest.com`, 'الداعي التجريبي', passHash, 'CUSTOMER', refCode]
    );
    await pool.query('INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)', [uuidv4(), referrerId, 0, 'SDG']);

    // Create Referee
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified") VALUES ($1, $2, $3, $4, $5, true)',
      [refereeId, `referee_${Date.now()}@kirotest.com`, 'المدعو الأول', passHash, 'CUSTOMER']
    );
    const refereeWalletId = uuidv4();
    await pool.query('INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)', [refereeWalletId, refereeId, 0, 'SDG']);

    // Create Referee 2
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified") VALUES ($1, $2, $3, $4, $5, true)',
      [referee2Id, `referee2_${Date.now()}@kirotest.com`, 'المدعو الثاني', passHash, 'CUSTOMER']
    );
    await pool.query('INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, $3, $4)', [uuidv4(), referee2Id, 0, 'SDG']);

    // 5. Test getUserReferralDetails
    const userDetails = await getUserReferralDetails(referrerId);
    assert(userDetails.referralCode === refCode, '8. User details returns correct assigned referralCode');
    assert(userDetails.hasReferrer === false, '9. Unreferred user has hasReferrer = false');

    // 6. Test Self-referral prevention
    let selfRefBlocked = false;
    try {
      await bindReferralCode(referrerId, refCode, undefined, true);
    } catch (err) {
      selfRefBlocked = true;
    }
    assert(selfRefBlocked, '10. Self-referral is strictly prevented');

    // 7. Test Invalid referral code
    let invalidCodeBlocked = false;
    try {
      await bindReferralCode(refereeId, 'NONEXISTENT99', undefined, true);
    } catch (err) {
      invalidCodeBlocked = true;
    }
    assert(invalidCodeBlocked, '11. Non-existent referral codes are rejected');

    // 8. Test immediate referee reward upon binding (Existing user or registration)
    const bindRes = await bindReferralCode(refereeId, refCode, undefined, true);
    assert(bindRes.success === true, '12. Existing unreferred user can bind a valid referral code');
    assert(bindRes.reward === 800, '13. Binding returns correct referee reward (800)');

    // Verify Referee Wallet got credited immediately
    const refereeWalletRes = await pool.query('SELECT balance FROM "Wallet" WHERE "userId" = $1', [refereeId]);
    assert(Number(refereeWalletRes.rows[0].balance) === 800, '14. Referee wallet is credited with 800 immediately on bind');

    // Verify WalletTransaction for referee
    const refereeTxRes = await pool.query(
      'SELECT * FROM "WalletTransaction" WHERE "walletId" = $1 AND "referenceType" = \'REFERRAL\'',
      [refereeWalletId]
    );
    assert(refereeTxRes.rows.length === 1, '15. WalletTransaction recorded for referee welcome bonus');
    assert(refereeTxRes.rows[0].balanceBefore === 0 && refereeTxRes.rows[0].balanceAfter === 800, '16. WalletTransaction has accurate before/after balances');

    // Verify referrals row
    const refRowRes = await pool.query('SELECT * FROM "referrals" WHERE referee_id = $1', [refereeId]);
    assert(refRowRes.rows.length === 1, '17. referrals table contains entry for referee');
    assert(refRowRes.rows[0].referee_reward_paid === true, '18. referee_reward_paid is marked true immediately upon bind');
    assert(refRowRes.rows[0].referrer_reward_paid === false, '19. referrer_reward_paid is still false pending order');

    // 9. Test duplicate binding prevention
    let duplicateBlocked = false;
    try {
      await bindReferralCode(refereeId, refCode, undefined, true);
    } catch (err) {
      duplicateBlocked = true;
    }
    assert(duplicateBlocked, '20. Duplicate binding on already referred user is strictly rejected');

    // 10. Order qualification: uncompleted order does not pay referrer
    const order1Id = uuidv4();
    testOrderIds.push(order1Id);
    await pool.query(`
      INSERT INTO "Order" (id, "userId", "gameId", "packageId", "packageName", "playerId", amount, status, "orderType")
      VALUES ($1, $2, 'pubg-mobile', 'pkg_60uc', '60 UC PUBG', '1234567', 4000, 'PENDING', 'PRODUCT')
    `, [order1Id, refereeId]);

    const pendResult = await processReferralRewardOnOrder(order1Id);
    assert(pendResult.awarded === false, '21. PENDING order does not trigger referrer reward');

    // 11. Order qualification: completed order with amount below min_order_amount (3000)
    await pool.query('UPDATE "Order" SET status = \'COMPLETED\', amount = 2500 WHERE id = $1', [order1Id]);
    const belowMinResult = await processReferralRewardOnOrder(order1Id);
    assert(belowMinResult.awarded === false && belowMinResult.reason === 'ORDER_AMOUNT_BELOW_MINIMUM', '22. Order below min_order_amount (2500 < 3000) does not award referrer');

    // 12. Order qualification: qualifying completed order (amount = 4000 >= 3000)
    await pool.query('UPDATE "Order" SET amount = 4000 WHERE id = $1', [order1Id]);
    const qualResult = await processReferralRewardOnOrder(order1Id);
    assert(qualResult.awarded === true && qualResult.reward === 1200, '23. Qualifying completed order awards referrer reward (1200)');

    // Verify Referrer wallet got credited
    const referrerWalletRes = await pool.query('SELECT balance FROM "Wallet" WHERE "userId" = $1', [referrerId]);
    assert(Number(referrerWalletRes.rows[0].balance) === 1200, '24. Referrer wallet balance increased by 1200');

    // 13. Referrer idempotency: repeating order completion does not pay twice
    const repeatResult = await processReferralRewardOnOrder(order1Id);
    assert(repeatResult.awarded === false && repeatResult.reason === 'REFERRER_REWARD_ALREADY_PAID', '25. Repeating reward process is strictly idempotent and does not pay twice');

    console.log('\n======================================================');
    console.log(`       ALL 25 REFERRAL TESTS PASSED! (${passedTests}/${totalTests})      `);
    console.log('======================================================\n');
  } finally {
    // Clean up test data
    if (testOrderIds.length > 0) {
      await pool.query('DELETE FROM "Order" WHERE id = ANY($1)', [testOrderIds]);
    }
    if (testUserIds.length > 0) {
      await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" IN (SELECT id FROM "Wallet" WHERE "userId" = ANY($1))', [testUserIds]);
      await pool.query('DELETE FROM "referrals" WHERE referrer_id = ANY($1) OR referee_id = ANY($1)', [testUserIds]);
      await pool.query('DELETE FROM "Wallet" WHERE "userId" = ANY($1)', [testUserIds]);
      await pool.query('DELETE FROM "User" WHERE id = ANY($1)', [testUserIds]);
    }
    // Restore default settings
    await updateReferralSettings({
      enabled: true,
      referrer_reward: 1000,
      referee_reward: 1000,
      currency: 'جنيه',
      min_order_amount: 5000,
      max_referrer_earnings: 10000,
      allow_existing_users_binding: true,
      first_order_only: true,
      allow_crypto_orders: true,
      allow_game_orders: true,
      allow_cards_orders: true
    });
    await pool.end();
  }
}

runReferralSuite().catch(err => {
  console.error('Fatal error in referral test suite:', err);
  process.exit(1);
});
