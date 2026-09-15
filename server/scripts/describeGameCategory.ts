import 'dotenv/config';
import pool from '../src/db';

async function main() {
  const r = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'GameCategory'`);
  console.log(r.rows);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
