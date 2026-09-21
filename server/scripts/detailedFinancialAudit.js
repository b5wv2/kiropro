const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false }
});

async function runDetailedAudit() {
  const client = await pool.connect();
  try {
    console.log('=== 1. CUSTOMER ACCOUNTS COUNT & SUMMARY ===');
    const custCountRes = await client.query(`
      SELECT 
        COUNT(*)::int as total_customers,
        COUNT(*) FILTER (WHERE preferred_currency = 'USD')::int as usd_preferred,
        COUNT(*) FILTER (WHERE preferred_currency = 'SDG')::int as sdg_preferred,
        COUNT(*) FILTER (WHERE preferred_currency IS NULL)::int as null_preferred
      FROM "User" 
      WHERE role = 'CUSTOMER'
    `);
    console.log('Customers count:', custCountRes.rows[0]);

    console.log('\n=== 2. WALLETS BREAKDOWN (ROLE = CUSTOMER) ===');
    const walletsSummary = await client.query(`
      SELECT 
        w.currency,
        COUNT(*)::int as wallet_count,
        SUM(w.balance)::numeric as total_balance,
        COUNT(*) FILTER (WHERE w.balance > 0)::int as positive_balance_wallets,
        COUNT(*) FILTER (WHERE w.balance = 0)::int as zero_balance_wallets
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER'
      GROUP BY w.currency
    `);
    console.log('Wallets summary:', walletsSummary.rows);

    console.log('\n=== 3. ALL CUSTOMER USD WALLETS WITH DETAILS ===');
    const usdWallets = await client.query(`
      SELECT 
        w.id as wallet_id,
        w."userId",
        u.email,
        u.name,
        w.balance,
        w.currency,
        u.preferred_currency,
        u."createdAt"
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER' AND w.currency = 'USD'
      ORDER BY w.balance DESC
    `);
    console.log(`Found ${usdWallets.rows.length} USD customer wallets:`);
    usdWallets.rows.forEach(w => {
      console.log(`- User [${w.userId}] (${w.email}): Balance = ${w.balance} USD`);
    });

    console.log('\n=== 4. PENDING TOPUPS ===');
    const topupColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'topup_requests'
    `);
    console.log('topup_requests columns:', topupColumns.rows.map(c => c.column_name));

    const topupsRes = await client.query(`
      SELECT id, user_id, amount_usd, amount_sdg, requested_amount, requested_currency, exchange_rate, status, created_at
      FROM topup_requests
      WHERE status = 'PENDING'
    `);
    console.log('Pending topups count:', topupsRes.rows.length);
    console.log(JSON.stringify(topupsRes.rows, null, 2));

    console.log('\n=== 5. REFERRALS & REFERRAL REWARDS ===');
    const refSummary = await client.query(`
      SELECT 
        r.currency,
        r.status,
        COUNT(*)::int as count,
        SUM(r.referrer_reward_amount)::numeric as total_referrer_reward,
        SUM(r.referee_reward_amount)::numeric as total_referee_reward,
        COUNT(*) FILTER (WHERE r.referee_reward_paid)::int as referee_paid_count,
        COUNT(*) FILTER (WHERE r.referrer_reward_paid)::int as referrer_paid_count
      FROM "referrals" r
      GROUP BY r.currency, r.status
    `);
    console.log('Referrals summary:', refSummary.rows);

    const refTx = await client.query(`
      SELECT 
        wt.id,
        wt."walletId",
        w."userId",
        u.email,
        w.currency as wallet_currency,
        wt.currency as tx_currency,
        wt.amount,
        wt.type,
        wt.description,
        wt."balanceBefore",
        wt."balanceAfter",
        wt."createdAt"
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE wt.type LIKE '%REFERRAL%' OR wt."referenceType" = 'REFERRAL'
      ORDER BY wt."createdAt" DESC
    `);
    console.log(`Referral Wallet Transactions (${refTx.rows.length} found):`);
    refTx.rows.forEach(t => {
      console.log(`- Tx [${t.id}] User (${t.email}): amount=${t.amount} ${t.tx_currency}, wallet=${t.wallet_currency}, type=${t.type}, desc=${t.description}`);
    });

    console.log('\n=== 6. ACTIVE EXCHANGE RATE ===');
    const rateSetting = await client.query(`SELECT value FROM platform_settings WHERE key = 'exchange_rate'`);
    console.log('Exchange rate value:', rateSetting.rows[0]?.value);

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runDetailedAudit();
