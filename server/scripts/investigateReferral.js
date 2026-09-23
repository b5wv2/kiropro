const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runInvestigation() {
  const client = await pool.connect();
  try {
    console.log('=== [TARGET USER: yasmineyoyi32@gmail.com] ===');
    const uRes = await client.query(`SELECT * FROM "User" WHERE LOWER(email) LIKE '%yasmine%'`);
    console.log('User:', JSON.stringify(uRes.rows[0], null, 2));

    const wRes = await client.query(`SELECT * FROM "Wallet" WHERE "userId" = $1`, [uRes.rows[0]?.id]);
    console.log('Wallet:', JSON.stringify(wRes.rows[0], null, 2));

    const txRes = await client.query(`SELECT * FROM "WalletTransaction" WHERE "walletId" = $1`, [wRes.rows[0]?.id]);
    console.log('WalletTransactions:', JSON.stringify(txRes.rows, null, 2));

    const otpRes = await client.query(`SELECT * FROM "email_verification_otps" WHERE user_id = $1`, [uRes.rows[0]?.id]);
    console.log('OTPs:', JSON.stringify(otpRes.rows, null, 2));

    const refRes = await client.query(`SELECT * FROM "referrals" WHERE referee_id = $1`, [uRes.rows[0]?.id]);
    console.log('Referral:', JSON.stringify(refRes.rows[0], null, 2));

    console.log('\n=== [REFERRER USER (Owner of KPPWYXSZ)] ===');
    const refUserRes = await client.query(`SELECT * FROM "User" WHERE UPPER(referral_code) LIKE 'KPPWY%' OR id = $1`, [refRes.rows[0]?.referrer_id]);
    console.log('Referrer User:', JSON.stringify(refUserRes.rows[0], null, 2));

    const refUserWalletRes = await client.query(`SELECT * FROM "Wallet" WHERE "userId" = $1`, [refUserRes.rows[0]?.id]);
    console.log('Referrer Wallet:', JSON.stringify(refUserWalletRes.rows[0], null, 2));

    console.log('\n=== [ORDERS BY ANY UNVERIFIED REFERRAL USER] ===');
    const ordersRes = await client.query(`
      SELECT id, "userId", status, amount, "finalPrice", "createdAt"
      FROM "Order"
      WHERE "userId" IN ($1, '85867b5f-5b47-43dc-bbc4-f07a18f54b85', 'e97efe39-127c-483f-ae6f-804a8eeeb7f1')
    `, [uRes.rows[0]?.id]);
    console.log('Orders found:', ordersRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runInvestigation();
