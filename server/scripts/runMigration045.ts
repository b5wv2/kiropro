/**
 * Migration 045 Runner
 * Supports --dry-run (validates with full ROLLBACK, leaves database 100% untouched)
 * or explicit apply when approved.
 */
import fs from 'fs';
import path from 'path';
import pool from '../src/db';

async function run() {
  const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
  console.log(`=== Migration 045 Runner [Mode: ${isDryRun ? 'DRY-RUN (Safe Validation)' : 'APPLY (Live)'}] ===`);

  const sqlPath = path.resolve(__dirname, '../migrations/045_harden_customer_wallets_numeric_and_check.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('1. Starting transaction...');
    await client.query('BEGIN');

    console.log('2. Executing Migration 045 statements...');
    await client.query(sql);

    // Verify within the transaction that the types and constraints took effect
    const checkTypes = await client.query(`
      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name IN ('Wallet', 'WalletTransaction', 'Order')
        AND column_name IN ('balance', 'amount', 'balanceBefore', 'balanceAfter', 'chargedAmount')
      ORDER BY table_name, column_name;
    `);
    console.log('\nVerified column types inside transaction:');
    console.table(checkTypes.rows);

    // Verify constraint inside transaction
    const checkCon = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      WHERE conname = 'chk_wallet_balance_non_negative';
    `);
    console.log('Verified constraint inside transaction:', checkCon.rows);

    // Test constraint enforcement inside transaction by attempting negative balance
    try {
      await client.query(`
        UPDATE "Wallet" SET balance = -50.00 WHERE id = (SELECT id FROM "Wallet" LIMIT 1)
      `);
      throw new Error('FAIL: Constraint failed to block negative balance!');
    } catch (conErr: any) {
      if (conErr.message.includes('chk_wallet_balance_non_negative')) {
        console.log('SUCCESS: CHECK constraint strictly blocked negative balance (-50.00).');
      } else {
        throw conErr;
      }
    }

    if (isDryRun) {
      console.log('\n[DRY RUN] Rolling back all changes cleanly. Database remains 100% unchanged.');
      await client.query('ROLLBACK');
    } else {
      console.log('\n[LIVE APPLY] Committing transaction...');
      await client.query('COMMIT');
      console.log('Migration 045 committed successfully!');
    }
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Migration 045 failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
