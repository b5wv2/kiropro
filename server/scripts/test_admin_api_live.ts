import pool from '../src/db.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config.js';

async function testLiveAdminApi() {
  // 1. Find admin user
  const adminRes = await pool.query(`SELECT id, email, role FROM "User" WHERE role = 'ADMIN' LIMIT 1`);
  if (adminRes.rows.length === 0) {
    console.error('No admin found in DB!');
    process.exit(1);
  }
  const admin = adminRes.rows[0];
  console.log('Testing with Admin user:', admin.email, 'ID:', admin.id);

  // 2. Generate Admin Token
  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const endpoints = [
    '/api/admin/kiropro-cards/stats',
    '/api/admin/kiropro-cards/inventory?page=1&limit=10',
    '/api/admin/kiropro-cards/settings',
    '/api/admin/kiropro-cards/vouchers?page=1&limit=10',
    '/api/products/admin/catalog?page=1&limit=10'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`http://localhost:5000${ep}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      const data = await res.json();
      console.log(`Endpoint: ${ep} -> Status: ${res.status}`, res.status === 200 ? 'SUCCESS' : data);
    } catch (err: any) {
      console.error(`Endpoint: ${ep} -> Network Error:`, err.message);
    }
  }

  process.exit(0);
}

testLiveAdminApi().catch(console.error);
