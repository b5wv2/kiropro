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

const { checkBan, createBan, revokeBan, formatBanResponse } = require('../dist/services/banService');
const { createSession, validateSession } = require('../dist/services/sessionService');

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
  console.log('       KIROPRO BAN & AUTH EXPERIENCE TEST SUITE             ');
  console.log('============================================================\n');

  const testEmail = `ban_exp_${Date.now()}@kirotest.com`;
  const testUserId = uuidv4();
  const testPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(testPassword, 10);
  const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  const testDevice = `dvc_test_${Date.now()}`;

  try {
    // 1. Setup user
    await pool.query(
      'INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified", "preferred_currency") VALUES ($1, $2, $3, $4, $5, true, $6)',
      [testUserId, testEmail, 'مستخدم تجريبي للحظر', passwordHash, 'CUSTOMER', 'SDG']
    );
    await pool.query(
      'INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, 0, $3)',
      [uuidv4(), testUserId, 'SDG']
    );

    // 2. Normal check before ban
    const initialBan = await checkBan({ userId: testUserId, ip: testIp, deviceId: testDevice });
    assert(!initialBan.isBanned, '1. Clean user is not banned');

    // 3. Create active temporary ban
    const tempExpiry = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days
    const banRecord = await createBan({
      userId: testUserId,
      scope: 'ACCOUNT',
      reason: 'محاولات احتيالية متكررة',
      expiresAt: tempExpiry
    });
    assert(banRecord && banRecord.id, '2. Temporary ban created successfully');

    // 4. Test checkBan on temporary banned account
    const matchedBan = await checkBan({ userId: testUserId, ip: testIp, deviceId: testDevice });
    assert(matchedBan.isBanned === true, '3. Banned account is detected by checkBan');
    assert(matchedBan.matchedScope === 'ACCOUNT', '4. Matched scope is strictly ACCOUNT');
    assert(matchedBan.reason === 'محاولات احتيالية متكررة', '5. Reason matches ban record');

    // 5. Test formatBanResponse for login
    const loginBanResp = formatBanResponse(matchedBan, 'login');
    assert(loginBanResp.code === 'ACCOUNT_BANNED', '6. Formatted code is ACCOUNT_BANNED');
    assert(loginBanResp.message === 'تم حظر حسابك من قبل إدارة KIROPRO', '7. Message matches requested Arabic text');
    assert(loginBanResp.reason === 'محاولات احتيالية متكررة', '8. Reason is cleanly exposed in response');
    assert(loginBanResp.permanent === false, '9. Permanent is false for temporary ban');
    assert(loginBanResp.expiresAt !== null, '10. expiresAt is provided as ISO string');

    // 6. Security leakage check on loginBanResp
    assert(loginBanResp.banId === undefined, '11. banId is NOT leaked in client response');
    assert(loginBanResp.userId === undefined, '12. userId is NOT leaked in client response');
    assert(loginBanResp.ip === undefined, '13. IP is NOT leaked in client response');
    assert(loginBanResp.deviceId === undefined, '14. deviceId is NOT leaked in client response');
    assert(loginBanResp.createdBy === undefined, '15. createdBy/adminId is NOT leaked');

    // 7. Permanent Ban format check
    const permBanResult = {
      isBanned: true,
      matchedScope: 'ACCOUNT_IP_DEVICE',
      reason: 'سلوك مسيء وغير قانوني',
      expiresAt: null
    };
    const permResp = formatBanResponse(permBanResult, 'login');
    assert(permResp.code === 'ACCOUNT_IP_DEVICE_BANNED', '16. Permanent composite ban code is ACCOUNT_IP_DEVICE_BANNED');
    assert(permResp.permanent === true, '17. Permanent flag is true');
    assert(permResp.expiresAt === null, '18. expiresAt is null for permanent ban');

    // 8. Register blocked check (IP / Device ban)
    const regBanResult = {
      isBanned: true,
      matchedScope: 'DEVICE',
      reason: 'تم تقييد الجهاز بسبب عمليات احتيال',
      expiresAt: tempExpiry
    };
    const regResp = formatBanResponse(regBanResult, 'register');
    assert(regResp.code === 'DEVICE_BANNED', '19. Register restriction code is DEVICE_BANNED');
    assert(regResp.message === 'لا يمكنك إنشاء حساب حاليًا', '20. Register message matches requested Arabic text');
    assert(regResp.restrictionMessage === 'تم تقييد الوصول من قبل إدارة KIROPRO.', '21. Register restriction message matches');
    assert(regResp.reason === 'تم تقييد الجهاز بسبب عمليات احتيال', '22. Register reason included');

    // 9. Unban test
    await revokeBan({ banId: banRecord.id, revokeReason: 'موافقة الإدارة على رفع الحظر' });
    const unbannedCheck = await checkBan({ userId: testUserId, ip: testIp, deviceId: testDevice });
    assert(!unbannedCheck.isBanned, '23. Account is no longer banned after unban');

    // 10. Fresh session creation works after unban
    const newSessionId = await createSession({
      userId: testUserId,
      clientInfo: {
        ip: testIp,
        deviceId: testDevice,
        userAgent: 'Mozilla/5.0'
      }
    });
    assert(Boolean(newSessionId), '24. Fresh session created successfully after unban');

    const validated = await validateSession(newSessionId);
    assert(validated.valid === true, '25. New session is valid and active');

    console.log('\n============================================================');
    console.log(`🎉 ALL ${passedTests} / ${totalTests} BAN & AUTH TESTS PASSED!`);
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
  console.error('Fatal test error:', err);
  process.exit(1);
});
