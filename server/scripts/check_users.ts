import pool from '../src/db';

async function main() {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM "User"');
    console.log('Total users in DB:', totalUsers.rows[0].count);

    const partners = await pool.query('SELECT COUNT(*) FROM partner_profiles');
    console.log('Total partner_profiles in DB:', partners.rows[0].count);

    const orders = await pool.query('SELECT COUNT(*) FROM "Order"');
    console.log('Total orders in DB:', orders.rows[0].count);

    // List all users with email containing "abobaker" or "ameer"
    const searchRes = await pool.query(`
      SELECT id, email, role, "createdAt" 
      FROM "User" 
      WHERE email ILIKE '%abobaker%' OR email ILIKE '%ameer%'
    `);
    console.log('Users matching abobaker or ameer:', searchRes.rows);

    // Show recent 10 users
    const recentUsers = await pool.query(`
      SELECT id, email, role, "createdAt" 
      FROM "User" 
      ORDER BY "createdAt" DESC 
      LIMIT 10
    `);
    console.log('Recent 10 users in DB:', recentUsers.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
