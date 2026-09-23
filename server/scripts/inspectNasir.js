const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function inspectNasir() {
  const client = await pool.connect();
  try {
    const txs = await client.query(`
      SELECT wt.id, wt.amount, wt.type, wt.description, wt."balanceBefore", wt."balanceAfter", wt."createdAt"
      FROM "WalletTransaction" wt
      JOIN "Wallet" w ON wt."walletId" = w.id
      JOIN "User" u ON w."userId" = u.id
      WHERE u.email = 'nasir.x.7415963@gmail.com'
      ORDER BY wt."createdAt" ASC
    `);
    console.log('nasir.x.7415963@gmail.com transactions:');
    console.table(txs.rows);

    const orders = await client.query(`
      SELECT * FROM "Order" WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'nasir.x.7415963@gmail.com')
    `);
    console.log('nasir orders count:', orders.rows.length);

    const refs = await client.query(`
      SELECT r.*, ur.email as referrer_email, ue.email as referee_email
      FROM "referrals" r
      JOIN "User" ur ON r.referrer_id = ur.id
      JOIN "User" ue ON r.referee_id = ue.id
      WHERE ur.email = 'nasir.x.7415963@gmail.com' OR ue.email = 'nasir.x.7415963@gmail.com'
    `);
    console.log('nasir referrals:');
    console.table(refs.rows);

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

inspectNasir();
