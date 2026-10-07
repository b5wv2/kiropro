import pool from '../src/db';

async function main() {
  try {
    const res = await pool.query(`
      SELECT id, email, name, role, "createdAt" 
      FROM "User" 
      WHERE email ILIKE '%abobaker%' 
         OR email ILIKE '%ameer%' 
         OR email ILIKE '%5@gmail.com'
         OR email ILIKE '%abobaker%'
      ORDER BY "createdAt" DESC;
    `);
    console.log('Users matching broad pattern:', res.rows);

    // Also check if there's any deleted users table or soft delete column
    const colRes = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User';
    `);
    console.log('All User columns:', colRes.rows.map(r => r.column_name));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
