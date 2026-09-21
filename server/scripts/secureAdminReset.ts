import readline from 'readline';
import bcrypt from 'bcrypt';
import dns from 'node:dns';
import { v4 as uuidv4 } from 'uuid';
import pool from '../src/db';

dns.setDefaultResultOrder('ipv4first');

/**
 * Direct programmatic function to reset admin password with security checks and audit logging
 */
export async function resetAdminPasswordDirect(email: string, newPassword: string): Promise<{ success: boolean; adminId: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('البريد الإلكتروني مطلوب.');
  }

  if (!newPassword || newPassword.length < 8) {
    throw new Error('كلمة المرور يجب ألا تقل عن 8 أحرف.');
  }

  // 1. Verify user exists and has ADMIN role
  const userRes = await pool.query(
    'SELECT id, email, name, role FROM "User" WHERE email = $1',
    [normalizedEmail]
  );
  const user = userRes.rows[0];
  if (!user) {
    throw new Error(`لا يوجد حساب مسجل بهذا البريد الإلكتروني: ${normalizedEmail}`);
  }
  if (user.role !== 'ADMIN') {
    throw new Error(`الحساب ${normalizedEmail} ليس بحساب مشرف (ADMIN). لا يمكن استخدام هذه الأداة.`);
  }

  // 2. Hash password with bcrypt
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE "User"
       SET "passwordHash" = $1,
           "passwordChangedAt" = CURRENT_TIMESTAMP,
           "emailVerified" = true,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // 3. Log to AuditLog table
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, reason)
       VALUES ($1, $2, 'ADMIN_PASSWORD_RESET', $3)`,
      [uuidv4(), user.id, `Admin password securely reset for ${normalizedEmail}`]
    );

    await client.query('COMMIT');
    return { success: true, adminId: user.id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const question = (rl: readline.Interface, query: string): Promise<string> => {
  return new Promise(resolve => rl.question(query, resolve));
};

async function main() {
  console.log('==============================================');
  console.log('  KIROPRO Secure Admin Password Reset Utility  ');
  console.log('==============================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const email = (await question(rl, 'Enter Admin Email to reset: ')).trim().toLowerCase();
    const newPassword = await question(rl, 'Enter New Secure Password (min 8 chars): ');
    const confirmPassword = await question(rl, 'Confirm New Password: ');

    if (newPassword !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const confirmAction = (await question(rl, `Are you sure you want to reset password for ${email}? (yes/no): `)).toLowerCase();
    if (confirmAction !== 'yes' && confirmAction !== 'y') {
      console.log('Operation aborted by user.');
      return;
    }

    await resetAdminPasswordDirect(email, newPassword);
    console.log('\n✅ Admin password has been securely reset successfully.');
    console.log('All previous active browser sessions have been invalidated.');
  } catch (error: any) {
    console.error('\n❌ Password reset failed:', error.message);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Only execute interactive CLI when script is run directly
if (require.main === module) {
  main();
}
