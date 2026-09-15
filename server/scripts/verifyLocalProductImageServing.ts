import path from 'path';
import fs from 'fs';
import { normalizeProductImageUrl, resolveImageUrl, DEFAULT_PLACEHOLDER } from '../src/routes/products';

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 VERIFYING LOCAL PRODUCT IMAGE STORAGE & SERVING PIPELINE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ''}`);
    }
  }

  // 1. Check physical disk storage
  console.log('--- TEST 1: Physical Disk Storage in server/uploads/products ---');
  const uploadsProductsDir = path.resolve(__dirname, '../uploads/products');
  assert(fs.existsSync(uploadsProductsDir), 'server/uploads/products directory exists');

  const targetFile = path.join(uploadsProductsDir, 'prod_1789435947312_54dc7dd7.webp');
  assert(fs.existsSync(targetFile), 'Target image prod_1789435947312_54dc7dd7.webp exists on local disk');

  const targetStats = fs.statSync(targetFile);
  assert(targetStats.size > 0, `Target image size is valid (${targetStats.size} bytes)`);

  // Verify binary WebP magic bytes
  const buf = fs.readFileSync(targetFile);
  const isWebp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  assert(isWebp, 'Target image contains genuine WebP binary magic bytes (RIFF...WEBP)');

  // 2. Test Backend Image URL Normalization & Resolution
  console.log('\n--- TEST 2: Backend Image URL Normalization & Resolution ---');
  const prevBackendUrl = process.env.BACKEND_URL;
  process.env.BACKEND_URL = 'https://api.kiropro.store';

  // Relative path to backend domain
  const testRel = '/uploads/products/prod_1789435947312_54dc7dd7.webp';
  const resolvedRel = normalizeProductImageUrl(testRel);
  assert(
    resolvedRel === 'https://api.kiropro.store/uploads/products/prod_1789435947312_54dc7dd7.webp',
    'Relative path /uploads/... expanded to https://api.kiropro.store/uploads/...'
  );

  // Erroneous kiropro.store domain corrected to api.kiropro.store
  const testWrongHost = 'https://kiropro.store/uploads/products/prod_1789435947312_54dc7dd7.webp';
  const resolvedWrongHost = normalizeProductImageUrl(testWrongHost);
  assert(
    resolvedWrongHost === 'https://api.kiropro.store/uploads/products/prod_1789435947312_54dc7dd7.webp',
    'Erroneous kiropro.store/uploads/... domain automatically corrected to api.kiropro.store/uploads/...'
  );

  // External CDN / Unsplash preserved
  const testUnsplash = 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';
  assert(
    normalizeProductImageUrl(testUnsplash) === testUnsplash,
    'External image URLs preserved without modification'
  );

  // Fallback hierarchy
  assert(
    resolveImageUrl(testRel, 'https://fallback.com/cat.jpg') === 'https://api.kiropro.store/uploads/products/prod_1789435947312_54dc7dd7.webp',
    'Priority 1: Product image wins over category image'
  );
  assert(
    resolveImageUrl(null, testRel) === 'https://api.kiropro.store/uploads/products/prod_1789435947312_54dc7dd7.webp',
    'Priority 2: Category image used when product image is null'
  );
  assert(
    resolveImageUrl(null, null) === DEFAULT_PLACEHOLDER,
    'Priority 3: Default placeholder used when both product and category are null'
  );

  process.env.BACKEND_URL = prevBackendUrl;

  // 3. Test HTTP Endpoint directly against running backend server (port 5000)
  console.log('\n--- TEST 3: HTTP Endpoint Serving (GET /uploads/products/:filename) ---');
  try {
    const res = await fetch('http://localhost:5000/uploads/products/prod_1789435947312_54dc7dd7.webp');
    assert(res.status === 200, `HTTP status is 200 OK (got: ${res.status})`);

    const contentType = res.headers.get('content-type');
    assert(contentType === 'image/webp', `Content-Type is image/webp (got: ${contentType})`);

    const corsHeader = res.headers.get('access-control-allow-origin');
    assert(corsHeader === '*', `CORS header Access-Control-Allow-Origin is * (got: ${corsHeader})`);

    const corpHeader = res.headers.get('cross-origin-resource-policy');
    assert(corpHeader === 'cross-origin', `Cross-Origin-Resource-Policy is cross-origin (got: ${corpHeader})`);

    const imageBytes = await res.arrayBuffer();
    assert(imageBytes.byteLength > 0, `Received image data (${imageBytes.byteLength} bytes)`);

    // Verify received data is real WebP binary
    const receivedBuf = Buffer.from(imageBytes);
    const isReceivedWebp = receivedBuf.toString('ascii', 0, 4) === 'RIFF' && receivedBuf.toString('ascii', 8, 12) === 'WEBP';
    assert(isReceivedWebp, 'HTTP response body contains genuine WebP binary, NOT HTML error');
  } catch (err: any) {
    console.warn(`⚠️ HTTP endpoint test to localhost:5000 skipped or encountered network error: ${err.message}`);
  }

  // 4. Test Path Traversal and Security
  console.log('\n--- TEST 4: Path Traversal & File Whitelisting Security ---');
  try {
    // Malicious traversal attempt
    const traversalRes = await fetch('http://localhost:5000/uploads/products/..%2Fconfig.ts');
    assert(
      traversalRes.status === 400 || traversalRes.status === 403 || traversalRes.status === 404,
      `Path traversal attack blocked with status ${traversalRes.status}`
    );

    // Invalid extension attempt
    const exeRes = await fetch('http://localhost:5000/uploads/products/malicious.exe');
    assert(
      exeRes.status === 400 || exeRes.status === 404,
      `Non-image extension (.exe) blocked with status ${exeRes.status}`
    );

    // Non-existent image fallback to default.webp
    const fallbackRes = await fetch('http://localhost:5000/uploads/products/non_existent_file_99999.webp');
    assert(
      fallbackRes.status === 200 && fallbackRes.headers.get('content-type') === 'image/webp',
      'Missing image gracefully falls back to default.webp (HTTP 200, image/webp) instead of 500 HTML'
    );
  } catch (err: any) {
    console.warn(`⚠️ Security tests to localhost:5000: ${err.message}`);
  }

  console.log(`\n================================================================`);
  console.log(`📊 ALL VERIFICATION TESTS COMPLETED: ${passed}/${total} PASSED`);
  console.log(`================================================================\n`);

  if (passed < total) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
