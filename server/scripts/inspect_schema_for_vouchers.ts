import pool from '../src/db';

async function main() {
  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Tables in database:');
  console.log(res.rows.map(r => r.table_name));

  // Check columns of "Order"
  const orderCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Order' 
    ORDER BY ordinal_position;
  `);
  console.log('Order columns:', orderCols.rows.map(c => `${c.column_name} (${c.data_type})`));

  // Check columns of email_events
  const emailCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'email_events' 
    ORDER BY ordinal_position;
  `);
  console.log('email_events columns:', emailCols.rows.map(c => `${c.column_name} (${c.data_type})`));

  // Check not-null columns in Product
  const nnCols = await pool.query(`
    SELECT column_name, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'Product' AND is_nullable = 'NO';
  `);
  console.log('Not-null columns in Product:', nnCols.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
