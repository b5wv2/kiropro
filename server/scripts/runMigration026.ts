import pool from '../src/db';

async function main() {
  console.log('--- Applying Migration 026 (Partner Pricing Settings & Markup Structure) ---');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Partner pricing settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "partner_pricing_settings" (
        "key" VARCHAR(50) PRIMARY KEY,
        "value" NUMERIC(10, 4) NOT NULL,
        "description" TEXT,
        "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Seed default markup settings (0.01 min, 0.05 max, 0.03 default)
    await client.query(`
      INSERT INTO "partner_pricing_settings" ("key", "value", "description")
      VALUES 
        ('default_markup_usd', 0.0300, 'الهامش الافتراضي بالدولار لأسعار الشركاء فوق تكلفة المورد'),
        ('min_markup_usd', 0.0100, 'الحد الأدنى للهامش بالدولار'),
        ('max_markup_usd', 0.0500, 'الحد الأقصى للهامش بالدولار')
      ON CONFLICT ("key") DO UPDATE SET
        "description" = EXCLUDED."description",
        "updated_at" = CURRENT_TIMESTAMP;
    `);

    // 3. Add markup_usd to partner_orders
    await client.query(`
      ALTER TABLE "partner_orders" 
      ADD COLUMN IF NOT EXISTS "markup_usd" NUMERIC(10, 4) DEFAULT 0.0300;
    `);

    // 4. Add markup_usd to partner_product_pricing
    await client.query(`
      ALTER TABLE "partner_product_pricing" 
      ADD COLUMN IF NOT EXISTS "markup_usd" NUMERIC(10, 4);
    `);

    await client.query('COMMIT');
    console.log('✓ Migration 026 applied successfully!');

    const res = await pool.query('SELECT * FROM "partner_pricing_settings"');
    console.log('Current Partner Pricing Settings:', res.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration 026 error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
