import pool from '../src/db';

async function main() {
  console.log('Altering partner_orders to make provider columns nullable for internal card orders...');
  
  await pool.query(`
    ALTER TABLE partner_orders ALTER COLUMN provider_offer_id DROP NOT NULL;
    ALTER TABLE partner_orders ALTER COLUMN game_id DROP NOT NULL;
    ALTER TABLE partner_orders ALTER COLUMN player_id DROP NOT NULL;
  `);

  console.log('Successfully dropped NOT NULL constraints on partner_orders provider columns.');
  await pool.end();
}

main().catch(console.error);
