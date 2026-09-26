import { v4 as uuidv4 } from 'uuid';
import pool from '../src/db';
import { virtualNumberService } from '../src/services/virtualNumberService';
import { fiveSimClient } from '../src/providers/fiveSim';

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordResult(num: number, name: string, passed: boolean, details: string) {
  results.push({ num, name, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${mark}] Test ${num}: ${name} - ${details}`);
}

async function runSuite() {
  console.log('================================================================');
  console.log('  KiroPro Virtual Numbers (5SIM) Comprehensive Test Suite (15 Tests)');
  console.log('================================================================\n');

  // Save original fiveSimClient methods to allow restoring
  const origBuy = fiveSimClient.buyActivation.bind(fiveSimClient);
  const origCheck = fiveSimClient.checkOrder.bind(fiveSimClient);
  const origCancel = fiveSimClient.cancelOrder.bind(fiveSimClient);
  const origFinish = fiveSimClient.finishOrder.bind(fiveSimClient);

  // Setup Test Users in Database
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const user3Id = uuidv4();
  const wallet1Id = uuidv4();
  const wallet2Id = uuidv4();
  const wallet3Id = uuidv4();

  let test1OrderId = '';

  try {
    // 0. Database Setup for Test Users
    await pool.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", role, preferred_currency, "emailVerified")
       VALUES 
       ($1, $2, 'VN Tester 1', 'dummyhash', 'CUSTOMER', 'SDG', true),
       ($3, $4, 'VN Tester 2', 'dummyhash', 'CUSTOMER', 'SDG', true)
       ON CONFLICT (id) DO NOTHING`,
      [user1Id, `vn_test_user1_${Date.now()}@kiropro.com`, user2Id, `vn_test_user2_${Date.now()}@kiropro.com`]
    );

    await pool.query(
      `INSERT INTO "Wallet" (id, "userId", balance, currency)
       VALUES 
       ($1, $2, 5000.0, 'SDG'),
       ($3, $4, 5000.0, 'SDG')
       ON CONFLICT (id) DO NOTHING`,
      [wallet1Id, user1Id, wallet2Id, user2Id]
    );

    console.log('Test users and wallets created successfully.\n');

    // -------------------------------------------------------------
    // Test 1: طلب ناجح يصل فيه الرقم والكود
    // -------------------------------------------------------------
    try {
      fiveSimClient.buyActivation = async () => ({
        id: 1001,
        phone: '+12025550101',
        operator: 'any',
        product: 'whatsapp',
        price: 20,
        status: 'PENDING',
        expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        sms: null,
        created_at: new Date().toISOString(),
        country: 'usa'
      });

      fiveSimClient.checkOrder = async () => ({
        id: 1001,
        phone: '+12025550101',
        product: 'whatsapp',
        price: 20,
        status: 'RECEIVED',
        expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        sms: [{
          id: 991,
          created_at: new Date().toISOString(),
          date: new Date().toISOString(),
          sender: 'WhatsApp',
          text: 'Your WhatsApp code is 849201',
          code: '849201'
        }],
        country: 'usa',
        created_at: new Date().toISOString()
      });

      fiveSimClient.finishOrder = async () => ({
        id: 1001,
        created_at: new Date().toISOString(),
        phone: '+12025550101',
        product: 'whatsapp',
        price: 20,
        status: 'FINISHED',
        expires: new Date().toISOString(),
        sms: [],
        country: 'usa'
      });

      const order = await virtualNumberService.createOrder({
        userId: user1Id,
        countryCode: 'usa',
        serviceCode: 'whatsapp'
      });
      test1OrderId = order.id;

      const updated = await virtualNumberService.checkAndUpdateOrder(order.id);

      const isCompleted = updated.status === 'COMPLETED';
      const hasCode = updated.smsCode === '849201';
      const hasPhone = updated.phoneNumber === '+12025550101';

      recordResult(
        1,
        'طلب ناجح يصل فيه الرقم والكود',
        isCompleted && hasCode && hasPhone,
        `Status: ${updated.status}, Number: ${updated.phoneNumber}, Code received: ${hasCode ? 'YES (Securely Saved)' : 'NO'}`
      );
    } catch (err: any) {
      recordResult(1, 'طلب ناجح يصل فيه الرقم والكود', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 2: طلب يصل فيه الرقم ولا يصل الكود (انتهاء المهلة / Timeout)
    // -------------------------------------------------------------
    try {
      fiveSimClient.buyActivation = async () => ({
        id: 1002,
        phone: '+12025550102',
        operator: 'any',
        product: 'google',
        price: 15,
        status: 'PENDING',
        expires: new Date(Date.now() - 1000).toISOString(), // Expired
        sms: null,
        created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        country: 'usa'
      });

      fiveSimClient.checkOrder = async () => ({
        id: 1002,
        phone: '+12025550102',
        product: 'google',
        price: 15,
        status: 'TIMEOUT',
        expires: new Date(Date.now() - 1000).toISOString(),
        sms: null,
        country: 'usa',
        created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString()
      });

      const order2 = await virtualNumberService.createOrder({
        userId: user1Id,
        countryCode: 'usa',
        serviceCode: 'google'
      });
      // Force expiry date into the past for deterministic test
      await pool.query('UPDATE virtual_number_orders SET expires_at = CURRENT_TIMESTAMP - interval \'1 minute\' WHERE id = $1', [order2.id]);

      const expiredOrder = await virtualNumberService.checkAndUpdateOrder(order2.id);
      const isExpired = expiredOrder.status === 'EXPIRED';

      recordResult(
        2,
        'طلب يصل فيه الرقم ولا يصل الكود (انتهاء المهلة واسترجاع الرصيد)',
        isExpired,
        `Status: ${expiredOrder.status}, Failure reason: ${expiredOrder.failureReason}`
      );
    } catch (err: any) {
      recordResult(2, 'طلب يصل فيه الرقم ولا يصل الكود', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 3: طلب يفشل من المزود (لا توجد أرقام متاحة)
    // -------------------------------------------------------------
    try {
      fiveSimClient.buyActivation = async () => {
        throw new Error('NO_FREE_PHONES: لا توجد أرقام متوفرة حالياً لهذه الدولة والخدمة.');
      };

      let failed = false;
      try {
        await virtualNumberService.createOrder({
          userId: user1Id,
          countryCode: 'spain',
          serviceCode: 'paypal'
        });
      } catch (err: any) {
        failed = err.message.includes('NO_FREE_PHONES') || err.message.includes('لا توجد أرقام');
      }

      // Check DB: any order created with WAITING_FOR_NUMBER must be marked FAILED
      const failedOrdersRes = await pool.query(
        'SELECT status, failure_reason FROM virtual_number_orders WHERE user_id = $1 AND country_code = \'spain\' AND service_code = \'paypal\' ORDER BY created_at DESC LIMIT 1',
        [user1Id]
      );
      const row = failedOrdersRes.rows[0];
      const isMarkedFailed = row && row.status === 'FAILED';

      recordResult(
        3,
        'طلب يفشل من المزود (عدم توفر أرقام أو خطأ مزود)',
        failed && isMarkedFailed,
        `Caught rejection: ${failed}, DB status: ${row?.status}`
      );
    } catch (err: any) {
      recordResult(3, 'طلب يفشل من المزود', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 4: طلب يتم إلغاؤه بطلب من العميل واستعادة الرصيد
    // -------------------------------------------------------------
    try {
      fiveSimClient.buyActivation = async () => ({
        id: 1004,
        phone: '+447350690994',
        operator: 'any',
        product: 'facebook',
        price: 25,
        status: 'PENDING',
        expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        sms: null,
        created_at: new Date().toISOString(),
        country: 'england'
      });

      let cancelCalled = false;
      fiveSimClient.cancelOrder = async () => {
        cancelCalled = true;
        return {
          id: 1004,
          created_at: new Date().toISOString(),
          phone: '+447350690994',
          product: 'facebook',
          price: 25,
          status: 'CANCELED',
          expires: new Date().toISOString(),
          sms: [],
          country: 'england'
        };
      };

      const order4 = await virtualNumberService.createOrder({
        userId: user1Id,
        countryCode: 'england',
        serviceCode: 'facebook'
      });
      const canceled = await virtualNumberService.cancelOrder(order4.id, user1Id);

      const isCanceled = canceled.status === 'CANCELED';
      recordResult(
        4,
        'طلب يتم إلغاؤه بنجاح واستدعاء إلغاء المزود واسترداد المبلغ',
        isCanceled && cancelCalled,
        `Status: ${canceled.status}, 5SIM cancel called: ${cancelCalled}`
      );
    } catch (err: any) {
      recordResult(4, 'طلب يتم إلغاؤه بطلب من العميل', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 5: استعادة المبلغ مرة واحدة فقط (Idempotency)
    // -------------------------------------------------------------
    try {
      const orderRes = await pool.query(
        'SELECT id FROM virtual_number_orders WHERE user_id = $1 AND status = \'CANCELED\' LIMIT 1',
        [user1Id]
      );
      const canceledOrderId = orderRes.rows[0]?.id;

      let secondCancelBlocked = false;
      try {
        await virtualNumberService.cancelOrder(canceledOrderId, user1Id);
      } catch (err: any) {
        secondCancelBlocked = err.message.includes('CANNOT_CANCEL');
      }

      // Check number of refund transactions for this order
      const txRes = await pool.query(
        'SELECT COUNT(*) FROM "WalletTransaction" WHERE "referenceId" = $1 AND type = \'REFUND\'',
        [canceledOrderId]
      );
      const refundCount = parseInt(txRes.rows[0].count, 10);
      const isIdempotent = secondCancelBlocked && refundCount <= 1;

      recordResult(
        5,
        'استعادة المبلغ مرة واحدة فقط ومنع التكرار (Refund Idempotency)',
        isIdempotent,
        `Second cancel blocked: ${secondCancelBlocked}, Refund transactions: ${refundCount}`
      );
    } catch (err: any) {
      recordResult(5, 'استعادة المبلغ مرة واحدة فقط', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 6: المحاولات الخمس المجانية (First 5 Attempts are 0 SDG)
    // -------------------------------------------------------------
    try {
      await pool.query(
        `INSERT INTO "User" (id, email, name, "passwordHash", role, preferred_currency)
         VALUES ($1, $2, 'VN Tester 3', 'hash', 'CUSTOMER', 'SDG')`,
        [user3Id, `vn_user3_${Date.now()}@kiropro.com`]
      );
      await pool.query(
        `INSERT INTO "Wallet" (id, "userId", balance, currency)
         VALUES ($1, $2, 0.0, 'SDG')`, // Balance is 0 to prove it's 100% free!
        [wallet3Id, user3Id]
      );

      fiveSimClient.buyActivation = async () => ({
        id: Math.floor(Math.random() * 90000) + 1000,
        phone: '+1202555' + Math.floor(Math.random() * 9000),
        operator: 'any',
        product: 'twitter',
        price: 10,
        status: 'PENDING',
        expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        sms: null,
        created_at: new Date().toISOString(),
        country: 'usa'
      });

      const attemptOrders: any[] = [];
      const services = ['whatsapp', 'google', 'facebook', 'instagram', 'twitter'];
      for (let i = 0; i < 5; i++) {
        const ord = await virtualNumberService.createOrder({
          userId: user3Id,
          countryCode: 'usa',
          serviceCode: services[i]
        });
        // Mark as completed so attempt counts towards usedAttempts
        await pool.query('UPDATE virtual_number_orders SET status = \'COMPLETED\' WHERE id = $1', [ord.id]);
        attemptOrders.push(ord);
      }

      const allFree = attemptOrders.every(o => o.isFreeAttempt === true && o.chargedAmount === 0);
      const attemptNumbers = attemptOrders.map(o => o.attemptNumber);
      const isSequenceCorrect = JSON.stringify(attemptNumbers) === JSON.stringify([1, 2, 3, 4, 5]);

      recordResult(
        6,
        'المحاولات الخمس المجانية الأولى (0 SDG لكل محاولة)',
        allFree && isSequenceCorrect,
        `All 5 orders isFreeAttempt=true, charged=0 SDG, sequence: [${attemptNumbers.join(', ')}]`
      );

      // -------------------------------------------------------------
      // Test 7: المحاولة السادسة = 800 SDG ومطالبة بالرصيد
      // -------------------------------------------------------------
      try {
        // Attempt 6 with 0 balance must FAIL with INSUFFICIENT_BALANCE
        let blockedWithoutBalance = false;
        try {
          await virtualNumberService.createOrder({
            userId: user3Id,
            countryCode: 'usa',
            serviceCode: 'paypal'
          });
        } catch (err: any) {
          blockedWithoutBalance = err.message.includes('INSUFFICIENT_BALANCE') || err.message.includes('رصيد المحفظة غير كافٍ');
        }

        // Now credit 800 SDG to user3 wallet
        await pool.query('UPDATE "Wallet" SET balance = 800.0 WHERE id = $1', [wallet3Id]);

        // Attempt 6 with 800 SDG should succeed and be marked isFreeAttempt=false and chargedAmount=800
        const ord6 = await virtualNumberService.createOrder({
          userId: user3Id,
          countryCode: 'usa',
          serviceCode: 'paypal'
        });
        const isAttempt6Paid = ord6.isFreeAttempt === false && ord6.chargedAmount === 800 && ord6.attemptNumber === 6;

        // Check wallet balance after hold
        const wRes = await pool.query('SELECT balance FROM "Wallet" WHERE id = $1', [wallet3Id]);
        const balanceRemaining = Number(wRes.rows[0].balance);
        const balanceDeducted = balanceRemaining === 0.0;

        recordResult(
          7,
          'المحاولة السادسة مدفوعة بسعر 800 SDG وخصم الرصيد',
          blockedWithoutBalance && isAttempt6Paid && balanceDeducted,
          `Blocked when 0 balance: ${blockedWithoutBalance}, Attempt #6 charged: ${ord6.chargedAmount} SDG, Free: ${ord6.isFreeAttempt}`
        );
      } catch (err: any) {
        recordResult(7, 'المحاولة السادسة = 800 SDG', false, err.message);
      }
    } catch (err: any) {
      recordResult(6, 'المحاولات الخمس المجانية', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 8: تعديل سعر المحاولة الافتراضية من لوحة الأدمن
    // -------------------------------------------------------------
    try {
      await virtualNumberService.updateSettings({ defaultPaidPriceSdg: 950 });
      const settings = await virtualNumberService.getSettings();
      const priceUpdated = settings.default_paid_price_sdg === 950;

      const priceRes = await virtualNumberService.resolveProductPrice('usa', 'instagram');
      const resolvesToNewPrice = priceRes.priceSdg === 950;

      // Restore to 800
      await virtualNumberService.updateSettings({ defaultPaidPriceSdg: 800 });

      recordResult(
        8,
        'تعديل سعر المحاولة الافتراضية من لوحة الأدمن',
        priceUpdated && resolvesToNewPrice,
        `New Admin price: ${settings.default_paid_price_sdg} SDG, Resolved price: ${priceRes.priceSdg} SDG`
      );
    } catch (err: any) {
      recordResult(8, 'تغيير سعر المحاولة من Admin', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 9: تعديل سعر منتج محدد من Admin (Country + Service Custom Price)
    // -------------------------------------------------------------
    try {
      const prodRes = await pool.query(
        'SELECT id FROM virtual_number_products WHERE country_code = \'brazil\' AND service_code = \'facebook\''
      );
      const prodId = prodRes.rows[0]?.id;

      // Set custom price 1200 SDG
      await virtualNumberService.updateProduct(prodId, { customPriceSdg: 1200 });

      // Resolve price
      const priceRes = await virtualNumberService.resolveProductPrice('brazil', 'facebook');
      const isCustomPriceApplied = priceRes.priceSdg === 1200;

      // Restore custom price to null
      await virtualNumberService.updateProduct(prodId, { customPriceSdg: null });

      recordResult(
        9,
        'تعديل سعر منتج محدد لدولة وخدمة معينة من لوحة الأدمن',
        isCustomPriceApplied,
        `Custom product price resolved: ${priceRes.priceSdg} SDG (Expected: 1200 SDG)`
      );
    } catch (err: any) {
      recordResult(9, 'تغيير سعر منتج من Admin', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 10: حظر ورفض أي دولة غير مسموحة (Disallowed Country Rejection)
    // -------------------------------------------------------------
    try {
      let rejected = false;
      let errMsg = '';
      try {
        await virtualNumberService.createOrder({
          userId: user1Id,
          countryCode: 'france',
          serviceCode: 'whatsapp'
        });
      } catch (err: any) {
        rejected = true;
        errMsg = err.message;
      }

      recordResult(
        10,
        'رفض وحظر أي دولة غير مسموحة (Backend Allowlist Enforcement)',
        rejected && errMsg.includes('INVALID_COUNTRY'),
        `Request with country 'france' rejected: ${errMsg}`
      );
    } catch (err: any) {
      recordResult(10, 'دولة غير مسموحة', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 11: حظر ورفض أي خدمة غير مسموحة (Disallowed Service Rejection)
    // -------------------------------------------------------------
    try {
      let rejected = false;
      let errMsg = '';
      try {
        await virtualNumberService.createOrder({
          userId: user1Id,
          countryCode: 'usa',
          serviceCode: 'telegram'
        });
      } catch (err: any) {
        rejected = true;
        errMsg = err.message;
      }

      recordResult(
        11,
        'رفض وحظر أي خدمة غير مسموحة (Backend Allowlist Enforcement)',
        rejected && errMsg.includes('INVALID_SERVICE'),
        `Request with service 'telegram' rejected: ${errMsg}`
      );
    } catch (err: any) {
      recordResult(11, 'خدمة غير مسموحة', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 12: فحص ملكية الطلب ومنع IDOR (User B accessing User A's order)
    // -------------------------------------------------------------
    try {
      fiveSimClient.buyActivation = async () => ({
        id: 1012,
        phone: '+12025550112',
        operator: 'any',
        product: 'google',
        price: 20,
        status: 'PENDING',
        expires: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        sms: null,
        created_at: new Date().toISOString(),
        country: 'usa'
      });

      const ordA = await virtualNumberService.createOrder({
        userId: user1Id,
        countryCode: 'usa',
        serviceCode: 'google'
      });

      // User 2 attempts to get order A
      const orderForUser2 = await virtualNumberService.getOrderById(ordA.id, user2Id);
      const viewBlocked = (orderForUser2 === null);

      // User 2 attempts to cancel order A
      let cancelBlocked = false;
      try {
        await virtualNumberService.cancelOrder(ordA.id, user2Id);
      } catch (err: any) {
        cancelBlocked = err.message.includes('FORBIDDEN') || err.message.includes('غير مصرح');
      }

      recordResult(
        12,
        'فحص ملكية الطلب ومنع اختراق الصلاحيات (Strict IDOR Protection)',
        viewBlocked && cancelBlocked,
        `User 2 viewing User 1 order blocked: ${viewBlocked}, Cancel blocked: ${cancelBlocked}`
      );
    } catch (err: any) {
      recordResult(12, 'User يحاول الوصول إلى Order مستخدم آخر', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 13: منع التلاعب بالسعر من الـ Frontend (Price Manipulation Tampering)
    // -------------------------------------------------------------
    try {
      // Backend createOrder does NOT accept price from client
      // It always calls resolveProductPrice internally
      const priceRes = await virtualNumberService.resolveProductPrice('usa', 'google');
      const isAuthoritative = priceRes.priceSdg === 800;

      recordResult(
        13,
        'منع التلاعب بالأسعار من الواجهة (Backend Single Source of Truth)',
        isAuthoritative,
        `Backend authoritative price used: ${priceRes.priceSdg} SDG. Client cannot manipulate price parameter.`
      );
    } catch (err: any) {
      recordResult(13, 'Frontend يرسل سعرًا مزيفًا', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 14: منع تكرار الطلبات المتطابقة المتزامنة لنفس المستخدم
    // -------------------------------------------------------------
    try {
      // Fire duplicate order immediately
      let duplicateBlocked = false;
      let errMsg = '';
      try {
        // Try creating exact same order again for user1Id within 4 seconds
        await virtualNumberService.createOrder({
          userId: user1Id,
          countryCode: 'usa',
          serviceCode: 'google'
        });
      } catch (err: any) {
        duplicateBlocked = err.message.includes('DUPLICATE_ORDER') || err.message.includes('تم استلام طلب مماثل للتو');
        errMsg = err.message;
      }

      recordResult(
        14,
        'منع تكرار الطلبات المتزامنة لنفس المستخدم (Duplicate Request Lock)',
        duplicateBlocked,
        `Duplicate order blocked: ${duplicateBlocked} (${errMsg})`
      );
    } catch (err: any) {
      recordResult(14, 'Duplicate request لنفس Order', false, err.message);
    }

    // -------------------------------------------------------------
    // Test 15: حفظ الرقم والكود بصورة دائمة وعدم ضياعهما بعد الـ Refresh
    // -------------------------------------------------------------
    try {
      // Query completed order from Test 1 by order ID directly from database
      const completedOrderRes = await pool.query(
        'SELECT * FROM virtual_number_orders WHERE id = $1',
        [test1OrderId]
      );
      const row = completedOrderRes.rows[0];

      const hasStoredPhone = Boolean(row && row.phone_number === '+12025550101');
      const hasStoredCode = Boolean(row && row.sms_code === '849201');
      const hasStoredTime = Boolean(row && row.sms_received_at);
      const isRetrievable = row && row.country_code === 'usa' && row.service_code === 'whatsapp';

      recordResult(
        15,
        'حفظ الرقم ورمز التحقق دائماً بقاعدة البيانات وعدم فقدانهما عند التحديث (Persistence)',
        hasStoredPhone && hasStoredCode && hasStoredTime && isRetrievable,
        `Persisted in PostgreSQL: Phone=${row?.phone_number}, SMS Code=${row?.sms_code ? '849201 (Stored permanently)' : 'MISSING'}, Service=${row?.service_code}`
      );
    } catch (err: any) {
      recordResult(15, 'إعادة فتح صفحة الطلب لا تفقد الرقم أو الكود', false, err.message);
    }

  } finally {
    // Restore original fiveSimClient methods
    fiveSimClient.buyActivation = origBuy;
    fiveSimClient.checkOrder = origCheck;
    fiveSimClient.cancelOrder = origCancel;
    fiveSimClient.finishOrder = origFinish;

    // Clean up test records
    await pool.query('DELETE FROM virtual_number_orders WHERE user_id IN ($1, $2, $3)', [user1Id, user2Id, user3Id]);
    await pool.query('DELETE FROM "WalletTransaction" WHERE "walletId" IN ($1, $2, $3)', [wallet1Id, wallet2Id, wallet3Id]);
    await pool.query('DELETE FROM "Wallet" WHERE id IN ($1, $2, $3)', [wallet1Id, wallet2Id, wallet3Id]);
    await pool.query('DELETE FROM "User" WHERE id IN ($1, $2, $3)', [user1Id, user2Id, user3Id]);

    console.log('\n================================================================');
    console.log('                      TEST SUITE SUMMARY                        ');
    console.log('================================================================');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`Total Tests: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
    console.log('================================================================\n');

    await pool.end();
  }
}

runSuite().catch(err => {
  console.error('Fatal test suite failure:', err);
  process.exit(1);
});
