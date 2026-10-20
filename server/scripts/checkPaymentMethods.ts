import pool from '../src/db';

async function run() {
  const c = await pool.connect();
  try {
    const res = await c.query(`SELECT * FROM payment_methods`);
    console.log('=== PAYMENT METHODS ===');
    console.table(res.rows.map(r => ({
      id: r.id,
      name: r.name,
      bank_name: r.bank_name,
      currency: r.currency,
      account_name: r.account_name,
      account_number: r.account_number
    })));
  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(console.error);
