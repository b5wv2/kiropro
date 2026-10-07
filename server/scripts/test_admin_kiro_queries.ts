import pool from '../src/db.js';

async function testAdminKiroproCardsRoutes() {
  console.log('=== TESTING ADMIN KIROPRO CARDS QUERIES ===');

  // 1. Stats query
  try {
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*)::int as "totalCards",
        COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END)::int as "available",
        COUNT(CASE WHEN status = 'CLAIMED' THEN 1 END)::int as "claimed",
        COUNT(CASE WHEN status = 'DISABLED' THEN 1 END)::int as "disabled"
      FROM kiropro_cards_inventory
    `);
    console.log('STATS QUERY SUCCESS:', statsRes.rows[0]);
  } catch (err: any) {
    console.error('STATS QUERY FAILED:', err.message);
  }

  // 2. Inventory query
  try {
    const invQuery = `
      SELECT 
        c.id,
        c.card_last4 as "last4",
        c.exp_date as "expDate",
        c.balance,
        c.status,
        c.order_id as "orderId",
        c.assigned_at as "assignedAt",
        c.created_at as "createdAt",
        u.id as "userId",
        u.email as "customerEmail",
        u.name as "customerName"
      FROM kiropro_cards_inventory c
      LEFT JOIN "User" u ON c.assigned_to_user_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 50
    `;
    const invRes = await pool.query(invQuery);
    console.log('INVENTORY QUERY SUCCESS. Rows count:', invRes.rows.length);
    console.log('INVENTORY SAMPLE (IDs and status only):', invRes.rows.map(r => ({ id: r.id, status: r.status, cardLast4: r.last4 })));
  } catch (err: any) {
    console.error('INVENTORY QUERY FAILED:', err.message);
  }

  // 3. Settings query
  try {
    const settingsRes = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'kiropro_card_settings'`
    );
    console.log('SETTINGS QUERY SUCCESS:', settingsRes.rows[0]?.value);
  } catch (err: any) {
    console.error('SETTINGS QUERY FAILED:', err.message);
  }

  // 4. Check Product in Admin Catalog query
  try {
    const prodRes = await pool.query(`
      SELECT p.id, p."productName", p."arabicName", p.category, p."productType", p."customerPriceUsd", p."isActive"
      FROM "Product" p
      WHERE p.id = 'b0000000-0000-0000-0000-000000000001'
    `);
    console.log('ADMIN PRODUCT RECORD:', prodRes.rows[0]);
  } catch (err: any) {
    console.error('ADMIN PRODUCT QUERY FAILED:', err.message);
  }

  process.exit(0);
}

testAdminKiroproCardsRoutes().catch(console.error);
