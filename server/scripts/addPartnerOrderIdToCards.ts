import pool from '../src/db';

async function main() {
  console.log('Adding partner_order_id to kiropro_cards_inventory...');
  
  await pool.query(`
    ALTER TABLE kiropro_cards_inventory 
    ADD COLUMN IF NOT EXISTS partner_order_id UUID REFERENCES partner_orders(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_kiropro_cards_partner_order 
    ON kiropro_cards_inventory(partner_order_id);
  `);

  console.log('Successfully added partner_order_id to kiropro_cards_inventory.');
  await pool.end();
}

main().catch(console.error);
