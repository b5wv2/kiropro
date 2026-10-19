import pool from '../src/db';

async function main() {
  console.log('Checking for any views or dependent objects on Wallet, WalletTransaction, Order...');

  const viewsRes = await pool.query(`
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public';
  `);
  console.log('Views found in public schema:', viewsRes.rows.length);
  if (viewsRes.rows.length > 0) {
    console.table(viewsRes.rows.map(v => ({ table_name: v.table_name })));
  }

  // Check triggers on Wallet
  const triggersRes = await pool.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE event_object_table IN ('Wallet', 'WalletTransaction', 'Order');
  `);
  console.log('Triggers found on Wallet / WalletTransaction / Order:', triggersRes.rows.length);
  if (triggersRes.rows.length > 0) {
    console.table(triggersRes.rows);
  }

  await pool.end();
}

main().catch(console.error);
