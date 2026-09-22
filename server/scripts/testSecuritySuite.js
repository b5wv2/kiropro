const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

// Import services from compiled dist
const {
  extractClientInfo,
  generateDeviceId,
  isValidDeviceId,
  maskDeviceId,
  parseBrowser,
  parseOS,
  parseDeviceType,
  extractClientIp
} = require('../dist/services/clientInfoService');

const {
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  closeSession,
  getUserSessions
} = require('../dist/services/sessionService');

const {
  checkBan,
  createBan,
  revokeBan,
  getUserBans,
  expireOverdueBans,
  isAccountBanned
} = require('../dist/services/banService');

const {
  logSecurityEvent,
  querySecurityEvents,
  sanitizeMetadata
} = require('../dist/services/securityEventService');

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

async function runSecuritySuite() {
  console.log('====================================================');
  console.log('🚀 Starting Comprehensive KIROPRO Security Test Suite');
  console.log('====================================================');

  const testEmail = `sec_test_${Date.now()}@kiropro.store`;
  const testPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(testPassword, 10);
  const testUserId = crypto.randomUUID();

  // Admin user for testing admin actions
  const adminRes = await pool.query(`SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1`);
  const adminId = adminRes.rows[0]?.id || testUserId;

  try {
    // Setup test user
    await pool.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", role, "emailVerified", "preferred_currency") 
       VALUES ($1, $2, 'Security Tester', $3, 'CUSTOMER', true, 'SDG')`,
      [testUserId, testEmail, passwordHash]
    );

    // 1. Device ID is created (cryptographically random dvc_...)
    const generatedDvc = generateDeviceId();
    assert(isValidDeviceId(generatedDvc), '1. Device ID is cryptographically random and valid format');
    assert(maskDeviceId(generatedDvc).includes('...'), '2. Device ID masking works properly for UI display');

    // 2. MAC / IMEI collection check: verify no hardware collection calls exist
    const rawClientServiceCode = require('fs').readFileSync(require('path').join(__dirname, '../src/services/clientInfoService.ts'), 'utf8');
    assert(!rawClientServiceCode.includes('getMac') && !rawClientServiceCode.includes('getImei') && !rawClientServiceCode.includes('node-mac') && !rawClientServiceCode.includes('systeminformation'), '3. Privacy check: MAC / IMEI / hardware collection libraries are not used');

    // 3. User-Agent & Browser/OS parsing
    const sampleChromeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const browserParsed = parseBrowser(sampleChromeUa);
    const osParsed = parseOS(sampleChromeUa);
    const devTypeParsed = parseDeviceType(sampleChromeUa);
    assert(browserParsed.name === 'Chrome', '4. Browser parsing correctly identifies Chrome');
    assert(osParsed.name.includes('Windows'), '5. OS parsing correctly identifies Windows');
    assert(devTypeParsed === 'Desktop', '6. Device type parsing identifies Desktop');

    // 4. IP & Railway proxy extraction
    const mockReq = {
      ip: '196.29.167.45',
      headers: {
        'x-forwarded-for': '196.29.167.45, 10.0.0.1',
        'user-agent': sampleChromeUa
      }
    };
    const clientInfo = extractClientInfo(mockReq);
    assert(clientInfo.ip === '196.29.167.45', '7. Client IP extraction extracts leftmost client IP behind proxy');

    // 5. LOGIN_SUCCESS creates session & logs event
    const sessionId = await createSession({
      userId: testUserId,
      clientInfo,
      loginMethod: 'PASSWORD'
    });
    assert(sessionId && sessionId.startsWith('ses_'), '8. LOGIN_SUCCESS creates session record in database');

    const sessionCheck = await validateSession(sessionId);
    assert(sessionCheck.valid && sessionCheck.status === 'ACTIVE', '9. Newly created session is ACTIVE and valid');

    // 6. LOGIN_FAILED creates security event
    await logSecurityEvent({
      userId: testUserId,
      eventType: 'LOGIN_FAILED',
      ipAddress: clientInfo.ip,
      deviceId: clientInfo.deviceId,
      userAgent: clientInfo.userAgent,
      metadata: { reason: 'INVALID_CREDENTIALS', test: true }
    });

    const failedEvents = await querySecurityEvents({ userId: testUserId, eventType: 'LOGIN_FAILED' });
    assert(failedEvents.total >= 1, '10. LOGIN_FAILED creates security event in security_events table');

    // 7. Secrets are NOT written to logs (sanitization)
    const dirtyMeta = {
      password: 'SuperSecretPassword',
      user_token: 'jwt_raw_secret',
      otp_code: '123456',
      safe_data: 'allowed_info'
    };
    const cleanedMeta = sanitizeMetadata(dirtyMeta);
    assert(!cleanedMeta.password && !cleanedMeta.user_token && !cleanedMeta.otp_code, '11. Secrets (password, token, OTP) are stripped from metadata');
    assert(cleanedMeta.safe_data === 'allowed_info', '12. Non-sensitive metadata fields are preserved');

    // 8. LOGOUT closes session
    await closeSession(sessionId);
    const afterLogoutCheck = await validateSession(sessionId);
    assert(!afterLogoutCheck.valid && afterLogoutCheck.status === 'LOGGED_OUT', '13. LOGOUT sets status to LOGGED_OUT and invalidates server-side session');

    // 9. Create fresh session and test Admin single session revocation
    const session2Id = await createSession({ userId: testUserId, clientInfo, loginMethod: 'PASSWORD' });
    assert((await validateSession(session2Id)).valid, '14. Second session created successfully');

    const revokedSingle = await revokeSession(session2Id, adminId, 'ADMIN_TEST_REVOKE');
    assert(revokedSingle === true, '15. Admin single session revocation returns true');
    const afterRevokeCheck = await validateSession(session2Id);
    assert(!afterRevokeCheck.valid && afterRevokeCheck.status === 'REVOKED', '16. Revoked session is rejected server-side with status REVOKED');

    // 10. Admin revoke all sessions
    const session3A = await createSession({ userId: testUserId, clientInfo, loginMethod: 'PASSWORD' });
    const session3B = await createSession({ userId: testUserId, clientInfo, loginMethod: 'PASSWORD' });
    const countRevoked = await revokeAllUserSessions(testUserId, adminId, 'ADMIN_TEST_REVOKE_ALL');
    assert(countRevoked >= 2, '17. Admin revoke all sessions invalidates all active sessions');
    assert(!(await validateSession(session3A)).valid, '18. First multi-session is invalidated');
    assert(!(await validateSession(session3B)).valid, '19. Second multi-session is invalidated');

    // 11. Create Ban & verify active sessions revoked immediately
    const sessionBeforeBan = await createSession({ userId: testUserId, clientInfo, loginMethod: 'PASSWORD' });
    const banRecord = await createBan({
      userId: testUserId,
      ip: clientInfo.ip,
      deviceId: clientInfo.deviceId,
      scope: 'ACCOUNT_IP_DEVICE',
      reason: 'Violation of Terms Test',
      createdBy: adminId,
      durationHours: null // Permanent
    });
    assert(banRecord && banRecord.status === 'ACTIVE', '20. Ban record created successfully in user_bans');

    const sessionAfterBanCheck = await validateSession(sessionBeforeBan);
    assert(!sessionAfterBanCheck.valid && sessionAfterBanCheck.status === 'REVOKED', '21. Ban immediately revokes all active user sessions');

    // 12. Banned account cannot login / is detected
    const accountBanCheck = await checkBan({ userId: testUserId, ip: clientInfo.ip, deviceId: clientInfo.deviceId });
    assert(accountBanCheck.isBanned === true, '22. Banned account is detected by checkBan');
    assert(await isAccountBanned(testUserId) === true, '23. isAccountBanned returns true');

    // 13. BAN_CREATED was logged
    const banCreatedEvents = await querySecurityEvents({ userId: testUserId, eventType: 'BAN_CREATED' });
    assert(banCreatedEvents.total >= 1, '24. BAN_CREATED security event logged in security_events');

    // 14. Unban (Revoke Ban)
    const unbanRecord = await revokeBan({
      banId: banRecord.id,
      revokedBy: adminId,
      revokeReason: 'Resolved Dispute Test'
    });
    assert(unbanRecord.status === 'REVOKED', '25. Ban record updated to REVOKED upon unban');

    const accountCheckAfterUnban = await checkBan({ userId: testUserId, ip: clientInfo.ip, deviceId: clientInfo.deviceId });
    assert(accountCheckAfterUnban.isBanned === false, '26. Unban allows user access again');

    // 15. Important Rule: Old sessions remain revoked after unban!
    const oldSessionPostUnban = await validateSession(sessionBeforeBan);
    assert(!oldSessionPostUnban.valid && oldSessionPostUnban.status === 'REVOKED', '27. Critical: Old sessions remain REVOKED after unban (user must re-login)');

    // 16. Temporary ban auto-expires without admin intervention
    const tempBan = await createBan({
      userId: testUserId,
      scope: 'ACCOUNT',
      reason: 'Temporary Ban Test',
      createdBy: adminId,
      durationHours: 1
    });
    assert(tempBan.expires_at !== null, '28. Temporary ban sets expires_at');

    // Simulate expiration by setting expires_at to 5 minutes ago in DB
    await pool.query(`UPDATE "user_bans" SET expires_at = NOW() - INTERVAL '5 minutes' WHERE id = $1`, [tempBan.id]);
    await expireOverdueBans();

    const checkExpiredBan = await checkBan({ userId: testUserId });
    assert(checkExpiredBan.isBanned === false, '29. Temporary ban auto-expires and user is no longer blocked');

    const expiredBanEvents = await querySecurityEvents({ userId: testUserId, eventType: 'BAN_EXPIRED' });
    assert(expiredBanEvents.total >= 1, '30. BAN_EXPIRED event logged automatically upon expiry');

    console.log('\n====================================================');
    console.log(`🎉 ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  } finally {
    // Clean up test records
    try {
      await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
    } catch {}
    await pool.end();
  }
}

runSecuritySuite();
