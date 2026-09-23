const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

const UNVERIFIED_ACCOUNTS = [
  { email: 'yasmineyoyi32@gmail.com', originalTxId: 'ef0c1591-09fa-4b74-bf63-5e6278d038be' },
  { email: 'kelwa771@gmail.com', originalTxId: '7776d58a-78f3-4710-b0ef-eb549c76658a' },
  { email: 'ays0999090498@hotmail.com', originalTxId: '6bd5157b-c5cf-406e-b385-c024eadbd6df' },
  { email: 'aly257093@hotmail.com', originalTxId: 'a7e7e6b0-2bae-4c43-92f3-dff649327290' },
  { email: 'synyiayna@gmail.com', originalTxId: 'cf48ff43-40a8-4949-a282-c1ba4cf3f0d2' }
];

async function executeSafeReversal() {
  const client = await pool.connect();
  console.log('=== EXECUTING SAFE REVERSAL FOR CONFIRMED UNVERIFIED REFERRAL BONUSES ===\n');

  try {
    await client.query('BEGIN');

    for (const item of UNVERIFIED_ACCOUNTS) {
      console.log(`Processing reversal for ${item.email}...`);
      
      const uRes = await client.query(
        'SELECT id, email, "emailVerified" FROM "User" WHERE email = $1 FOR UPDATE',
        [item.email]
      );
      const user = uRes.rows[0];
      if (!user) {
        console.warn(`User ${item.email} not found, skipping.`);
        continue;
      }

      if (user.emailVerified) {
        console.warn(`User ${item.email} is actually verified, skipping safety reversal.`);
        continue;
      }

      const wRes = await client.query(
        'SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE',
        [user.id]
      );
      const wallet = wRes.rows[0];
      if (!wallet) {
        console.warn(`Wallet for ${item.email} not found, skipping.`);
        continue;
      }

      const balBefore = Number(wallet.balance || 0);
      if (balBefore <= 0) {
        console.log(`Wallet balance for ${item.email} is already 0, skipping.`);
        continue;
      }

      const reversalAmount = 1000;
      const balAfter = Math.max(0, balBefore - reversalAmount);

      // 1. Update wallet balance
      await client.query('UPDATE "Wallet" SET balance = $1 WHERE id = $2', [balAfter, wallet.id]);

      // 2. Insert documented audit reversal transaction (NO DELETE)
      const reversalTxId = uuidv4();
      await client.query(`
        INSERT INTO "WalletTransaction" (
          id, "walletId", amount, type, description, 
          currency, "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
        ) VALUES ($1, $2, $3, 'REFERRAL_REVERSAL', $4, 'SDG', $5, $6, 'SYSTEM_REVERSAL', $7, null, 'SYSTEM')
      `, [
        reversalTxId,
        wallet.id,
        -reversalAmount,
        `تسوية تصحيحية أمنية: تعليق مكافأة الترحيب لعدم توثيق ملكية البريد (مرجع الحركة الأصلية: ${item.originalTxId})`,
        balBefore,
        balAfter,
        item.originalTxId
      ]);

      // 3. Reset referrals record to unearned (referee_reward_paid = false) so if legitimate user verifies later they can earn it
      await client.query(`
        UPDATE "referrals"
        SET referee_reward_paid = false,
            referee_reward_paid_at = null,
            updated_at = CURRENT_TIMESTAMP
        WHERE referee_id = $1
      `, [user.id]);

      // 4. Log security event
      await client.query(`
        INSERT INTO "security_events" (
          user_id, event_type, ip_address, metadata
        ) VALUES ($1, 'REFERRAL_REVERSAL', '127.0.0.1', $2)
      `, [user.id, JSON.stringify({
        action: 'REFERRAL_BONUS_REVERSED',
        original_tx_id: item.originalTxId,
        reversal_tx_id: reversalTxId,
        amount: reversalAmount,
        reason: 'UNVERIFIED_EMAIL_REVERSAL'
      })]);

      console.log(`✓ Reversed 1000 SDG for ${item.email}: Balance ${balBefore} -> ${balAfter} (Tx: ${reversalTxId})`);
    }

    await client.query('COMMIT');
    console.log('\n=== SAFE REVERSAL COMMITTED SUCCESSFULLY! ALL AUDIT TRAILS PRESERVED ===');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reversal failed, rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

executeSafeReversal();
