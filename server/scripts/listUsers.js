const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
const pool = require('../dist/db').pool;

async function check() {
  const users = await pool.query('SELECT id, email, role, "emailVerified" FROM "User" LIMIT 10');
  console.log('USERS:', users.rows);
  await pool.end();
}
check();
