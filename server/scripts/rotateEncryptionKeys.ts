/**
 * Database Encryption Key Rotation Utility (SEC-FIN-02 / SEC-FIN-03)
 * Safely decrypts legacy encrypted records using fallback candidate keys
 * and re-encrypts them using the dedicated primary encryption keys.
 */
import pool from '../src/db';
import { decryptCardData, encryptCardData } from '../src/utils/cryptoCard';
import { decryptVoucherCode, encryptVoucherCode } from '../src/utils/cryptoVoucher';
import { decryptPassword, encryptPassword } from '../src/utils/cryptoAccount';

async function runKeyRotation() {
  console.log('=== KIROPRO ENCRYPTION KEY ROTATION & INTEGRITY CHECK ===\n');

  const client = await pool.connect();
  try {
    // 1. Check & Re-encrypt Virtual Cards (kiropro_cards)
    console.log('1. Checking Virtual Cards table (kiropro_cards)...');
    const cardsRes = await client.query(`
      SELECT id, encrypted_pan, encrypted_cvv 
      FROM kiropro_cards 
      WHERE encrypted_pan IS NOT NULL
    `);
    console.log(`Found ${cardsRes.rows.length} cards.`);

    let cardsRotated = 0;
    for (const card of cardsRes.rows) {
      try {
        const pan = decryptCardData(card.encrypted_pan);
        const cvv = card.encrypted_cvv ? decryptCardData(card.encrypted_cvv) : null;

        // Re-encrypt with primary key
        const newEncPan = encryptCardData(pan);
        const newEncCvv = cvv ? encryptCardData(cvv) : null;

        await client.query(`
          UPDATE kiropro_cards 
          SET encrypted_pan = $1, encrypted_cvv = $2, updated_at = NOW()
          WHERE id = $3
        `, [newEncPan, newEncCvv, card.id]);

        cardsRotated++;
      } catch (err: any) {
        console.error(`Error rotating card ${card.id}:`, err.message);
      }
    }
    console.log(`Successfully verified/rotated ${cardsRotated}/${cardsRes.rows.length} cards.\n`);

    // 2. Check & Re-encrypt Voucher Codes (order_voucher_codes)
    console.log('2. Checking Order Voucher Codes table (order_voucher_codes)...');
    const voucherRes = await client.query(`
      SELECT id, code_encrypted 
      FROM order_voucher_codes 
      WHERE code_encrypted IS NOT NULL
    `);
    console.log(`Found ${voucherRes.rows.length} voucher records.`);

    let vouchersRotated = 0;
    for (const v of voucherRes.rows) {
      try {
        const code = decryptVoucherCode(v.code_encrypted);
        const newEnc = encryptVoucherCode(code);

        await client.query(`
          UPDATE order_voucher_codes 
          SET code_encrypted = $1 
          WHERE id = $2
        `, [newEnc, v.id]);

        vouchersRotated++;
      } catch (err: any) {
        console.error(`Error rotating voucher ${v.id}:`, err.message);
      }
    }
    console.log(`Successfully verified/rotated ${vouchersRotated}/${voucherRes.rows.length} vouchers.\n`);

    // 3. Check & Re-encrypt Digital Product Accounts (digital_product_account_items)
    console.log('3. Checking Digital Product Accounts (digital_product_account_items)...');
    const accountsRes = await client.query(`
      SELECT id, password_encrypted 
      FROM digital_product_account_items 
      WHERE password_encrypted IS NOT NULL
    `);
    console.log(`Found ${accountsRes.rows.length} digital account items.`);

    let accountsRotated = 0;
    for (const acc of accountsRes.rows) {
      try {
        const pwd = decryptPassword(acc.password_encrypted);
        const newEnc = encryptPassword(pwd);

        await client.query(`
          UPDATE digital_product_account_items 
          SET password_encrypted = $1 
          WHERE id = $2
        `, [newEnc, acc.id]);

        accountsRotated++;
      } catch (err: any) {
        console.error(`Error rotating account item ${acc.id}:`, err.message);
      }
    }
    console.log(`Successfully verified/rotated ${accountsRotated}/${accountsRes.rows.length} account items.\n`);

    console.log('=== ROTATION AND INTEGRITY CHECK COMPLETED SUCCESSFULLY ===');
  } catch (err: any) {
    console.error('Fatal rotation error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runKeyRotation().catch(console.error);
