const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('================================================================');
    console.log('    EXECUTING PRODUCTION FINANCIAL MIGRATION TO SDG (ONE-TIME)  ');
    console.log('================================================================\n');

    // 1. Idempotency Check
    const markerRes = await client.query(`SELECT value FROM "platform_settings" WHERE key = 'customer_currency_migration_sdg'`);
    if (markerRes.rows.length > 0 && markerRes.rows[0].value?.status === 'COMPLETED') {
      console.log('⚠️ Migration was already applied previously: MIGRATION_ALREADY_APPLIED');
      console.log('Details:', markerRes.rows[0].value);
      return;
    }

    // 2. Apply Migration 019 DDL
    console.log('Step 1: Applying DDL schema (table & triggers)...');
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/019_customer_currency_migration_sdg.sql'), 'utf-8');
    await client.query(sql);
    console.log('✓ DDL schema applied successfully.\n');

    // 3. Begin Atomic Data Transaction
    console.log('Step 2: Beginning atomic database transaction...');
    await client.query('BEGIN');

    // Fetch exchange rate snapshot
    const rateRes = await client.query(`SELECT value FROM "platform_settings" WHERE key = 'exchange_rate'`);
    const rate = Number(rateRes.rows[0]?.value?.rate || 7600);
    console.log(`Active Exchange Rate used: 1 USD = ${rate} SDG`);

    // Fetch USD Customer Wallets for update
    const usdWalletsRes = await client.query(`
      SELECT 
        w.id as wallet_id,
        w."userId",
        u.email,
        w.balance,
        w.currency
      FROM "Wallet" w
      JOIN "User" u ON w."userId" = u.id
      WHERE u.role = 'CUSTOMER' AND w.currency = 'USD'
      FOR UPDATE OF w
    `);

    console.log(`\nFound ${usdWalletsRes.rows.length} real Customer USD wallets to convert:`);

    let totalUsdConverted = 0;
    let totalSdgResulting = 0;

    for (const w of usdWalletsRes.rows) {
      const oldBal = Number(w.balance || 0);
      const newBal = Math.round(oldBal * rate * 100) / 100;
      totalUsdConverted += oldBal;
      totalSdgResulting += newBal;

      const snapshotId = uuidv4();

      // Record snapshot
      await client.query(`
        INSERT INTO "currency_migration_snapshots" (
          id, user_id, wallet_id, user_email, old_currency, old_balance,
          exchange_rate_used, new_currency, new_balance, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED')
      `, [snapshotId, w.userId, w.wallet_id, w.email, 'USD', oldBal, rate, 'SDG', newBal]);

      // If had balance, log formal WalletTransaction
      if (oldBal > 0) {
        await client.query(`
          INSERT INTO "WalletTransaction" (
            id, "walletId", amount, type, description, currency,
            source_amount_usd, exchange_rate, "balanceBefore", "balanceAfter",
            "referenceType", "referenceId", "createdBy", "created_by_type"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, null, 'SYSTEM')
        `, [
          uuidv4(),
          w.wallet_id,
          newBal - oldBal,
          'CURRENCY_MIGRATION',
          `تحويل رصيد المحفظة من USD إلى الجنيه السوداني (SDG) بسعر صرف ${rate}`,
          'SDG',
          oldBal,
          rate,
          oldBal,
          newBal,
          'MIGRATION',
          snapshotId
        ]);
      }

      // Update Wallet
      await client.query(`
        UPDATE "Wallet" 
        SET balance = $1, currency = 'SDG', "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newBal, w.wallet_id]);

      console.log(`  ✓ Converted user [${w.email}]: ${oldBal} USD -> ${newBal} SDG`);
    }

    // 4. Update all CUSTOMER preferred_currency to SDG
    const userUpdateRes = await client.query(`
      UPDATE "User" 
      SET preferred_currency = 'SDG', "updatedAt" = CURRENT_TIMESTAMP 
      WHERE role = 'CUSTOMER' AND (preferred_currency != 'SDG' OR preferred_currency IS NULL)
    `);
    console.log(`\n✓ Updated preferred_currency = 'SDG' for ${userUpdateRes.rowCount} customers.`);

    // 5. Grant legitimate 1,000 SDG welcome rewards to the 3 referral users
    const referralEmails = ['b29878587@gmail.com', 'ays0999090498@hotmail.com', 'aly257093@hotmail.com'];
    for (const refEmail of referralEmails) {
      const uRes = await client.query(`SELECT id FROM "User" WHERE email = $1`, [refEmail]);
      if (uRes.rows.length > 0) {
        const uId = uRes.rows[0].id;
        const wRes = await client.query(`SELECT id, balance, currency FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`, [uId]);
        const w = wRes.rows[0];
        if (w && Number(w.balance) === 0) {
          const balBefore = 0;
          const balAfter = 1000;
          await client.query(`UPDATE "Wallet" SET balance = $1 WHERE id = $2`, [balAfter, w.id]);
          await client.query(`
            INSERT INTO "WalletTransaction" (
              id, "walletId", amount, type, description, currency,
              "balanceBefore", "balanceAfter", "referenceType", "referenceId", "createdBy", "created_by_type"
            ) VALUES ($1, $2, 1000, 'REFERRAL_BONUS', 'مكافأة الصداقة الترحيبية المعتمدة - 1,000 ج.س', 'SDG', $3, $4, 'REFERRAL', null, null, 'SYSTEM')
          `, [uuidv4(), w.id, balBefore, balAfter]);
          console.log(`  ✓ Credited legitimate 1,000 SDG welcome reward to [${refEmail}]`);
        }
      }
    }

    // 6. Update referrals table currency to SDG
    await client.query(`UPDATE "referrals" SET currency = 'SDG' WHERE currency != 'SDG'`);

    // 7. Record Idempotency Marker in platform_settings
    await client.query(`
      INSERT INTO "platform_settings" ("key", "value", "updated_at")
      VALUES ('customer_currency_migration_sdg', $1, CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE 
      SET "value" = $1, "updated_at" = CURRENT_TIMESTAMP
    `, [JSON.stringify({
      applied_at: new Date().toISOString(),
      exchange_rate: rate,
      wallets_converted: usdWalletsRes.rows.length,
      total_usd_converted: totalUsdConverted,
      total_sdg_resulting: totalSdgResulting,
      status: 'COMPLETED'
    })]);

    // Commit Transaction
    await client.query('COMMIT');
    console.log('\n================================================================');
    console.log('✓ FINANCIAL MIGRATION COMMITTED & COMPLETED SUCCESSFULLY!');
    console.log(`  Total USD Converted:    ${totalUsdConverted} USD`);
    console.log(`  Total SDG Resulting:    ${totalSdgResulting} SDG`);
    console.log(`  Exchange Rate Applied:  ${rate} SDG/USD`);
    console.log('================================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ MIGRATION FAILED — FULL ROLLBACK EXECUTED:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
