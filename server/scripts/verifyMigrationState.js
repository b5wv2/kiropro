const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verify() {
  const client = await pool.connect();
  try {
    const usdWallets = await client.query(`
      SELECT count(*)::int as count
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER' AND w.currency = 'USD'
    `);
    console.log('1. Customer USD wallets count:', usdWallets.rows[0].count);

    const sdgWallets = await client.query(`
      SELECT count(*)::int as count
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER' AND w.currency = 'SDG'
    `);
    console.log('2. Customer SDG wallets count:', sdgWallets.rows[0].count);

    const userCurrencies = await client.query(`
      SELECT preferred_currency, count(*)::int
      FROM "User"
      WHERE role = 'CUSTOMER'
      GROUP BY preferred_currency
    `);
    console.log('3. Customer preferred_currencies:', userCurrencies.rows);

    const snapshots = await client.query(`
      SELECT user_email, old_currency, old_balance, exchange_rate_used, new_currency, new_balance
      FROM "currency_migration_snapshots"
    `);
    console.log('4. Snapshots recorded in currency_migration_snapshots:');
    console.table(snapshots.rows);

    const migTxs = await client.query(`
      SELECT wt.type, wt.amount, wt.currency, wt."source_amount_usd", wt.exchange_rate, wt.description, u.email
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE wt.type = 'CURRENCY_MIGRATION'
    `);
    console.log('5. Accounting WalletTransactions created:');
    console.table(migTxs.rows);

    // Test trigger: Attempt to insert a CUSTOMER wallet with USD
    let triggerWorks = false;
    try {
      const dummyId = '00000000-0000-0000-0000-000000000001';
      // Pick any real customer user
      const anyCust = await client.query(`SELECT id FROM "User" WHERE role = 'CUSTOMER' LIMIT 1`);
      await client.query(`
        INSERT INTO "Wallet" (id, "userId", balance, currency)
        VALUES ($1, $2, 10, 'USD')
      `, [dummyId, anyCust.rows[0].id]);
    } catch (err) {
      if (err.message.includes('Customer wallets must use SDG currency only')) {
        triggerWorks = true;
      }
    }
    console.log('6. Database trigger blocks USD on Customer Wallet?', triggerWorks ? 'YES (PROTECTED)' : 'NO (ERROR)');

  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();
