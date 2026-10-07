import pool from '../src/db';

async function main() {
  try {
    const auditRes = await pool.query(`
      SELECT id, "adminId", action, "targetUserId", reason, "createdAt" 
      FROM "AuditLog" 
      ORDER BY "createdAt" DESC 
      LIMIT 25;
    `);
    console.log('Recent AuditLog entries:', auditRes.rows);

    // Also check all partners in partner_profiles
    const partnersRes = await pool.query(`
      SELECT p.id, p.user_id, u.email, u.name, p.business_name, p.phone, p.status, p.created_at
      FROM partner_profiles p
      JOIN "User" u ON p.user_id = u.id
      ORDER BY p.created_at DESC;
    `);
    console.log('\nAll partner_profiles in DB:');
    console.log(partnersRes.rows);

  } catch (err) {
    console.error('AuditLog query error:', err);
  } finally {
    await pool.end();
  }
}

main();
