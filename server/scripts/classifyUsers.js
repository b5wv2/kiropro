const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function inspectAllUsers() {
  const client = await pool.connect();
  try {
    const users = await client.query(`
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.role, 
        u."emailVerified",
        w.id as wallet_id,
        w.currency as wallet_currency, 
        w.balance as wallet_balance,
        u.preferred_currency,
        u."createdAt",
        (SELECT count(*) FROM "Order" WHERE "userId" = u.id) as order_count,
        (SELECT count(*) FROM "referrals" WHERE referrer_id = u.id OR referee_id = u.id) as referral_count,
        (SELECT count(*) FROM "WalletTransaction" wt JOIN "Wallet" w2 ON wt."walletId" = w2.id WHERE w2."userId" = u.id) as tx_count
      FROM "User" u
      LEFT JOIN "Wallet" w ON u.id = w."userId"
      ORDER BY u.role, w.currency, u."createdAt" ASC
    `);

    console.log(`TOTAL USERS IN SYSTEM: ${users.rows.length}\n`);
    users.rows.forEach((u, i) => {
      console.log(`[#${i+1}] [${u.role}] ${u.email} | Name: "${u.name || ''}" | Wallet: ${u.wallet_balance ?? 'NO_WALLET'} ${u.wallet_currency ?? 'NONE'} | Pref: ${u.preferred_currency} | Orders: ${u.order_count} | Txs: ${u.tx_count} | Created: ${u.createdAt.toISOString().slice(0,19)}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

inspectAllUsers();
