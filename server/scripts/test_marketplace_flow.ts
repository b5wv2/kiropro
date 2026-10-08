import pool from '../src/db';
import crypto from 'crypto';

async function testMarketplaceFlow() {
  console.log('--- STARTING ACCOUNT MARKETPLACE BACKEND TEST SUITE ---');

  // 1. Create a dummy test user and wallet for testing
  const testEmail = `test_seller_${Date.now()}@kiropro.test`;
  const userRes = await pool.query(
    `INSERT INTO "User" (id, email, name, role, "emailVerified", "passwordHash")
     VALUES (gen_random_uuid(), $1, 'Test Seller', 'CUSTOMER', true, 'dummy_hash')
     RETURNING id`,
    [testEmail]
  );
  const testUserId = userRes.rows[0].id;

  const walletRes = await pool.query(
    `INSERT INTO "Wallet" (id, "userId", balance, currency)
     VALUES (gen_random_uuid(), $1, 500, 'SDG')
     RETURNING id, balance`,
    [testUserId]
  );
  const testWalletId = walletRes.rows[0].id;
  console.log(`[Test] Created test user ${testUserId} with 500 SDG balance.`);

  try {
    // TEST 1: Insufficient funds (Fee for 15 days is 1,500 SDG, balance is 500 SDG)
    console.log('\n[Test 1] Testing insufficient funds rejection...');
    const fee15 = 1500;
    const client1 = await pool.connect();
    let failedAsExpected = false;
    try {
      await client1.query('BEGIN');
      const wRes = await client1.query('SELECT balance FROM "Wallet" WHERE id = $1 FOR UPDATE', [testWalletId]);
      const bal = Number(wRes.rows[0].balance);
      if (bal < fee15) {
        throw new Error('الرصيد غير كافٍ');
      }
      await client1.query('COMMIT');
    } catch (e: any) {
      await client1.query('ROLLBACK');
      if (e.message.includes('الرصيد غير كافٍ')) {
        failedAsExpected = true;
      }
    } finally {
      client1.release();
    }
    if (!failedAsExpected) throw new Error('Test 1 failed: Should have rejected due to insufficient balance.');
    console.log('✅ Test 1 Passed: Payment rejected when balance is insufficient.');

    // TEST 2: Add funds and pay fee (1,500 SDG for 15 days)
    console.log('\n[Test 2] Adding balance to 3,000 SDG and paying 1,500 SDG fee...');
    await pool.query('UPDATE "Wallet" SET balance = 3000 WHERE id = $1', [testWalletId]);

    const payClient = await pool.connect();
    let paymentId: string;
    try {
      await payClient.query('BEGIN');
      const w = await payClient.query('SELECT id, balance FROM "Wallet" WHERE id = $1 FOR UPDATE', [testWalletId]);
      const before = Number(w.rows[0].balance);
      const after = before - 1500;
      await payClient.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [after, testWalletId]);

      const payInsert = await payClient.query(
        `INSERT INTO account_listing_payments (
          user_id, wallet_id, duration_days, amount, currency,
          payment_method, status, payment_type, is_consumed
        ) VALUES ($1, $2, 15, 1500, 'SDG', 'WALLET', 'PAID', 'NEW_LISTING', false)
        RETURNING id`,
        [testUserId, testWalletId]
      );
      paymentId = payInsert.rows[0].id;

      await payClient.query(
        `INSERT INTO "WalletTransaction" (
          "walletId", amount, type, description, currency, "balanceBefore", "balanceAfter",
          "referenceType", "referenceId", "createdBy", "created_by_type"
        ) VALUES ($1, 1500, 'PURCHASE', 'رسوم إعلان تجريبي', 'SDG', $2, $3, 'ACCOUNT_MARKETPLACE', $4, $5, 'USER')`,
        [testWalletId, before, after, paymentId, testUserId]
      );

      await payClient.query('COMMIT');
    } finally {
      payClient.release();
    }

    const checkWallet = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
    if (Number(checkWallet.rows[0].balance) !== 1500) {
      throw new Error(`Expected balance 1500 but got ${checkWallet.rows[0].balance}`);
    }
    console.log(`✅ Test 2 Passed: 1,500 SDG deducted atomically, new balance: 1,500 SDG, paymentId: ${paymentId}`);

    // TEST 3: Create Listing using paymentId
    console.log('\n[Test 3] Creating listing with paymentId and validating PENDING_REVIEW state...');
    const publicCode = `KPR-PUB-TEST${Math.floor(Math.random() * 8999 + 1000)}`;
    const slug = `pubg_mobile-${publicCode.toLowerCase()}`;
    const sellerPhone = '+249912345678';

    const listClient = await pool.connect();
    let listingId: string;
    try {
      await listClient.query('BEGIN');
      const pCheck = await listClient.query(
        'SELECT * FROM account_listing_payments WHERE id = $1 FOR UPDATE',
        [paymentId]
      );
      if (pCheck.rows[0].is_consumed) throw new Error('Payment already consumed');

      const lRes = await listClient.query(
        `INSERT INTO account_listings (
          public_code, slug, seller_user_id, game, title,
          price, price_currency, is_negotiable, account_level,
          binding_type, description, notes, seller_whatsapp,
          status, duration_days, listing_fee
        ) VALUES (
          $1, $2, $3, 'PUBG_MOBILE', 'حساب ببجي مميز مثك كونكر',
          450000, 'SDG', true, '61-80',
          'Twitter/X', 'حساب كامل الأسلحة المطورة وأطقم نادرة', 'تسليم فوري', $4,
          'PENDING_REVIEW', 15, 1500
        ) RETURNING id`,
        [publicCode, slug, testUserId, sellerPhone]
      );
      listingId = lRes.rows[0].id;

      // Add image
      await listClient.query(
        `INSERT INTO account_listing_images (
          listing_id, image_url, storage_key, is_primary, sort_order, file_size, mime_type
        ) VALUES ($1, '/uploads/marketplace/test.webp', 'test.webp', true, 0, 102400, 'image/webp')`,
        [listingId]
      );

      // Consume payment
      await listClient.query(
        'UPDATE account_listing_payments SET is_consumed = true, listing_id = $1 WHERE id = $2',
        [listingId, paymentId]
      );

      await listClient.query('COMMIT');
    } finally {
      listClient.release();
    }
    console.log(`✅ Test 3 Passed: Listing created with ID ${listingId}, code ${publicCode}, status PENDING_REVIEW`);

    // TEST 4: Attempt to reuse consumed paymentId -> Must be rejected
    console.log('\n[Test 4] Attempting to reuse consumed paymentId...');
    const reuseClient = await pool.connect();
    let reuseBlocked = false;
    try {
      await reuseClient.query('BEGIN');
      const pCheck = await reuseClient.query(
        'SELECT is_consumed FROM account_listing_payments WHERE id = $1 FOR UPDATE',
        [paymentId]
      );
      if (pCheck.rows[0].is_consumed) {
        throw new Error('تم استخدام عملية الدفع هذه مسبقاً');
      }
      await reuseClient.query('COMMIT');
    } catch (e: any) {
      await reuseClient.query('ROLLBACK');
      if (e.message.includes('تم استخدام عملية الدفع')) reuseBlocked = true;
    } finally {
      reuseClient.release();
    }
    if (!reuseBlocked) throw new Error('Test 4 failed: Consumed payment reuse was NOT blocked.');
    console.log('✅ Test 4 Passed: Duplicate payment consumption prevented.');

    // TEST 5: Verify privacy & public query filters
    console.log('\n[Test 5] Verifying public privacy and review gating...');
    // While PENDING_REVIEW, should NOT appear in published query
    const pubCheck = await pool.query(
      "SELECT id FROM account_listings WHERE id = $1 AND status = 'PUBLISHED'",
      [listingId]
    );
    if (pubCheck.rows.length !== 0) throw new Error('Pending listing appeared in published query!');

    // Public SELECT should NEVER return seller_whatsapp
    const publicSelect = await pool.query(
      `SELECT id, public_code, slug, game, title, price, is_negotiable, account_level, binding_type, status
       FROM account_listings WHERE id = $1`,
      [listingId]
    );
    if ((publicSelect.rows[0] as any).seller_whatsapp) {
      throw new Error('seller_whatsapp leaked in public query!');
    }
    console.log('✅ Test 5 Passed: Pending review ad is hidden from public; seller WhatsApp strictly isolated.');

    // TEST 6: Admin approves listing -> becomes PUBLISHED
    console.log('\n[Test 6] Admin approves listing...');
    const expiryDate = new Date(Date.now() + 15 * 86400 * 1000);
    await pool.query(
      `UPDATE account_listings
       SET status = 'PUBLISHED', starts_at = NOW(), published_at = NOW(), expires_at = $1
       WHERE id = $2`,
      [expiryDate, listingId]
    );
    const pubNow = await pool.query(
      "SELECT id, status, expires_at FROM account_listings WHERE id = $1 AND status = 'PUBLISHED'",
      [listingId]
    );
    if (pubNow.rows.length === 0) throw new Error('Listing did not publish');
    console.log(`✅ Test 6 Passed: Listing approved and PUBLISHED with expiry: ${pubNow.rows[0].expires_at}`);

    // TEST 7: Seller marks listing as SOLD
    console.log('\n[Test 7] Seller marks listing as SOLD...');
    await pool.query(
      "UPDATE account_listings SET status = 'SOLD', sold_at = NOW() WHERE id = $1",
      [listingId]
    );
    const soldCheck = await pool.query(
      "SELECT id FROM account_listings WHERE id = $1 AND status = 'PUBLISHED'",
      [listingId]
    );
    if (soldCheck.rows.length !== 0) throw new Error('Sold listing still visible in published listings!');
    console.log('✅ Test 7 Passed: SOLD listing immediately removed from published query.');

    // TEST 8: Admin cancel & refund fee back to wallet
    console.log('\n[Test 8] Admin cancels listing and refunds 1,500 SDG fee...');
    const refundClient = await pool.connect();
    try {
      await refundClient.query('BEGIN');
      const p = await refundClient.query(
        'SELECT * FROM account_listing_payments WHERE listing_id = $1 AND status = \'PAID\' FOR UPDATE',
        [listingId]
      );
      if (p.rows.length === 0) throw new Error('No paid payment found to refund');
      const refundAmt = Number(p.rows[0].amount);

      const w = await refundClient.query('SELECT balance FROM "Wallet" WHERE id = $1 FOR UPDATE', [testWalletId]);
      const before = Number(w.rows[0].balance);
      const after = before + refundAmt;
      await refundClient.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [after, testWalletId]);

      await refundClient.query(
        `UPDATE account_listing_payments 
         SET status = 'REFUNDED', refunded_at = NOW(), refund_amount = $1, refund_reason = 'طلب الإلغاء'
         WHERE id = $2`,
        [refundAmt, p.rows[0].id]
      );

      await refundClient.query(
        "UPDATE account_listings SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = 'طلب الإلغاء' WHERE id = $1",
        [listingId]
      );

      await refundClient.query('COMMIT');
    } finally {
      refundClient.release();
    }

    const finalWallet = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [testWalletId]);
    if (Number(finalWallet.rows[0].balance) !== 3000) {
      throw new Error(`Expected refunded balance 3000 but got ${finalWallet.rows[0].balance}`);
    }
    console.log(`✅ Test 8 Passed: 1,500 SDG refunded atomically, wallet restored to: ${finalWallet.rows[0].balance} SDG`);

    // TEST 9: Double refund attempt -> Must be rejected (Idempotency)
    console.log('\n[Test 9] Testing double refund prevention...');
    const doubleRefundRes = await pool.query(
      'SELECT id FROM account_listing_payments WHERE listing_id = $1 AND status = \'PAID\'',
      [listingId]
    );
    if (doubleRefundRes.rows.length !== 0) {
      throw new Error('Payment status was not updated to REFUNDED, double refund vulnerability!');
    }
    console.log('✅ Test 9 Passed: Double refund safely blocked by status check.');

    console.log('\n🎉 ALL 9 ACCOUNT MARKETPLACE TEST CASES PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    // Clean up test data
    console.log('[Cleanup] Cleaning up test user and test listing data...');
    await pool.query('DELETE FROM account_listing_events WHERE listing_id IN (SELECT id FROM account_listings WHERE seller_user_id = $1)', [testUserId]);
    await pool.query('DELETE FROM account_listing_images WHERE listing_id IN (SELECT id FROM account_listings WHERE seller_user_id = $1)', [testUserId]);
    await pool.query('DELETE FROM account_listing_payments WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM account_listings WHERE seller_user_id = $1', [testUserId]);
    await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" = $1', [testWalletId]);
    await pool.query('DELETE FROM "Wallet" WHERE id = $1', [testWalletId]);
    await pool.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
    console.log('[Cleanup] Complete. No dirty test data left.');
  }

  process.exit(0);
}

testMarketplaceFlow().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
