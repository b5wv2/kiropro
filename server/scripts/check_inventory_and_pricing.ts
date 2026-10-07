import pool from '../src/db';

async function main() {
  try {
    console.log('=== CHECKING KIROPRO CARDS INVENTORY ===\n');
    
    // Check columns of kiropro_cards_inventory
    const colsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'kiropro_cards_inventory'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', colsRes.rows);

    // Check count by status
    const statusCounts = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM kiropro_cards_inventory 
      GROUP BY status;
    `);
    console.log('\nInventory by status:', statusCounts.rows);

    // Safe sample (only last4, status, id)
    const sample = await pool.query(`
      SELECT id, card_last4, balance, status, assigned_to_user_id, created_at 
      FROM kiropro_cards_inventory 
      LIMIT 5;
    `);
    console.log('\nSample records (safe columns):', sample.rows);

    // Check partner pricing tables
    const pricingTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name ILIKE '%partner%pric%';
    `);
    console.log('\nPartner pricing tables:', pricingTables.rows);

    for (const t of pricingTables.rows) {
      const tCols = await pool.query(`
        SELECT column_name FROM information_schema.columns WHERE table_name = $1
      `, [t.table_name]);
      console.log(`Columns for ${t.table_name}:`, tCols.rows.map(r => r.column_name));
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
