import pool from '../src/db';

async function main() {
  console.log('=== FINANCIAL COLUMNS & CONSTRAINTS AUDIT ===\n');

  // 1. Check data types of target tables
  const cols = await pool.query(`
    SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name IN ('Wallet', 'WalletTransaction', 'Order', 'partner_wallets', 'partner_ledger', 'partner_deposits')
      AND column_name IN ('balance', 'amount', 'balanceBefore', 'balanceAfter', 'chargedAmount', 'price')
    ORDER BY table_name, column_name;
  `);
  console.log('--- Current Column Types ---');
  console.table(cols.rows);

  // 2. Check existing constraints on Wallet
  const constraints = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = '"Wallet"'::regclass;
  `);
  console.log('\n--- Current Wallet Constraints ---');
  console.table(constraints.rows);

  // 3. Check for any negative balances or invalid numbers in Wallet
  const invalidBalances = await pool.query(`
    SELECT id, "userId", balance, currency
    FROM "Wallet"
    WHERE balance < 0 OR balance IS NULL OR balance = 'NaN'::double precision
  `);
  console.log(`\n--- Invalid or Negative Wallet Balances: ${invalidBalances.rows.length} ---`);
  if (invalidBalances.rows.length > 0) {
    console.table(invalidBalances.rows);
  }

  // 4. Check max balance to verify numeric scale/precision safety
  const maxBalance = await pool.query(`
    SELECT 
      MIN(balance) as min_balance, 
      MAX(balance) as max_balance, 
      AVG(balance) as avg_balance,
      COUNT(*) as total_wallets
    FROM "Wallet";
  `);
  console.log('\n--- Balance Statistics ---');
  console.table(maxBalance.rows);

  // 5. Check WalletTransaction amount statistics
  const txStats = await pool.query(`
    SELECT 
      MIN(amount) as min_tx_amount,
      MAX(amount) as max_tx_amount,
      COUNT(*) as total_txs
    FROM "WalletTransaction";
  `);
  console.log('\n--- Transaction Amount Statistics ---');
  console.table(txStats.rows);

  await pool.end();
  console.log('\nInspection completed successfully.');
}

main().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
