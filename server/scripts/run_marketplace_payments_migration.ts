import 'dotenv/config';
import pool from '../src/db';

async function migrate() {
  console.log('--- Applying Marketplace Payments & Drafts Migration ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add idempotency_key and draft_data to account_listing_payments
    await client.query(`
      ALTER TABLE account_listing_payments 
        ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
        ADD COLUMN IF NOT EXISTS draft_data JSONB DEFAULT '{}'::jsonb;
    `);
    console.log('✓ Added idempotency_key and draft_data columns (if not exist).');

    // 2. Create unique index on idempotency_key (allows NULL for existing rows)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_account_listing_payments_idempotency 
        ON account_listing_payments(idempotency_key) 
        WHERE idempotency_key IS NOT NULL;
    `);
    console.log('✓ Created unique index on idempotency_key.');

    // 3. Create index for active unconsumed drafts
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_account_listing_payments_active_draft
        ON account_listing_payments(user_id, status, is_consumed)
        WHERE status = 'PAID' AND is_consumed = false;
    `);
    console.log('✓ Created index on active drafts.');

    await client.query('COMMIT');
    console.log('✓ Migration committed successfully!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
