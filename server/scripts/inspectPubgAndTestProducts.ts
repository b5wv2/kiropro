import pool from '../src/db';
import { g2BulkClient } from '../src/providers/g2bulk/client';

async function run() {
  console.log('=== G2Bulk Games List Search ===');
  const gamesRes = await g2BulkClient.getGames();
  const games = (gamesRes as any).games || [];
  console.log(`Total games in G2Bulk: ${games.length}`);

  const relevantGames = games.filter((g: any) => 
    /pubg|bgmi|battleground|mobile|test|krafton|tencent/i.test(g.code + ' ' + g.name)
  );
  console.log('Relevant games:', relevantGames);

  // Test pubgm catalogue with requiresAuth = false and requiresAuth = true
  console.log('\n=== Testing pubgm catalogue ===');
  try {
    const rawNoAuth = await g2BulkClient.request('/games/pubgm/catalogue', { method: 'GET', requiresAuth: false });
    console.log('pubgm catalogue (no auth):', JSON.stringify(rawNoAuth));
  } catch (e: any) {
    console.log('pubgm no auth error:', e.message);
  }

  try {
    const rawAuth = await g2BulkClient.request('/games/pubgm/catalogue', { method: 'GET', requiresAuth: true });
    console.log('pubgm catalogue (with auth):', JSON.stringify(rawAuth));
  } catch (e: any) {
    console.log('pubgm with auth error:', e.message);
  }

  // Check test game
  console.log('\n=== Testing test game ===');
  try {
    const testNoAuth = await g2BulkClient.request('/games/test/catalogue', { method: 'GET', requiresAuth: false });
    console.log('test catalogue (no auth):', JSON.stringify(testNoAuth));
  } catch (e: any) {
    console.log('test no auth error:', e.message);
  }
  try {
    const testAuth = await g2BulkClient.request('/games/test/catalogue', { method: 'GET', requiresAuth: true });
    console.log('test catalogue (with auth):', JSON.stringify(testAuth));
  } catch (e: any) {
    console.log('test with auth error:', e.message);
  }

  // Check test player ID validation
  console.log('\n=== Testing checkPlayerId for test and pubgm ===');
  try {
    const chkTest = await g2BulkClient.checkPlayerId({ game: 'test', user_id: '123456' });
    console.log('checkPlayerId test:', chkTest);
  } catch (e: any) {
    console.log('checkPlayerId test error:', e.status, e.message, e.raw);
  }

  try {
    const chkPubgm = await g2BulkClient.checkPlayerId({ game: 'pubgm', user_id: '5123456789' });
    console.log('checkPlayerId pubgm:', chkPubgm);
  } catch (e: any) {
    console.log('checkPlayerId pubgm error:', e.status, e.message, e.raw);
  }

  // Search vouchers for "test"
  console.log('\n=== Searching vouchers for test ===');
  try {
    const vRes = await g2BulkClient.request<any>('/products', { method: 'GET', requiresAuth: true });
    const allProds = vRes.products || vRes.data || [];
    const testVouchers = allProds.filter((p: any) => /test/i.test(p.title + ' ' + (p.description || '') + ' ' + (p.category_title || '')));
    console.log('Test vouchers found:', testVouchers);
  } catch (e: any) {
    console.log('Error fetching vouchers:', e.message);
  }

  // Check DB product_provider_mappings schema
  console.log('\n=== Checking product_provider_mappings schema ===');
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'product_provider_mappings'
  `);
  console.log('product_provider_mappings columns:', cols.rows.map(c => c.column_name));

  // Check existing PUBG products in DB
  const pubgProds = await pool.query(`
    SELECT id, "productName", "offerName", "customerPriceUsd", "providerOfferId", "gameCategoryId", "inStock", "primaryProvider", "fallbackProvider"
    FROM "Product"
    WHERE "gameCategoryId" = 'pubg-mobile' OR "productName" ILIKE '%pubg%'
    ORDER BY "customerPriceUsd" ASC
  `);
  console.log(`DB PUBG products (${pubgProds.rows.length}):`);
  pubgProds.rows.forEach(p => console.log(`  - ${p.id} | ${p.productName} (${p.offerName}) | Price: $${p.customerPriceUsd} | GD: ${p.providerOfferId} | InStock: ${p.inStock} | Prim: ${p.primaryProvider} | Fall: ${p.fallbackProvider}`));

  await pool.end();
}

run().catch(console.error);
