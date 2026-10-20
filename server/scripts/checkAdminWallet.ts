import pool from '../src/db';

async function run() {
  const c = await pool.connect();
  try {
    const res = await c.query('SELECT * FROM "Wallet" WHERE id = $1', ['7e53e0d1-6f21-4848-8830-cc8b135fd77f']);
    console.log('WALLET:', res.rows[0]);

    const tx = await c.query('SELECT * FROM "WalletTransaction" WHERE id = $1', ['6d34956c-f959-4c59-a458-20a52f68f342']);
    console.log('TRANSACTION:', tx.rows[0]);

    const order = await c.query('SELECT * FROM "Order" WHERE id = $1', [tx.rows[0]?.referenceId]);
    console.log('ORDER:', order.rows[0]);

  } finally {
    c.release();
    await pool.end();
  }
}

run().catch(console.error);
