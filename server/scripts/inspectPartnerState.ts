import { pool } from '../src/db.js';

async function main() {
  console.log('=== 1. PARTNER ORDERS ===');
  const orders = await pool.query(`
    SELECT id, partner_id, product_id, game_id, package_name, player_id,
           cost_price_usd, partner_price_usd, status, created_at, completed_at
    FROM partner_orders
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log(orders.rows);

  console.log('\n=== 2. KIROPRO CARDS INVENTORY ===');
  const cards = await pool.query(`
    SELECT id, product_id, card_last4, balance, currency, card_network, status,
           assigned_to_user_id, partner_order_id, created_at
    FROM kiropro_cards_inventory
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log(cards.rows);

  console.log('\n=== SYNCHRONIZING PRODUCT inStock WITH ACTUAL AVAILABLE CARDS ===');
  await pool.query(`
    UPDATE "Product" p
    SET "inStock" = (
      (SELECT COUNT(*) FROM kiropro_cards_inventory WHERE product_id = p.id AND status = 'AVAILABLE') > 0
    ),
    "updatedAt" = NOW()
    WHERE p."productType" = 'VIRTUAL_CARD' OR p.fulfillment_type = 'KIROPRO_CARD'
  `);

  console.log('\n=== 3. CARD PRODUCTS IN PRODUCT TABLE (AFTER SYNC) ===');
  const prods = await pool.query(`
    SELECT id, "productName", "arabicName", "customerPriceUsd", "defaultPartnerPriceUsd",
           card_network, card_currency, face_value, "isActive", "inStock",
           (SELECT COUNT(*)::int FROM kiropro_cards_inventory WHERE product_id = p.id AND status = 'AVAILABLE') as "liveStock"
    FROM "Product" p
    WHERE id::text LIKE 'b0000000%' OR "productType" = 'VIRTUAL_CARD' OR fulfillment_type = 'KIROPRO_CARD'
    ORDER BY face_value ASC, id ASC
  `);
  console.log(prods.rows);

  console.log('\n=== 4. TEST PARTNER ORDERS QUERY (FRONTEND SIMULATION) ===');
  const testOrderQuery = await pool.query(`
    SELECT 
      o.id,
      SUBSTRING(o.id::text, 1, 8) as "orderNumber",
      o.product_id as "productId",
      COALESCE(p."arabicName", p."productName", o.package_name) as "productName",
      o.game_id as "gameId", 
      o.package_name as "packageName",
      o.player_id as "playerId", 
      o.partner_price_usd as "amountUsd",
      o.status, 
      o.created_at as "createdAt",
      c.id as "cardId",
      c.card_last4 as "cardLast4",
      c.balance as "cardBalance"
    FROM partner_orders o
    LEFT JOIN "Product" p ON o.product_id = p.id
    LEFT JOIN kiropro_cards_inventory c ON c.partner_order_id = o.id
    ORDER BY o.created_at DESC
    LIMIT 5
  `);
  console.log(testOrderQuery.rows);

  await pool.end();
}

main().catch(console.error);
