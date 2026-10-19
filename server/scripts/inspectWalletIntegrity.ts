/**
 * Wallet & Financial Ledger Deep Inspection (SEC-FIN-04)
 * Read-only script: inspects all wallet balances, negative balance check,
 * and ledger reconciliation.
 */
import pool from '../src/db';

async function inspectWallets() {
  console.log('=== WALLET INTEGRITY & NUMERIC PRECISION AUDIT ===\n');

  const client = await pool.connect();
  try {
    // 1. Check for negative balances
    const negativeRes = await client.query(`
      SELECT id, "userId", balance, currency, "updatedAt"
      FROM "Wallet"
      WHERE balance < 0
    `);
    console.log(`1. Negative Balance Check: Found ${negativeRes.rows.length} wallets with balance < 0.`);
    if (negativeRes.rows.length > 0) {
      console.table(negativeRes.rows);
    }

    // 2. Check for NULL or NaN balances
    const nullRes = await client.query(`
      SELECT id, "userId", balance
      FROM "Wallet"
      WHERE balance IS NULL OR balance != balance
    `);
    console.log(`2. NULL/NaN Balance Check: Found ${nullRes.rows.length} invalid wallets.`);

    // 3. Total Wallets and Currency Distribution
    const statsRes = await client.query(`
      SELECT currency, COUNT(*) as count, MIN(balance) as min_bal, MAX(balance) as max_bal, SUM(balance) as total_bal
      FROM "Wallet"
      GROUP BY currency
    `);
    console.log('\n3. Wallet Currency & Balance Stats:');
    console.table(statsRes.rows);

    // 4. Partner Wallets Check
    const partnerNegative = await client.query(`
      SELECT id, partner_id, balance, currency
      FROM partner_wallets
      WHERE balance < 0
    `);
    console.log(`\n4. Partner Wallets Negative Check: Found ${partnerNegative.rows.length} partner wallets with balance < 0.`);

    // 5. Pre-existing Duplicate Refund Transactions Check (Verification of Migration 044)
    const duplicateRefunds = await client.query(`
      SELECT "walletId", "referenceType", "referenceId", COUNT(*) as cnt
      FROM "WalletTransaction"
      WHERE "type" = 'REFUND' AND "referenceType" = 'ORDER' AND "referenceId" IS NOT NULL
      GROUP BY "walletId", "referenceType", "referenceId"
      HAVING COUNT(*) > 1
    `);
    console.log(`\n5. Duplicate Order Refunds Check: Found ${duplicateRefunds.rows.length} duplicate groups.`);
    if (duplicateRefunds.rows.length > 0) {
      console.table(duplicateRefunds.rows);
    }

    // 6. Schema Column Types Check
    const schemaCheck = await client.query(`
      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name IN ('Wallet', 'WalletTransaction', 'Order')
        AND column_name IN ('balance', 'amount', 'chargedAmount', 'balanceBefore', 'balanceAfter')
      ORDER BY table_name, column_name
    `);
    console.log('\n6. Current Database Column Types:');
    console.table(schemaCheck.rows);

  } catch (err: any) {
    console.error('Inspection failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

inspectWallets().catch(console.error);
