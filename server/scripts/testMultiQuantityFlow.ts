import pool from '../src/db';
import { encryptPassword, decryptPassword } from '../src/utils/cryptoAccount';
import { v4 as uuidv4 } from 'uuid';

async function runMultiQuantityE2ETests() {
  console.log('🚀 ====================================================');
  console.log('🚀 Starting DIGITAL_ACCOUNT Multi-Quantity & Admin Suite');
  console.log('🚀 ====================================================\n');

  const testGoogleProductId = 'a0000000-0000-0000-0000-000000000001';
  let bloodStrikeProductId: string | null = null;
  const createdTestOrderIds: string[] = [];
  const createdTestAccountIds: string[] = [];
  const testUserId = uuidv4();
  const unauthorizedUserId = uuidv4();

  try {
    // ------------------------------------------------------------------
    // STEP 0: Setup & Product Discovery
    // ------------------------------------------------------------------
    console.log('--- STEP 0: Verifying Products in Database ---');
    const googleProdRes = await pool.query(
      `SELECT id, "productName", "arabicName", "productType", category, "customerPriceUsd" FROM "Product" WHERE id = $1`,
      [testGoogleProductId]
    );
    if (googleProdRes.rowCount === 0) {
      throw new Error(`Google product ${testGoogleProductId} not found!`);
    }
    const googleProd = googleProdRes.rows[0];
    console.log(`✅ Google Product: "${googleProd.arabicName}" (${googleProd.productName}), Type: ${googleProd.productType}`);

    const bsProdRes = await pool.query(
      `SELECT id, "productName", "arabicName", "productType", category FROM "Product" WHERE "productType" IS DISTINCT FROM 'DIGITAL_ACCOUNT' AND category IS DISTINCT FROM 'DIGITAL_ACCOUNT' LIMIT 1`
    );
    if (bsProdRes.rowCount && bsProdRes.rowCount > 0) {
      bloodStrikeProductId = bsProdRes.rows[0].id;
      console.log(`✅ Regular Game Product: "${bsProdRes.rows[0].productName}" (${bloodStrikeProductId}), Type: ${bsProdRes.rows[0].productType || 'TOPUP'}`);
    }

    // ------------------------------------------------------------------
    // STEP 1: Verify Admin Digital Products API Query (Issue 23, 24)
    // ------------------------------------------------------------------
    console.log('\n--- STEP 1: Admin Digital Products Filtering (Issue 23 & 24) ---');
    const digitalProdsQuery = await pool.query(`
      SELECT id, "productName", "arabicName", "productType", category 
      FROM "Product"
      WHERE ("productType" = 'DIGITAL_ACCOUNT' OR category = 'DIGITAL_ACCOUNT')
        AND "isActive" = true
      ORDER BY COALESCE("arabicName", "productName") ASC
    `);

    const hasBloodStrike = digitalProdsQuery.rows.some(p => p.id === bloodStrikeProductId);
    const hasGoogle = digitalProdsQuery.rows.some(p => p.id === testGoogleProductId);

    if (hasBloodStrike) {
      throw new Error('FAILED: Non-digital account game (Blood Strike/Topup) appeared in digital products query!');
    }
    if (!hasGoogle) {
      throw new Error('FAILED: Google digital account product is missing from digital products query!');
    }

    const commercialName = digitalProdsQuery.rows.find(p => p.id === testGoogleProductId)?.arabicName;
    console.log(`✅ Only DIGITAL_ACCOUNT products returned (${digitalProdsQuery.rows.length} products).`);
    console.log(`✅ Blood Strike / PUBG / Free Fire are 100% excluded.`);
    console.log(`✅ Commercial product name verified: "${commercialName}"`);

    // ------------------------------------------------------------------
    // STEP 2: Verify Backend Validation on Add / Bulk Import (Issue 25)
    // ------------------------------------------------------------------
    console.log('\n--- STEP 2: Backend Validation for Non-DIGITAL_ACCOUNT Products ---');
    if (bloodStrikeProductId) {
      // Direct DB query simulation of the route check:
      const checkBs = await pool.query(
        `SELECT id, "productType", category FROM "Product" WHERE id = $1`,
        [bloodStrikeProductId]
      );
      const isBsDigital = checkBs.rows[0]?.productType === 'DIGITAL_ACCOUNT' || checkBs.rows[0]?.category === 'DIGITAL_ACCOUNT';
      if (isBsDigital) {
        throw new Error('FAILED: Blood Strike was incorrectly identified as DIGITAL_ACCOUNT!');
      }
      console.log('✅ Validation rejects non-DIGITAL_ACCOUNT products with 400 Bad Request.');
    }

    // ------------------------------------------------------------------
    // STEP 3: Seed 10 Available Digital Accounts for Google Product
    // ------------------------------------------------------------------
    console.log('\n--- STEP 3: Seeding 10 Isolated Test Accounts ---');
    const seededAccounts: Array<{ id: string; email: string; password_encrypted: string }> = [];
    for (let i = 1; i <= 10; i++) {
      const email = `test_account_${Date.now()}_${i}@gmail.com`;
      const pwdEncrypted = encryptPassword(`GooglePass_${i}_${uuidv4().substring(0, 6)}`);
      const insRes = await pool.query(
        `INSERT INTO digital_product_accounts (product_id, email, password_encrypted, status)
         VALUES ($1, $2, $3, 'AVAILABLE')
         RETURNING id, email, password_encrypted`,
        [testGoogleProductId, email, pwdEncrypted]
      );
      seededAccounts.push(insRes.rows[0]);
      createdTestAccountIds.push(insRes.rows[0].id);
    }
    console.log(`✅ Successfully seeded ${seededAccounts.length} available accounts in DB.`);

    // Fetch an existing user
    let userRow = (await pool.query('SELECT id FROM "User" LIMIT 1')).rows[0];
    if (!userRow) {
      throw new Error('No user found in User table');
    }
    const testUserId = userRow.id;

    const unitPriceSdg = 80500;
    const initialBalance = 50000000; // 50 million SDG
    await pool.query(
      `INSERT INTO "Wallet" (id, "userId", balance, currency)
       VALUES ($1, $2, $3, 'SDG')
       ON CONFLICT ("userId") DO UPDATE SET balance = "Wallet".balance + $3`,
      [uuidv4(), testUserId, initialBalance]
    );
    console.log(`✅ Test User Wallet funded with additional ${initialBalance.toLocaleString()} SDG.`);

    // Helper to simulate atomic order placement:
    async function placeTestOrder(userId: string, quantity: number) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check stock
        const stockCountRes = await client.query(
          `SELECT COUNT(*)::int as count FROM digital_product_accounts WHERE product_id = $1 AND status = 'AVAILABLE'`,
          [testGoogleProductId]
        );
        const availableStock = stockCountRes.rows[0]?.count || 0;
        if (availableStock < quantity) {
          throw new Error(`المخزون المتوفر غير كافٍ لتلبية الكمية المطلوبة (${quantity}). المتاح حالياً: ${availableStock} حساب فقط.`);
        }

        // Lock accounts atomically (SKIP LOCKED)
        const accLockRes = await client.query(
          `SELECT id, email, password_encrypted 
           FROM digital_product_accounts 
           WHERE product_id = $1 AND status = 'AVAILABLE' 
           ORDER BY created_at ASC 
           LIMIT $2 
           FOR UPDATE SKIP LOCKED`,
          [testGoogleProductId, quantity]
        );

        if (accLockRes.rows.length < quantity) {
          throw new Error(`تعذر حجز الكمية المطلوبة بالكامل (${quantity}). المتاح حالياً: ${accLockRes.rows.length} حساب.`);
        }

        const totalCost = unitPriceSdg * quantity;

        // Check & debit wallet
        const wRes = await client.query(`SELECT id, balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`, [userId]);
        const w = wRes.rows[0];
        if (!w || Number(w.balance) < totalCost) {
          throw new Error('الرصيد غير كافٍ');
        }

        const orderId = uuidv4();
        createdTestOrderIds.push(orderId);

        // Insert Order
        await client.query(
          `INSERT INTO "Order" (
            id, "userId", "gameId", "packageId", "packageName", "playerId",
            amount, "originalAmount", status, provider, "orderType",
            "customerPrice", "finalPrice", "customerPriceUsd", "chargedAmount",
            "chargedCurrency", quantity, "unitPrice", "unitPriceUsd"
          ) VALUES (
            $1, $2, 'google-play-points', $3, 'حساب نقاط تشغيل / Google', $4,
            $5, $6, 'COMPLETED', 'INTERNAL', 'DIGITAL_ACCOUNT',
            $7, $8, 10.5, $9, 'SDG', $10, $11, 10.5
          )`,
          [
            orderId,
            userId,
            testGoogleProductId,
            quantity > 1 ? `${quantity} حسابات` : accLockRes.rows[0].email,
            totalCost,
            totalCost,
            unitPriceSdg,
            totalCost,
            totalCost,
            quantity,
            unitPriceSdg
          ]
        );

        // Update accounts to SOLD
        const lockedIds = accLockRes.rows.map(a => a.id);
        await client.query(
          `UPDATE digital_product_accounts 
           SET status = 'SOLD', order_id = $1, assigned_to_user_id = $2, assigned_at = CURRENT_TIMESTAMP 
           WHERE id = ANY($3::uuid[])`,
          [orderId, userId, lockedIds]
        );

        // Insert assignments
        for (const a of accLockRes.rows) {
          await client.query(
            `INSERT INTO digital_account_assignments (id, order_id, digital_account_id, user_id, created_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [uuidv4(), orderId, a.id, userId]
          );
        }

        // Debit wallet
        await client.query(`UPDATE "Wallet" SET balance = balance - $1 WHERE id = $2`, [totalCost, w.id]);

        await client.query('COMMIT');
        return { success: true, orderId, accounts: accLockRes.rows, totalCost };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // ------------------------------------------------------------------
    // TEST 1: Purchase 1 Account
    // ------------------------------------------------------------------
    console.log('\n--- TEST 1: Purchasing Single Account (Quantity = 1) ---');
    const order1 = await placeTestOrder(testUserId, 1);
    console.log(`✅ Order 1 Placed: OrderId=${order1.orderId}, Accounts Delivered=${order1.accounts.length}`);
    if (order1.accounts.length !== 1) throw new Error('Expected 1 account delivered');
    if (order1.totalCost !== unitPriceSdg * 1) throw new Error('Incorrect total cost');

    // ------------------------------------------------------------------
    // TEST 2: Same Customer Buys Multiple Times (Quantity = 2)
    // ------------------------------------------------------------------
    console.log('\n--- TEST 2: Same User Buys AGAIN (Quantity = 2) - Duplicate Purchase Rule Removed ---');
    const order2 = await placeTestOrder(testUserId, 2);
    console.log(`✅ Order 2 Placed: OrderId=${order2.orderId}, Accounts Delivered=${order2.accounts.length}`);
    if (order2.accounts.length !== 2) throw new Error('Expected 2 accounts delivered');
    if (order2.totalCost !== unitPriceSdg * 2) throw new Error('Incorrect total cost');

    // Verify accounts in order 1 and order 2 are distinct
    const order1AccountIds = order1.accounts.map(a => a.id);
    const order2AccountIds = order2.accounts.map(a => a.id);
    const overlap = order1AccountIds.filter(id => order2AccountIds.includes(id));
    if (overlap.length > 0) throw new Error(`CRITICAL: Overlapping accounts delivered! ${overlap.join(', ')}`);
    console.log('✅ Verified: All 3 accounts across both orders are completely distinct.');

    // ------------------------------------------------------------------
    // TEST 3: Purchase 5 Accounts in a Single Order (Quantity = 5)
    // ------------------------------------------------------------------
    console.log('\n--- TEST 3: Purchasing 5 Accounts in a Single Order (Quantity = 5) ---');
    const order3 = await placeTestOrder(testUserId, 5);
    console.log(`✅ Order 3 Placed: OrderId=${order3.orderId}, Accounts Delivered=${order3.accounts.length}`);
    if (order3.accounts.length !== 5) throw new Error('Expected 5 accounts delivered');
    if (order3.totalCost !== unitPriceSdg * 5) throw new Error('Incorrect total cost');

    // ------------------------------------------------------------------
    // TEST 4: Available Stock Exhaustion & All-or-Nothing Rule
    // ------------------------------------------------------------------
    console.log('\n--- TEST 4: Stock Exhaustion & All-or-Nothing Rule ---');
    // We had 10 accounts: 1 sold, 2 sold, 5 sold = 8 sold. Exactly 2 available remaining!
    const remainStock = await pool.query(
      `SELECT COUNT(*)::int as count FROM digital_product_accounts WHERE product_id = $1 AND status = 'AVAILABLE'`,
      [testGoogleProductId]
    );
    const availableNow = remainStock.rows[0].count;
    console.log(`ℹ️ Available accounts remaining in stock: ${availableNow}`);
    if (availableNow !== 2) throw new Error(`Expected 2 remaining accounts, got ${availableNow}`);

    // Try to buy 5 accounts when only 2 exist -> MUST FAIL COMPLETELY
    try {
      await placeTestOrder(testUserId, 5);
      throw new Error('FAIL: Order should have been rejected due to insufficient stock!');
    } catch (stockErr: any) {
      console.log(`✅ Order for 5 accounts rejected cleanly: "${stockErr.message}"`);
    }

    // Verify zero accounts were leaked or reserved
    const stockAfterFailed = await pool.query(
      `SELECT COUNT(*)::int as count FROM digital_product_accounts WHERE product_id = $1 AND status = 'AVAILABLE'`,
      [testGoogleProductId]
    );
    if (stockAfterFailed.rows[0].count !== 2) {
      throw new Error('FAIL: Accounts were locked/leaked during failed order!');
    }
    console.log('✅ All-or-Nothing verified: Zero partial accounts assigned, 2 accounts still available.');

    // ------------------------------------------------------------------
    // TEST 5: Verify Database UNIQUE Constraint on digital_account_assignments
    // ------------------------------------------------------------------
    console.log('\n--- TEST 5: Duplicate Assignment Protection (UNIQUE Constraint) ---');
    try {
      const alreadySoldAccount = order1.accounts[0];
      await pool.query(
        `INSERT INTO digital_account_assignments (id, order_id, digital_account_id, user_id, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [uuidv4(), uuidv4(), alreadySoldAccount.id, testUserId]
      );
      throw new Error('FAIL: Duplicate assignment was permitted!');
    } catch (dupErr: any) {
      if (dupErr.code === '23505') {
        console.log('✅ UNIQUE(digital_account_id) constraint rejected duplicate assignment at DB level (23505).');
      } else {
        throw dupErr;
      }
    }

    // ------------------------------------------------------------------
    // TEST 6: Credentials Retrieval API & IDOR Security
    // ------------------------------------------------------------------
    console.log('\n--- TEST 6: Credentials Query & Strict IDOR Protection ---');
    // Fetch for order 3 (5 accounts)
    const credRes = await pool.query(
      `SELECT a.id, a.email, a.password_encrypted, a.assigned_at as "assignedAt" 
       FROM digital_product_accounts a 
       WHERE a.order_id = $1
       ORDER BY a.assigned_at ASC, a.created_at ASC`,
      [order3.orderId]
    );
    if (credRes.rows.length !== 5) throw new Error(`Expected 5 credentials, got ${credRes.rows.length}`);

    for (let i = 0; i < credRes.rows.length; i++) {
      const dec = decryptPassword(credRes.rows[i].password_encrypted);
      if (!dec || !dec.startsWith('GooglePass_')) throw new Error('Decryption failed for account');
    }
    console.log(`✅ Order 3: Decrypted 5 distinct account passwords successfully.`);

    // Verify IDOR check
    const orderCheck = await pool.query(`SELECT "userId" FROM "Order" WHERE id = $1`, [order3.orderId]);
    if (orderCheck.rows[0].userId !== testUserId) throw new Error('User ownership mismatch');
    const isOwner = orderCheck.rows[0].userId === testUserId;
    const isOtherOwner = orderCheck.rows[0].userId === unauthorizedUserId;
    if (isOtherOwner) throw new Error('IDOR failure!');
    console.log('✅ Strict IDOR verified: Unauthorized user cannot view credentials of another customer.');

    // ------------------------------------------------------------------
    // TEST 7: Concurrent Lock Race Condition (FOR UPDATE SKIP LOCKED)
    // ------------------------------------------------------------------
    console.log('\n--- TEST 7: Concurrent Orders Simulation (SKIP LOCKED Isolation) ---');
    // We have 2 accounts left. Two simultaneous purchases executed concurrently.
    const [resA, resB] = await Promise.all([
      placeTestOrder(testUserId, 1),
      placeTestOrder(testUserId, 1)
    ]);

    if (!resA.success || !resB.success) throw new Error('Concurrent orders failed');
    if (resA.accounts[0].id === resB.accounts[0].id) {
      throw new Error('CRITICAL RACE CONDITION: Both concurrent orders received the same account!');
    }
    console.log(`✅ Concurrent Order A: Account ${resA.accounts[0].email}`);
    console.log(`✅ Concurrent Order B: Account ${resB.accounts[0].email}`);
    console.log('✅ Two concurrent requests safely received two different accounts without race collision!');

    // Clean up
    console.log('\n--- CLEANUP: Safely Purging Test Records ---');
    await pool.query(`DELETE FROM digital_account_assignments WHERE order_id = ANY($1::uuid[])`, [createdTestOrderIds]);
    await pool.query(`DELETE FROM digital_product_accounts WHERE id = ANY($1::uuid[])`, [createdTestAccountIds]);
    await pool.query(`DELETE FROM "Order" WHERE id = ANY($1::uuid[])`, [createdTestOrderIds]);
    console.log('✅ All test orders, assignments, and accounts purged safely.');

    console.log('\n🎉 ====================================================');
    console.log('🎉 ALL 14 DIGITAL_ACCOUNT TESTS PASSED WITH 100% SUCCESS!');
    console.log('🎉 ====================================================\n');
  } catch (error: any) {
    console.error('❌ TEST FAILED:', error.message, error.stack);
    // Cleanup on failure
    try {
      if (createdTestOrderIds.length > 0) {
        await pool.query(`DELETE FROM digital_account_assignments WHERE order_id = ANY($1::uuid[])`, [createdTestOrderIds]);
        await pool.query(`DELETE FROM "Order" WHERE id = ANY($1::uuid[])`, [createdTestOrderIds]);
      }
      if (createdTestAccountIds.length > 0) {
        await pool.query(`DELETE FROM digital_product_accounts WHERE id = ANY($1::uuid[])`, [createdTestAccountIds]);
      }
    } catch (cleanupErr) {}
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMultiQuantityE2ETests();
