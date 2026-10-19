import { pool } from '../src/db';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kiropro_card_reentry_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        card_id UUID NOT NULL REFERENCES kiropro_cards_inventory(id) ON DELETE CASCADE,
        card_last4 VARCHAR(4) NOT NULL,
        card_hash VARCHAR(64) NOT NULL,
        previous_status VARCHAR(20) NOT NULL,
        previous_order_id UUID,
        previous_partner_order_id UUID,
        previous_user_id UUID,
        previous_assigned_at TIMESTAMP WITH TIME ZONE,
        reentered_by_admin_id UUID REFERENCES "User"(id),
        reentry_reason TEXT NOT NULL,
        admin_confirmed_unused BOOLEAN NOT NULL DEFAULT true,
        admin_confirmed_authorized BOOLEAN NOT NULL DEFAULT true,
        reentered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_card_reentry_card_id ON kiropro_card_reentry_logs(card_id);
      CREATE INDEX IF NOT EXISTS idx_card_reentry_card_hash ON kiropro_card_reentry_logs(card_hash);
    `);

    await client.query('COMMIT');
    console.log('Successfully created kiropro_card_reentry_logs table and indexes.');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
