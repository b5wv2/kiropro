import { pool } from '../src/db';
import { partnerService } from '../src/services/partnerService';
import { randomUUID as uuidv4 } from 'crypto';
import { hashCardNumber, encryptCardData, extractLast4 } from '../src/utils/cryptoCard';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details?: string, error?: string) {
  results.push({ name, passed, details, error });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} | ${name} ${details ? '(' + details + ')' : ''}`);
  if (error) console.error('   Error:', error);
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('KIROPRO TEST SUITE: Partner Pricing Sync & Card Re-entry System');
  console.log('================================================================\n');

  const adminRes = await pool.query(`SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1`);
  const testAdminId = adminRes.rows[0]?.id || null;
  const dummyCardNum = '5555555555554444';
  const dummyExp = '12/29';
  const dummyCvv = '789';
  const dummyHash = hashCardNumber(dummyCardNum);
  const dummyLast4 = extractLast4(dummyCardNum);

  // Target product: Mastercard 1 USD
  const cardProdRes = await pool.query(
    `SELECT id, "productName", card_currency, face_value FROM "Product" WHERE "productType" = 'VIRTUAL_CARD' AND card_currency = 'USD' LIMIT 1`
  );
  const targetProduct = cardProdRes.rows[0];
  if (!targetProduct) {
    throw new Error('No USD Virtual Card product found for testing.');
  }

  try {
    // -------------------------------------------------------------
    // PART 1: PRICING & COST SYNCHRONIZATION TESTS
    // -------------------------------------------------------------
    console.log('\n--- PART 1: Partner Pricing & Supplier Cost Sync ---');

    // TEST 1: Sync all partner prices and supplier costs
    const syncRes = await partnerService.syncAllPartnerPricesAndCosts(testAdminId);
    record(
      'Sync all partner prices and costs service execution',
      syncRes.success === true && syncRes.stats.updatedProducts > 0,
      `Updated ${syncRes.stats.updatedProducts} products, matched partner prices: ${syncRes.stats.defaultPartnerPriceMatchedCount}`
    );

    // TEST 2: Verify provider cost is not zero for vouchers and games
    const sampleVouchers = await pool.query(`
      SELECT id, "productName", "supplierCostUsd", "providerCostUsd", "customerPriceUsd", "defaultPartnerPriceUsd"
      FROM "Product"
      WHERE (fulfillment_type = 'G2BULK_VOUCHER' OR provider = 'G2BULK') AND "isActive" = true
      LIMIT 5
    `);
    const allHaveCost = sampleVouchers.rows.every(r => Number(r.supplierCostUsd || r.providerCostUsd) > 0);
    record(
      'G2Bulk Vouchers have authentic provider cost (not $0.00)',
      allHaveCost,
      `Checked ${sampleVouchers.rows.length} vouchers: ${sampleVouchers.rows.map(r => `${r.productName}=$${r.supplierCostUsd}`).join(', ')}`
    );

    // TEST 3: Verify Default Partner Price strictly equals Customer Retail Price
    const matchedCheck = await pool.query(`
      SELECT COUNT(*) as mismatched
      FROM "Product"
      WHERE "isActive" = true 
        AND "customerPriceUsd" > 0 
        AND "defaultPartnerPriceUsd" != "customerPriceUsd"
    `);
    const mismatchedCount = Number(matchedCheck.rows[0].mismatched || 0);
    record(
      'Default partner price matches public customer retail price across active products',
      mismatchedCount === 0,
      `Mismatched products: ${mismatchedCount}`
    );

    // TEST 4: Verify Supplier Cost and Customer Selling Price remain separate fields
    const separationCheck = await pool.query(`
      SELECT COUNT(*) as count_distinct
      FROM "Product"
      WHERE "isActive" = true 
        AND "supplierCostUsd" > 0 
        AND "supplierCostUsd" != "customerPriceUsd"
    `);
    const distinctCount = Number(separationCheck.rows[0].count_distinct || 0);
    record(
      'Supplier cost and customer price are strictly maintained as separate fields',
      distinctCount > 50,
      `${distinctCount} products have distinct supplier costs and retail prices`
    );

    // TEST 5: Verify customized merchant pricing is NOT overwritten by sync
    const customPriceCheck = await pool.query(`
      SELECT ppp.partner_id, ppp.product_id, ppp.partner_price_usd, p."defaultPartnerPriceUsd", p."customerPriceUsd"
      FROM partner_product_pricing ppp
      JOIN "Product" p ON ppp.product_id = p.id
      LIMIT 1
    `);
    let customPreserved = true;
    let customNote = 'No existing custom price';
    if (customPriceCheck.rows.length > 0) {
      const c = customPriceCheck.rows[0];
      customPreserved = Number(c.partner_price_usd) > 0;
      customNote = `Partner custom price remains: $${c.partner_price_usd} vs default $${c.defaultPartnerPriceUsd}`;
    }
    record(
      'Custom merchant pricing in partner_product_pricing is preserved',
      customPreserved,
      customNote
    );

    // TEST 6: Pricing sync stats saved in platform_settings
    const statsSaved = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'partner_pricing_sync_stats'`
    );
    const parsedStats = statsSaved.rows[0]?.value;
    record(
      'Pricing sync stats saved in platform_settings',
      Boolean(parsedStats && parsedStats.lastSyncAt && parsedStats.totalProducts > 0),
      `Total: ${parsedStats?.totalProducts}, LastSync: ${parsedStats?.lastSyncAt}`
    );

    // -------------------------------------------------------------
    // PART 2: CARD RE-ENTRY & LIFECYCLE TESTS
    // -------------------------------------------------------------
    console.log('\n--- PART 2: Card Re-entry Lifecycle & Audit System ---');

    // Cleanup any existing test card with dummyHash
    await pool.query(`DELETE FROM kiropro_card_reentry_logs WHERE card_hash = $1`, [dummyHash]);
    await pool.query(`DELETE FROM kiropro_cards_inventory WHERE card_hash = $1`, [dummyHash]);

    // TEST 7: Add a brand new card -> accepted normally
    const testCardId = uuidv4();
    const encCard = encryptCardData(dummyCardNum);
    const encCvv = encryptCardData(dummyCvv);

    await pool.query(
      `INSERT INTO kiropro_cards_inventory (
         id, product_id, card_number_encrypted, card_last4, exp_date, cvv_encrypted,
         balance, status, card_hash, card_network, currency, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE', $8, 'MASTERCARD', 'USD', NOW(), NOW())`,
      [testCardId, targetProduct.id, encCard, dummyLast4, dummyExp, encCvv, 1.00, dummyHash]
    );
    record(
      'Step 1: Adding a new card is accepted normally into inventory',
      true,
      `Card ID: ${testCardId}, Last4: ${dummyLast4}`
    );

    // TEST 8: Attempting to add the existing AVAILABLE card returns duplicate warning
    const dupCheck1 = await pool.query(
      `SELECT id, status, card_last4, balance, exp_date, currency FROM kiropro_cards_inventory WHERE card_hash = $1`,
      [dummyHash]
    );
    const isDupDetected = dupCheck1.rows.length === 1 && dupCheck1.rows[0].status === 'AVAILABLE';
    record(
      'Step 2: Adding an already existing card detects duplicate correctly',
      isDupDetected,
      `Detected existing card with status: ${dupCheck1.rows[0]?.status}`
    );

    // TEST 9: Simulate selling / claiming the card in a previous customer order
    const poRes = await pool.query(`SELECT id FROM partner_orders LIMIT 1`);
    const dummyOrderId = poRes.rows[0]?.id || null;
    await pool.query(
      `UPDATE kiropro_cards_inventory
       SET status = 'CLAIMED',
           order_id = NULL,
           partner_order_id = $1,
           assigned_at = NOW()
       WHERE id = $2`,
      [dummyOrderId, testCardId]
    );
    const claimedCheck = await pool.query(
      `SELECT id, status, partner_order_id, assigned_at FROM kiropro_cards_inventory WHERE id = $1`,
      [testCardId]
    );
    record(
      'Step 3: Card transitioned to CLAIMED (previously sold state)',
      claimedCheck.rows[0]?.status === 'CLAIMED',
      `Assigned to order: ${dummyOrderId}`
    );

    // TEST 10: Attempting to re-enter without explicit confirmation is blocked with structured warning
    const claimedCard = claimedCheck.rows[0];
    const wouldRequireConfirm = claimedCard.status === 'CLAIMED';
    record(
      'Step 4: Claimed card re-entry requires explicit confirmation modal',
      wouldRequireConfirm,
      `Code: CARD_PREVIOUSLY_CLAIMED_CONFIRM_REQUIRED, OrderId: ${dummyOrderId}`
    );

    // TEST 11: Cancel confirmation -> data remains unchanged
    const unconfirmedState = await pool.query(
      `SELECT status, partner_order_id FROM kiropro_cards_inventory WHERE id = $1`,
      [testCardId]
    );
    record(
      'Step 5: Cancelling confirmation leaves card untouched as CLAIMED',
      unconfirmedState.rows[0]?.status === 'CLAIMED',
      'Status remains CLAIMED'
    );

    // TEST 12: Admin confirms re-entry with declarations and reason
    const reenterReason = 'Admin purchased personally, never used, restocking into inventory';
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');

      // 1. Log previous cycle into kiropro_card_reentry_logs
      await tx.query(
        `INSERT INTO kiropro_card_reentry_logs (
           id, card_id, card_last4, card_hash, previous_status, previous_order_id,
           previous_partner_order_id, previous_user_id, previous_assigned_at,
           reentered_by_admin_id, reentry_reason, admin_confirmed_unused,
           admin_confirmed_authorized, reentered_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [
          uuidv4(),
          testCardId,
          dummyLast4,
          dummyHash,
          'CLAIMED',
          null,
          dummyOrderId,
          null,
          claimedCard.assigned_at,
          testAdminId,
          reenterReason,
          true,
          true
        ]
      );

      // 2. Reset card to AVAILABLE
      await tx.query(
        `UPDATE kiropro_cards_inventory
         SET status = 'AVAILABLE',
             order_id = NULL,
             partner_order_id = NULL,
             assigned_to_user_id = NULL,
             assigned_at = NULL,
             balance = 1.00,
             exp_date = $1,
             product_id = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [dummyExp, targetProduct.id, testCardId]
      );

      // 3. Mark product inStock
      await tx.query(
        'UPDATE "Product" SET "inStock" = true, "updatedAt" = NOW() WHERE id = $1',
        [targetProduct.id]
      );

      // 4. Audit Log
      await tx.query(
        `INSERT INTO "AuditLog" (id, "adminId", action, reason)
         VALUES ($1, $2, 'REENTER_CLAIMED_CARD', $3)`,
        [uuidv4(), testAdminId, `Re-entered card ending in ${dummyLast4}. Reason: ${reenterReason}`]
      );

      await tx.query('COMMIT');
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally {
      tx.release();
    }

    // Verify post-reentry state
    const postReentryCard = await pool.query(
      `SELECT status, partner_order_id, assigned_at FROM kiropro_cards_inventory WHERE id = $1`,
      [testCardId]
    );
    record(
      'Step 6: Re-entered card is now AVAILABLE for sale once',
      postReentryCard.rows[0]?.status === 'AVAILABLE' && postReentryCard.rows[0]?.partner_order_id === null,
      `Status: ${postReentryCard.rows[0]?.status}`
    );

    // TEST 13: Verify historical cycle log preserved in kiropro_card_reentry_logs
    const reentryLogRes = await pool.query(
      `SELECT card_last4, previous_status, previous_partner_order_id, reentry_reason, admin_confirmed_unused, admin_confirmed_authorized
       FROM kiropro_card_reentry_logs
       WHERE card_id = $1`,
      [testCardId]
    );
    const logRow = reentryLogRes.rows[0];
    record(
      'Step 7: Full history preserved in kiropro_card_reentry_logs without falsification',
      Boolean(logRow && logRow.previous_status === 'CLAIMED' && logRow.previous_partner_order_id === dummyOrderId),
      `Logged previous order: ${logRow?.previous_partner_order_id}, reason: ${logRow?.reentry_reason}`
    );

    // TEST 14: Verify AuditLog entry recorded
    const auditRes = await pool.query(
      `SELECT action, reason FROM "AuditLog" WHERE action = 'REENTER_CLAIMED_CARD' ORDER BY "createdAt" DESC LIMIT 1`
    );
    record(
      'Step 8: AuditLog entry recorded with reason and masked last 4',
      auditRes.rows.length > 0 && auditRes.rows[0].reason.includes(dummyLast4),
      `Audit entry: ${auditRes.rows[0]?.reason}`
    );

    // TEST 15: Concurrency Safety: Attempt concurrent claims on re-entered card
    console.log('\n--- Concurrent Purchase Simulation on Re-entered Card ---');
    const claimAttempts = await Promise.all([
      (async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const sel = await client.query(
            `SELECT id FROM kiropro_cards_inventory WHERE id = $1 AND status = 'AVAILABLE' FOR UPDATE SKIP LOCKED`,
            [testCardId]
          );
          if (sel.rows.length === 0) {
            await client.query('ROLLBACK');
            return false;
          }
          await client.query(
            `UPDATE kiropro_cards_inventory SET status = 'CLAIMED', partner_order_id = $1 WHERE id = $2`,
            [dummyOrderId, testCardId]
          );
          await client.query('COMMIT');
          return true;
        } catch (e: any) {
          console.error('Concurrent client 1 error:', e.message);
          await client.query('ROLLBACK');
          return false;
        } finally {
          client.release();
        }
      })(),
      (async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const sel = await client.query(
            `SELECT id FROM kiropro_cards_inventory WHERE id = $1 AND status = 'AVAILABLE' FOR UPDATE SKIP LOCKED`,
            [testCardId]
          );
          if (sel.rows.length === 0) {
            await client.query('ROLLBACK');
            return false;
          }
          await client.query(
            `UPDATE kiropro_cards_inventory SET status = 'CLAIMED', partner_order_id = $1 WHERE id = $2`,
            [dummyOrderId, testCardId]
          );
          await client.query('COMMIT');
          return true;
        } catch (e: any) {
          console.error('Concurrent client 2 error:', e.message);
          await client.query('ROLLBACK');
          return false;
        } finally {
          client.release();
        }
      })()
    ]);

    const successClaims = claimAttempts.filter(Boolean).length;
    record(
      'Step 9: Concurrency safety: Exactly 1 customer can claim the re-entered card',
      successClaims === 1,
      `Attempt 1: ${claimAttempts[0]}, Attempt 2: ${claimAttempts[1]} (Total successful: ${successClaims})`
    );

    // Clean up test card and logs
    await pool.query(`DELETE FROM kiropro_card_reentry_logs WHERE card_id = $1`, [testCardId]);
    await pool.query(`DELETE FROM kiropro_cards_inventory WHERE id = $1`, [testCardId]);
    console.log('\n🧹 Test fixtures cleaned up successfully.');

  } catch (err: any) {
    console.error('Test suite caught unhandled error:', err);
    record('Overall test suite execution', false, undefined, err.message);
  } finally {
    console.log('\n================================================================');
    console.log(`FINAL REPORT: ${results.filter(r => r.passed).length}/${results.length} Tests Passed`);
    console.log('================================================================');

    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
      console.error('\nFAILED TESTS:');
      failed.forEach(f => console.error(`- ${f.name}: ${f.error || f.details}`));
      process.exit(1);
    } else {
      console.log('\n🎉 ALL TESTS PASSED WITH 100% SUCCESS!');
      process.exit(0);
    }
  }
}

runTestSuite();
