import { pool } from '../src/db.js';

async function checkSettings() {
  const settings = await pool.query(`SELECT key, value FROM platform_settings`);
  console.log('ALL PLATFORM SETTINGS:');
  console.log(settings.rows);
  process.exit(0);
}

checkSettings().catch(console.error);
