import { pool } from '../src/db';

async function main() {
  try {
    const res = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'kiropro_cards_inventory'::regclass;
    `);
    console.log('Constraints on kiropro_cards_inventory:');
    console.table(res.rows);

    const indexes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'kiropro_cards_inventory';
    `);
    console.log('Indexes:');
    console.table(indexes.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
