import { pool } from '../src/db.js';

async function investigate() {
  console.log('=== 1. CHECKING PRODUCT TABLE FOR MASTERCARD ===');
  const prods = await pool.query(`
    SELECT id, "productId", "productName", "arabicName", category, "subCategory",
           "productType", fulfillment_type, "customerPriceUsd", "defaultPartnerPriceUsd",
           "isActive", "inStock", requires_player_id, requires_inventory
    FROM "Product"
    WHERE id = 'b0000000-0000-0000-0000-000000000001'
       OR "productName" ILIKE '%Mastercard%'
       OR "arabicName" ILIKE '%كيرو برو%'
       OR "productType" = 'VIRTUAL_CARD'
       OR fulfillment_type = 'KIROPRO_CARD'
  `);
  console.log('Products found:', prods.rows.length);
  console.log(JSON.stringify(prods.rows, null, 2));

  console.log('\n=== 2. CHECKING KIROPRO_CARDS_INVENTORY ===');
  const invCounts = await pool.query(`
    SELECT status, COUNT(*)::int as count
    FROM kiropro_cards_inventory
    GROUP BY status
  `);
  console.log('Inventory status counts:', invCounts.rows);

  const totalInv = await pool.query(`
    SELECT COUNT(*)::int as total FROM kiropro_cards_inventory
  `);
  console.log('Total cards in inventory:', totalInv.rows[0].total);

  // List card IDs (NO PAN/CVV)
  const cardsSample = await pool.query(`
    SELECT id, status, card_balance_usd, assigned_at, order_id, partner_order_id, created_at
    FROM kiropro_cards_inventory
    ORDER BY created_at DESC
  `);
  console.log('Cards list (IDs only):', cardsSample.rows);

  process.exit(0);
}

investigate().catch(err => {
  console.error('Investigation error:', err);
  process.exit(1);
});
