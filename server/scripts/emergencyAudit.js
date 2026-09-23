const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runEmergencyAudit() {
  const client = await pool.connect();
  try {
    console.log('\n=== [1] AUDIT ACTIVE BANS IN user_bans ===');
    const banRes = await client.query(`
      SELECT id, scope, user_id, ip_address, device_id, reason, status, expires_at, created_at
      FROM "user_bans"
      WHERE status = 'ACTIVE'
    `);
    console.log('Active bans count:', banRes.rows.length);
    console.table(banRes.rows);

    console.log('\n=== [2] AUDIT ALL REFERRAL_BONUS TRANSACTIONS ===');
    const bonusRes = await client.query(`
      SELECT 
        wt.id as transaction_id,
        w."userId" as user_id,
        u.email,
        u.name,
        u."emailVerified",
        wt.amount,
        wt.currency,
        wt.description,
        wt."referenceType",
        wt."referenceId",
        wt."createdAt" as tx_time,
        w.balance as current_wallet_balance,
        u.referral_code,
        u.referred_by_id
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE wt.type = 'REFERRAL_BONUS'
      ORDER BY wt."createdAt" DESC
    `);
    console.log('Total REFERRAL_BONUS transactions:', bonusRes.rows.length);
    console.table(bonusRes.rows);

    console.log('\n=== [3] AUDIT ALL REFERRALS TABLE ENTRIES ===');
    const refTableRes = await client.query(`
      SELECT * FROM "referrals" ORDER BY created_at DESC
    `);
    console.log('Total referrals table entries:', refTableRes.rows.length);
    console.table(refTableRes.rows);

    console.log('\n=== [4] DETECT USERS WITH MULTIPLE REFERRAL_BONUS TRANSACTIONS ===');
    const dupRes = await client.query(`
      SELECT 
        w."userId",
        u.email,
        u."emailVerified",
        COUNT(*) as bonus_count,
        SUM(wt.amount) as total_bonus,
        w.balance as current_balance
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE wt.type = 'REFERRAL_BONUS'
      GROUP BY w."userId", u.email, u."emailVerified", w.balance
      ORDER BY bonus_count DESC
    `);
    console.table(dupRes.rows);

    console.log('\n=== [5] ALL USERS WITH WALLET BALANCE >= 1000 SDG ===');
    const richUsers = await client.query(`
      SELECT 
        u.id, u.email, u.name, u."emailVerified", w.balance, w.currency,
        (SELECT COUNT(*) FROM "WalletTransaction" wt WHERE wt."walletId" = w.id AND wt.type = 'REFERRAL_BONUS') as ref_bonus_tx_count,
        (SELECT COUNT(*) FROM "Order" o WHERE o."userId" = u.id) as orders_count
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE w.balance >= 1000
      ORDER BY w.balance DESC
    `);
    console.table(richUsers.rows);

  } catch (err) {
    console.error('Emergency audit error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runEmergencyAudit();
