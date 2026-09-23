const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function inspectReferralsAndBalances() {
  const client = await pool.connect();
  try {
    console.log('=== [1] INSPECT USER WITH 2000 SDG: nasir.x.7415963@gmail.com ===');
    const uRes = await client.query(`
      SELECT u.id, u.email, u.name, u."emailVerified", u.referral_code, u.referred_by_id, w.id as wallet_id, w.balance, w.currency
      FROM "User" u
      JOIN "Wallet" w ON u.id = w."userId"
      WHERE u.email = 'nasir.x.7415963@gmail.com'
    `);
    console.log('User info:', uRes.rows[0]);

    if (uRes.rows[0]) {
      const txs = await client.query(`
        SELECT * FROM "WalletTransaction"
        WHERE "walletId" = $1
        ORDER BY "createdAt" ASC
      `, [uRes.rows[0].wallet_id]);
      console.log('All transactions for 2000 SDG user:');
      console.table(txs.rows);

      const refs = await client.query(`
        SELECT * FROM "referrals"
        WHERE referrer_id = $1 OR referee_id = $1
      `, [uRes.rows[0].id]);
      console.log('Referrals for 2000 SDG user:');
      console.table(refs.rows);
    }

    console.log('\n=== [2] ALL USERS WITH balance = 1000 SDG WITHOUT ORDERS ===');
    const b1000 = await client.query(`
      SELECT 
        u.id, u.email, u.name, u."emailVerified", w.balance, w.id as wallet_id,
        (SELECT json_agg(wt.*) FROM "WalletTransaction" wt WHERE wt."walletId" = w.id) as transactions
      FROM "User" u
      JOIN "Wallet" w ON u.id = w."userId"
      WHERE w.balance = 1000
    `);
    for (const r of b1000.rows) {
      console.log(`\nUser: ${r.email} | Verified: ${r.emailVerified} | Balance: ${r.balance}`);
      if (r.transactions) {
        console.table(r.transactions.map(t => ({
          type: t.type,
          amount: t.amount,
          description: t.description,
          refType: t.referenceType,
          refId: t.referenceId,
          date: t.createdAt
        })));
      }
    }

    console.log('\n=== [3] ALL REFERRAL_BONUS TRANSACTIONS (TOTAL IN DB) ===');
    const allRefBonuses = await client.query(`
      SELECT 
        wt.id as transaction_id,
        u.id as user_id,
        u.email,
        u."emailVerified",
        wt.amount,
        wt.currency,
        wt.type,
        wt.description,
        wt."balanceBefore",
        wt."balanceAfter",
        wt."referenceType",
        wt."referenceId",
        wt."createdAt"
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE wt.type = 'REFERRAL_BONUS'
      ORDER BY wt."createdAt" ASC
    `);
    console.table(allRefBonuses.rows);

    console.log('\n=== [4] ALL REFERRALS TABLE ROWS ===');
    const allRefs = await client.query(`SELECT * FROM "referrals" ORDER BY created_at ASC`);
    console.table(allRefs.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

inspectReferralsAndBalances();
