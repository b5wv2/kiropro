import jwt from 'jsonwebtoken';
import { pool } from '../src/db.js';
import { JWT_SECRET, getAuthCookieOptions } from '../src/config.js';
import { createSession, validateSession } from '../src/services/sessionService.js';
import { checkBan } from '../src/services/banService.js';

async function testFullAuth() {
  console.log('==============================================');
  console.log('DIAGNOSTIC SECTION D: ADMIN USER IN DB');
  console.log('==============================================');
  const adminRes = await pool.query(
    'SELECT id, email, role, "emailVerified", "passwordChangedAt", "is_super_admin", permissions FROM "User" WHERE role = \'ADMIN\''
  );
  console.log('Admin count in DB:', adminRes.rows.length);
  if (adminRes.rows.length === 0) {
    console.error('CRITICAL: No admin user found in database!');
    return;
  }
  const admin = adminRes.rows[0];
  console.log('Admin ID:', admin.id);
  console.log('Admin Role:', admin.role);
  console.log('Admin Email Verified:', admin.emailVerified);
  console.log('Admin has passwordChangedAt:', !!admin.passwordChangedAt, admin.passwordChangedAt);
  console.log('Admin is_super_admin:', admin.is_super_admin);
  console.log('Admin permissions:', admin.permissions);

  // Check ban status for admin
  const banStatus = await checkBan({ userId: admin.id });
  console.log('Admin is banned:', banStatus.isBanned);

  console.log('\n==============================================');
  console.log('DIAGNOSTIC SECTION B: TOKEN GENERATION & VALIDATION');
  console.log('==============================================');
  console.log('JWT_SECRET configured:', Boolean(JWT_SECRET));
  console.log('JWT_SECRET length:', JWT_SECRET.length);
  console.log('JWT_SECRET starts with quotes?:', JWT_SECRET.startsWith('"') || JWT_SECRET.startsWith("'"));

  // Check cookie options
  const cookieOpts = getAuthCookieOptions();
  console.log('getAuthCookieOptions():', cookieOpts);

  console.log('\n==============================================');
  console.log('DIAGNOSTIC SECTION C: DATABASE SESSION');
  console.log('==============================================');
  const mockClientInfo = {
    ip: '127.0.0.1',
    deviceId: 'dev_diagnostic_test',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DiagnosticTest/1.0',
    browser: 'Chrome',
    browserVersion: '120.0',
    os: 'Windows',
    osVersion: '10',
    deviceType: 'Desktop' as const,
    language: 'ar-SA',
    timezone: 'Africa/Khartoum'
  };

  console.log('Creating session for admin...');
  const testSessionId = await createSession({
    userId: admin.id,
    clientInfo: mockClientInfo,
    loginMethod: 'PASSWORD'
  });
  console.log('Session created with prefix:', testSessionId.substring(0, 10));

  console.log('Validating newly created session...');
  const sessionCheck = await validateSession(testSessionId);
  console.log('Session validation result:', sessionCheck);

  console.log('\n==============================================');
  console.log('DIAGNOSTIC SECTION A: TOKEN CREATION AND VERIFICATION');
  console.log('==============================================');
  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, sessionId: testSessionId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  console.log('Token generated successfully (first 15 chars):', token.substring(0, 15) + '...');

  // Now verify token as requireAuth would
  console.log('Verifying token with JWT_SECRET...');
  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
    console.log('jwt.verify succeeded. Decoded fields:', {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      sessionIdPrefix: decoded.sessionId?.substring(0, 10),
      iat: decoded.iat,
      exp: decoded.exp
    });
  } catch (err: any) {
    console.error('jwt.verify failed:', err.name, err.message);
  }

  // Simulate requireAuth logic step-by-step
  console.log('Simulating requireAuth full execution...');
  try {
    // 1. Session verification
    if (decoded.sessionId) {
      const sCheck = await validateSession(decoded.sessionId);
      if (!sCheck.valid) {
        throw new Error(`Session validation failed: ${sCheck.error}`);
      }
      console.log('Step 1 (Session check): PASSED');
    }

    // 2. Ban check
    if (decoded.id) {
      const bRes = await checkBan({ userId: decoded.id });
      if (bRes.isBanned) {
        throw new Error('User is banned');
      }
      console.log('Step 2 (Ban check): PASSED');
    }

    // 3. Password changed check & RBAC columns query
    if (decoded.id && decoded.iat) {
      const userRes = await pool.query(
        'SELECT "passwordChangedAt", is_super_admin, permissions FROM "User" WHERE id = $1',
        [decoded.id]
      );
      const uRow = userRes.rows[0];
      console.log('Step 3 (User query): PASSED. uRow:', {
        passwordChangedAt: uRow?.passwordChangedAt,
        is_super_admin: uRow?.is_super_admin,
        permissions: uRow?.permissions
      });

      if (uRow?.passwordChangedAt) {
        const pwdChangedSec = Math.floor(new Date(uRow.passwordChangedAt).getTime() / 1000);
        console.log('   iat:', decoded.iat, 'pwdChangedSec:', pwdChangedSec);
        if (decoded.iat < pwdChangedSec) {
          throw new Error('Password changed after token issuance');
        }
      }
      console.log('Step 3 (Password timestamp check): PASSED');
    }

    console.log('=== requireAuth simulation PASSED 100% ===');
  } catch (err: any) {
    console.error('requireAuth simulation FAILED with:', err.message);
  }

  // Clean up test session
  await pool.query('DELETE FROM "user_sessions" WHERE session_id = $1', [testSessionId]);
  console.log('Test session cleaned up.');

  await pool.end();
}

testFullAuth().catch(console.error);
