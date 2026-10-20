import pool from '../src/db';

async function diagnose() {
  console.log('=== DEEP DIAGNOSTIC ON CURRENCY AND WALLETS ===\n');
  const client = await pool.connect();
  try {
    // 1. User preferred_currency distribution
    const userCurrencies = await client.query(`
      SELECT role, preferred_currency, count(*) as count
      FROM "User"
      GROUP BY role, preferred_currency
      ORDER BY role, preferred_currency
    `);
    console.log('1. User preferred_currency distribution:');
    console.table(userCurrencies.rows);

    // 2. Wallet currency distribution
    const walletCurrencies = await client.query(`
      SELECT currency, count(*), min(balance), max(balance), avg(balance)
      FROM "Wallet"
      GROUP BY currency
    `);
    console.log('\n2. Wallet currency distribution:');
    console.table(walletCurrencies.rows);

    // 3. Check for any Wallets where User role is CUSTOMER vs ADMIN vs PARTNER
    const walletByRole = await client.query(`
      SELECT u.role, w.currency, count(*), min(w.balance), max(w.balance)
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      GROUP BY u.role, w.currency
    `);
    console.log('\n3. Wallet by User Role:');
    console.table(walletByRole.rows);

    // 4. WalletTransaction currency distribution
    const txCurrencies = await client.query(`
      SELECT currency, type, count(*), min(amount), max(amount)
      FROM "WalletTransaction"
      GROUP BY currency, type
      ORDER BY count(*) DESC
    `);
    console.log('\n4. WalletTransaction currency distribution:');
    console.table(txCurrencies.rows);

    // 5. Recent 30 WalletTransactions
    const recentTx = await client.query(`
      SELECT wt.id, wt."walletId", wt.amount, wt.currency, wt.type, wt."balanceBefore", wt."balanceAfter", 
             wt."createdAt", u.email, u.role, u.preferred_currency
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      ORDER BY wt."createdAt" DESC
      LIMIT 30
    `);
    console.log('\n5. Recent 30 Wallet Transactions:');
    console.table(recentTx.rows.map(r => ({
      ...r,
      email: r.email ? r.email.substring(0, 3) + '***@' + r.email.split('@')[1] : null
    })));

    // 6. Recent topup requests
    const recentTopups = await client.query(`
      SELECT tr.id, tr.user_id, tr.amount_sdg, tr.amount_usd, tr.requested_amount, tr.requested_currency,
             tr.exchange_rate, tr.status, tr.payment_method_id, tr.created_at
      FROM topup_requests tr
      ORDER BY tr.created_at DESC
      LIMIT 25
    `);
    console.log('\n6. Recent 25 Topup Requests:');
    console.table(recentTopups.rows);

    // 7. Check platform settings exchange_rate
    const settings = await client.query(`
      SELECT key, value, updated_at
      FROM platform_settings
      WHERE key IN ('exchange_rate', 'currency_settings', 'payment_settings')
    `);
    console.log('\n7. Platform Settings:');
    console.table(settings.rows);

    // 8. Partner Wallets
    const partnerWallets = await client.query(`
      SELECT currency, count(*), min(balance), max(balance)
      FROM partner_wallets
      GROUP BY currency
    `);
    console.log('\n8. Partner Wallets:');
    console.table(partnerWallets.rows);

    // 9. Check currency_migration_snapshots (if any)
    const snapshots = await client.query(`
      SELECT count(*), old_currency, new_currency, min(exchange_rate_used), max(exchange_rate_used)
      FROM currency_migration_snapshots
      GROUP BY old_currency, new_currency
    `);
    console.log('\n9. Currency Migration Snapshots:');
    console.table(snapshots.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

diagnose().catch(console.error);
