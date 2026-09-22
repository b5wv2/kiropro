import 'dotenv/config';
import { gamesDropClient } from '../src/providers/gamesdrop/client';

async function testLive() {
  console.log('--- Testing Live GamesDrop API ---');
  console.log('Base URL:', gamesDropClient.getBaseUrl());
  console.log('Token starts with:', gamesDropClient.getToken().slice(0, 8) + '...');

  // 1. Check Balance
  try {
    const balance = await gamesDropClient.request('/api/v1/partner/balance');
    console.log('Balance result:', balance);
  } catch (err: any) {
    console.error('Balance error:', err);
  }

  // 2. Search Likee
  try {
    console.log('\n--- Sync: Likee ---');
    const likeeRes = await gamesDropClient.request('/api/v1/offers/sync', {
      method: 'POST',
      body: { limit: 100, page: 1, search: 'Likee' }
    });
    console.log(`Likee count: ${likeeRes.count}, returned rows: ${likeeRes.rows?.length}`);
    if (likeeRes.rows?.length > 0) {
      console.log('Likee sample row:', JSON.stringify(likeeRes.rows[0], null, 2));
      console.log('All Likee offers:');
      likeeRes.rows.forEach((r: any) => {
        console.log(`- offerGroupId: ${r.offerGroupId}, name: "${r.offerGroupName || r.offerName}", price: ${r.price} ${r.currency}, inStock: ${r.inStock}, reqUser: ${r.isRequiredGameUserId}, reqServer: ${r.isRequiredGameServerId}, prodOfferId: ${r.productOfferId}`);
      });
    }
  } catch (err: any) {
    console.error('Likee sync error:', err);
  }

  // 3. Search Telegram Stars
  try {
    console.log('\n--- Sync: Telegram Stars ---');
    const tgStarsRes = await gamesDropClient.request('/api/v1/offers/sync', {
      method: 'POST',
      body: { limit: 100, page: 1, search: 'Telegram Stars' }
    });
    console.log(`Telegram Stars count: ${tgStarsRes.count}, returned rows: ${tgStarsRes.rows?.length}`);
    if (tgStarsRes.rows?.length > 0) {
      console.log('Telegram Stars sample row:', JSON.stringify(tgStarsRes.rows[0], null, 2));
      console.log('All Telegram Stars offers:');
      tgStarsRes.rows.forEach((r: any) => {
        console.log(`- offerGroupId: ${r.offerGroupId}, name: "${r.offerGroupName || r.offerName}", price: ${r.price} ${r.currency}, inStock: ${r.inStock}, reqUser: ${r.isRequiredGameUserId}, reqServer: ${r.isRequiredGameServerId}, isReturnData: ${r.isReturnDataForCustomer}`);
      });
    }
  } catch (err: any) {
    console.error('Telegram Stars sync error:', err);
  }

  // 4. Search Telegram Premium
  try {
    console.log('\n--- Sync: Telegram Premium ---');
    const tgPremRes = await gamesDropClient.request('/api/v1/offers/sync', {
      method: 'POST',
      body: { limit: 100, page: 1, search: 'Telegram Premium' }
    });
    console.log(`Telegram Premium count: ${tgPremRes.count}, returned rows: ${tgPremRes.rows?.length}`);
    if (tgPremRes.rows?.length > 0) {
      console.log('Telegram Premium sample row:', JSON.stringify(tgPremRes.rows[0], null, 2));
      console.log('All Telegram Premium offers:');
      tgPremRes.rows.forEach((r: any) => {
        console.log(`- offerGroupId: ${r.offerGroupId}, name: "${r.offerGroupName || r.offerName}", price: ${r.price} ${r.currency}, inStock: ${r.inStock}, reqUser: ${r.isRequiredGameUserId}, reqServer: ${r.isRequiredGameServerId}, isReturnData: ${r.isReturnDataForCustomer}`);
      });
    }
  } catch (err: any) {
    console.error('Telegram Premium sync error:', err);
  }

  // 5. Search general "Telegram"
  try {
    console.log('\n--- Sync: General Telegram ---');
    const tgGeneralRes = await gamesDropClient.request('/api/v1/offers/sync', {
      method: 'POST',
      body: { limit: 100, page: 1, search: 'Telegram' }
    });
    console.log(`General Telegram count: ${tgGeneralRes.count}, returned rows: ${tgGeneralRes.rows?.length}`);
    const distinctProds = new Set(tgGeneralRes.rows?.map((r: any) => r.productName));
    console.log('Distinct Telegram product names:', Array.from(distinctProds));
  } catch (err: any) {
    console.error('General Telegram sync error:', err);
  }

  // 6. Test Telegram user-info validation endpoint
  try {
    console.log('\n--- Testing Telegram user-info endpoint ---');
    const tgUserRes = await fetch('https://gamesdrop.io/api/aggregator/a6/telegram/user-info', {
      method: 'POST',
      headers: {
        'Authorization': gamesDropClient.getToken(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: '@durov' })
    });
    console.log('Telegram user-info HTTP status:', tgUserRes.status);
    const tgUserJson = await tgUserRes.json();
    console.log('Telegram user-info response for @durov:', tgUserJson);
  } catch (err: any) {
    console.error('Telegram user-info error:', err);
  }

  process.exit(0);
}

testLive().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
