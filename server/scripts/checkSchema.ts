import pool from '../src/db';

async function main() {
  console.log('--- Wallet & WalletTransaction columns ---');
  const cols = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name IN ('Wallet', 'WalletTransaction', 'User', 'AuditLog')
    ORDER BY table_name, ordinal_position;
  `);
  console.table(cols.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
