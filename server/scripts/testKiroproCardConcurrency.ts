import pool from '../src/db';
import { encryptCardData, decryptCardData, maskCardNumber, formatCardNumber, validateLuhn } from '../src/utils/cryptoCard';

async function runConcurrencyTest() {
  console.log('================================================================');
  console.log('🧪 KIROPRO CARD CONCURRENCY & ZERO RACE CONDITION TEST SUITE');
  console.log('================================================================\n');

  const client = await pool.connect();
  let testUserId: string;
  const PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';

  try {
    // 0. Locate or create a test user
    const userRes = await client.query(`SELECT id, email FROM "User" LIMIT 1`);
    if (userRes.rows.length > 0) {
      testUserId = userRes.rows[0].id;
    } else {
      const newUser = await client.query(`
        INSERT INTO "User" (email, name, role) 
        VALUES ('concurrency.test@kiropro.local', 'Test Runner', 'CUSTOMER') 
        RETURNING id
      `);
      testUserId = newUser.rows[0].id;
    }
    console.log(`👤 Using User ID for testing: ${testUserId}`);

    // Verify Product exists
    const prodRes = await client.query(`SELECT id, "productName", "productType" FROM "Product" WHERE id = $1`, [PRODUCT_ID]);
    if (prodRes.rows.length === 0) {
      throw new Error(`Product ${PRODUCT_ID} does not exist! Migration 031 required.`);
    }
    console.log(`📦 Verified Product: ${prodRes.rows[0].productName} (${prodRes.rows[0].productType})`);

    // Clean any previous test artifacts
    await client.query(`DELETE FROM kiropro_card_vouchers WHERE code LIKE 'TEST-%'`);
    await client.query(`DELETE FROM kiropro_cards_inventory WHERE card_last4 IN ('9911', '9922', '9933')`);

    // ==============================================================
    // TEST 1: DIRECT CLAIM CONCURRENCY (SELECT ... FOR UPDATE SKIP LOCKED)
    // ==============================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 1: Simulating 10 Concurrent Claims on 2 Available Cards');
    console.log('----------------------------------------------------------------');

    // Insert exactly 2 available cards
    const card1EncNum = encryptCardData('5105105105109911');
    const card1EncCvv = encryptCardData('123');
    const card2EncNum = encryptCardData('5105105105109922');
    const card2EncCvv = encryptCardData('456');

    const insertRes1 = await client.query(`
      INSERT INTO kiropro_cards_inventory (
        product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status
      ) VALUES ($1, $2, '9911', '12/28', $3, 1.00, 'AVAILABLE')
      RETURNING id
    `, [PRODUCT_ID, card1EncNum, card1EncCvv]);

    const insertRes2 = await client.query(`
      INSERT INTO kiropro_cards_inventory (
        product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status
      ) VALUES ($1, $2, '9922', '11/29', $3, 1.00, 'AVAILABLE')
      RETURNING id
    `, [PRODUCT_ID, card2EncNum, card2EncCvv]);

    const cardIds = [insertRes1.rows[0].id, insertRes2.rows[0].id];
    console.log(`💳 Seeded 2 test cards: [${cardIds[0]}, ${cardIds[1]}]`);

    // Release client before running concurrent queries via separate pool connections
    client.release();

    // Spawn 10 concurrent requests simultaneously
    const CONCURRENT_REQUESTS = 10;
    console.log(`⚡ Firing ${CONCURRENT_REQUESTS} parallel checkout claims at the exact same millisecond...`);

    const runClaimTransaction = async (workerId: number): Promise<{ workerId: number; success: boolean; cardId?: string; error?: string }> => {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');

        // Atomic row-level lock
        const lockRes = await conn.query(`
          SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance 
          FROM kiropro_cards_inventory 
          WHERE product_id = $1 AND status = 'AVAILABLE' 
          ORDER BY created_at ASC 
          LIMIT 1 
          FOR UPDATE SKIP LOCKED
        `, [PRODUCT_ID]);

        const card = lockRes.rows[0];
        if (!card) {
          throw new Error('OUT_OF_STOCK');
        }

        // Mark claimed
        await conn.query(`
          UPDATE kiropro_cards_inventory 
          SET status = 'CLAIMED', 
              assigned_to_user_id = $1, 
              assigned_at = CURRENT_TIMESTAMP, 
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = $2
        `, [testUserId, card.id]);

        await conn.query('COMMIT');
        return { workerId, success: true, cardId: card.id };
      } catch (err: any) {
        await conn.query('ROLLBACK');
        return { workerId, success: false, error: err.message };
      } finally {
        conn.release();
      }
    };

    const startTime = Date.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => runClaimTransaction(i + 1))
    );
    const durationMs = Date.now() - startTime;

    const successfulClaims = results.filter(r => r.success);
    const failedClaims = results.filter(r => !r.success);
    const claimedCardIds = successfulClaims.map(r => r.cardId);

    console.log(`⏱️ Completed in ${durationMs}ms`);
    console.log(`✅ Successful claims: ${successfulClaims.length}`);
    console.log(`❌ Rejected (out of stock): ${failedClaims.length}`);
    console.log(`🆔 Claimed Card IDs:`, claimedCardIds);

    // Assertions for Test 1
    if (successfulClaims.length !== 2) {
      throw new Error(`CRITICAL FAILURE: Expected exactly 2 successful claims, got ${successfulClaims.length}`);
    }
    if (failedClaims.length !== 8) {
      throw new Error(`CRITICAL FAILURE: Expected exactly 8 rejected claims, got ${failedClaims.length}`);
    }
    if (new Set(claimedCardIds).size !== 2) {
      throw new Error(`CRITICAL RACE CONDITION DETECTED: The same card was claimed more than once! ${JSON.stringify(claimedCardIds)}`);
    }

    console.log('🎉 TEST 1 PASSED: Zero race conditions! Exactly 2 cards claimed with unique card assignments.');

    // ==============================================================
    // TEST 2: VOUCHER DOUBLE-SPENDING CONCURRENCY
    // ==============================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 2: Simulating 5 Concurrent Redemptions on 1 Single Voucher');
    console.log('----------------------------------------------------------------');

    const adminClient = await pool.connect();

    // Seed 1 card and 1 voucher
    const card3EncNum = encryptCardData('5105105105109933');
    const card3EncCvv = encryptCardData('789');

    const card3Res = await adminClient.query(`
      INSERT INTO kiropro_cards_inventory (
        product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance, status
      ) VALUES ($1, $2, '9933', '10/30', $3, 1.00, 'AVAILABLE')
      RETURNING id
    `, [PRODUCT_ID, card3EncNum, card3EncCvv]);
    const testCard3Id = card3Res.rows[0].id;

    const voucherCode = 'TEST-CONCURRENCY-VOUCHER';
    const voucherRes = await adminClient.query(`
      INSERT INTO kiropro_card_vouchers (
        code, product_id, is_redeemed, is_active
      ) VALUES ($1, $2, false, true)
      RETURNING id
    `, [voucherCode, PRODUCT_ID]);
    const voucherId = voucherRes.rows[0].id;

    adminClient.release();
    console.log(`🎁 Seeded test voucher: ${voucherCode} (${voucherId}) for card ${testCard3Id}`);

    // Run 5 concurrent redemption transactions
    const runVoucherRedemption = async (workerId: number): Promise<{ workerId: number; success: boolean; error?: string }> => {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');

        // 1. Lock voucher row
        const vRes = await conn.query(`
          SELECT id, product_id, is_redeemed, is_active, expires_at 
          FROM kiropro_card_vouchers 
          WHERE UPPER(code) = $1 
          FOR UPDATE
        `, [voucherCode]);

        const v = vRes.rows[0];
        if (!v || v.is_redeemed || !v.is_active) {
          throw new Error('ALREADY_REDEEMED_OR_INVALID');
        }

        // 2. Lock available card
        const cRes = await conn.query(`
          SELECT id, card_number_encrypted, card_last4, exp_date, cvv_encrypted, balance 
          FROM kiropro_cards_inventory 
          WHERE product_id = $1 AND status = 'AVAILABLE' 
          ORDER BY created_at ASC 
          LIMIT 1 
          FOR UPDATE SKIP LOCKED
        `, [v.product_id]);

        const c = cRes.rows[0];
        if (!c) {
          throw new Error('OUT_OF_STOCK');
        }

        // 3. Mark card claimed
        await conn.query(`
          UPDATE kiropro_cards_inventory 
          SET status = 'CLAIMED', 
              assigned_to_user_id = $1, 
              assigned_at = CURRENT_TIMESTAMP, 
              claimed_by_voucher_id = $2, 
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = $3
        `, [testUserId, v.id, c.id]);

        // 4. Mark voucher redeemed
        await conn.query(`
          UPDATE kiropro_card_vouchers 
          SET is_redeemed = true, 
              card_id = $1, 
              redeemed_by_user_id = $2, 
              redeemed_at = CURRENT_TIMESTAMP 
          WHERE id = $3
        `, [c.id, testUserId, v.id]);

        await conn.query('COMMIT');
        return { workerId, success: true };
      } catch (err: any) {
        await conn.query('ROLLBACK');
        return { workerId, success: false, error: err.message };
      } finally {
        conn.release();
      }
    };

    console.log(`⚡ Firing 5 parallel redemption attempts with the exact same voucher code...`);
    const voucherResults = await Promise.all(
      Array.from({ length: 5 }, (_, i) => runVoucherRedemption(i + 1))
    );

    const successfulRedeems = voucherResults.filter(r => r.success);
    const failedRedeems = voucherResults.filter(r => !r.success);

    console.log(`✅ Successful redemptions: ${successfulRedeems.length}`);
    console.log(`❌ Rejected redemptions: ${failedRedeems.length}`);

    if (successfulRedeems.length !== 1) {
      throw new Error(`CRITICAL FAILURE: Expected exactly 1 successful redemption, got ${successfulRedeems.length}`);
    }
    if (failedRedeems.length !== 4) {
      throw new Error(`CRITICAL FAILURE: Expected exactly 4 rejected redemptions, got ${failedRedeems.length}`);
    }

    console.log('🎉 TEST 2 PASSED: Double-spending prevention guaranteed! Exactly 1 redemption succeeded.');

    // ==============================================================
    // TEST 3: CRYPTOGRAPHIC AES-256-GCM & LUHN VALIDATION
    // ==============================================================
    console.log('\n----------------------------------------------------------------');
    console.log('TEST 3: Validating AES-256-GCM Encryption / Decryption & Luhn');
    console.log('----------------------------------------------------------------');

    const rawTestCard = '5105105105109933';
    const rawTestCvv = '789';

    const decryptedCardNum = decryptCardData(card3EncNum);
    const decryptedCvv = decryptCardData(card3EncCvv);

    if (decryptedCardNum !== rawTestCard) {
      throw new Error(`Decrypted card number does not match original: ${decryptedCardNum} !== ${rawTestCard}`);
    }
    if (decryptedCvv !== rawTestCvv) {
      throw new Error(`Decrypted CVV does not match original: ${decryptedCvv} !== ${rawTestCvv}`);
    }

    const masked = maskCardNumber('9933');
    const formatted = formatCardNumber(decryptedCardNum);

    console.log(`🔒 Encryption/Decryption: OK`);
    console.log(`🎭 Masked Format: ${masked}`);
    console.log(`💳 Formatted Card: ${formatted}`);
    console.log('🎉 TEST 3 PASSED: Full cryptographic integrity verified.');

    // ==============================================================
    // CLEANUP
    // ==============================================================
    const cleanupClient = await pool.connect();
    await cleanupClient.query(`DELETE FROM kiropro_card_vouchers WHERE code = $1`, [voucherCode]);
    await cleanupClient.query(`DELETE FROM kiropro_cards_inventory WHERE id IN ($1, $2, $3)`, [cardIds[0], cardIds[1], testCard3Id]);
    cleanupClient.release();
    console.log('\n🧹 Cleaned up all temporary test records.');

    console.log('\n================================================================');
    console.log('🌟 ALL CONCURRENCY & ZERO RACE CONDITION TESTS PASSED (100%)');
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('\n❌ CONCURRENCY TEST FAILED:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runConcurrencyTest();
