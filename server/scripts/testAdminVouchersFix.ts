import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../src/db';
import { JWT_SECRET } from '../src/config';
import adminVouchersRouter from '../src/routes/adminVouchers';

async function runTestSuite() {
  console.log('=== [TEST SUITE] Admin Vouchers PATCH & Validation ===\n');

  // 1. Setup Express app on ephemeral port
  const app = express();
  app.use(express.json());
  app.use('/api/admin/vouchers', adminVouchersRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api/admin/vouchers`;
  console.log(`[Setup] Test server running at ${baseUrl}`);

  try {
    // 2. Identify or create Admin and Regular User for Auth testing
    let adminUser = (await pool.query(`SELECT id, email, role FROM "User" WHERE role = 'ADMIN' LIMIT 1`)).rows[0];
    if (!adminUser) {
      const res = await pool.query(`
        INSERT INTO "User" (id, email, password, role, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), 'test_admin_suite@kiropro.com', 'hashed_pwd', 'ADMIN', NOW(), NOW())
        RETURNING id, email, role
      `);
      adminUser = res.rows[0];
      console.log(`[Setup] Created temporary admin user: ${adminUser.id}`);
    } else {
      console.log(`[Setup] Using existing admin user: ${adminUser.id} (${adminUser.email})`);
    }

    let regularUser = (await pool.query(`SELECT id, email, role FROM "User" WHERE role = 'CUSTOMER' LIMIT 1`)).rows[0];
    if (!regularUser) {
      const res = await pool.query(`
        INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), 'test_user_suite@kiropro.com', 'hashed_pwd', 'CUSTOMER', NOW(), NOW())
        RETURNING id, email, role
      `);
      regularUser = res.rows[0];
      console.log(`[Setup] Created temporary regular user: ${regularUser.id}`);
    } else {
      console.log(`[Setup] Using existing regular user: ${regularUser.id} (${regularUser.email})`);
    }

    const adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: 'ADMIN' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const userToken = jwt.sign(
      { id: regularUser.id, email: regularUser.email, role: 'CUSTOMER' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 3. Locate target voucher
    const targetVoucherId = '589ab8bc-f3e6-4a4b-b0e2-7f3fbb1936c7';
    const originalRes = await pool.query(
      `SELECT * FROM g2bulk_voucher_catalog WHERE id = $1::uuid`,
      [targetVoucherId]
    );

    if (originalRes.rows.length === 0) {
      throw new Error(`Target voucher ${targetVoucherId} not found in database.`);
    }

    const originalVoucher = originalRes.rows[0];
    console.log(`[Setup] Found target test voucher: ${originalVoucher.id} ("${originalVoucher.title}")\n`);

    let passedTests = 0;
    const totalTests = 6;

    // --- TEST 1: Unauthorized user rejection ---
    console.log('--- Test 1: Reject unauthorized or non-admin user ---');
    const unauthRes = await fetch(`${baseUrl}/${targetVoucherId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerPriceUsd: 2.0 })
    });
    console.log(`- Without token status: ${unauthRes.status} (expected: 401)`);

    const regularUserRes = await fetch(`${baseUrl}/${targetVoucherId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ customerPriceUsd: 2.0 })
    });
    console.log(`- Regular user token status: ${regularUserRes.status} (expected: 403)`);

    if (unauthRes.status === 401 && regularUserRes.status === 403) {
      console.log('✓ TEST 1 PASSED: Unauthorized users are strictly rejected.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 1 FAILED');
    }

    // --- TEST 2: Reject invalid identifier ---
    console.log('--- Test 2: Reject invalid identifier ---');
    const invalidIdRes = await fetch(`${baseUrl}/invalid-id-xyz-123!`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ customerPriceUsd: 2.0 })
    });
    const invalidIdBody = await invalidIdRes.json();
    console.log(`- Invalid ID response: ${invalidIdRes.status}`, invalidIdBody);

    if (invalidIdRes.status === 400 && invalidIdBody.error === 'معرف البطاقة غير صالح.') {
      console.log('✓ TEST 2 PASSED: Invalid identifier rejected with 400 Bad Request.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 2 FAILED');
    }

    // --- TEST 3: Handle non-existent voucher ---
    console.log('--- Test 3: Handle non-existent voucher ---');
    const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
    const nonExistentRes = await fetch(`${baseUrl}/${nonExistentUuid}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ customerPriceUsd: 2.0 })
    });
    const nonExistentBody = await nonExistentRes.json();
    console.log(`- Non-existent UUID response: ${nonExistentRes.status}`, nonExistentBody);

    if (nonExistentRes.status === 404 && nonExistentBody.error === 'فئة البطاقة غير موجودة.') {
      console.log('✓ TEST 3 PASSED: Non-existent voucher returns 404 Not Found.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 3 FAILED');
    }

    // --- TEST 4: Modify allowed fields & save ---
    console.log('--- Test 4: Modify allowed fields & save (Fixes previously failing query) ---');
    const testUpdatePayload = {
      customerPriceUsd: 1.35,
      isActive: true,
      arabicTitle: '1 دولار ماسات فري فاير (تجريبي)'
    };

    const updateRes = await fetch(`${baseUrl}/${targetVoucherId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(testUpdatePayload)
    });

    const updateBody = await updateRes.json();
    console.log(`- Update response status: ${updateRes.status}`, updateBody.message);

    if (updateRes.status === 200 && updateBody.success === true) {
      console.log('✓ TEST 4 PASSED: Allowed fields updated successfully without SQL error.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 4 FAILED:', updateBody);
    }

    // --- TEST 5: Refetch voucher & verify persistence ---
    console.log('--- Test 5: Refetch voucher & verify persistence ---');
    const fetchRes = await fetch(`${baseUrl}/${targetVoucherId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const fetchBody = await fetchRes.json();
    console.log('- Fetched voucher data:', {
      id: fetchBody.product?.id,
      price: fetchBody.product?.customer_price_usd,
      isActive: fetchBody.product?.is_active,
      arabicTitle: fetchBody.product?.arabic_title
    });

    if (
      fetchRes.status === 200 &&
      Number(fetchBody.product?.customer_price_usd) === 1.35 &&
      fetchBody.product?.is_active === true &&
      fetchBody.product?.arabic_title === '1 دولار ماسات فري فاير (تجريبي)'
    ) {
      console.log('✓ TEST 5 PASSED: Re-fetched voucher confirms persisted changes.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 5 FAILED');
    }

    // --- TEST 6: Preserve unprovided fields ---
    console.log('--- Test 6: Preserve fields that were not sent in the update payload ---');
    const partialUpdatePayload = {
      arabicTitle: '1 دولار فري فاير محدث'
    };

    const partialRes = await fetch(`${baseUrl}/${targetVoucherId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(partialUpdatePayload)
    });

    const partialBody = await partialRes.json();
    const updatedProd = partialBody.product;

    console.log('- After partial update:', {
      arabicTitle: updatedProd?.arabic_title,
      customerPriceUsd: updatedProd?.customer_price_usd,
      isActive: updatedProd?.is_active
    });

    if (
      partialRes.status === 200 &&
      updatedProd?.arabic_title === '1 دولار فري فاير محدث' &&
      Number(updatedProd?.customer_price_usd) === 1.35 && // Retained previous value!
      updatedProd?.is_active === true // Retained previous value!
    ) {
      console.log('✓ TEST 6 PASSED: Unprovided fields remained completely intact.\n');
      passedTests++;
    } else {
      console.error('✗ TEST 6 FAILED');
    }

    // --- CLEANUP: Restore original voucher values ---
    console.log('--- Clean Up: Restoring original voucher values ---');
    await pool.query(
      `UPDATE g2bulk_voucher_catalog 
       SET customer_price_usd = $1, is_active = $2, custom_image_url = $3, arabic_title = $4, updated_at = NOW()
       WHERE id = $5::uuid`,
      [
        originalVoucher.customer_price_usd,
        originalVoucher.is_active,
        originalVoucher.custom_image_url,
        originalVoucher.arabic_title,
        targetVoucherId
      ]
    );
    console.log('✓ Clean up complete. Original database state restored.');

    console.log(`\n========================================`);
    console.log(`ALL TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
    console.log(`========================================\n`);

    server.close();
    process.exit(passedTests === totalTests ? 0 : 1);
  } catch (err: any) {
    console.error('Test Suite encountered an error:', err);
    server.close();
    process.exit(1);
  }
}

runTestSuite();
