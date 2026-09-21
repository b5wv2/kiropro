const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
const bcrypt = require('bcrypt');
const pool = require('../dist/db').pool;

async function run() {
  const hash = await bcrypt.hash('admin123456', 10);
  await pool.query('UPDATE "User" SET "passwordHash" = $1 WHERE email = $2', [hash, 'admin@kiropro.com']);
  console.log('✅ Admin password updated to admin123456');
  await pool.end();
}
run();
