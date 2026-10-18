import pool from '../src/db';

async function test() {
  const schema = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'UploadedAsset'
  `);
  console.log('UploadedAsset columns:', schema.rows);

  const count = await pool.query('SELECT count(*)::int as count FROM "UploadedAsset"');
  console.log('UploadedAsset count:', count.rows[0].count);

  await pool.end();
}

test().catch(console.error);
