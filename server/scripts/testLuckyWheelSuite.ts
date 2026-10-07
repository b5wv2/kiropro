import pool from '../src/db';
import { v4 as uuidv4 } from 'uuid';
import { 
  getWheelStatus, 
  executeDailySpin, 
  getKhartoumTodayDate, 
  getNextKhartoumSpinTime,
  getWheelAdminStats,
  getAllPrizesAdmin,
  createPrizeAdmin,
  updatePrizeAdmin,
  togglePrizeActiveAdmin,
  deletePrizeAdmin
} from '../src/services/wheelService';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE LUCKY WHEEL TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  const assert = (condition: boolean, testName: string, details?: any) => {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] Test ${totalTests}: ${testName}`);
    } else {
      console.error(`❌ [FAIL] Test ${totalTests}: ${testName}`, details || '');
      throw new Error(`Assertion failed for: ${testName}`);
    }
  };

  // Create temporary test users
  const testUserId1 = uuidv4();
  const testUserId2 = uuidv4();
  const testAdminId = uuidv4();

  const client = await pool.connect();

  try {
    const runId = Date.now();
    // Clean up any old test users
    await client.query(`DELETE FROM "User" WHERE email LIKE 'test_wheel_%'`);

    // Setup test users in User table
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role)
      VALUES 
        ($1, 'test_wheel_${runId}_1@test.com', 'hashed_pw', 'Test Wheel User 1', 'CUSTOMER'),
        ($2, 'test_wheel_${runId}_2@test.com', 'hashed_pw', 'Test Wheel User 2', 'CUSTOMER'),
        ($3, 'test_wheel_${runId}_admin@test.com', 'hashed_pw', 'Test Wheel Admin', 'ADMIN')
    `, [testUserId1, testUserId2, testAdminId]);

    // Ensure wallet exists for test users
    await client.query(`
      INSERT INTO "Wallet" (id, "userId", balance, currency)
      VALUES 
        (gen_random_uuid(), $1, 1000.00, 'SDG'),
        (gen_random_uuid(), $2, 0.00, 'SDG')
    `, [testUserId1, testUserId2]);

    const todayDate = getKhartoumTodayDate();
    console.log(`📅 Current Server Date (Khartoum): ${todayDate}`);
    console.log(`⏰ Next Spin Time: ${getNextKhartoumSpinTime()}\n`);

    // Clean up any test spins for these users today
    await client.query(`DELETE FROM wheel_spins WHERE user_id IN ($1, $2)`, [testUserId1, testUserId2]);

    // -------------------------------------------------------------
    // TEST 1: New user can spin once
    // -------------------------------------------------------------
    const statusBefore = await getWheelStatus(testUserId1);
    assert(statusBefore.canSpin === true, 'New user can spin today', { canSpin: statusBefore.canSpin });
    assert(statusBefore.todaySpin === null, 'No spin recorded yet for user today');
    assert(statusBefore.prizes.length >= 8, 'Public prizes list returned for wheel rendering');
    assert((statusBefore.prizes[0] as any).weight === undefined, 'Prize weights are strictly hidden from public response');

    // Execute first spin
    const spin1 = await executeDailySpin(testUserId1);
    assert(spin1.alreadySpun === false, 'First spin executes successfully');
    assert(spin1.canSpin === false, 'canSpin is false after spinning');
    assert(Boolean(spin1.prize?.name), 'Winning prize returned', { prize: spin1.prize?.name });
    const returnedDateStr = spin1.spin?.spin_date instanceof Date
      ? `${spin1.spin.spin_date.getFullYear()}-${String(spin1.spin.spin_date.getMonth() + 1).padStart(2, '0')}-${String(spin1.spin.spin_date.getDate()).padStart(2, '0')}`
      : String(spin1.spin?.spin_date).slice(0, 10);
    assert(returnedDateStr === todayDate, 'Spin date matches server date in Khartoum', { returnedDateStr, todayDate });

    // -------------------------------------------------------------
    // TEST 2: Second spin on same day is blocked (No Double Spin)
    // -------------------------------------------------------------
    const statusAfter = await getWheelStatus(testUserId1);
    assert(statusAfter.canSpin === false, 'User status reflects canSpin = false after spinning');
    assert(statusAfter.todaySpin !== null, 'todaySpin contains record of today’s spin');

    const spin2 = await executeDailySpin(testUserId1);
    assert(spin2.alreadySpun === true, 'Second spin on same day flagged alreadySpun = true');
    assert(spin2.canSpin === false, 'Second spin does not grant another spin');
    assert(spin2.spin?.id === spin1.spin?.id, 'Second spin returns existing spin (Idempotent response)');

    // -------------------------------------------------------------
    // TEST 3: Database Unique Constraint verification
    // -------------------------------------------------------------
    let directDuplicateInsertFailed = false;
    try {
      await client.query(`
        INSERT INTO wheel_spin_credits (id, user_id, source_type, source_id, spin_date, status)
        VALUES (gen_random_uuid(), $1, 'DAILY', $2, $3, 'USED')
      `, [testUserId1, todayDate, todayDate]);
    } catch (err: any) {
      if (err.code === '23505') {
        directDuplicateInsertFailed = true;
      }
    }
    assert(directDuplicateInsertFailed, 'PostgreSQL UNIQUE(user_id, spin_date) on DAILY credits strictly prevents duplicate insert');

    // -------------------------------------------------------------
    // TEST 4: Next day spin renewal (simulated by checking date logic)
    // -------------------------------------------------------------
    // Insert a past spin for user 2 with yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0];

    await client.query(`
      INSERT INTO wheel_spins (id, user_id, spin_date, reward_type, reward_value)
      VALUES (gen_random_uuid(), $1, $2, 'NO_PRIZE', 0)
    `, [testUserId2, yesterdayDate]);

    const user2Status = await getWheelStatus(testUserId2);
    assert(user2Status.canSpin === true, 'User with yesterday’s spin can spin today (automatic renewal)');

    // -------------------------------------------------------------
    // TEST 5: Concurrent Requests / Race Condition Protection
    // -------------------------------------------------------------
    // Clean user 2 today spins and credits and fire 5 parallel spins concurrently
    await client.query(`DELETE FROM wheel_spins WHERE user_id = $1`, [testUserId2]);
    await client.query(`DELETE FROM wheel_spin_credits WHERE user_id = $1`, [testUserId2]);

    const parallelSpins = await Promise.all([
      executeDailySpin(testUserId2),
      executeDailySpin(testUserId2),
      executeDailySpin(testUserId2),
      executeDailySpin(testUserId2),
      executeDailySpin(testUserId2)
    ]);

    const successfulSpins = parallelSpins.filter(s => s.alreadySpun === false);
    const alreadySpunResponses = parallelSpins.filter(s => s.alreadySpun === true);

    assert(successfulSpins.length === 1, 'Exactly 1 spin succeeds in race condition', { successfulSpins: successfulSpins.length });
    assert(alreadySpunResponses.length === 4, '4 parallel requests safely returned alreadySpun without double rewards');

    const totalUser2SpinsInDb = await client.query(`
      SELECT COUNT(*)::int AS count FROM wheel_spins WHERE user_id = $1 AND spin_date = $2
    `, [testUserId2, todayDate]);
    assert(totalUser2SpinsInDb.rows[0].count === 1, 'Only 1 record exists in DB after 5 concurrent requests');

    // -------------------------------------------------------------
    // TEST 6: Disabled Prizes are NEVER selected
    // -------------------------------------------------------------
    const testPrizeId = uuidv4();
    await client.query(`
      INSERT INTO wheel_prizes (id, name, type, value, weight, is_active, display_order)
      VALUES ($1, 'Disabled Fake Prize 999999', 'DISCOUNT_FIXED', 999999, 1000000, false, 99)
    `, [testPrizeId]);

    // Spin for another user and verify this disabled prize is never picked
    const testUserId3 = uuidv4();
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role)
      VALUES ($1, 'test_wheel_${runId}_3@test.com', 'pw', 'User 3', 'CUSTOMER')
    `, [testUserId3]);

    const spinDisabledTest = await executeDailySpin(testUserId3);
    assert(spinDisabledTest.prize?.name !== 'Disabled Fake Prize 999999', 'Disabled prize with massive weight was skipped');

    // -------------------------------------------------------------
    // TEST 7: Expired Prizes are NEVER selected
    // -------------------------------------------------------------
    const testExpiredPrizeId = uuidv4();
    await client.query(`
      INSERT INTO wheel_prizes (id, name, type, value, weight, is_active, expires_at, display_order)
      VALUES ($1, 'Expired Fake Prize', 'DISCOUNT_FIXED', 999999, 1000000, true, NOW() - INTERVAL '1 day', 99)
    `, [testExpiredPrizeId]);

    const testUserId4 = uuidv4();
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role)
      VALUES ($1, 'test_wheel_${runId}_4@test.com', 'pw', 'User 4', 'CUSTOMER')
    `, [testUserId4]);

    const spinExpiredTest = await executeDailySpin(testUserId4);
    assert(spinExpiredTest.prize?.name !== 'Expired Fake Prize', 'Expired prize with massive weight was skipped');

    // -------------------------------------------------------------
    // TEST 8: max_winners cap prevents over-awarding
    // -------------------------------------------------------------
    const testCappedPrizeId = uuidv4();
    await client.query(`
      INSERT INTO wheel_prizes (id, name, type, value, weight, is_active, max_winners, current_winners, display_order)
      VALUES ($1, 'Capped Winners Prize', 'DISCOUNT_FIXED', 5000, 1000000, true, 2, 2, 99)
    `, [testCappedPrizeId]);

    const testUserId5 = uuidv4();
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role)
      VALUES ($1, 'test_wheel_${runId}_5@test.com', 'pw', 'User 5', 'CUSTOMER')
    `, [testUserId5]);

    const spinCappedTest = await executeDailySpin(testUserId5);
    assert(spinCappedTest.prize?.name !== 'Capped Winners Prize', 'Prize that reached max_winners was excluded');

    // -------------------------------------------------------------
    // TEST 9: max_total_cost cap prevents budget overrun
    // -------------------------------------------------------------
    const testBudgetPrizeId = uuidv4();
    await client.query(`
      INSERT INTO wheel_prizes (id, name, type, value, weight, is_active, max_total_cost, current_total_cost, display_order)
      VALUES ($1, 'Budget Capped Prize', 'DISCOUNT_FIXED', 5000, 1000000, true, 10000, 10000, 99)
    `, [testBudgetPrizeId]);

    const testUserId6 = uuidv4();
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role)
      VALUES ($1, 'test_wheel_${runId}_6@test.com', 'pw', 'User 6', 'CUSTOMER')
    `, [testUserId6]);

    const spinBudgetTest = await executeDailySpin(testUserId6);
    assert(spinBudgetTest.prize?.name !== 'Budget Capped Prize', 'Prize that reached max_total_cost was excluded');

    // -------------------------------------------------------------
    // TEST 10: Reward Execution Integration (Promo Code Generation)
    // -------------------------------------------------------------
    // Check if promo codes generated by winning spins exist in promo_codes table
    const promoCheck = await client.query(`
      SELECT * FROM promo_codes WHERE code LIKE 'SPIN-%' LIMIT 5
    `);
    console.log(`Found ${promoCheck.rows.length} generated spin promo codes in promo_codes table.`);
    for (const promo of promoCheck.rows) {
      assert(promo.type === 'DISCOUNT', 'Generated promo code has type DISCOUNT');
      assert(promo.usage_limit === 1, 'Generated promo code has usage_limit = 1');
      assert(promo.is_active === true, 'Generated promo code is active');
      assert(promo.currency === 'SDG', 'Generated promo code has currency SDG');
    }

    // -------------------------------------------------------------
    // TEST 11: Admin Prize Management CRUD
    // -------------------------------------------------------------
    const newPrize = await createPrizeAdmin({
      name: 'جائزة تجريبية خاصة',
      type: 'DISCOUNT_FIXED',
      value: 300,
      weight: 50,
      color: '#A855F7',
      is_active: true
    });
    assert(Boolean(newPrize.id), 'Admin can create a new prize');

    const updatedPrize = await updatePrizeAdmin(newPrize.id, { weight: 75, value: 350 });
    assert(Number(updatedPrize.weight) === 75, 'Admin can update prize weight');
    assert(Number(updatedPrize.value) === 350, 'Admin can update prize value');

    const toggledPrize = await togglePrizeActiveAdmin(newPrize.id);
    assert(toggledPrize.is_active === false, 'Admin can toggle prize status to false');

    const deletedResult = await deletePrizeAdmin(newPrize.id);
    assert(deletedResult.deleted === true, 'Admin can delete an unawarded prize');

    // -------------------------------------------------------------
    // TEST 12: Admin Analytics & Statistics Computation
    // -------------------------------------------------------------
    const adminStats = await getWheelAdminStats();
    assert(adminStats.overview.totalSpins > 0, 'Admin stats computes total spins');
    assert(adminStats.overview.averageRewardCost >= 0, 'Admin stats computes average reward cost');
    assert(adminStats.prizesBreakdown.length >= 8, 'Admin stats returns prize breakdown matrix');
    assert(adminStats.recentSpins.length > 0, 'Admin stats returns recent spins audit log');

    // Clean up temporary prizes created during tests
    await client.query(`
      DELETE FROM wheel_prizes WHERE id IN ($1, $2, $3, $4)
    `, [testPrizeId, testExpiredPrizeId, testCappedPrizeId, testBudgetPrizeId]);

    // Clean up temporary test users and their spins & credits
    await client.query(`DELETE FROM wheel_spins WHERE user_id IN ($1, $2, $3, $4, $5, $6)`, [
      testUserId1, testUserId2, testUserId3, testUserId4, testUserId5, testUserId6
    ]);
    await client.query(`DELETE FROM wheel_spin_credits WHERE user_id IN ($1, $2, $3, $4, $5, $6)`, [
      testUserId1, testUserId2, testUserId3, testUserId4, testUserId5, testUserId6
    ]);
    await client.query(`DELETE FROM "User" WHERE id IN ($1, $2, $3, $4, $5, $6)`, [
      testUserId1, testUserId2, testUserId3, testUserId4, testUserId5, testUserId6
    ]);

    console.log('\n====================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('====================================================\n');

  } catch (err: any) {
    console.error('Test suite failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runTestSuite();
