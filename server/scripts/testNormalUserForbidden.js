const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testRbac() {
  const customerToken = jwt.sign(
    { id: '11111111-1111-1111-1111-111111111111', email: 'customer@test.com', role: 'CUSTOMER' },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1h' }
  );

  const res1 = await fetch('http://localhost:5000/api/admin/security/events', {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  console.log('Customer accessing /api/admin/security/events status:', res1.status);
  if (res1.status !== 403) throw new Error('Expected 403 Forbidden for customer on admin security events');

  const res2 = await fetch('http://localhost:5000/api/admin/users/11111111-1111-1111-1111-111111111111/ban', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}` 
    },
    body: JSON.stringify({ reason: 'Hacking attempt' })
  });
  console.log('Customer accessing /api/admin/users/:id/ban status:', res2.status);
  if (res2.status !== 403) throw new Error('Expected 403 Forbidden for customer on ban endpoint');

  console.log('✅ RBAC check passed: Customers are strictly forbidden from all admin security actions (403).');
}

testRbac().catch(err => {
  console.error(err);
  process.exit(1);
});
