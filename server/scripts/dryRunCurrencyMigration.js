const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function dryRun() {
  const client = await pool.connect();
  try {
    console.log('================================================================');
    console.log('       KIROPRO FINANCIAL MIGRATION — DRY RUN (READ ONLY)        ');
    console.log('================================================================\n');

    // 1. Fetch system exchange rate
    const rateRes = await client.query(`SELECT value FROM platform_settings WHERE key = 'exchange_rate'`);
    const systemRateObj = rateRes.rows[0]?.value || {};
    const rate7600 = Number(systemRateObj.rate || 7600);
    const rate6000 = 6000;

    console.log(`Active Platform Settings Exchange Rate: 1 USD = ${rate7600} SDG`);
    console.log(`User Prompt Example Exchange Rate:       1 USD = ${rate6000} SDG\n`);

    // 2. Fetch all customer wallets
    const wallets = await client.query(`
      SELECT 
        w.id as wallet_id,
        w."userId",
        u.email,
        u.name,
        w.balance,
        w.currency,
        u.preferred_currency
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER'
      ORDER BY w.currency ASC, w.balance DESC
    `);

    const usdWallets = wallets.rows.filter(w => w.currency === 'USD');
    const sdgWallets = wallets.rows.filter(w => w.currency === 'SDG');

    console.log(`Total Customer Wallets: ${wallets.rows.length}`);
    console.log(`  - USD Wallets to convert: ${usdWallets.length}`);
    console.log(`  - SDG Wallets (remain SDG): ${sdgWallets.length}\n`);

    console.log('--------------------------------------------------------------------------------------------------------------------------------');
    console.log('| User ID                              | Email                            | Old Currency | Old Balance     | Rate | New Currency | New Balance (SDG)      |');
    console.log('--------------------------------------------------------------------------------------------------------------------------------');

    let totalOldUsd = 0;
    let totalNewSdgAt7600 = 0;
    let totalNewSdgAt6000 = 0;

    for (const w of usdWallets) {
      const oldBal = Number(w.balance || 0);
      totalOldUsd += oldBal;
      const newBal7600 = Math.round(oldBal * rate7600 * 100) / 100;
      const newBal6000 = Math.round(oldBal * rate6000 * 100) / 100;
      totalNewSdgAt7600 += newBal7600;
      totalNewSdgAt6000 += newBal6000;

      const uid = w.userId.padEnd(36);
      const mail = w.email.slice(0, 32).padEnd(32);
      const oldC = w.currency.padEnd(12);
      const oldB = oldBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15);
      const rStr = String(rate7600).padStart(4);
      const newC = 'SDG'.padEnd(12);
      const newB = newBal7600.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(22);

      console.log(`| ${uid} | ${mail} | ${oldC} | ${oldB} | ${rStr} | ${newC} | ${newB} |`);
    }

    console.log('--------------------------------------------------------------------------------------------------------------------------------');
    console.log(`TOTAL CONVERTED USD BALANCE: ${totalOldUsd.toLocaleString('en-US', { minimumFractionDigits: 3 })} USD`);
    console.log(`TOTAL RESULTING SDG BALANCE (at rate ${rate7600}): ${totalNewSdgAt7600.toLocaleString('en-US', { minimumFractionDigits: 2 })} SDG`);
    console.log(`TOTAL RESULTING SDG BALANCE (at rate ${rate6000}): ${totalNewSdgAt6000.toLocaleString('en-US', { minimumFractionDigits: 2 })} SDG\n`);

    // 3. Check existing referral USD rewards
    const refTx = await client.query(`
      SELECT wt.id, u.email, wt.amount, wt.currency, wt.type, wt."balanceBefore", wt."balanceAfter", wt.description
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE (wt.type LIKE '%REFERRAL%' OR wt."referenceType" = 'REFERRAL') AND wt.currency = 'USD'
    `);
    console.log(`Existing USD Referral Transactions (${refTx.rows.length} found):`);
    refTx.rows.forEach(t => {
      console.log(`  * Tx ${t.id}: User ${t.email} received ${t.amount} ${t.currency}`);
    });

  } catch (err) {
    console.error('Dry run error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

dryRun();
