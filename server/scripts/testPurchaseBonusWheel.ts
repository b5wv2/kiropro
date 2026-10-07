import pool from '../src/db';
import { v4 as uuidv4 } from 'uuid';
import { 
  grantBonusSpinForOrder, 
  getWheelStatus, 
  executeDailySpin, 
  isUsdtOrder, 
  getKhartoumTodayDate 
} from '../src/services/wheelService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(msg);
  } else {
    console.log(`  ✅ ${msg}`);
  }
}

async function runTests() {
  console.log('🧪 RUNNING COMPREHENSIVE PURCHASE BONUS & MULTI-CREDIT WHEEL TEST SUITE');
  const client = await pool.connect();

  const testUserId = uuidv4();
  const testEmail = `wheel_test_${Date.now()}@kiropro.test`;
  const today = getKhartoumTodayDate();

  try {
    // 1. Create a dummy test user
    await client.query(
      `INSERT INTO "User" (id, email, "passwordHash", name, role) VALUES ($1, $2, 'hash', 'Wheel Tester', 'CUSTOMER')`,
      [testUserId, testEmail]
    );
    console.log(`[Setup] Created test user: ${testUserId}`);

    // --- TEST GROUP 1: USDT EXCLUSION ---
    console.log('\n--- Group 1: Strict Server-Side USDT Exclusion ---');

    // Test 1: isUsdtOrder unit checks
    assert(isUsdtOrder({ orderType: 'USDT_TRANSFER' }), 'Test 1.1: orderType USDT_TRANSFER is recognized as USDT');
    assert(isUsdtOrder({ gameId: 'CRYPTO' }), 'Test 1.2: gameId CRYPTO is recognized as USDT');
    assert(isUsdtOrder({ packageId: 'USDT_INSTANT' }), 'Test 1.3: packageId USDT_INSTANT is recognized as USDT');
    assert(isUsdtOrder({ packageName: '100 USDT Tron' }), 'Test 1.4: packageName containing USDT is recognized as USDT');
    assert(isUsdtOrder({ orderType: 'PRODUCT' }, { name: 'USDT Token', category: 'crypto' }), 'Test 1.5: Product metadata containing USDT is recognized as USDT');
    assert(!isUsdtOrder({ orderType: 'PRODUCT', gameId: 'FREE_FIRE', packageName: 'Free Fire 100 Diamonds' }), 'Test 1.6: Free Fire order is NOT recognized as USDT');

    // Test 2: Database USDT order completion check
    const usdtOrderId = uuidv4();
    await client.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId",
        amount, status, provider, "orderType", "usdtAmount"
      ) VALUES (
        $1, $2, 'CRYPTO', 'USDT_INSTANT', 'USDT 50 Transfer', '0x123',
        250000, 'COMPLETED', 'MANUAL_ADMIN', 'USDT_TRANSFER', 50
      )
    `, [usdtOrderId, testUserId]);

    const usdtGrantRes = await grantBonusSpinForOrder(usdtOrderId);
    assert(!usdtGrantRes.granted && usdtGrantRes.reason === 'USDT_EXCLUDED', 'Test 2: Completed USDT order is strictly rejected from receiving bonus spin');

    // --- TEST GROUP 2: ELIGIBLE ORDER BONUS SPIN & QUANTITY RULE ---
    console.log('\n--- Group 2: Eligible Product Orders & Quantity Rule ---');

    // Test 3: Normal digital account order (Quantity = 5)
    const digitalOrderId = uuidv4();
    await client.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId",
        amount, status, provider, "orderType", quantity
      ) VALUES (
        $1, $2, 'INTERNAL', 'PUBG_ACCOUNT_BUNDLE', 'PUBG Accounts Bundle', 'DIGITAL_ACCOUNT',
        15000, 'COMPLETED', 'INTERNAL', 'DIGITAL_ACCOUNT', 5
      )
    `, [digitalOrderId, testUserId]);

    const grant1 = await grantBonusSpinForOrder(digitalOrderId);
    assert(grant1.granted === true && !!grant1.creditId, 'Test 3.1: Completed PUBG order (qty=5) successfully receives +1 bonus spin');

    // Test 4: Verify exactly 1 credit exists for this order in wheel_spin_credits
    const creditRows1 = (await client.query(
      `SELECT * FROM wheel_spin_credits WHERE source_id = $1 AND source_type = 'PURCHASE'`,
      [digitalOrderId]
    )).rows;
    assert(creditRows1.length === 1, 'Test 3.2: Quantity = 5 resulted in exactly 1 credit record (not 5)');

    // Test 5: Idempotency on duplicate calls (webhook retry / multiple status updates)
    const grantRetry = await grantBonusSpinForOrder(digitalOrderId);
    assert(!grantRetry.granted && grantRetry.reason === 'ALREADY_GRANTED', 'Test 5.1: Duplicate call for same order is rejected gracefully');
    const creditRowsRetry = (await client.query(
      `SELECT * FROM wheel_spin_credits WHERE source_id = $1 AND source_type = 'PURCHASE'`,
      [digitalOrderId]
    )).rows;
    assert(creditRowsRetry.length === 1, 'Test 5.2: Credit table still has exactly 1 credit record after retry');

    // Test 6: Non-completed order check
    const pendingOrderId = uuidv4();
    await client.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId",
        amount, status, provider
      ) VALUES (
        $1, $2, 'GAME_FF', 'FF_100D', 'Free Fire 100 Diamonds', '123456',
        5000, 'PENDING', 'GAMESDROP'
      )
    `, [pendingOrderId, testUserId]);

    const pendingGrant = await grantBonusSpinForOrder(pendingOrderId);
    assert(!pendingGrant.granted && pendingGrant.reason === 'ORDER_NOT_COMPLETED', 'Test 6: Order with status PENDING cannot receive bonus spin');

    // --- TEST GROUP 3: COMBINED DAILY & PURCHASE SPINS ---
    console.log('\n--- Group 3: Multi-Credit Lifecycle & Same-Day Multiple Spins ---');

    // Add a second completed order to give user another purchase bonus
    const secondOrderId = uuidv4();
    await client.query(`
      INSERT INTO "Order" (
        id, "userId", "gameId", "packageId", "packageName", "playerId",
        amount, status, provider
      ) VALUES (
        $1, $2, 'GAME_BLOOD', 'BS_GOLD', 'Blood Strike Gold', '78910',
        3000, 'COMPLETED', 'GAMESDROP'
      )
    `, [secondOrderId, testUserId]);
    await grantBonusSpinForOrder(secondOrderId);

    // Check status: user should have 1 daily + 2 purchase = 3 total spins
    const initialStatus = await getWheelStatus(testUserId);
    assert(initialStatus.canSpin === true, 'Test 7.1: User canSpin is true');
    assert(initialStatus.availableSpins === 3, `Test 7.2: User has exactly 3 available spins (1 daily + 2 purchase), got: ${initialStatus.availableSpins}`);
    assert(initialStatus.creditsSummary?.dailyAvailable === true, 'Test 7.3: dailyAvailable is true');
    assert(initialStatus.creditsSummary?.purchaseAvailable === 2, 'Test 7.4: purchaseAvailable is 2');

    // Execute Spin 1: Should consume the DAILY credit
    const spin1 = await executeDailySpin(testUserId);
    assert(spin1.alreadySpun === false, 'Test 8.1: Spin 1 executed successfully');
    assert(spin1.consumedSource === 'DAILY', `Test 8.2: Spin 1 consumed DAILY credit, got: ${spin1.consumedSource}`);
    assert(spin1.availableSpins === 2, `Test 8.3: 2 available spins remaining after spin 1, got: ${spin1.availableSpins}`);
    assert(spin1.canSpin === true, 'Test 8.4: canSpin is still true');

    // Execute Spin 2 on same day: Should consume the 1st PURCHASE credit
    const spin2 = await executeDailySpin(testUserId);
    assert(spin2.alreadySpun === false, 'Test 9.1: Spin 2 executed successfully on the same day');
    assert(spin2.consumedSource === 'PURCHASE', `Test 9.2: Spin 2 consumed PURCHASE credit, got: ${spin2.consumedSource}`);
    assert(spin2.availableSpins === 1, `Test 9.3: 1 available spin remaining after spin 2, got: ${spin2.availableSpins}`);
    assert(spin2.canSpin === true, 'Test 9.4: canSpin is still true');

    // Execute Spin 3 on same day: Should consume the 2nd PURCHASE credit
    const spin3 = await executeDailySpin(testUserId);
    assert(spin3.alreadySpun === false, 'Test 10.1: Spin 3 executed successfully on the same day');
    assert(spin3.consumedSource === 'PURCHASE', `Test 10.2: Spin 3 consumed PURCHASE credit, got: ${spin3.consumedSource}`);
    assert(spin3.availableSpins === 0, `Test 10.3: 0 available spins remaining after spin 3, got: ${spin3.availableSpins}`);
    assert(spin3.canSpin === false, 'Test 10.4: canSpin is now false');

    // Execute Spin 4 on same day: Should be blocked!
    const spin4 = await executeDailySpin(testUserId);
    assert(spin4.alreadySpun === true, 'Test 11.1: Spin 4 correctly blocked with alreadySpun=true');
    assert(spin4.canSpin === false, 'Test 11.2: Spin 4 canSpin is false');

    // Verify all 3 spins are recorded in wheel_spins for this user on today's date
    const userSpinsToday = (await client.query(
      `SELECT id, source_type FROM wheel_spins WHERE user_id = $1 AND spin_date = $2`,
      [testUserId, today]
    )).rows;
    assert(userSpinsToday.length === 3, `Test 12: Exactly 3 historical spin records exist for user today (1 DAILY, 2 PURCHASE), got: ${userSpinsToday.length}`);

    console.log('\n🎉 ALL 24 TESTS PASSED FLAWLESSLY WITH 100% SUCCESS!');
  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    // Cleanup test data
    try {
      await client.query(`DELETE FROM wheel_spins WHERE user_id = $1`, [testUserId]);
      await client.query(`DELETE FROM wheel_spin_credits WHERE user_id = $1`, [testUserId]);
      await client.query(`DELETE FROM "Order" WHERE "userId" = $1`, [testUserId]);
      await client.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
      console.log('[Cleanup] Test user and dummy records removed.');
    } catch {}
    client.release();
    await pool.end();
  }
}

runTests();
