import jwt from 'jsonwebtoken';
import { pool } from '../src/db.js';
import { JWT_SECRET, getAuthCookieOptions } from '../src/config.js';
import { createSession, validateSession } from '../src/services/sessionService.js';

async function testHttpEndpointsLocally() {
  console.log('========================================================');
  console.log('1. PREPARE VALID SESSION & TOKEN FOR ADMIN');
  console.log('========================================================');

  const adminRes = await pool.query('SELECT id, email, role FROM "User" WHERE role = \'ADMIN\' LIMIT 1');
  if (adminRes.rows.length === 0) {
    console.error('No admin found!');
    return;
  }
  const admin = adminRes.rows[0];

  const testSessionId = await createSession({
    userId: admin.id,
    clientInfo: {
      ip: '127.0.0.1',
      deviceId: 'local_http_test_device',
      userAgent: 'NodeFetch/1.0',
      browser: 'Chrome',
      browserVersion: '120.0',
      os: 'Windows',
      osVersion: '10',
      deviceType: 'Desktop',
      language: 'ar-SA',
      timezone: 'Africa/Khartoum'
    },
    loginMethod: 'PASSWORD'
  });

  const validToken = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, sessionId: testSessionId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  console.log('Admin session created:', testSessionId.substring(0, 10) + '...');
  console.log('Token created with JWT_SECRET length:', JWT_SECRET.length);

  console.log('\n========================================================');
  console.log('2. TEST GET /api/auth/me - CASE A: NO COOKIE / NO HEADER');
  console.log('========================================================');
  const resNoAuth = await fetch('http://localhost:5000/api/auth/me');
  console.log('Status without auth:', resNoAuth.status);
  const bodyNoAuth = await resNoAuth.json();
  console.log('Response body without auth:', bodyNoAuth);

  console.log('\n========================================================');
  console.log('3. TEST GET /api/auth/me - CASE B: WITH VALID COOKIE');
  console.log('========================================================');
  const resWithCookie = await fetch('http://localhost:5000/api/auth/me', {
    headers: {
      'Cookie': `token=${validToken}`,
      'Origin': 'http://localhost:5173'
    }
  });
  console.log('Status with Cookie token:', resWithCookie.status);
  const bodyWithCookie = await resWithCookie.json();
  console.log('Response body with Cookie user.role:', bodyWithCookie.user?.role);
  console.log('Response body with Cookie user.email verified:', bodyWithCookie.user?.emailVerified);
  console.log('Response body has user object:', Boolean(bodyWithCookie.user));

  console.log('\n========================================================');
  console.log('4. TEST GET /api/auth/me - CASE C: WITH BEARER HEADER');
  console.log('========================================================');
  const resWithBearer = await fetch('http://localhost:5000/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${validToken}`,
      'Origin': 'http://localhost:5173'
    }
  });
  console.log('Status with Bearer header:', resWithBearer.status);
  const bodyWithBearer = await resWithBearer.json();
  console.log('Response body with Bearer has user:', Boolean(bodyWithBearer.user));

  console.log('\n========================================================');
  console.log('5. TEST GET /api/auth/me - CASE D: INVALID/EXPIRED/WRONG-SECRET TOKEN');
  console.log('========================================================');
  const wrongSecretToken = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    'completely_wrong_secret_for_test'
  );
  const resWrongSecret = await fetch('http://localhost:5000/api/auth/me', {
    headers: {
      'Cookie': `token=${wrongSecretToken}`,
      'Origin': 'http://localhost:5173'
    }
  });
  console.log('Status with wrong-secret token:', resWrongSecret.status);
  const bodyWrongSecret = await resWrongSecret.json();
  console.log('Response body with wrong-secret token:', bodyWrongSecret);

  console.log('\n========================================================');
  console.log('6. TEST GET /api/topups - WITH VALID COOKIE');
  console.log('========================================================');
  const resTopupsValid = await fetch('http://localhost:5000/api/topups', {
    headers: {
      'Cookie': `token=${validToken}`,
      'Origin': 'http://localhost:5173'
    }
  });
  console.log('Status /api/topups with valid cookie:', resTopupsValid.status);
  const bodyTopupsValid = await resTopupsValid.json();
  console.log('/api/topups returns array?:', Array.isArray(bodyTopupsValid));

  console.log('\n========================================================');
  console.log('7. TEST GET /api/topups - WITH WRONG SECRET TOKEN');
  console.log('========================================================');
  const resTopupsWrong = await fetch('http://localhost:5000/api/topups', {
    headers: {
      'Cookie': `token=${wrongSecretToken}`,
      'Origin': 'http://localhost:5173'
    }
  });
  console.log('Status /api/topups with wrong secret:', resTopupsWrong.status);
  const bodyTopupsWrong = await resTopupsWrong.json();
  console.log('Response body /api/topups with wrong secret:', bodyTopupsWrong);

  // Clean up test session
  await pool.query('DELETE FROM "user_sessions" WHERE session_id = $1', [testSessionId]);
  console.log('\nTest session cleaned up.');
  await pool.end();
}

testHttpEndpointsLocally().catch(console.error);
