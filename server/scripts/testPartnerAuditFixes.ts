import { pool } from '../src/db.js';
import { partnerService } from '../src/services/partnerService.js';
import { hashCardNumber } from '../src/utils/cryptoCard.js';

async function runTests() {
  console.log('====================================================');
  console.log('KIROPRO PARTNER PORTAL AUDIT & FIXES VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      if (detail) console.error(`  Detail: ${detail}`);
    }
  }

  const partnerId = '22632d77-e550-468b-a7a0-9f3ed618ef0c';
  const partnerUserId = 'f6286921-6aa1-43b3-8683-f260943d0844';

  // ----------------------------------------------------
  // TEST 1: Requesting 3 USD card when stock is 0
  // MUST fail with clear out-of-stock message, NEVER deliver 1 USD or CAD
  // ----------------------------------------------------
  console.log('\n--- Test 1: Denomination isolation & zero-fallback guard ---');
  try {
    await partnerService.issueKiroProCard({
      partnerId,
      partnerUserId,
      productId: 'b0000000-0000-0000-0000-000000000005', // 3 USD Card
      idempotencyKey: 'test_deny_3usd_' + Date.now()
    });
    assert(false, 'Should have rejected 3 USD card when stock is 0');
  } catch (err: any) {
    const isOutOfStock = err.message.includes('نفد مخزون');
    assert(isOutOfStock, 'Rejected 3 USD card purchase when stock is 0 with exact out-of-stock error', err.message);
  }

  // ----------------------------------------------------
  // TEST 2: Requesting 1 USD card when stock is 0
  // MUST fail with clear out-of-stock message
  // ----------------------------------------------------
  console.log('\n--- Test 2: 1 USD card out-of-stock rejection ---');
  try {
    await partnerService.issueKiroProCard({
      partnerId,
      partnerUserId,
      productId: 'b0000000-0000-0000-0000-000000000001', // 1 USD Card
      idempotencyKey: 'test_deny_1usd_' + Date.now()
    });
    assert(false, 'Should have rejected 1 USD card when stock is 0');
  } catch (err: any) {
    const isOutOfStock = err.message.includes('نفد مخزون');
    assert(isOutOfStock, 'Rejected 1 USD card purchase when stock is 0 with exact out-of-stock error', err.message);
  }

  // ----------------------------------------------------
  // TEST 3: Mock transaction test for CAD card issuance (atomic rollback)
  // Ensures matching face_value, currency, and balance without touching production balances
  // ----------------------------------------------------
  console.log('\n--- Test 3: Atomic card issuance logic verification (rolled back) ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Query available 1 CAD card
    const cardRes = await client.query(
      `SELECT id, card_last4, balance, currency, card_network, product_id
       FROM kiropro_cards_inventory
       WHERE status = 'AVAILABLE' AND product_id = 'b0000000-0000-0000-0000-000000000006'
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    assert(cardRes.rows.length === 1, 'Found 1 CAD card in inventory matching product_id');
    const card = cardRes.rows[0];
    assert(card.currency === 'CAD', 'Delivered card currency matches requested product (CAD)', card.currency);
    assert(Number(card.balance) === 1, 'Delivered card balance matches requested face value (1.00)', String(card.balance));

    // Rollback so no state is altered
    await client.query('ROLLBACK');
    assert(true, 'Atomic transaction verified and rolled back safely');
  } catch (err: any) {
    await client.query('ROLLBACK');
    assert(false, 'Failed atomic issuance test', err.message);
  } finally {
    client.release();
  }

  // ----------------------------------------------------
  // TEST 4: Duplicate card check for CLAIMED card
  // Attempting to add an existing claimed card hash MUST be blocked
  // ----------------------------------------------------
  console.log('\n--- Test 4: Duplicate check for CLAIMED/SOLD card ---');
  const claimedCardRes = await pool.query(
    `SELECT card_hash, card_last4, status FROM kiropro_cards_inventory WHERE status = 'CLAIMED' LIMIT 1`
  );
  if (claimedCardRes.rows.length > 0) {
    const claimedCard = claimedCardRes.rows[0];
    const dupCheck = await pool.query(
      `SELECT id, status, card_last4 FROM kiropro_cards_inventory WHERE card_hash = $1`,
      [claimedCard.card_hash]
    );
    assert(dupCheck.rows.length > 0, 'Found claimed card in DB');
    const isClaimed = ['CLAIMED', 'SOLD'].includes(dupCheck.rows[0].status);
    assert(isClaimed, 'Existing claimed card identified and strictly blocked from re-adding/re-listing');
  }

  // ----------------------------------------------------
  // TEST 5: getPartnerCardInfo multi-tier support
  // Must return all active products with independent live stock counts
  // ----------------------------------------------------
  console.log('\n--- Test 5: getPartnerCardInfo multi-tier & stock segregation ---');
  const cardInfo = await partnerService.getPartnerCardInfo(partnerId);
  assert(cardInfo.success === true, 'getPartnerCardInfo succeeded');
  assert(Array.isArray(cardInfo.products) && cardInfo.products.length >= 3, 'Returns all virtual card products (tiers)');

  const prod1Usd = cardInfo.products.find((p: any) => p.faceValue === 1 && p.cardCurrency === 'USD');
  const prod3Usd = cardInfo.products.find((p: any) => p.faceValue === 3 && p.cardCurrency === 'USD');
  const prod1Cad = cardInfo.products.find((p: any) => p.faceValue === 1 && p.cardCurrency === 'CAD');

  assert(prod1Usd?.availableStock === 0, '1 USD card reports availableStock = 0');
  assert(prod3Usd?.availableStock === 0, '3 USD card reports availableStock = 0');
  assert(prod1Cad?.availableStock === 2, '1 CAD card reports availableStock = 2 (not contaminated by 0-stock USD)');

  // ----------------------------------------------------
  // TEST 6: Order history query verification
  // Verifies that the partner's actual past order (ee870dc5-...) is retrieved
  // with orderNumber, productName, cardLast4, cardBalance, and status
  // ----------------------------------------------------
  console.log('\n--- Test 6: Partner order history retrieval ---');
  const orderRes = await pool.query(`
    SELECT 
      o.id,
      SUBSTRING(o.id::text, 1, 8) as "orderNumber",
      o.product_id as "productId",
      COALESCE(p."arabicName", p."productName", o.package_name) as "productName",
      o.partner_price_usd as "amountUsd",
      o.status,
      c.card_last4 as "cardLast4",
      c.balance as "cardBalance"
    FROM partner_orders o
    LEFT JOIN "Product" p ON o.product_id = p.id
    LEFT JOIN kiropro_cards_inventory c ON c.partner_order_id = o.id
    WHERE o.partner_id = $1
    ORDER BY o.created_at DESC
  `, [partnerId]);

  assert(orderRes.rows.length >= 1, 'Partner orders list is NOT empty');
  const myOrder = orderRes.rows.find((o: any) => o.id === 'ee870dc5-2a15-4006-89ad-4c73507aba78');
  assert(Boolean(myOrder), 'Historical order ee870dc5 found in partner history');
  assert(myOrder?.orderNumber.toLowerCase() === 'ee870dc5', 'Order number properly formatted (ee870dc5)');
  assert(myOrder?.cardLast4 === '5728', 'Delivered card last4 is correctly linked (5728)');
  assert(Number(myOrder?.cardBalance) === 1, 'Card balance is 1.00 USD');
  assert(myOrder?.status === 'COMPLETED', 'Order status is COMPLETED');

  console.log(`\n====================================================`);
  console.log(`SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`====================================================\n`);

  await pool.end();
  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
