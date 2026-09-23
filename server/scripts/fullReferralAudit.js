const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function auditAllReferralBonuses() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        wt.id as transaction_id,
        u.id as user_id,
        u.email,
        u.name,
        u."emailVerified",
        wt.amount,
        wt.currency,
        wt.description,
        wt."balanceBefore",
        wt."balanceAfter",
        wt."referenceType",
        wt."referenceId",
        wt."createdAt" as created_at,
        u.referral_code as user_referral_code,
        u.referred_by_id,
        r.id as referral_id,
        r.referrer_id,
        ur.email as referrer_email,
        ur.name as referrer_name,
        r.referee_id,
        r.referee_reward_paid,
        r.referee_reward_paid_at,
        r.referrer_reward_paid,
        r.referrer_reward_paid_at,
        r.qualifying_order_id,
        r.status as referral_status,
        w.balance as current_wallet_balance
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      LEFT JOIN "referrals" r ON (r.referee_id = u.id OR r.id::text = wt."referenceId"::text)
      LEFT JOIN "User" ur ON r.referrer_id = ur.id
      WHERE wt.type = 'REFERRAL_BONUS'
      ORDER BY wt."createdAt" ASC
    `);

    console.log(`TOTAL REFERRAL_BONUS TRANSACTIONS FOUND: ${res.rows.length}`);
    res.rows.forEach((row, i) => {
      console.log(`\n--- [#${i+1}] Transaction: ${row.transaction_id} ---`);
      console.log(`User: ${row.email} (ID: ${row.user_id}) | Verified: ${row.emailVerified}`);
      console.log(`Amount: ${row.amount} ${row.currency} | Description: ${row.description}`);
      console.log(`Balance Before: ${row.balanceBefore} -> After: ${row.balanceAfter} (Current Wallet: ${row.current_wallet_balance})`);
      console.log(`Tx Date: ${new Date(row.created_at).toISOString()}`);
      console.log(`Referral Code: ${row.user_referral_code} | Referred By: ${row.referrer_email || 'NONE'}`);
      console.log(`Referral Record ID: ${row.referral_id} | Status: ${row.referral_status}`);
      console.log(`Referee Reward Paid: ${row.referee_reward_paid} (at: ${row.referee_reward_paid_at})`);
      console.log(`Referrer Reward Paid: ${row.referrer_reward_paid} | Qualifying Order: ${row.qualifying_order_id || 'NONE'}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

auditAllReferralBonuses();
