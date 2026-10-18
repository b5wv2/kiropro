import { pool } from '../src/db';

async function main() {
  try {
    const cols = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'Order' 
       ORDER BY ordinal_position`
    );
    console.log('Order columns:');
    for (const c of cols.rows) {
      console.log(`  ${c.column_name}: ${c.data_type}`);
    }

    const vcols = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'order_voucher_codes' 
       ORDER BY ordinal_position`
    );
    console.log('\norder_voucher_codes columns:');
    for (const c of vcols.rows) {
      console.log(`  ${c.column_name}: ${c.data_type}`);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
