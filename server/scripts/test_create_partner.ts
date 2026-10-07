import pool from '../src/db';
import { partnerService } from '../src/services/partnerService';

async function main() {
  const email = 'abobakerameer5@gmail.com';
  console.log(`=== TESTING PARTNER CREATION FOR: "${email}" ===\n`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Test the exact check in partnerService.ts:
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await client.query('SELECT id, role, email FROM "User" WHERE email = $1', [normalizedEmail]);
    console.log('1. Check "User" with email = normalizedEmail:', existingUser.rows);

    // Also check case-insensitive
    const ilikeUser = await client.query('SELECT id, role, email FROM "User" WHERE email ILIKE $1', [normalizedEmail]);
    console.log('2. Check "User" with email ILIKE:', ilikeUser.rows);

    // Also check partner_profiles
    const existingPartner = await client.query(`
      SELECT pp.id, pp.status, u.email 
      FROM partner_profiles pp 
      JOIN "User" u ON pp.user_id = u.id 
      WHERE LOWER(TRIM(u.email)) = $1
    `, [normalizedEmail]);
    console.log('3. Check partner_profiles:', existingPartner.rows);

    // Also check partner_levels
    const levelsRes = await client.query(`SELECT id, name FROM partner_levels ORDER BY min_points ASC`);
    console.log('4. Available partner_levels:', levelsRes.rows);

    // Always rollback
    await client.query('ROLLBACK');
    console.log('\nDry-run check completed successfully (no data changed).');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error during dry-run:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
