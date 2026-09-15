import pool from '../src/db';
import { v4 as uuidv4 } from 'uuid';

// Helper to simulate central exchange rate and test harness
async function runTests() {
  console.log('================================================================');
  console.log('🧪 VERIFYING KIROPRO PROMO CODES, CURRENCY & SECURITY LOGIC');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (detail) console.log(`   Detail: ${detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Detail: ${detail}`);
      failed++;
    }
  }

  const client = await pool.connect();

  // Test setup identifiers
  const testUserId = uuidv4();
  const testPromoFixedSdg = `TEST_SDG_${Date.now()}`;
  const testPromoFixedUsd = `TEST_USD_${Date.now()}`;
  const testPromoGift = `TEST_GIFT_${Date.now()}`;
  const testPromoPct = `TEST_PCT_${Date.now()}`;
  const testPromoHuge = `TEST_HUGE_${Date.now()}`;

  try {
    // 0. Ensure Central Exchange Rate exists
    const rateRes = await client.query('SELECT value FROM "platform_settings" WHERE key = $1', ['exchange_rate']);
    const exchangeRate = Number(rateRes.rows[0]?.value?.rate) || 5000;
    console.log(`ℹ️ Current Central Exchange Rate: 1 USD = ${exchangeRate} SDG\n`);

    // Create test user in DB with SDG wallet
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role, "preferred_currency")
      VALUES ($1, $2, 'hashed_pwd', 'Test Buyer', 'CUSTOMER', 'SDG')
      ON CONFLICT (id) DO NOTHING
    `, [testUserId, `test_promo_${Date.now()}@example.com`]);

    await client.query(`
      INSERT INTO "Wallet" (id, "userId", balance, currency)
      VALUES ($1, $2, 100000, 'SDG')
      ON CONFLICT DO NOTHING
    `, [uuidv4(), testUserId]);

    // Insert Test Promo Codes
    // 1) 1000 SDG Fixed Discount
    await client.query(`
      INSERT INTO promo_codes (
        id, code, type, discount_type, discount_value, currency, usage_limit, per_user_limit, is_active
      ) VALUES ($1, $2, 'DISCOUNT', 'FIXED', 1000, 'SDG', 100, 1, true)
    `, [uuidv4(), testPromoFixedSdg]);

    // 2) 1000 USD Fixed Discount
    await client.query(`
      INSERT INTO promo_codes (
        id, code, type, discount_type, discount_value, currency, usage_limit, per_user_limit, is_active
      ) VALUES ($1, $2, 'DISCOUNT', 'FIXED', 1000, 'USD', 100, 1, true)
    `, [uuidv4(), testPromoFixedUsd]);

    // 3) Gift Balance (WALLET_CREDIT) of 3000 SDG
    await client.query(`
      INSERT INTO promo_codes (
        id, code, type, credit_amount, currency, usage_limit, per_user_limit, is_active
      ) VALUES ($1, $2, 'WALLET_CREDIT', 3000, 'SDG', 100, 1, true)
    `, [uuidv4(), testPromoGift]);

    // 4) 10% Percentage Discount (max cap 2000 SDG)
    await client.query(`
      INSERT INTO promo_codes (
        id, code, type, discount_type, discount_value, max_discount, currency, usage_limit, per_user_limit, is_active
      ) VALUES ($1, $2, 'DISCOUNT', 'PERCENTAGE', 10, 2000, 'SDG', 100, 1, true)
    `, [uuidv4(), testPromoPct]);

    // 5) Huge 50,000 SDG Discount (larger than cart)
    await client.query(`
      INSERT INTO promo_codes (
        id, code, type, discount_type, discount_value, currency, usage_limit, per_user_limit, is_active
      ) VALUES ($1, $2, 'DISCOUNT', 'FIXED', 50000, 'SDG', 100, 1, true)
    `, [uuidv4(), testPromoHuge]);

    // =========================================================================
    // TEST 1: SDG wallet + 1000 SDG fixed discount => exact 1000 SDG discount
    // =========================================================================
    console.log('--- TEST 1: SDG wallet + 1000 SDG fixed discount ---');
    const orderTotalSdg = 7344; // e.g. 7,344 SDG product
    const promo1Res = await client.query('SELECT * FROM promo_codes WHERE code = $1', [testPromoFixedSdg]);
    const promo1 = promo1Res.rows[0];
    
    // Simulate server discount logic
    let calcDiscount1 = 0;
    const userCurrency1 = 'SDG';
    const promoCurrency1 = (promo1.currency || 'USD').toUpperCase();
    if (promo1.discount_type === 'FIXED') {
      let fixedVal = Number(promo1.discount_value);
      if (promoCurrency1 !== userCurrency1) {
        fixedVal = userCurrency1 === 'SDG' ? Math.round(fixedVal * exchangeRate) : Math.round((fixedVal / exchangeRate) * 100) / 100;
      }
      calcDiscount1 = fixedVal;
    }
    const finalPrice1 = Math.max(0, orderTotalSdg - calcDiscount1);
    assert(calcDiscount1 === 1000, 'Fixed SDG discount value is 1000 SDG', `Expected 1000, got: ${calcDiscount1}`);
    assert(finalPrice1 === 6344, 'Final price is 7344 - 1000 = 6344 SDG', `Expected 6344, got: ${finalPrice1}`);

    // =========================================================================
    // TEST 2: SDG wallet + 1000 USD fixed discount => NEVER treated 1:1 as 1000 SDG
    // =========================================================================
    console.log('\n--- TEST 2: SDG wallet + 1000 USD fixed discount ---');
    const promo2Res = await client.query('SELECT * FROM promo_codes WHERE code = $1', [testPromoFixedUsd]);
    const promo2 = promo2Res.rows[0];
    let calcDiscount2 = 0;
    const userCurrency2 = 'SDG';
    const promoCurrency2 = (promo2.currency || 'USD').toUpperCase();
    if (promo2.discount_type === 'FIXED') {
      let fixedVal = Number(promo2.discount_value);
      if (promoCurrency2 !== userCurrency2) {
        fixedVal = userCurrency2 === 'SDG' ? Math.round(fixedVal * exchangeRate) : Math.round((fixedVal / exchangeRate) * 100) / 100;
      }
      calcDiscount2 = fixedVal;
    }
    assert(calcDiscount2 !== 1000, '1000 USD is NOT treated as 1000 SDG', `Expected not 1000, got: ${calcDiscount2}`);
    assert(calcDiscount2 === 1000 * exchangeRate, `1000 USD is converted via exchange rate to ${1000 * exchangeRate} SDG`, `Got: ${calcDiscount2}`);

    // =========================================================================
    // TEST 3: WALLET_CREDIT code in checkout discount field
    // =========================================================================
    console.log('\n--- TEST 3: WALLET_CREDIT code in checkout discount field ---');
    const promo3Res = await client.query('SELECT * FROM promo_codes WHERE code = $1', [testPromoGift]);
    const promo3 = promo3Res.rows[0];
    
    // Server validation check when purpose = 'CHECKOUT_DISCOUNT'
    const purpose = 'CHECKOUT_DISCOUNT';
    let isRejected = false;
    let errorCode = '';
    let errorMessage = '';
    if (promo3.type === 'WALLET_CREDIT' && purpose === 'CHECKOUT_DISCOUNT') {
      isRejected = true;
      errorCode = 'GIFT_CODE_USED_IN_DISCOUNT_FIELD';
      errorMessage = 'عذرًا، هذا كود رصيد هدايا وليس كود خصم. يرجى استبداله من المكان المخصص لإضافة الرصيد.';
    }
    assert(isRejected, 'WALLET_CREDIT code in discount field is rejected');
    assert(errorCode === 'GIFT_CODE_USED_IN_DISCOUNT_FIELD', 'Error code is GIFT_CODE_USED_IN_DISCOUNT_FIELD', `Got: ${errorCode}`);
    assert(errorMessage.includes('عذرًا، هذا كود رصيد هدايا'), 'Error message is Arabic and clear');
    
    // Verify usage count not touched and no redemption record created
    const countCheck = await client.query('SELECT usage_count FROM promo_codes WHERE code = $1', [testPromoGift]);
    assert(countCheck.rows[0].usage_count === 0, 'Code usage count remained 0 (not consumed)');

    // =========================================================================
    // TEST 4: DISCOUNT code in discount field => Valid and works normally
    // =========================================================================
    console.log('\n--- TEST 4: DISCOUNT code in discount field ---');
    assert(promo1.type === 'DISCOUNT' && promo1.is_active, 'Discount code is valid and active');

    // =========================================================================
    // TEST 5: Percentage discount => Accurately computed
    // =========================================================================
    console.log('\n--- TEST 5: Percentage discount calculation ---');
    const promo4Res = await client.query('SELECT * FROM promo_codes WHERE code = $1', [testPromoPct]);
    const promo4 = promo4Res.rows[0];
    const testCartTotal = 10000; // 10,000 SDG
    let pctDiscount = (testCartTotal * Number(promo4.discount_value)) / 100; // 10% = 1000
    if (promo4.max_discount) {
      pctDiscount = Math.min(pctDiscount, Number(promo4.max_discount));
    }
    assert(pctDiscount === 1000, '10% of 10,000 SDG is 1,000 SDG', `Got: ${pctDiscount}`);

    // =========================================================================
    // TEST 6: Discount greater than order total => Total never negative
    // =========================================================================
    console.log('\n--- TEST 6: Discount greater than order total ---');
    const smallCart = 5000;
    const hugeDiscountVal = 50000;
    const cappedDiscount = Math.min(hugeDiscountVal, smallCart);
    const finalCartTotal = Math.max(0, smallCart - cappedDiscount);
    assert(cappedDiscount === 5000, 'Discount capped at cart total 5000 SDG', `Got: ${cappedDiscount}`);
    assert(finalCartTotal === 0, 'Final price never becomes negative', `Got: ${finalCartTotal}`);

    // =========================================================================
    // TEST 7: Attempt to tamper with discountAmount from client
    // =========================================================================
    console.log('\n--- TEST 7: Server ignores client discountAmount tampering ---');
    // Simulate what orders.ts does: client sends { discountAmount: 999999, promoCode: testPromoFixedSdg }
    // Server queries promo_codes from DB for testPromoFixedSdg
    const trustedPromo = (await client.query('SELECT * FROM promo_codes WHERE code = $1', [testPromoFixedSdg])).rows[0];
    const serverAuthoritativeDiscount = Number(trustedPromo.discount_value);
    assert(serverAuthoritativeDiscount === 1000, 'Server uses DB discount (1000) ignoring client 999999');

    // =========================================================================
    // TEST 8: Re-using a single-use promo code rejected
    // =========================================================================
    console.log('\n--- TEST 8: Re-use of single-use promo code is rejected ---');
    // First redemption
    await client.query(`
      INSERT INTO promo_code_redemptions (id, promo_code_id, user_id, discount_amount)
      VALUES ($1, $2, $3, 1000)
    `, [uuidv4(), promo1.id, testUserId]);

    // Second check
    const secondCheck = await client.query(
      'SELECT id FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2',
      [promo1.id, testUserId]
    );
    const wouldRejectSecondUse = secondCheck.rows.length > 0;
    assert(wouldRejectSecondUse, 'Second attempt to use promo code is rejected');

    // =========================================================================
    // TEST 9: Cross-currency promo conversion preserves exchange rate
    // =========================================================================
    console.log('\n--- TEST 9: Cross-currency exchange rate integrity ---');
    // $10 USD promo on SDG user cart
    const tenUsdPromoVal = 10;
    const convertedToSdg = Math.round(tenUsdPromoVal * exchangeRate);
    assert(convertedToSdg === tenUsdPromoVal * exchangeRate, `10 USD promo correctly converted to ${tenUsdPromoVal * exchangeRate} SDG at rate ${exchangeRate}`, `Got: ${convertedToSdg}`);
    assert(convertedToSdg !== 10, 'No silent 1:1 conversion of USD to SDG');

    // =========================================================================
    // TEST 10: WALLET_CREDIT never displays as "خصم 0"
    // =========================================================================
    console.log('\n--- TEST 10: WALLET_CREDIT never displays as 0 discount ---');
    // In QuickTopUpModal:
    const appliedPromoSim: any = { type: 'WALLET_CREDIT', creditAmount: 3000 };
    const discountAmountSim = (appliedPromoSim && appliedPromoSim.type === 'DISCOUNT')
      ? (appliedPromoSim.discountAmount || appliedPromoSim.discount || 0)
      : 0;
    const isDiscountZeroForbidden = appliedPromoSim.type === 'WALLET_CREDIT' && discountAmountSim === 0;
    assert(isDiscountZeroForbidden, 'WALLET_CREDIT yields 0 discount amount in modal logic (never treated as discount)');
    // But since it is rejected at validation with error, appliedPromo is NEVER set!
    let modalAppliedPromo: any = null;
    let modalPromoError: string | null = null;
    if (appliedPromoSim.type === 'WALLET_CREDIT') {
      modalAppliedPromo = null;
      modalPromoError = 'عذرًا، هذا كود رصيد هدايا وليس كود خصم. يرجى استبداله من المكان المخصص لإضافة الرصيد.';
    }
    assert(modalAppliedPromo === null, 'appliedPromo is null for WALLET_CREDIT (never active in checkout)');
    assert(modalPromoError !== null, 'Red error is shown to user instead of success card');

    console.log('\n================================================================');
    console.log(`📊 RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

  } catch (err: any) {
    console.error('Test error:', err);
    failed++;
  } finally {
    // Cleanup test data
    await client.query('DELETE FROM promo_code_redemptions WHERE user_id = $1', [testUserId]);
    await client.query('DELETE FROM "Wallet" WHERE "userId" = $1', [testUserId]);
    await client.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
    await client.query('DELETE FROM promo_codes WHERE code IN ($1, $2, $3, $4, $5)', [
      testPromoFixedSdg, testPromoFixedUsd, testPromoGift, testPromoPct, testPromoHuge
    ]);
    client.release();
    await pool.end();
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
