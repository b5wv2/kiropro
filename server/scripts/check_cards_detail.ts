import { pool } from '../src/db.js';

async function checkInventoryDetails() {
  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'kiropro_cards_inventory'
  `);
  console.log('COLUMNS:', cols.rows);

  const cards = await pool.query(`
    SELECT id, status, balance, assigned_at, order_id, partner_order_id, created_at
    FROM kiropro_cards_inventory
    ORDER BY created_at DESC
  `);
  console.log('ALL CARDS IN INVENTORY (Total ' + cards.rows.length + '):');
  console.log(cards.rows);

  process.exit(0);
}

checkInventoryDetails().catch(err => {
  console.error(err);
  process.exit(1);
});
