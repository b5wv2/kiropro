import pool from '../src/db';

async function run() {
  const c = await pool.connect();
  try {
    const topupStats = await c.query(`
      SELECT requested_currency, status, count(*)
      FROM topup_requests
      GROUP BY requested_currency, status
    `);
    console.log(JSON.stringify(topupStats.rows, null, 2));
  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(console.error);
