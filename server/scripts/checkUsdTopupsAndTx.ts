import pool from '../src/db';

async function run() {
  const c = await pool.connect();
  try {
    const topupStats = await c.query(`
      SELECT requested_currency, status, count(*), min(created_at), max(created_at)
      FROM topup_requests
      GROUP BY requested_currency, status
    `);
    console.log('=== TOPUP STATS BY REQUESTED CURRENCY & STATUS ===');
    console.table(topupStats.rows);

    const usdTopups = await c.query(`
      SELECT tr.id, tr.user_id, u.email, u.role, tr.amount_sdg, tr.amount_usd, 
             tr.requested_amount, tr.requested_currency, tr.exchange_rate, tr.status, tr.created_at
      FROM topup_requests tr
      JOIN "User" u ON tr.user_id = u.id
      WHERE tr.requested_currency = 'USD'
    `);
    console.log('=== USD TOPUPS COUNT:', usdTopups.rows.length);
    console.table(usdTopups.rows);

    const sdgWalletsWithUsdTx = await c.query(`
      SELECT wt.id, wt."walletId", wt.amount, wt.currency, wt.type, wt.description, wt."createdAt", u.email, u.role
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE wt.currency != 'SDG'
    `);
    console.log('=== TRANSACTIONS WITH currency != SDG COUNT:', sdgWalletsWithUsdTx.rows.length);
    console.table(sdgWalletsWithUsdTx.rows);

  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(console.error);
