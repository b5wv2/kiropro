import pool from '../src/db';

async function run() {
  const c = await pool.connect();
  try {
    const orderCurr = await c.query(`
      SELECT "chargedCurrency", count(*), min(amount), max(amount), min("createdAt"), max("createdAt")
      FROM "Order"
      GROUP BY "chargedCurrency"
    `);
    console.log('=== ORDERS BY CHARGED CURRENCY ===');
    console.table(orderCurr.rows);

    const usdOrders = await c.query(`
      SELECT o.id, o."userId", u.email, u.role, u.preferred_currency, o.amount, o."customerPriceUsd", 
             o."chargedAmount", o."chargedCurrency", o."exchangeRateUsed", o.status, o."createdAt"
      FROM "Order" o
      JOIN "User" u ON o."userId" = u.id
      WHERE o."chargedCurrency" = 'USD' OR o."chargedCurrency" IS NULL
      ORDER BY o."createdAt" DESC
      LIMIT 20
    `);
    console.log('\n=== USD / NULL ORDERS ===');
    console.table(usdOrders.rows);

  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(console.error);
