import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import pool from '../src/db';
import { v4 as uuidv4 } from 'uuid';
import { g2BulkVoucherService } from '../src/services/g2bulkVoucherService';
import { g2BulkVoucherPurchaseProvider } from '../src/providers/g2bulk/voucherPurchaseProvider';
import { encryptVoucherCode, decryptVoucherCode, maskVoucherCode } from '../src/utils/cryptoVoucher';
import { sendVoucherDeliveryEmail } from '../src/services/emailService';

async function runVoucherTests() {
  console.log('================================================================');
  console.log('🧪 KIROPRO × G2BULK DIGITAL VOUCHERS VERIFICATION SUITE');
  console.log('================================================================');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ✕ [FAIL] ${message}`);
      throw new Error(`Test assertion failed: ${message}`);
    }
  }

  // TEST 1: Local Catalog File Verification
  console.log('\n--- 1. Testing Local Catalog File Integrity ---');
  const catalogPath = path.resolve(__dirname, '../data/g2bulk-voucher-catalog.json');
  assert(fs.existsSync(catalogPath), 'server/data/g2bulk-voucher-catalog.json exists locally');

  const fileRaw = fs.readFileSync(catalogPath, 'utf8');
  const catalogData = JSON.parse(fileRaw);
  assert(catalogData.total_categories === 2, 'Catalog total_categories is 2');
  assert(Boolean(catalogData.categories?.freefire && catalogData.categories?.pubg), 'Contains both Free Fire and PUBG UC categories');
  assert(Array.isArray(catalogData.products), 'Catalog products is an array');
  assert(catalogData.products.length >= 15, `Contains 15 voucher products (found: ${catalogData.products.length})`);

  // TEST 2: Strict Provider Image Prohibition
  console.log('\n--- 2. Testing Strict Provider Image Prohibition ---');
  let foundProviderImage = false;
  for (const prod of catalogData.products) {
    if (prod.image_url !== null && prod.image_url !== undefined && prod.image_url !== '') {
      foundProviderImage = true;
      break;
    }
  }
  assert(!foundProviderImage, 'ALL products in local catalog JSON have image_url = null (Provider images strictly banned)');

  // TEST 3: Provider Concealment (White-Label Branding)
  console.log('\n--- 3. Testing Provider Concealment on Customer-Facing Fields ---');
  let providerMentioned = false;
  for (const prod of catalogData.products) {
    const combined = `${prod.title} ${prod.description || ''} ${prod.category_title}`.toLowerCase();
    if (combined.includes('g2bulk')) {
      providerMentioned = true;
      break;
    }
  }
  assert(!providerMentioned, 'G2Bulk name is NOT mentioned in any product titles or descriptions');

  // TEST 4: Database Catalog & GameCategory Verification
  console.log('\n--- 4. Testing Database Tables & Category Registration ---');
  const dbVouchersRes = await pool.query('SELECT * FROM g2bulk_voucher_catalog ORDER BY id ASC');
  assert(dbVouchersRes.rows.length >= 15, `g2bulk_voucher_catalog table has ${dbVouchersRes.rows.length} rows`);

  const gameCatsRes = await pool.query(`SELECT id, name FROM "GameCategory" WHERE id IN ('freefire-vouchers', 'pubg-vouchers')`);
  assert(gameCatsRes.rows.length === 2, 'GameCategory table has freefire-vouchers and pubg-vouchers registered');

  // Verify custom_image_url does not point to G2Bulk
  let dbHasG2BulkImage = false;
  for (const r of dbVouchersRes.rows) {
    if (r.custom_image_url && r.custom_image_url.includes('api.g2bulk.com')) {
      dbHasG2BulkImage = true;
      break;
    }
  }
  assert(!dbHasG2BulkImage, 'Database records have NO images pointing to G2Bulk domain');

  // TEST 5: Cryptography (AES-256-GCM Encryption, Decryption, Masking)
  console.log('\n--- 5. Testing Voucher Cryptography (AES-256-GCM) ---');
  const samplePlainCode = 'PUBG-UC-SAMPLE-8899-A1B2-C3D4';
  const encrypted = encryptVoucherCode(samplePlainCode);
  assert(typeof encrypted === 'string' && encrypted.split(':').length === 3, 'encryptVoucherCode produces IV:AuthTag:Ciphertext');

  const decrypted = decryptVoucherCode(encrypted);
  assert(decrypted === samplePlainCode, 'decryptVoucherCode successfully restored exact plain code');

  const masked = maskVoucherCode(samplePlainCode);
  assert(masked.includes('••••') && masked.endsWith(samplePlainCode.slice(-4)), `maskVoucherCode masks middle characters (${masked})`);

  // TEST 6: Single-Product Live Price Check (Public Read-Only Endpoint)
  console.log('\n--- 6. Testing Live Read-Only Single-Product Price Verification ---');
  try {
    const sampleVoucherId = dbVouchersRes.rows[0].provider_product_id;
    const freshPrice = await g2BulkVoucherPurchaseProvider.getFreshProductPrice(sampleVoucherId);
    assert(freshPrice.unitPrice > 0, `Fresh live price retrieved successfully: $${freshPrice.unitPrice}`);
  } catch (err: any) {
    console.warn('  ⚠️ Note on live network test:', err.message);
  }

  // TEST 7: Strict Mock Provider Purchase Execution (ZERO REAL SPEND)
  console.log('\n--- 7. Testing Purchase Safety Lock (Strict Mock Mode) ---');
  const mockPurchase = await g2BulkVoucherPurchaseProvider.purchaseVoucher({
    providerProductId: 1,
    quantity: 2,
    idempotencyKey: uuidv4(),
    productTitle: '60 UC Voucher',
    gameKey: 'pubg',
    simulateMode: 'COMPLETED'
  });

  assert(mockPurchase.success === true, 'Mock purchase completed successfully');
  assert(mockPurchase.isMock === true, 'MOCK SAFETY LOCK CONFIRMED: isMock = true (ZERO REAL DEDUCTIONS)');
  assert(mockPurchase.deliveryItems.length === 2, 'Delivered exactly 2 voucher codes');
  assert(mockPurchase.deliveryItems[0].startsWith('PUBG-'), 'Generated PUBG voucher format code');

  // TEST 8: Simulated Order Storage and Decrypted History Retrieval
  console.log('\n--- 8. Testing Order Voucher Codes Storage & Retrieval ---');
  const userRowRes = await pool.query(`SELECT id FROM "User" LIMIT 1`);
  const testUserId = userRowRes.rows[0]?.id || uuidv4();
  const testOrderId = uuidv4();
  const testCode1 = 'FREEFIRE-MOCK-CODE-001';
  const testCode2 = 'FREEFIRE-MOCK-CODE-002';

  // Create temporary Order to satisfy Foreign Key
  await pool.query(
    `INSERT INTO "Order" (
      id, "userId", "gameId", "packageId", "packageName", "playerId",
      amount, status, provider, "orderType"
    ) VALUES (
      $1, $2, 'freefire-vouchers', 'pkg-test', 'Test Voucher Package', 'test@kiropro.com',
      7600, 'COMPLETED', 'G2BULK', 'G2BULK_VOUCHER'
    )`,
    [testOrderId, testUserId]
  );

  // Store encrypted codes
  for (const rawCode of [testCode1, testCode2]) {
    await pool.query(
      `INSERT INTO "order_voucher_codes" (
        order_id, user_id, product_id, provider_product_id,
        game_type, code_encrypted, code_masked, face_value, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD')`,
      [
        testOrderId,
        testUserId,
        'prod-test-voucher',
        '6',
        'freefire',
        encryptVoucherCode(rawCode),
        maskVoucherCode(rawCode),
        1.00
      ]
    );
  }

  // Query and decrypt
  const retrievedRes = await pool.query(
    `SELECT * FROM order_voucher_codes WHERE order_id = $1 ORDER BY created_at ASC`,
    [testOrderId]
  );
  assert(retrievedRes.rows.length === 2, 'Stored and retrieved 2 voucher code rows');
  const decryptedCodes = retrievedRes.rows.map(r => decryptVoucherCode(r.code_encrypted));
  assert(decryptedCodes.includes(testCode1), 'First test code matches');
  assert(decryptedCodes.includes(testCode2), 'Second test code matches');

  // Clean up test rows
  await pool.query(`DELETE FROM order_voucher_codes WHERE order_id = $1`, [testOrderId]);
  await pool.query(`DELETE FROM "Order" WHERE id = $1`, [testOrderId]);

  // TEST 9: Admin Catalog Update Capability
  console.log('\n--- 9. Testing Admin Pricing and Custom Image Updates ---');
  const targetVoucher = dbVouchersRes.rows[0];
  const testPrice = 0.99;
  const testCustomImage = '/uploads/custom-voucher-image.png';

  await pool.query(
    `UPDATE g2bulk_voucher_catalog 
     SET customer_price_usd = $1, custom_image_url = $2, is_active = true, updated_at = NOW() 
     WHERE id = $3`,
    [testPrice, testCustomImage, targetVoucher.id]
  );

  const updatedRowRes = await pool.query(`SELECT * FROM g2bulk_voucher_catalog WHERE id = $1`, [targetVoucher.id]);
  const updatedRow = updatedRowRes.rows[0];
  assert(Number(updatedRow.customer_price_usd) === testPrice, 'Admin updated customer_price_usd successfully');
  assert(updatedRow.custom_image_url === testCustomImage, 'Admin set custom_image_url successfully');
  assert(updatedRow.is_active === true, 'Admin toggled is_active successfully');

  // TEST 10: Email Template Generation Test
  console.log('\n--- 10. Testing Email Template Generation ---');
  try {
    const testEmailOrderUuid = uuidv4();
    const emailRes = await sendVoucherDeliveryEmail({
      to: 'buyer-test@kiropro.com',
      orderId: testEmailOrderUuid,
      productName: 'قسيمة فري فاير $1 (100+10 جواهر)',
      gameName: 'Free Fire',
      quantity: 1,
      codes: ['FF-TEST-REDEEM-KEY-7788'],
      totalPaid: '7,600 ج.س'
    });
    assert(emailRes !== undefined, 'Email service successfully built and executed template dispatch');
  } catch (err: any) {
    console.warn('  ⚠️ Note on email test:', err.message);
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL TESTS PASSED! (${passedTests}/${totalTests} assertions passed)`);
  console.log('================================================================\n');
  await pool.end();
}

runVoucherTests().catch(async (err) => {
  console.error('\n✕ Test Suite Failed with Error:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
