const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Explicit list of verified test accounts to delete
const TEST_EMAILS_TO_DELETE = [
  // 1. Explicitly requested test user (with 599,980 USD fake balance)
  'test_user_1789350923269@example.com',

  // 2. Security & reset test accounts
  'sectest_1789366886170@kiropro.test',
  'test_usd_wallet@kiropro.com',
  'test_sdg_wallet@kiropro.com',
  'test_reset_customer@kiropro.com',
  'test_reset_admin@kiropro.com',

  // 3. Automated USDT test customer accounts created by testUsdtSuite.ts
  'test_usdt_a_1789721235410@kiropro.test',
  'test_usdt_b_1789721235410@kiropro.test',
  'test_usdt_a_1789721350353@kiropro.test',
  'test_usdt_b_1789721350353@kiropro.test',
  'test_usdt_a_1789721490091@kiropro.test',
  'test_usdt_b_1789721490091@kiropro.test',
  'usdt_test_1789782094840@kiropro.test',
  'usdt_test_1789782138558@kiropro.test',
  'usdt_test_1789782158404@kiropro.test',
  'usdt_test_1789782187545@kiropro.test',
  'usdt_test_1789783400581@kiropro.test',
  'test_usdt_a_1789783947494@kiropro.test',
  'test_usdt_b_1789783947494@kiropro.test',
  'test_usdt_a_1789783977090@kiropro.test',
  'test_usdt_b_1789783977090@kiropro.test',
  'test_usdt_a_1789784010069@kiropro.test',
  'test_usdt_b_1789784010069@kiropro.test',
  'usdt_test_1789784064766@kiropro.test',

  // 4. Automated USDT test admin accounts created by testUsdtSuite.ts
  'admin_1789782095871@kiropro.test',
  'admin_1789782139354@kiropro.test',
  'admin_1789782159287@kiropro.test',
  'admin_1789782188528@kiropro.test',
  'admin_1789783401476@kiropro.test',
  'admin_1789784065632@kiropro.test'
];

async function deleteTestAccounts() {
  const client = await pool.connect();
  try {
    console.log('================================================================');
    console.log('         STEP 1 & 2: VERIFY AND DELETE TEST ACCOUNTS            ');
    console.log('================================================================\n');

    await client.query('BEGIN');

    // 1. Fetch details of test accounts to be deleted
    const res = await client.query(`
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.role, 
        w.currency, 
        w.balance
      FROM "User" u
      LEFT JOIN "Wallet" w ON u.id = w."userId"
      WHERE u.email = ANY($1)
    `, [TEST_EMAILS_TO_DELETE]);

    console.log(`Found ${res.rows.length} test accounts to delete:\n`);
    res.rows.forEach((acc, i) => {
      console.log(`  [${i+1}] ${acc.email} (${acc.role}): Balance = ${acc.balance ?? 'NO_WALLET'} ${acc.currency ?? ''}`);
    });

    // Save audit snapshot to file before deletion
    const backupPath = path.join(__dirname, 'deleted_test_accounts_backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(res.rows, null, 2), 'utf-8');
    console.log(`\nAudit backup saved to: ${backupPath}`);

    // 2. Perform cascade delete of these test accounts
    const userIds = res.rows.map(r => r.id);
    if (userIds.length > 0) {
      // First clean any references where set null might leave orphaned entries if needed
      await client.query('DELETE FROM "WalletTransaction" WHERE "walletId" IN (SELECT id FROM "Wallet" WHERE "userId" = ANY($1))', [userIds]);
      await client.query('DELETE FROM "Order" WHERE "userId" = ANY($1)', [userIds]);
      await client.query('DELETE FROM "referrals" WHERE referrer_id = ANY($1) OR referee_id = ANY($1)', [userIds]);
      await client.query('DELETE FROM "Wallet" WHERE "userId" = ANY($1)', [userIds]);
      const delUserRes = await client.query('DELETE FROM "User" WHERE id = ANY($1) RETURNING email', [userIds]);
      console.log(`\n✓ Successfully deleted ${delUserRes.rowCount} test accounts from database.`);
    }

    await client.query('COMMIT');

    // 3. Verify target account is deleted
    const verifyTarget = await client.query('SELECT id FROM "User" WHERE email = $1', ['test_user_1789350923269@example.com']);
    console.log('Verification: Does test_user_1789350923269@example.com still exist?', verifyTarget.rows.length > 0 ? 'YES (ERROR)' : 'NO (CONFIRMED DELETED)');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to delete test accounts:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

deleteTestAccounts();
