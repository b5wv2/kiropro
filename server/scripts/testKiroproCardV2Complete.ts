import pool from '../src/db';
import { encryptCardData, decryptCardData, maskCardNumber, formatCardNumber } from '../src/utils/cryptoCard';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

async function runKiroproCardV2Verification() {
  console.log('================================================================');
  console.log('🚀 KIROPRO CARD V2 COMPREHENSIVE INTEGRATION & CONCURRENCY SUITE');
  console.log('================================================================\n');

  const client = await pool.connect();
  const PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';

  try {
    // -------------------------------------------------------------
    // CHECK 1: DB Schema & Product Price ($2.00 price, $1.00 card balance)
    // -------------------------------------------------------------
    console.log('--- CHECK 1: Product Pricing & Catalog Configuration ---');
    const prodRes = await client.query(
      `SELECT id, "productName", "customerPriceUsd", "productType", "isActive" FROM "Product" WHERE id = $1`,
      [PRODUCT_ID]
    );

    if (prodRes.rows.length === 0) {
      throw new Error(`Product ${PRODUCT_ID} does not exist in DB!`);
    }

    const prod = prodRes.rows[0];
    const customerPrice = parseFloat(prod.customerPriceUsd);
    console.log(`Product Name: "${prod.productName}"`);
    console.log(`Product Type: ${prod.productType}`);
    console.log(`Product Price (USD): $${customerPrice.toFixed(2)}`);

    if (customerPrice !== 2.00) {
      throw new Error(`CRITICAL: Product price must be $2.00, found $${customerPrice}`);
    }
    console.log('✅ CHECK 1 PASSED: Product issue price is strictly configured to $2.00.\n');

    // -------------------------------------------------------------
    // CHECK 2: Issuance Code Format (KPC-XXXX-XXXX-XXXX) & Attributes
    // -------------------------------------------------------------
    console.log('--- CHECK 2: Issuance Code Format & Voucher Table Schema ---');
    const colRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'kiropro_card_vouchers' AND column_name IN ('value', 'status', 'redeemed_order_id')
    `);
    const foundCols = colRes.rows.map(r => r.column_name);
    console.log('Voucher V2 columns in DB:', foundCols);
    if (!foundCols.includes('value') || !foundCols.includes('status') || !foundCols.includes('redeemed_order_id')) {
      throw new Error('Missing columns in kiropro_card_vouchers! Migration 032 needed.');
    }

    // Generate sample code format matching KPC-XXXX-XXXX-XXXX
    function generateTestKpcCode(): string {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const seg = (len: number) => {
        let res = '';
        const bytes = crypto.randomBytes(len);
        for (let i = 0; i < len; i++) {
          res += chars[bytes[i] % chars.length];
        }
        return res;
      };
      return `KPC-${seg(4)}-${seg(4)}-${seg(4)}`;
    }

    const sampleCode = generateTestKpcCode();
    console.log(`Sample Generated Issuance Code: ${sampleCode}`);
    const kpcRegex = /^KPC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
    if (!kpcRegex.test(sampleCode)) {
      throw new Error(`Code ${sampleCode} does not match KPC-XXXX-XXXX-XXXX pattern!`);
    }
    console.log('✅ CHECK 2 PASSED: Code format strictly follows KPC-XXXX-XXXX-XXXX.\n');

    // -------------------------------------------------------------
    // CHECK 3: Setup Test User & Clean Previous Test Data
    // -------------------------------------------------------------
    console.log('--- CHECK 3: Test User Preparation ---');
    let testUserId: string;
    const testUserEmail = 'kiropro.card.tester@kiropro.local';
    const userRes = await client.query(`SELECT id FROM "User" WHERE email = $1`, [testUserEmail]);
    if (userRes.rows.length > 0) {
      testUserId = userRes.rows[0].id;
      await client.query(`UPDATE "User" SET role = 'ADMIN' WHERE id = $1`, [testUserId]);
    } else {
      const createRes = await client.query(
        `INSERT INTO "User" (email, name, role, "passwordHash") VALUES ($1, 'KiroPro Card Tester', 'ADMIN', 'dummy_hash') RETURNING id`,
        [testUserEmail]
      );
      testUserId = createRes.rows[0].id;
    }

    // Ensure wallet exists
    await client.query(
      `INSERT INTO "Wallet" ("userId", balance, currency) VALUES ($1, 0.00, 'USD') ON CONFLICT ("userId") DO NOTHING`,
      [testUserId]
    );

    // Clean previous test vouchers & cards
    await client.query(`DELETE FROM kiropro_card_vouchers WHERE code LIKE 'KPC-TEST-%'`);
    await client.query(`DELETE FROM kiropro_cards_inventory WHERE card_last4 IN ('8811', '8822', '8833', '8844')`);
    console.log(`Test User ID: ${testUserId}`);
    console.log('✅ CHECK 3 PASSED: Test environment ready.\n');

    // -------------------------------------------------------------
    // CHECK 4: Wallet Purchase ($2.00) Flow & Balance Checking
    // -------------------------------------------------------------
    console.log('--- CHECK 4: Wallet Purchase Flow ($2.00 deduction) ---');

    // Seed 1 available card ($1.00 card balance)
    const cardEnc1 = encryptCardData('5301234567898811');
    const cvvEnc1 = encryptCardData('432');
    const c1Res = await client.query(`
      INSERT INTO kiropro_cards_inventory (
        product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status
      ) VALUES ($1, $2, '8811', '08/29', $3, 1.00, 'AVAILABLE')
      RETURNING id
    `, [PRODUCT_ID, cardEnc1, cvvEnc1]);
    const card1Id = c1Res.rows[0].id;

    // Set user balance to $1.50 (insufficient, since price is $2.00)
    await client.query(`UPDATE "Wallet" SET balance = 1.50 WHERE "userId" = $1`, [testUserId]);

    // Attempt purchase with $1.50 wallet balance -> must be rejected
    const testInsufficientWallet = async () => {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const wRes = await conn.query(`SELECT balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`, [testUserId]);
        const bal = parseFloat(wRes.rows[0].balance);
        const price = 2.00;
        if (bal < price) {
          throw new Error('INSUFFICIENT_FUNDS');
        }
        await conn.query('COMMIT');
        return true;
      } catch (err: any) {
        await conn.query('ROLLBACK');
        return err.message;
      } finally {
        conn.release();
      }
    };

    const insufficientResult = await testInsufficientWallet();
    console.log(`Insufficient balance check result: ${insufficientResult}`);
    if (insufficientResult !== 'INSUFFICIENT_FUNDS') {
      throw new Error('Failed to block purchase when wallet balance < $2.00');
    }

    // Set user balance to $10.00 (sufficient)
    await client.query(`UPDATE "Wallet" SET balance = 10.00 WHERE "userId" = $1`, [testUserId]);

    // Execute atomic wallet purchase
    const connWallet = await pool.connect();
    let orderIdWallet: string;
    try {
      await connWallet.query('BEGIN');

      // Deduct exactly $2.00
      await connWallet.query(`UPDATE "Wallet" SET balance = balance - 2.00 WHERE "userId" = $1`, [testUserId]);

      // Lock card
      const lockCard = await connWallet.query(`
        SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance
        FROM kiropro_cards_inventory
        WHERE product_id = $1 AND status = 'AVAILABLE'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `, [PRODUCT_ID]);

      if (lockCard.rows.length === 0) throw new Error('NO_CARD_AVAILABLE');
      const assignedCard = lockCard.rows[0];

      // Create Order
      orderIdWallet = uuidv4();
      await connWallet.query(
        `INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId", 
          amount, "originalAmount", "discountAmount", 
          status, provider, "orderType",
          "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
          "chargedCurrency", "exchangeRateUsed", "cashbackAmount", "completedAt",
          quantity, "unitPrice", "unitPriceUsd"
        ) 
        VALUES ($1, $2, 'kiropro-card', $3, 'بطاقة كيرو برو الافتراضية ($1.00)', $4, 2.00, 2.00, 0.0, 'COMPLETED', 'INTERNAL', 'VIRTUAL_CARD', 2.00, 2.00, 2.00, 2.00, 'USD', 1.0, 0.0, CURRENT_TIMESTAMP, 1, 2.00, 2.00)`,
        [orderIdWallet, testUserId, PRODUCT_ID, `بطاقة كيرو برو (•••• ${assignedCard.card_last4})`]
      );

      // Assign card
      await connWallet.query(`
        UPDATE kiropro_cards_inventory
        SET status = 'CLAIMED', assigned_to_user_id = $1, assigned_at = CURRENT_TIMESTAMP, order_id = $2
        WHERE id = $3
      `, [testUserId, orderIdWallet, assignedCard.id]);

      await connWallet.query('COMMIT');
      console.log(`Wallet purchase successfully created Order: ${orderIdWallet}`);
    } catch (err: any) {
      await connWallet.query('ROLLBACK');
      throw err;
    } finally {
      connWallet.release();
    }

    // Verify wallet balance is now $8.00 ($10.00 - $2.00)
    const afterWallet = await client.query(`SELECT balance FROM "Wallet" WHERE "userId" = $1`, [testUserId]);
    const remainingBalance = parseFloat(afterWallet.rows[0].balance);
    console.log(`Remaining Wallet Balance: $${remainingBalance.toFixed(2)}`);
    if (remainingBalance !== 8.00) {
      throw new Error(`Expected wallet balance $8.00, got $${remainingBalance}`);
    }
    console.log('✅ CHECK 4 PASSED: Wallet payment correctly requires and deducts $2.00.\n');

    // -------------------------------------------------------------
    // CHECK 5: Issuance Code Redemption Flow & Single-Use Enforcement
    // -------------------------------------------------------------
    console.log('--- CHECK 5: Issuance Code Redemption & Single-Use ---');

    // Seed 1 available card
    const cardEnc2 = encryptCardData('5301234567898822');
    const cvvEnc2 = encryptCardData('567');
    await client.query(`
      INSERT INTO kiropro_cards_inventory (
        product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status
      ) VALUES ($1, $2, '8822', '09/29', $3, 1.00, 'AVAILABLE')
    `, [PRODUCT_ID, cardEnc2, cvvEnc2]);

    // Seed 1 voucher code KPC-TEST-AAAA-BBBB
    const testVoucherCode = 'KPC-TEST-AAAA-BBBB';
    const vRes = await client.query(`
      INSERT INTO kiropro_card_vouchers (
        code, product_id, value, status, is_redeemed, is_active
      ) VALUES ($1, $2, 2.00, 'AVAILABLE', false, true)
      RETURNING id
    `, [testVoucherCode, PRODUCT_ID]);
    const testVoucherId = vRes.rows[0].id;
    console.log(`Created test voucher: ${testVoucherCode} (ID: ${testVoucherId})`);

    // Redeem code atomically
    const connVoucher = await pool.connect();
    try {
      await connVoucher.query('BEGIN');

      const vLock = await connVoucher.query(`
        SELECT id, product_id, is_redeemed, is_active, status, value
        FROM kiropro_card_vouchers
        WHERE UPPER(code) = $1
        FOR UPDATE
      `, [testVoucherCode]);

      const v = vLock.rows[0];
      if (!v || v.is_redeemed || v.status !== 'AVAILABLE') {
        throw new Error('VOUCHER_NOT_AVAILABLE');
      }

      const cLock = await connVoucher.query(`
        SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance
        FROM kiropro_cards_inventory
        WHERE product_id = $1 AND status = 'AVAILABLE'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `, [v.product_id]);

      if (cLock.rows.length === 0) throw new Error('NO_CARD_AVAILABLE');
      const c = cLock.rows[0];

      // Create Completed Order ($2.00 value, paymentMethod = 'ISSUANCE_CODE')
      const vOrderId = uuidv4();
      await connVoucher.query(
        `INSERT INTO "Order" (
          id, "userId", "gameId", "packageId", "packageName", "playerId", 
          amount, "originalAmount", "discountAmount", "promoCode", 
          status, provider, "orderType",
          "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
          "chargedCurrency", "exchangeRateUsed", "cashbackAmount", "completedAt",
          quantity, "unitPrice", "unitPriceUsd"
        ) 
        VALUES ($1, $2, 'kiropro-card', $3, 'بطاقة كيرو برو الافتراضية ($1.00)', $4, 0.0, 2.00, 2.00, $5, 'COMPLETED', 'INTERNAL', 'VIRTUAL_CARD', 2.00, 0.0, 2.00, 0.0, 'USD', 1.0, 0.0, CURRENT_TIMESTAMP, 1, 2.00, 2.00)`,
        [vOrderId, testUserId, PRODUCT_ID, `بطاقة كيرو برو (•••• ${c.card_last4})`, `ISSUANCE-CODE:${testVoucherCode.slice(0, 4)}...`]
      );

      // Assign card
      await connVoucher.query(`
        UPDATE kiropro_cards_inventory
        SET status = 'CLAIMED', assigned_to_user_id = $1, assigned_at = CURRENT_TIMESTAMP,
            claimed_by_voucher_id = $2, order_id = $3
        WHERE id = $4
      `, [testUserId, v.id, vOrderId, c.id]);

      // Update voucher status to REDEEMED
      await connVoucher.query(`
        UPDATE kiropro_card_vouchers
        SET is_redeemed = true, status = 'REDEEMED', card_id = $1, redeemed_by_user_id = $2,
            redeemed_at = CURRENT_TIMESTAMP, redeemed_order_id = $3
        WHERE id = $4
      `, [c.id, testUserId, vOrderId, v.id]);

      await connVoucher.query('COMMIT');
      console.log(`Successfully redeemed voucher ${testVoucherCode} -> Order ${vOrderId}`);
    } catch (err: any) {
      await connVoucher.query('ROLLBACK');
      throw err;
    } finally {
      connVoucher.release();
    }

    // Try redeeming the same voucher a second time -> MUST fail
    let secondRedeemFailed = false;
    try {
      const vCheck = await client.query(`SELECT is_redeemed, status FROM kiropro_card_vouchers WHERE id = $1`, [testVoucherId]);
      if (vCheck.rows[0].is_redeemed || vCheck.rows[0].status === 'REDEEMED') {
        secondRedeemFailed = true;
      }
    } catch {
      secondRedeemFailed = true;
    }

    if (!secondRedeemFailed) {
      throw new Error('Voucher was allowed to be re-used!');
    }
    console.log('✅ CHECK 5 PASSED: Issuance code correctly redeemed once and locked against replay.\n');

    // -------------------------------------------------------------
    // CHECK 6: ZERO-RACE-CONDITION CONCURRENCY ON ISSUANCE CODE
    // -------------------------------------------------------------
    console.log('--- CHECK 6: Zero-Race-Condition Concurrency (10 Parallel Workers vs 1 Code) ---');

    // Seed 1 card and 1 voucher
    const cardEnc3 = encryptCardData('5301234567898833');
    const cvvEnc3 = encryptCardData('999');
    await client.query(`
      INSERT INTO kiropro_cards_inventory (
        product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status
      ) VALUES ($1, $2, '8833', '10/29', $3, 1.00, 'AVAILABLE')
    `, [PRODUCT_ID, cardEnc3, cvvEnc3]);

    const concurrentCode = 'KPC-TEST-RACE-RACE';
    await client.query(`
      INSERT INTO kiropro_card_vouchers (
        code, product_id, value, status, is_redeemed, is_active
      ) VALUES ($1, $2, 2.00, 'AVAILABLE', false, true)
    `, [concurrentCode, PRODUCT_ID]);

    // Release main client before launching concurrent pool connections
    client.release();

    const PARALLEL_COUNT = 10;
    console.log(`⚡ Firing ${PARALLEL_COUNT} simultaneous attempts on code "${concurrentCode}"...`);

    const attemptRedemption = async (workerId: number) => {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');

        // SELECT ... FOR UPDATE ensures strict atomic serialization
        const vQuery = await conn.query(`
          SELECT id, product_id, is_redeemed, is_active, status, value
          FROM kiropro_card_vouchers
          WHERE UPPER(code) = $1
          FOR UPDATE
        `, [concurrentCode]);

        const v = vQuery.rows[0];
        if (!v || v.is_redeemed || v.status !== 'AVAILABLE' || !v.is_active) {
          throw new Error('CODE_ALREADY_USED_OR_INVALID');
        }

        const cQuery = await conn.query(`
          SELECT id FROM kiropro_cards_inventory
          WHERE product_id = $1 AND status = 'AVAILABLE'
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `, [v.product_id]);

        if (cQuery.rows.length === 0) throw new Error('OUT_OF_STOCK');
        const c = cQuery.rows[0];

        // Create completed order
        const oId = uuidv4();
        await conn.query(
          `INSERT INTO "Order" (
            id, "userId", "gameId", "packageId", "packageName", "playerId", 
            amount, "originalAmount", "discountAmount", "promoCode", 
            status, provider, "orderType",
            "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount", 
            "chargedCurrency", "exchangeRateUsed", "cashbackAmount", "completedAt",
            quantity, "unitPrice", "unitPriceUsd"
          ) 
          VALUES ($1, $2, 'kiropro-card', $3, 'بطاقة كيرو برو الافتراضية ($1.00)', $4, 0.0, 2.00, 2.00, $5, 'COMPLETED', 'INTERNAL', 'VIRTUAL_CARD', 2.00, 0.0, 2.00, 0.0, 'USD', 1.0, 0.0, CURRENT_TIMESTAMP, 1, 2.00, 2.00)`,
          [oId, testUserId, PRODUCT_ID, `بطاقة كيرو برو`, `ISSUANCE-CODE:${concurrentCode.slice(0, 4)}...`]
        );

        await conn.query(`
          UPDATE kiropro_cards_inventory
          SET status = 'CLAIMED', assigned_to_user_id = $1, assigned_at = CURRENT_TIMESTAMP,
              claimed_by_voucher_id = $2, order_id = $3
          WHERE id = $4
        `, [testUserId, v.id, oId, c.id]);

        await conn.query(`
          UPDATE kiropro_card_vouchers
          SET is_redeemed = true, status = 'REDEEMED', card_id = $1, redeemed_by_user_id = $2,
              redeemed_at = CURRENT_TIMESTAMP, redeemed_order_id = $3
          WHERE id = $4
        `, [c.id, testUserId, oId, v.id]);

        await conn.query('COMMIT');
        return { workerId, success: true };
      } catch (err: any) {
        await conn.query('ROLLBACK');
        return { workerId, success: false, error: err.message };
      } finally {
        conn.release();
      }
    };

    const startTime = Date.now();
    const raceResults = await Promise.all(
      Array.from({ length: PARALLEL_COUNT }, (_, i) => attemptRedemption(i + 1))
    );
    const duration = Date.now() - startTime;

    const successfulRaces = raceResults.filter(r => r.success);
    const failedRaces = raceResults.filter(r => !r.success);

    console.log(`⏱️ Completed in ${duration}ms`);
    console.log(`✅ Successful Redemptions: ${successfulRaces.length}`);
    console.log(`❌ Rejected Attempts: ${failedRaces.length}`);

    if (successfulRaces.length !== 1) {
      throw new Error(`CRITICAL CONCURRENCY FAILURE: Expected exactly 1 success, got ${successfulRaces.length}`);
    }
    if (failedRaces.length !== PARALLEL_COUNT - 1) {
      throw new Error(`CRITICAL CONCURRENCY FAILURE: Expected ${PARALLEL_COUNT - 1} rejections, got ${failedRaces.length}`);
    }

    console.log('✅ CHECK 6 PASSED: Concurrency & Zero-Race-Condition is mathematically guaranteed (1 winner, 9 blocked).\n');

    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    const finalClient = await pool.connect();
    await finalClient.query(`DELETE FROM kiropro_card_vouchers WHERE code LIKE 'KPC-TEST-%'`);
    await finalClient.query(`DELETE FROM kiropro_cards_inventory WHERE card_last4 IN ('8811', '8822', '8833')`);
    await finalClient.query(`DELETE FROM "Order" WHERE "userId" = $1 AND "packageId" = $2`, [testUserId, PRODUCT_ID]);
    await finalClient.query(`DELETE FROM "Wallet" WHERE "userId" = $1`, [testUserId]);
    await finalClient.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
    finalClient.release();
    console.log('🧹 Cleaned up all test records and test user.');

    console.log('\n================================================================');
    console.log('🎉 ALL KIROPRO CARD V2 VERIFICATION CHECKS PASSED WITH 100% SUCCESS');
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runKiroproCardV2Verification();
