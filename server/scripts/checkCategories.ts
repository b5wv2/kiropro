import pool from '../src/db';

async function test() {
  const res = await pool.query('SELECT * FROM "GameCategory" ORDER BY "displayOrder" ASC');
  console.log(`Game categories in DB (${res.rows.length}):`);
  res.rows.forEach(r => {
    console.log(`  ID: ${r.id} | Name: ${r.name} | Arabic: ${r.arabicName} | Platform: ${r.platform} | reqUser: ${r.requiresGameUserId}`);
  });
  await pool.end();
}

test().catch(console.error);
