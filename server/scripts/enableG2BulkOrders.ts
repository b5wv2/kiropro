import { pool } from '../src/db';

async function main() {
  await pool.query("UPDATE provider_settings SET orders_enabled = true, updated_at = NOW() WHERE provider = 'G2BULK'");
  const res = await pool.query("SELECT * FROM provider_settings WHERE provider = 'G2BULK'");
  console.log('Updated G2BULK provider_settings:', res.rows[0]);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
