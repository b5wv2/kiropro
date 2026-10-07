import pool from '../src/db';

async function main() {
  try {
    const res = await pool.query(`
      SELECT id, email, name, role, "createdAt" 
      FROM "User" 
      WHERE name ILIKE '%ابوبكر%' 
         OR name ILIKE '%أبوبكر%' 
         OR name ILIKE '%امير%' 
         OR name ILIKE '%أمير%'
         OR name ILIKE '%بكر%'
      ORDER BY "createdAt" DESC;
    `);
    console.log('Users matching Arabic names (ابوبكر / امير):', res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
