import { g2BulkClient } from '../src/providers/g2bulk/client';

async function testCheck() {
  console.log('Testing G2Bulk checkPlayerId for Free Fire...');
  
  // Test with user_id
  try {
    const res1 = await g2BulkClient.request('/games/checkPlayerId', {
      method: 'POST',
      body: { game: 'freefire_me', user_id: '123456789' }
    });
    console.log('Response with user_id on freefire_me:', JSON.stringify(res1));
  } catch (err: any) {
    console.log('Error with user_id on freefire_me:', err.status, err.message, JSON.stringify(err.raw));
  }

  // Test with player_id
  try {
    const res2 = await g2BulkClient.request('/games/checkPlayerId', {
      method: 'POST',
      body: { game: 'freefire_me', player_id: '123456789' }
    });
    console.log('Response with player_id on freefire_me:', JSON.stringify(res2));
  } catch (err: any) {
    console.log('Error with player_id on freefire_me:', err.status, err.message, JSON.stringify(err.raw));
  }

  // Test on freefire_global
  try {
    const res3 = await g2BulkClient.request('/games/checkPlayerId', {
      method: 'POST',
      body: { game: 'freefire_global', user_id: '123456789' }
    });
    console.log('Response with user_id on freefire_global:', JSON.stringify(res3));
  } catch (err: any) {
    console.log('Error with user_id on freefire_global:', err.status, err.message, JSON.stringify(err.raw));
  }
}

testCheck().catch(console.error);
