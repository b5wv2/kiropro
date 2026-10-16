import pool from '../src/db';
import { detectCardNetwork, isValidLuhn, cleanCardNumber } from '../src/utils/cryptoCard';

async function runComprehensiveVerification() {
  console.log('=====================================================');
  console.log('KIROPRO Virtual Cards System Comprehensive Verification');
  console.log('=====================================================\n');

  try {
    // 1. Check all 5 products in DB
    const prodsRes = await pool.query(`
      SELECT 
        id, "productName", "arabicName", "customerPriceUsd", "defaultPartnerPriceUsd",
        "isActive", "inStock", card_network, card_currency, face_value
      FROM "Product"
      WHERE "gameCategoryId" = 'kiropro-card' OR "productType" = 'VIRTUAL_CARD'
      ORDER BY "displayOrder" ASC, face_value ASC
    `);

    console.log(`[1] Virtual Card Products in Database (${prodsRes.rows.length}):`);
    for (const p of prodsRes.rows) {
      console.log(`  - ${p.id.slice(0, 10)}... | ${p.card_network} | Face: ${p.face_value} ${p.card_currency} | Sale Price: $${Number(p.customerPriceUsd).toFixed(2)} | Partner Price: ${p.defaultPartnerPriceUsd ? `$${Number(p.defaultPartnerPriceUsd).toFixed(2)}` : 'N/A'} | Active: ${p.isActive} | InStock: ${p.inStock} | ${p.arabicName}`);
    }

    if (prodsRes.rows.length !== 5) {
      throw new Error(`Expected exactly 5 card products, but found ${prodsRes.rows.length}`);
    }

    // 2. Verify original Mastercard USD 1 USD untouched
    const orig = prodsRes.rows.find(p => p.id === 'b0000000-0000-0000-0000-000000000001');
    if (!orig) {
      throw new Error('Original KiroPro Virtual Mastercard (b0000000-0000-0000-0000-000000000001) not found!');
    }
    console.log('\n[2] Original Mastercard USD (1 USD) Integrity Check:');
    console.log(`  - Customer Price: $${orig.customerPriceUsd} (Expected: 2.00)`);
    console.log(`  - Default Partner Price: $${orig.defaultPartnerPriceUsd} (Expected: 1.13)`);
    console.log(`  - Network: ${orig.card_network} (Expected: MASTERCARD)`);
    console.log(`  - Currency: ${orig.card_currency} (Expected: USD)`);
    console.log(`  - Face Value: ${orig.face_value} (Expected: 1.00)`);
    if (Number(orig.customerPriceUsd) !== 2.00 || Number(orig.defaultPartnerPriceUsd) !== 1.13) {
      throw new Error('Original Mastercard pricing was modified! Must remain $2.00 sale / $1.13 partner.');
    }

    // 3. Verify kiropro_cards_inventory state & isolation
    const invRes = await pool.query(`
      SELECT 
        status, 
        card_network, 
        currency, 
        COUNT(*)::int as count 
      FROM kiropro_cards_inventory 
      GROUP BY status, card_network, currency
    `);
    console.log('\n[3] Cards Inventory Current Status:');
    for (const r of invRes.rows) {
      console.log(`  - Status: ${r.status} | Network: ${r.card_network} | Currency: ${r.currency} | Count: ${r.count}`);
    }

    // Verify no claimed cards were converted to Visa or CAD
    const claimedCheck = await pool.query(`
      SELECT COUNT(*)::int as count 
      FROM kiropro_cards_inventory 
      WHERE status = 'CLAIMED' AND (card_network != 'MASTERCARD' OR currency != 'USD')
    `);
    if (claimedCheck.rows[0].count > 0) {
      throw new Error('Claimed cards were corrupted or converted! Must stay MASTERCARD and USD.');
    }
    console.log('  ✓ Zero existing claimed cards corrupted. All remain intact as Mastercard USD.');

    // 4. Verify Luhn + BIN Network Detection
    console.log('\n[4] Cryptographic BIN & Luhn Network Detection Tests:');
    const testCases = [
      { num: '4000001234567890', expected: 'VISA' },
      { num: '4532015012345678', expected: 'VISA' },
      { num: '5555555555554444', expected: 'MASTERCARD' },
      { num: '2221001234567890', expected: 'MASTERCARD' },
      { num: '378282246310005', expected: 'UNKNOWN' },
    ];
    for (const tc of testCases) {
      const clean = cleanCardNumber(tc.num);
      const network = detectCardNetwork(clean);
      const luhn = isValidLuhn(clean);
      console.log(`  - ${clean.slice(0, 6)}... : detected=${network} (expected ${tc.expected}), Luhn=${luhn}`);
      if (network !== tc.expected) {
        throw new Error(`BIN detection failed for ${tc.num}`);
      }
    }

    // 5. Test Admin Catalog Search with Arabic Keywords
    console.log('\n[5] Admin Catalog Search Verification (Arabic Keywords):');
    const keywords = ['كيرو', 'ماستركارد', 'فيزا', 'Visa', 'Mastercard'];
    for (const kw of keywords) {
      const searchRes = await pool.query(`
        SELECT p.id, p."productName", p."arabicName"
        FROM "Product" p
        WHERE (p."productName" ILIKE $1 OR p."offerName" ILIKE $1 OR p."arabicName" ILIKE $1)
          AND (p."productType" = 'VIRTUAL_CARD' OR p."gameCategoryId" = 'kiropro-card')
      `, [`%${kw}%`]);
      console.log(`  - Search for "${kw}": found ${searchRes.rows.length} product(s)`);
      if (searchRes.rows.length === 0) {
        throw new Error(`Search for "${kw}" returned 0 products! Admin catalog search fix failed.`);
      }
    }

    // 6. Test Multi-tier stats breakdown query
    console.log('\n[6] Admin Stats byProduct Breakdown Verification:');
    const statsBreakdownRes = await pool.query(`
      SELECT 
        p.id as "productId",
        p."arabicName",
        p.card_network as "cardNetwork",
        p.card_currency as "cardCurrency",
        p.face_value as "faceValue",
        p."customerPriceUsd" as "customerPriceUsd",
        p."defaultPartnerPriceUsd" as "defaultPartnerPriceUsd",
        COUNT(c.id) FILTER (WHERE c.status = 'AVAILABLE')::int as "available",
        COUNT(c.id) FILTER (WHERE c.status = 'CLAIMED')::int as "claimed",
        COUNT(c.id)::int as "total"
      FROM "Product" p
      LEFT JOIN kiropro_cards_inventory c ON c.product_id = p.id
      WHERE p."productType" = 'VIRTUAL_CARD' OR p."gameCategoryId" = 'kiropro-card'
      GROUP BY p.id
      ORDER BY p."displayOrder" ASC, p.face_value ASC
    `);
    console.log(`  - Successfully calculated breakdown for ${statsBreakdownRes.rows.length} tiers:`);
    for (const row of statsBreakdownRes.rows) {
      console.log(`    * ${row.arabicName}: Available=${row.available}, Claimed=${row.claimed}, Total=${row.total}`);
    }

    console.log('\n=====================================================');
    console.log('ALL VERIFICATIONS PASSED WITH 100% SUCCESS!');
    console.log('=====================================================');

  } catch (err: any) {
    console.error('\n❌ Verification Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runComprehensiveVerification();
