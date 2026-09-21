const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../dist/db').default || require('../dist/db').pool || require('../dist/db');

async function inspect() {
  try {
    console.log('--- 1. EXCHANGE RATE / PLATFORM SETTINGS ---');
    const allSettings = await pool.query('SELECT key, value, updated_at FROM "platform_settings"');
    for (const r of allSettings.rows) {
      console.log(`Key: [${r.key}]`, JSON.stringify(r.value));
    }

    console.log('\n--- 2. USERS BY ROLE ---');
    const usersCount = await pool.query('SELECT role, count(*) FROM "User" GROUP BY role');
    console.log(usersCount.rows);

    console.log('\n--- 3. WALLETS BY CURRENCY & ROLE ---');
    const walletsCount = await pool.query(`
      SELECT w.currency, u.role, count(*)::int as count, sum(w.balance)::numeric as total_balance 
      FROM "Wallet" w 
      JOIN "User" u ON w."userId" = u.id 
      GROUP BY w.currency, u.role
    `);
    console.log(walletsCount.rows);

    console.log('\n--- 4. DETAILED CUSTOMER WALLETS ---');
    const custWallets = await pool.query(`
      SELECT w.id as wallet_id, w."userId", u.email, u.name, u.role, w.balance, w.currency as wallet_currency, u.preferred_currency, u."createdAt"
      FROM "Wallet" w 
      JOIN "User" u ON w."userId" = u.id 
      WHERE u.role = 'CUSTOMER'
      ORDER BY w.balance DESC
    `);
    console.log(`Total Customer Wallets: ${custWallets.rows.length}`);
    console.log(JSON.stringify(custWallets.rows, null, 2));

    console.log('\n--- 5. TOPUPS & PENDING AMOUNTS ---');
    const topups = await pool.query(`
      SELECT status, currency, count(*)::int as count, sum(amount)::numeric as total_amount 
      FROM "TopupRequest" 
      GROUP BY status, currency
    `);
    console.log(topups.rows);

    const pendingTopups = await pool.query(`
      SELECT t.id, t."userId", u.email, t.amount, t.currency, t.status, t."createdAt"
      FROM "TopupRequest" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t.status = 'PENDING'
    `);
    console.log('Pending Topup Requests:', JSON.stringify(pendingTopups.rows, null, 2));

    console.log('\n--- 6. REFERRAL WALLET TRANSACTIONS ---');
    const refTx = await pool.query(`
      SELECT wt.type, wt.currency, wt."referenceType", count(*)::int as count, sum(wt.amount)::numeric as total_amount 
      FROM "WalletTransaction" wt
      WHERE wt.type LIKE '%REFERRAL%' OR wt."referenceType" = 'REFERRAL'
      GROUP BY wt.type, wt.currency, wt."referenceType"
    `);
    console.log(refTx.rows);

    const refTxDetails = await pool.query(`
      SELECT wt.id, wt."walletId", w."userId", u.email, wt.amount, wt.currency as tx_currency, w.currency as wallet_currency, wt."balanceBefore", wt."balanceAfter", wt.description, wt."createdAt"
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE wt.type LIKE '%REFERRAL%' OR wt."referenceType" = 'REFERRAL'
    `);
    console.log('Referral Transactions Detail:', JSON.stringify(refTxDetails.rows, null, 2));

    console.log('\n--- 7. REFERRALS TABLE ---');
    const refs = await pool.query(`
      SELECT r.id, r.referrer_id, r.referee_id, r.status, r.currency, r.referrer_reward_amount, r.referee_reward_amount, r.referee_reward_paid, r.referrer_reward_paid, r.created_at
      FROM "referrals" r
    `);
    console.log('Referrals Records:', JSON.stringify(refs.rows, null, 2));

    console.log('\n--- 8. ORDERS SUMMARY ---');
    const orders = await pool.query(`
      SELECT status, count(*)::int as count, sum(amount)::numeric as total_amount
      FROM "Order"
      GROUP BY status
    `);
    console.log(orders.rows);

  } catch (err) {
    console.error('Inspection failed:', err);
  } finally {
    await pool.end();
  }
}

inspect();
