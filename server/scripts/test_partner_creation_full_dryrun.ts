import pool from '../src/db';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const targetEmail = 'abobakerameer5@gmail.com';
  const name = 'ابوبكر أمير';
  const client = await pool.connect();
  
  try {
    console.log(`=== FULL DRY-RUN EXECUTION FOR "${targetEmail}" ===\n`);
    await client.query('BEGIN');

    const normalizedEmail = targetEmail.trim().toLowerCase();
    
    // Step 0: Check regex
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('يرجى إدخال بريد إلكتروني صحيح.');
    }
    console.log('Regex validation passed.');

    // Step 1: Check existing
    const existingUser = await client.query('SELECT id FROM "User" WHERE email = $1', [normalizedEmail]);
    console.log(`Existing user check: ${existingUser.rows.length} rows found.`);
    if (existingUser.rows.length > 0) {
      throw new Error('البريد الإلكتروني مسجل مسبقاً في النظام.');
    }

    // Step 2: Resolve level
    const defaultLevelRes = await client.query(
      `SELECT id FROM partner_levels ORDER BY min_points ASC LIMIT 1`
    );
    const effectiveLevelId = defaultLevelRes.rows[0]?.id;
    console.log('Resolved levelId:', effectiveLevelId);

    // Step 3: Insert User
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const placeholderPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const userId = uuidv4();

    await client.query(
      `INSERT INTO "User" (
        id, email, name, "passwordHash", role, 
        "emailVerified", preferred_currency, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'PARTNER', true, 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, normalizedEmail, name.trim(), placeholderPasswordHash]
    );
    console.log('Inserted User with role PARTNER successfully.');

    // Step 4: Insert partner_profiles
    const partnerId = uuidv4();
    await client.query(
      `INSERT INTO partner_profiles (
        id, user_id, business_name, phone, status, 
        level_id, total_points, must_change_password, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, 0.00, true, $7)`,
      [
        partnerId,
        userId,
        'متجر تجريبي',
        null,
        'ACTIVE',
        effectiveLevelId || null,
        null
      ]
    );
    console.log('Inserted partner_profiles successfully.');

    // Step 5: Insert partner_wallets
    await client.query(
      `INSERT INTO partner_wallets (
        id, partner_id, balance, currency, total_deposited_usd, total_spent_usd
      ) VALUES ($1, $2, 0.0000, 'USD', 0.0000, 0.0000)`,
      [uuidv4(), partnerId]
    );
    console.log('Inserted partner_wallets successfully.');

    // Step 6: Insert partner_setup_tokens
    await client.query(
      `INSERT INTO partner_setup_tokens (
        id, partner_id, token_hash, expires_at
      ) VALUES ($1, $2, $3, $4)`,
      [uuidv4(), partnerId, tokenHash, expiresAt]
    );
    console.log('Inserted partner_setup_tokens successfully.');

    // Step 7: Record AuditLog
    await client.query(
      `INSERT INTO "AuditLog" (id, "adminId", action, "targetUserId", reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        '888c5fa8-6f89-40e8-a5f1-0246ce525b57',
        'CREATE_PARTNER',
        userId,
        `إنشاء حساب تاجر جديد: ${name} (${normalizedEmail})`
      ]
    );
    console.log('Inserted AuditLog successfully.');

    console.log('\n>>> SUCCESS! All queries executed without error.');
    
    // Always rollback
    await client.query('ROLLBACK');
    console.log('Rolled back cleanly. No changes committed.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('FAILED during dry-run:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
