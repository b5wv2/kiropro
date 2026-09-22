const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

const { createBan, revokeBan } = require('../dist/services/banService');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ [PASS] ${message}`);
}

async function run() {
  console.log('\n============================================================');
  console.log('       KIROPRO HTTP ENDPOINT E2E TEST SUITE                 ');
  console.log('============================================================\n');

  const testEmail = `http_test_${Date.now()}@kirotest.com`;
  const testUserId = uuidv4();
  const testPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(testPassword, 10);
  const testDevice = `dvc_http_test_${Date.now()}`;

  try {
    // 1. Setup user in DB
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified", "preferred_currency") VALUES ($1, $2, $3, $4, $5, true, $6)',
      [testUserId, testEmail, 'عميل فحص HTTP', passwordHash, 'CUSTOMER', 'SDG']
    );
    await pool.query(
      'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, 0, $3)',
      [uuidv4(), testUserId, 'SDG']
    );

    // 2. Normal login test
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `kiro_dvc=${testDevice}`
      },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, '1. Normal user login returns 200 OK');
    assert(loginData.user && loginData.user.email === testEmail, '2. Login returns authenticated user');

    // 3. Invalid credentials test (wrong password)
    const wrongPassRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `kiro_dvc=${testDevice}`
      },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword999' })
    });
    const wrongPassData = await wrongPassRes.json();
    assert(wrongPassRes.status === 400, '3. Wrong password returns 400');
    assert(wrongPassData.error.includes('كلمة المرور غير صحيحة'), '4. Returns generic invalid credentials error');
    assert(wrongPassData.code === undefined, '5. Does not return ban code on wrong credentials');

    // 4. Ban account (Temporary)
    const tempExpiry = new Date(Date.now() + 5 * 24 * 3600 * 1000); // 5 days
    const banRecord = await createBan({
      userId: testUserId,
      scope: 'ACCOUNT',
      reason: 'سلوك احتيالي في عمليات الدفع',
      expiresAt: tempExpiry
    });
    assert(banRecord && banRecord.id, '6. Temporary ban applied successfully');

    // 5. Banned user login attempt
    const bannedLoginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `kiro_dvc=${testDevice}`
      },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const bannedData = await bannedLoginRes.json();
    assert(bannedLoginRes.status === 403, '7. Banned user login returns 403 Forbidden');
    assert(bannedData.code === 'ACCOUNT_BANNED', '8. Returns code ACCOUNT_BANNED');
    assert(bannedData.message === 'تم حظر حسابك من قبل إدارة KIROPRO', '9. Message matches Arabic specification');
    assert(bannedData.reason === 'سلوك احتيالي في عمليات الدفع', '10. Reason matches ban record');
    assert(bannedData.permanent === false, '11. permanent is false for temporary ban');
    assert(bannedData.expiresAt !== null, '12. expiresAt is provided');
    assert(bannedData.banId === undefined, '13. Internal banId is NOT leaked');
    assert(bannedData.userId === undefined, '14. Internal userId is NOT leaked');

    // 6. Device ban test on Registration
    const bannedDevice = `dvc_banned_reg_${Date.now()}`;
    await createBan({
      deviceId: bannedDevice,
      scope: 'DEVICE',
      reason: 'جهاز مرتبط بعمليات مشبوهة متعددة',
      expiresAt: null // Permanent
    });

    const regRes = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `kiro_dvc=${bannedDevice}`
      },
      body: JSON.stringify({
        name: 'عميل محظور',
        email: `banned_reg_${Date.now()}@kirotest.com`,
        password: 'Password123!',
        preferred_currency: 'SDG'
      })
    });
    const regData = await regRes.json();
    assert(regRes.status === 403, '15. Registration on banned device returns 403 Forbidden');
    assert(regData.code === 'DEVICE_BANNED', '16. Registration code is DEVICE_BANNED');
    assert(regData.message === 'لا يمكنك إنشاء حساب حاليًا', '17. Registration message matches specification');
    assert(regData.restrictionMessage === 'تم تقييد الوصول من قبل إدارة KIROPRO.', '18. restrictionMessage matches specification');
    assert(regData.reason === 'جهاز مرتبط بعمليات مشبوهة متعددة', '19. Registration ban reason included');
    assert(regData.permanent === true, '20. Registration permanent flag is true');

    // 7. Unban user test
    await revokeBan({ banId: banRecord.id, revokeReason: 'تم قبول التظلم' });

    const unbannedLoginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `kiro_dvc=${testDevice}`
      },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const unbannedLoginData = await unbannedLoginRes.json();
    assert(unbannedLoginRes.status === 200, '21. Login succeeds after unban');
    assert(unbannedLoginData.user && unbannedLoginData.user.id === testUserId, '22. Unbanned user receives valid session');

    // 8. Public settings / maintenance status check
    const settingsRes = await fetch('http://localhost:5000/api/settings/public');
    const settingsData = await settingsRes.json();
    assert(settingsRes.status === 200, '23. /api/settings/public returns 200 OK');
    assert(settingsData.maintenanceMode !== undefined, '24. maintenanceMode field exists in public settings');

    console.log('\n============================================================');
    console.log(`🎉 ALL ${passedTests} / ${totalTests} E2E HTTP TESTS PASSED!`);
    console.log('============================================================\n');
  } finally {
    // Cleanup
    await pool.query('DELETE FROM "user_sessions" WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM "user_bans" WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM "Wallet" WHERE "userId" = $1', [testUserId]);
    await pool.query('DELETE FROM "User" WHERE id = $1', [testUserId]);
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal E2E test error:', err);
  process.exit(1);
});
