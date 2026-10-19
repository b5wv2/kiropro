import { pool } from '../src/db.js';

async function main() {
  const res = await pool.query(`
    SELECT conname, pg_get_constraintdef(c.oid) as def, conrelid::regclass::text as table_name
    FROM pg_constraint c
    WHERE conrelid IN ('topup_requests'::regclass, '"Wallet"'::regclass, '"WalletTransaction"'::regclass)
  `);
  console.log('Constraints:', JSON.stringify(res.rows, null, 2));
  await pool.end();
}

main().catch(console.error);
