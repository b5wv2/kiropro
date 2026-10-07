import pool from '../src/db';

async function main() {
  try {
    const res = await pool.query(
      `SELECT * FROM security_events WHERE metadata::text ILIKE $1 OR metadata::text ILIKE $2 LIMIT 10`,
      ['%abobaker%', '%ameer%']
    );
    console.log('security_events matches:', res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
