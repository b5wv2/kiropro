import pool from '../src/db';

async function main() {
  const cardId = 'aa339a57-4f25-43e7-a2b3-6230d6221db8';
  const before = await pool.query('SELECT id, status, card_last4, assigned_to_user_id FROM kiropro_cards_inventory WHERE id = $1', [cardId]);
  console.log('Before restore:', before.rows[0]);

  await pool.query("UPDATE kiropro_cards_inventory SET status = 'AVAILABLE', assigned_to_user_id = NULL WHERE id = $1", [cardId]);
  
  const after = await pool.query('SELECT id, status, card_last4, assigned_to_user_id FROM kiropro_cards_inventory WHERE id = $1', [cardId]);
  console.log('After restore:', after.rows[0]);

  await pool.end();
}

main().catch(console.error);
