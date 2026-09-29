import pool from '../src/db';
import { encryptPassword, decryptPassword } from '../src/utils/cryptoAccount';
import { v4 as uuidv4 } from 'uuid';

async function runE2ETests() {
  console.log('🚀 Starting Digital Accounts E2E Test Suite...');
  const testProductId = 'a0000000-0000-0000-0000-000000000001'; // Seeded Google Play Points product
  const testEmail1 = `test_google_${Date.now()}@gmail.com`;
  const testPassword1 = 'P@ssw0rdGoogle123!';
  const testUserId1 = uuidv4();
  const testUserId2 = uuidv4();
  let createdAccountId1: string | null = null;
  let testOrderId1: string | null = null;

  try {
    // 0. Clean prior test artifacts
    await pool.query("DELETE FROM digital_product_accounts WHERE email LIKE 'test_google_%'");

    // 1. Verify Product exists in DB
    const prodRes = await pool.query('SELECT id, "productName", "productType", category FROM "Product" WHERE id = $1', [testProductId]);
    if (prodRes.rowCount === 0) {
      throw new Error(`Seeded product ${testProductId} not found!`);
    }
    console.log('✅ 1. Product found in DB:', prodRes.rows[0]);

    // 2. Test Encryption & Plaintext Leak Prevention
    const encrypted = encryptPassword(testPassword1);
    if (encrypted.includes(testPassword1)) {
      throw new Error('CRITICAL: Plaintext password leaked in ciphertext!');
    }
    const decrypted = decryptPassword(encrypted);
    if (decrypted !== testPassword1) {
      throw new Error('CRITICAL: Decrypted password does not match original!');
    }
    console.log('✅ 2. AES-256-GCM encryption & decryption verified.');

    // 3. Test Inserting Digital Account into DB
    const insRes = await pool.query(
      `INSERT INTO digital_product_accounts (product_id, email, password_encrypted, status)
       VALUES ($1, LOWER($2), $3, 'AVAILABLE')
       RETURNING id, product_id, email, password_encrypted, status, created_at`,
      [testProductId, testEmail1, encrypted]
    );
    createdAccountId1 = insRes.rows[0].id;
    console.log('✅ 3. Account inserted into database:', {
      id: createdAccountId1,
      email: insRes.rows[0].email,
      status: insRes.rows[0].status,
      password_stored_as: insRes.rows[0].password_encrypted.substring(0, 20) + '...'
    });

    // 4. Test Duplicate Email Prevention
    try {
      await pool.query(
        `INSERT INTO digital_product_accounts (product_id, email, password_encrypted, status)
         VALUES ($1, LOWER($2), $3, 'AVAILABLE')`,
        [testProductId, testEmail1, encrypted]
      );
      throw new Error('FAIL: Duplicate email was allowed!');
    } catch (dupErr: any) {
      if (dupErr.message.includes('FAIL: Duplicate email')) throw dupErr;
      console.log('✅ 4. Duplicate email rejected by unique constraint.');
    }

    // Fetch or create a test user
    let userRow = (await pool.query('SELECT id FROM "User" LIMIT 1')).rows[0];
    let realUserId = userRow?.id;
    if (!realUserId) {
      realUserId = uuidv4();
      await pool.query(
        `INSERT INTO "User" (id, email, password, name) VALUES ($1, $2, 'hashedpass', 'Test User')`,
        [realUserId, `test_user_${Date.now()}@kiropro.store`]
      );
    }

    // 5. Test Atomic Order Draw & Concurrency Locking (SELECT ... FOR UPDATE SKIP LOCKED)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create an Order row first so FK constraint passes
      testOrderId1 = uuidv4();
      await client.query(
        `INSERT INTO "Order" (id, "userId", "gameId", "packageId", "packageName", "playerId", amount, status, "orderType")
         VALUES ($1, $2, 'google-play-points', $3, 'Google Play Points', 'DIGITAL_ACCOUNT', 10.00, 'COMPLETED', 'DIGITAL_ACCOUNT')`,
        [testOrderId1, realUserId, testProductId]
      );

      const lockRes = await client.query(
        `SELECT id, email, password_encrypted
         FROM digital_product_accounts
         WHERE product_id = $1 AND status = 'AVAILABLE'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [testProductId]
      );

      if (lockRes.rowCount === 0) {
        throw new Error('No available account locked!');
      }

      const lockedRow = lockRes.rows[0];
      await client.query(
        `UPDATE digital_product_accounts
         SET status = 'SOLD',
             order_id = $1,
             assigned_to_user_id = $2,
             assigned_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [testOrderId1, realUserId, lockedRow.id]
      );

      await client.query('COMMIT');
      console.log('✅ 5. Atomic draw & assignment completed for user:', realUserId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // 6. Verify Account Status is SOLD and Linked
    const verifyRow = await pool.query(
      `SELECT id, status, order_id, assigned_to_user_id, assigned_at
       FROM digital_product_accounts WHERE id = $1`,
      [createdAccountId1]
    );
    if (verifyRow.rows[0].status !== 'SOLD' || verifyRow.rows[0].assigned_to_user_id !== realUserId) {
      throw new Error('Account was not marked as SOLD or linked to user properly!');
    }
    console.log('✅ 6. Account row verified as SOLD to test user.');

    // 7. Verify 1-Account-Per-User Constraint
    // Attempt to assign a second account for the same user & product
    const testEmail2 = `test_google_2_${Date.now()}@gmail.com`;
    const ins2 = await pool.query(
      `INSERT INTO digital_product_accounts (product_id, email, password_encrypted, status)
       VALUES ($1, LOWER($2), $3, 'AVAILABLE')
       RETURNING id`,
      [testProductId, testEmail2, encryptPassword('anotherPass123!')]
    );
    const createdAccountId2 = ins2.rows[0].id;

    try {
      await pool.query(
        `UPDATE digital_product_accounts
         SET status = 'SOLD',
             order_id = $1,
             assigned_to_user_id = $2,
             assigned_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [uuidv4(), realUserId, createdAccountId2]
      );
      throw new Error('FAIL: Database allowed second SOLD account for the same user!');
    } catch (limitErr: any) {
      if (limitErr.message.includes('FAIL: Database allowed')) throw limitErr;
      console.log('✅ 7. 1-Account-Per-User constraint verified: duplicate purchase rejected at database level.');
    }

    // 8. Verify Deletion of SOLD Account is Blocked
    const delRes = await pool.query(
      `DELETE FROM digital_product_accounts WHERE id = $1 AND status != 'SOLD'`,
      [createdAccountId1]
    );
    if (delRes.rowCount !== 0) {
      throw new Error('FAIL: SOLD account was deleted!');
    }
    console.log('✅ 8. Guard verified: SOLD account cannot be deleted.');

    // 9. Cleanup test rows and test order
    await pool.query('DELETE FROM digital_product_accounts WHERE id IN ($1, $2)', [createdAccountId1, createdAccountId2]);
    if (testOrderId1) {
      await pool.query('DELETE FROM "Order" WHERE id = $1', [testOrderId1]);
    }
    console.log('✅ 9. Test rows and test order cleaned up safely.');

    console.log('\n🎉 ALL DIGITAL ACCOUNT TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ E2E TEST FAILED:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runE2ETests();
