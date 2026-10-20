import pool from '../src/db';

async function run() {
  const c = await pool.connect();
  try {
    const res = await c.query(`
      SELECT u.id, u.email, u.name, u.role, u.preferred_currency, u."createdAt", 
             w.id as wallet_id, w.balance, w.currency as wallet_currency
      FROM "User" u
      LEFT JOIN "Wallet" w ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER' AND u.preferred_currency = 'USD'
      ORDER BY u."createdAt" DESC
    `);
    console.log('COUNT:', res.rows.length);
    console.log(JSON.stringify(res.rows, null, 2));

    for (const u of res.rows) {
      console.log(`\n=== DETAILS FOR USER ${u.email} (${u.id}) ===`);
      const txs = await c.query(`SELECT * FROM "WalletTransaction" WHERE "walletId" = $1 ORDER BY "createdAt" ASC`, [u.wallet_id]);
      console.log('TRANSACTIONS:', txs.rows);
      const orders = await c.query(`SELECT * FROM "Order" WHERE "userId" = $1 ORDER BY "createdAt" ASC`, [u.id]);
      console.log('ORDERS:', orders.rows);
      const topups = await c.query(`SELECT * FROM topup_requests WHERE user_id = $1 ORDER BY created_at ASC`, [u.id]);
      console.log('TOPUPS:', topups.rows);
    }
  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(console.error);
