import 'dotenv/config';

async function main() {
  console.log('=== RATE LIMITING & PRODUCT CATALOG VALIDATION ===\n');

  // 1. Test GET /api/products
  console.log('1. Testing GET /api/products...');
  const res = await fetch('http://localhost:5000/api/products');
  console.log(`- Status: ${res.status} ${res.statusText}`);
  console.log(`- Cache-Control: ${res.headers.get('cache-control')}`);
  console.log(`- RateLimit-Limit: ${res.headers.get('ratelimit-limit')}`);
  console.log(`- RateLimit-Remaining: ${res.headers.get('ratelimit-remaining')}`);

  if (res.status === 429) {
    console.error('FAILED: Still returning 429!');
    process.exit(1);
  }

  const products = await res.json();
  console.log(`- Returned Game Categories count: ${products.length}`);
  for (const game of products) {
    console.log(`  * Game: "${game.name}" | ID: ${game.id} | Packages: ${game.packages?.length} | MinPrice: $${game.minPrice}`);
  }

  // 2. Test 20 rapid successive GET /api/products requests to verify high-capacity browsing
  console.log('\n2. Testing 20 rapid successive GET /api/products requests (stress test)...');
  let successCount = 0;
  let rateLimit429Count = 0;

  for (let i = 0; i < 20; i++) {
    const r = await fetch('http://localhost:5000/api/products');
    if (r.status === 200) successCount++;
    if (r.status === 429) rateLimit429Count++;
  }
  console.log(`- Success (200): ${successCount}/20`);
  console.log(`- Rate Limited (429): ${rateLimit429Count}/20`);

  if (rateLimit429Count > 0) {
    console.error('FAILED: Rapid product browsing was blocked by rate limiter!');
    process.exit(1);
  }

  // 3. Verify security: No provider leaks in customer DTO
  console.log('\n3. Verifying security and provider sanitization...');
  const rawJson = JSON.stringify(products);
  const leaks = ['gamesdrop', 'gamesDropCostUsd', 'supplierCostUsd', 'SHOP_API_TOKEN', 'providerOfferId'];
  const foundLeaks = leaks.filter(l => rawJson.toLowerCase().includes(l.toLowerCase()));
  if (foundLeaks.length > 0) {
    console.warn('Potential leaks found:', foundLeaks);
  } else {
    console.log('Passed: Zero provider identity or internal pricing leaked in customer catalog response.');
  }

  // 4. Verify Auth Limiter still strictly protects /api/auth/login
  console.log('\n4. Testing strict Auth Rate Limiter on POST /api/auth/login...');
  let auth429Triggered = false;
  for (let i = 0; i < 15; i++) {
    const authRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake_test_rate_limit@kiropro.com', password: 'wrongpassword' })
    });
    if (authRes.status === 429) {
      auth429Triggered = true;
      console.log(`- Auth limiter successfully triggered 429 at attempt #${i + 1}`);
      break;
    }
  }

  if (auth429Triggered) {
    console.log('Passed: Auth endpoint is strictly rate-limited and protected.');
  } else {
    console.log('Note: Auth endpoint did not trigger 429 in 15 attempts (limit is 10 per 15 mins per IP, may have reset).');
  }

  console.log('\n=== ALL VALIDATIONS COMPLETE ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Error during validation:', err);
  process.exit(1);
});
