const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkNoWallet() {
  const res = await pool.query(`
    SELECT u.id, u.email, u.name, u.role, u."createdAt" 
    FROM "User" u 
    LEFT JOIN "Wallet" w ON u.id = w."userId" 
    WHERE w.id IS NULL
  `);
  console.log('Users without wallet:', res.rows);
  await pool.end();
}
checkNoWallet();
