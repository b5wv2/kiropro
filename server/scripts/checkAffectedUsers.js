const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkTxs() {
  const res = await pool.query(`
    SELECT wt.id, u.email, wt.amount, wt.currency, wt.type, wt."balanceBefore", wt."balanceAfter", wt.description, wt."createdAt"
    FROM "WalletTransaction" wt
    JOIN "Wallet" w ON wt."walletId" = w.id
    JOIN "User" u ON w."userId" = u.id
    WHERE u.email IN ('aly257093@hotmail.com', 'ays0999090498@hotmail.com', 'b29878587@gmail.com')
    ORDER BY u.email, wt."createdAt" ASC
  `);
  console.log('=== TRANSACTIONS FOR THE 3 AFFECTED USERS ===');
  console.log(JSON.stringify(res.rows, null, 2));

  // Also check orders placed by these 3 users
  const orders = await pool.query(`
    SELECT o.id, u.email, o.amount, o.status, o."orderType", o."packageName", o."createdAt"
    FROM "Order" o
    JOIN "User" u ON o."userId" = u.id
    WHERE u.email IN ('aly257093@hotmail.com', 'ays0999090498@hotmail.com', 'b29878587@gmail.com')
  `);
  console.log('=== ORDERS FOR THE 3 USERS ===');
  console.log(JSON.stringify(orders.rows, null, 2));

  await pool.end();
}
checkTxs();
