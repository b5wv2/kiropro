import 'dotenv/config';

async function testEndpoints() {
  const token = process.env.GAMESDROP_API_TOKEN?.trim();
  console.log('Token length:', token?.length);
  console.log('Token value:', token);

  const tests = [
    { url: 'https://partner.gamesdrop.io/api/v1/partner/balance', method: 'GET' },
    { url: 'https://partner.gamesdrop.io/api/v1/balance', method: 'GET' },
    { url: 'https://partner.gamesdrop.io/api/v1/offers/find-one', method: 'POST', body: { offerId: 999 } },
    { url: 'https://partner.gamesdrop.io/api/v1/offers/find-one', method: 'POST', body: { offerId: 101 } },
    { url: 'https://partner.gamesdrop.io/api/v1/offers/sync', method: 'POST', body: { limit: 10, page: 1 } },
  ];

  for (const t of tests) {
    try {
      const res = await fetch(t.url, {
        method: t.method,
        headers: {
          'Authorization': token || '',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: t.body ? JSON.stringify(t.body) : undefined
      });
      console.log(`[${t.method}] ${t.url} -> HTTP ${res.status}:`, await res.text());
    } catch (e: any) {
      console.error(`[${t.method}] ${t.url} -> Fetch error:`, e.message);
    }
  }
}

testEndpoints();
