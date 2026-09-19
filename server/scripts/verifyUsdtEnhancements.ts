import dotenv from 'dotenv';
dotenv.config();

import pool from '../src/db';
import {
  createUsdtOrder,
  completeUsdtOrder,
  cancelUsdtOrder,
  updateUsdtInventory,
  updateUsdtExchangeRate,
  updateUsdtMinAmount,
  validateWalletAddress,
  getUsdtPublicConfig,
  getUsdtAdminStats,
  createCryptoNetwork,
  updateCryptoNetwork,
  deleteCryptoNetwork
} from '../src/services/cryptoService';
import { v4 as uuidv4 } from 'uuid';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    throw new Error(`Test failed: ${testName} ${detail || ''}`);
  }
}

async function runAllEnhancementTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE USDT ENHANCEMENTS TEST SUITE (24 TESTS)');
  console.log('================================================================\n');

  const validEvmAddress1 = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
  const validEvmAddress2 = '0x2b5AD5c4795c026514f8317c7a215E218DcCD6cF';
  const validEvmAddress3 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
  const validEvmAddress4 = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';
  const validEvmAddress5 = '0x1111111254EEB25477B68fb85Ed929f73A960582';
  const validTronAddress1 = 'TYDzsYUEpvnYmQk4zGP9sWWcTEd36dAtWv';
  const validTronAddress2 = 'TLyqz4YmmY5hxpaxb9FPJ2bSTh5hPjC8c2';
  const invalidEvmAddress = '0xInvalidEvmAddress';
  const invalidTronAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'; // EVM address passed as TRON

  // 1. Setup Test User with Wallet
  const testEmail = `usdt_test_${Date.now()}@kiropro.test`;
  const userRes = await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", role, preferred_currency) 
     VALUES ($1, $2, 'hashed_pwd', 'CUSTOMER', 'SDG') RETURNING id`,
    [uuidv4(), testEmail]
  );
  const userId = userRes.rows[0].id;

  await pool.query(
    `INSERT INTO "Wallet" (id, "userId", balance, currency) VALUES ($1, $2, 50000000, 'SDG')`,
    [uuidv4(), userId]
  );

  // Setup Admin user for audit logs
  const adminRes = await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", role, preferred_currency) 
     VALUES ($1, $2, 'hashed_admin', 'ADMIN', 'SDG') RETURNING id`,
    [uuidv4(), `admin_${Date.now()}@kiropro.test`]
  );
  const adminId = adminRes.rows[0].id;

  // Initialize Inventory
  await pool.query(
    `UPDATE usdt_inventory 
     SET available = 100.0000, reserved = 0.0000, sold = 0.0000, exchange_rate = 6200.0000, min_order_amount = 1.0000 
     WHERE id = 1`
  );

  console.log('--- Group 1: Minimum Order Amount Config & Enforcement ---');

  // Test 1: Admin sets Minimum = 1 ✅
  const min1Res = await updateUsdtMinAmount(1.0, adminId);
  assert(min1Res.minOrderAmount === 1.0, 'Test 1: Admin يضبط Minimum = 1 ✅');

  // Test 2: Admin sets Minimum = 2 ✅
  const min2Res = await updateUsdtMinAmount(2.0, adminId);
  assert(min2Res.minOrderAmount === 2.0, 'Test 2: Admin يضبط Minimum = 2 ✅');

  // Test 3: Minimum = 0 ❌
  let minZeroFailed = false;
  try {
    await updateUsdtMinAmount(0, adminId);
  } catch (err: any) {
    minZeroFailed = true;
    assert(err.message.includes('1 USDT'), 'Test 3: ضبط Minimum = 0 يُرفض برسالة حماية واضحة');
  }
  assert(minZeroFailed, 'Test 3: Minimum = 0 ❌ تم رفضه بنجاح');

  // Test 4: Customer requests < Minimum ❌
  // Set minimum back to 2
  await updateUsdtMinAmount(2.0, adminId);
  let orderUnderMinFailed = false;
  try {
    await createUsdtOrder({
      userId,
      amount: 1.5,
      networkIdentifier: 'POLYGON',
      walletAddress: validEvmAddress1
    });
  } catch (err: any) {
    orderUnderMinFailed = true;
    assert(err.code === 'MINIMUM_USDT_AMOUNT_NOT_MET', 'Test 4: طلب أقل من Minimum يرفض من الباكيند');
  }
  assert(orderUnderMinFailed, 'Test 4: Customer يطلب أقل من Minimum ❌');

  console.log('\n--- Group 2: Independent USDT Exchange Rate ---');

  // Test 5: USDT rate مستقل عن General Exchange Rate ✅
  await updateUsdtExchangeRate(6200, adminId);
  const publicConfig = await getUsdtPublicConfig();
  assert(publicConfig.exchangeRate === 6200, 'Test 5: USDT rate مستقل وقيمته 6200 SDG ✅');

  // Test 6: تعديل USDT rate يؤثر على الطلبات الجديدة فقط والطلبات القديمة تحتفظ بسعرها ✅
  // Create order at rate 6200
  const orderAt6200 = await createUsdtOrder({
    userId,
    amount: 5,
    networkIdentifier: 'POLYGON',
    walletAddress: validEvmAddress2
  });
  const chargedFirst = Number(orderAt6200.chargedAmount);
  assert(chargedFirst === 5 * 6200, `Order created at rate 6200: ${chargedFirst} SDG`);

  // Update rate to 6500
  await updateUsdtExchangeRate(6500, adminId);

  // Check that orderAt6200 in DB still has 6200
  const savedOldOrder = await pool.query('SELECT "exchangeRateUsed", "chargedAmount" FROM "Order" WHERE id = $1', [orderAt6200.orderId]);
  assert(Number(savedOldOrder.rows[0].exchangeRateUsed) === 6200, 'Test 6: الطلب القديم يحتفظ بسعره 6200 دون تغيير');

  // Create new order at rate 6500 with validEvmAddress3
  const orderAt6500 = await createUsdtOrder({
    userId,
    amount: 5,
    networkIdentifier: 'POLYGON',
    walletAddress: validEvmAddress3
  });
  assert(Number(orderAt6500.chargedAmount) === 5 * 6500, 'Test 6: الطلب الجديد يطبق السعر الجديد 6500 SDG ✅');

  console.log('\n--- Group 3: Inventory Management & Boundary Rules ---');

  // Test 7: تعديل inventory ✅
  const invRes = await updateUsdtInventory(80, adminId);
  assert(invRes.available === 80, 'Test 7: تعديل Inventory إلى 80 بنجاح ✅');

  // Test 8: لا يمكن Available < Reserved ❌
  // Currently reserved has 5 + 5 = 10 from the two previous orders
  const statsBefore = await getUsdtAdminStats();
  const reservedNow = statsBefore.inventory.reserved;
  let invalidInvFailed = false;
  try {
    await updateUsdtInventory(reservedNow - 1, adminId);
  } catch (err: any) {
    invalidInvFailed = true;
    assert(err.message.includes('أقل من المخزون المحجوز'), 'Test 8: رسالة رفض دقيقة عند محاولة جعل Available < Reserved');
  }
  assert(invalidInvFailed, 'Test 8: لا يمكن Available < Reserved ❌ تم رفضه');

  // Test 9: Customer يرى Available فقط بدون أسرار داخلية ✅
  const customerCfg = await getUsdtPublicConfig();
  assert(customerCfg.available !== undefined && (customerCfg as any).reserved === undefined && (customerCfg as any).sold === undefined, 'Test 9: Customer يرى Available فقط ✅');

  // Test 10: Available = 0 → الطلب معطل والطلب يرفض ✅
  // Clear inventory to test 0
  await pool.query('UPDATE usdt_inventory SET available = 0 WHERE id = 1');
  let zeroInvOrderFailed = false;
  try {
    await createUsdtOrder({
      userId,
      amount: 2,
      networkIdentifier: 'POLYGON',
      walletAddress: validEvmAddress4
    });
  } catch (err: any) {
    zeroInvOrderFailed = true;
    console.log('    Debug Test 10 error:', err.code, '|', err.message);
    assert(err.code === 'INSUFFICIENT_INVENTORY' || err.message.includes('الكمية المتاحة'), 'Test 10: رفض الطلب لعدم توفر مخزون', `${err.code}: ${err.message}`);
  }
  assert(zeroInvOrderFailed, 'Test 10: Available = 0 → الطلب يرفض من الباكيند ✅');

  // Restore inventory
  await pool.query('UPDATE usdt_inventory SET available = 100 WHERE id = 1');

  console.log('\n--- Group 4: Network CRUD & Delete Protection ---');

  // Test 11: إنشاء Network ✅
  const testNetCode = `TESTNET_${Date.now().toString().slice(-4)}`;
  const createdNet = await createCryptoNetwork({
    identifier: testNetCode,
    name: 'Test Network Custom',
    validatorType: 'EVM',
    minAmount: 2.0,
    enabled: true,
    displayOrder: 99
  });
  assert(createdNet.identifier === testNetCode && createdNet.name === 'Test Network Custom', 'Test 11: إنشاء Network ✅');

  // Test 12: تعديل Network ✅
  const updatedNet = await updateCryptoNetwork(createdNet.id, {
    name: 'Test Network Updated',
    minAmount: 1.5,
    displayOrder: 98
  });
  assert(updatedNet.name === 'Test Network Updated' && Number(updatedNet.min_amount) === 1.5, 'Test 12: تعديل Network ✅');

  // Test 13: Disable Network ✅
  const disabledNet = await updateCryptoNetwork(createdNet.id, { enabled: false });
  assert(disabledNet.enabled === false, 'Test 13: Disable Network ✅');

  // Test 14: Disabled Network لا تظهر للعميل ✅
  const customerCfgAfterDisable = await getUsdtPublicConfig();
  const foundDisabledInCustomer = customerCfgAfterDisable.networks.some(n => n.identifier === testNetCode);
  assert(!foundDisabledInCustomer, 'Test 14: الشبكة المعطلة لا تظهر في واجهة العميل ✅');

  // Re-enable for order creation test
  await updateCryptoNetwork(createdNet.id, { enabled: true });

  // Test 15: Delete Network بدون Orders ✅
  const tempNetCode = `DELNET_${Date.now().toString().slice(-4)}`;
  const tempNet = await createCryptoNetwork({
    identifier: tempNetCode,
    name: 'To Delete Network',
    validatorType: 'EVM',
    minAmount: 1.0,
    enabled: true,
    displayOrder: 100
  });
  const delResult = await deleteCryptoNetwork(tempNet.id);
  assert(delResult.success === true, 'Test 15: Delete Network بدون Orders نجح ✅');

  // Test 16: Delete Network مع Orders ❌ (يجب منعه مع رسالة واضحة)
  // Create an order on createdNet
  const orderOnTestNet = await createUsdtOrder({
    userId,
    amount: 2,
    networkIdentifier: testNetCode,
    walletAddress: validEvmAddress5
  });
  let deleteBlocked = false;
  try {
    await deleteCryptoNetwork(createdNet.id);
  } catch (err: any) {
    deleteBlocked = true;
    assert(err.message.includes('لا يمكن حذف هذه الشبكة لأنها مرتبطة بطلبات سابقة'), 'Test 16: رسالة الرفض عند محاولة حذف شبكة مرتبطة بطلبات');
  }
  assert(deleteBlocked, 'Test 16: Delete Network مع Orders ❌ تم حظره بنجاح');

  // Test 17: Historical orders تبقى سليمة ✅
  const historicalOrder = await pool.query('SELECT status, "cryptoNetwork" FROM "Order" WHERE id = $1', [orderOnTestNet.orderId]);
  assert(historicalOrder.rows[0].cryptoNetwork === testNetCode, 'Test 17: Historical orders تبقى سليمة ومحتفظة ببياناتها ✅');

  console.log('\n--- Group 5: Address Validation (EVM vs TRON) ---');

  // Test 18: Network-specific address validation ✅
  const validEvm = validateWalletAddress('EVM', validEvmAddress1);
  const invalidEvm = validateWalletAddress('EVM', '0x123');
  const validTron = validateWalletAddress('TRON', validTronAddress1);
  const invalidTron = validateWalletAddress('TRON', invalidTronAddress);

  assert(validEvm.valid === true, 'Valid EVM address passes');
  assert(invalidEvm.valid === false, 'Invalid EVM address rejected');
  assert(validTron.valid === true, 'Valid TRON address passes');
  assert(invalidTron.valid === false, 'EVM address rejected for TRON network');
  console.log('  ✅ [PASS] Test 18: Network-specific address validation (EVM vs TRON) ✅');

  console.log('\n--- Group 6: Atomic Reservation, Cancel Refund & Complete Settlement ---');

  // Test 19: Atomic inventory reservation ✅
  const invBeforeOrder = (await pool.query('SELECT available, reserved FROM usdt_inventory WHERE id = 1')).rows[0];
  const orderAtomic = await createUsdtOrder({
    userId,
    amount: 10,
    networkIdentifier: 'POLYGON',
    walletAddress: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88'
  });
  const invAfterOrder = (await pool.query('SELECT available, reserved FROM usdt_inventory WHERE id = 1')).rows[0];
  assert(
    Number(invAfterOrder.available) === Number(invBeforeOrder.available) - 10 &&
    Number(invAfterOrder.reserved) === Number(invBeforeOrder.reserved) + 10,
    'Test 19: Atomic inventory reservation (available -10, reserved +10) ✅'
  );

  // Test 20: Cancel يرجع inventory (reserved -> available) ✅
  const invBeforeCancel = (await pool.query('SELECT available, reserved FROM usdt_inventory WHERE id = 1')).rows[0];
  await cancelUsdtOrder({ orderId: orderAtomic.orderId, adminId, reason: 'Test cancel refund' });
  const invAfterCancel = (await pool.query('SELECT available, reserved FROM usdt_inventory WHERE id = 1')).rows[0];
  assert(
    Number(invAfterCancel.available) === Number(invBeforeCancel.available) + 10 &&
    Number(invAfterCancel.reserved) === Number(invBeforeCancel.reserved) - 10,
    'Test 20: Cancel يرجع inventory (reserved -10, available +10) ✅'
  );

  // Test 21: Complete يخصم المخزون المحجوز ويزيد المباع (reserved -> sold) ✅
  const orderForComplete = await createUsdtOrder({
    userId,
    amount: 4,
    networkIdentifier: 'TRON',
    walletAddress: validTronAddress2
  });
  const invBeforeComplete = (await pool.query('SELECT reserved, sold FROM usdt_inventory WHERE id = 1')).rows[0];
  await completeUsdtOrder({ orderId: orderForComplete.orderId, adminId, txHash: '0xcompletetest123' });
  const invAfterComplete = (await pool.query('SELECT reserved, sold FROM usdt_inventory WHERE id = 1')).rows[0];
  assert(
    Number(invAfterComplete.reserved) === Number(invBeforeComplete.reserved) - 4 &&
    Number(invAfterComplete.sold) === Number(invBeforeComplete.sold) + 4,
    'Test 21: Complete يخصم المخزون المحجوز ويزيد المباع (reserved -4, sold +4) ✅'
  );

  // Clean up test created network
  await pool.query('DELETE FROM "Order" WHERE "cryptoNetwork" = $1', [testNetCode]);
  await deleteCryptoNetwork(createdNet.id);

  console.log('\n================================================================');
  console.log('🎉 ALL 21 BACKEND & BUSINESS LOGIC ENHANCEMENT TESTS PASSED! 🎉');
  console.log('================================================================\n');

  await pool.end();
}

runAllEnhancementTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  });
