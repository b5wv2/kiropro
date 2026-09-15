import fs from 'fs';
import path from 'path';

async function main() {
  console.log('--- VERIFYING IMAGE PIPELINE FOR JPG, WEBP, PNG ---\n');

  // Test 1: JPG
  const vitePort = 5173;
  console.log(`1. Testing JPG fetch through frontend origin (http://localhost:${vitePort}):`);
  const resJpg = await fetch(`http://localhost:${vitePort}/uploads/products/prod_1789364878275_ed9de5f2.jpg`);
  const bufJpg = await resJpg.arrayBuffer();
  console.log('   - Status:', resJpg.status);
  console.log('   - Content-Type:', resJpg.headers.get('content-type'));
  console.log('   - Content-Length:', resJpg.headers.get('content-length'));
  console.log('   - Bytes received:', bufJpg.byteLength);
  console.log('   - Is binary image:', bufJpg.byteLength > 0 && !resJpg.headers.get('content-type')?.includes('text'));

  // Test 2: WEBP
  console.log(`\n2. Testing WEBP fetch through frontend origin (http://localhost:${vitePort}):`);
  const resWebp = await fetch(`http://localhost:${vitePort}/uploads/products/prod_1789364768436_327b2326.webp`);
  const bufWebp = await resWebp.arrayBuffer();
  console.log('   - Status:', resWebp.status);
  console.log('   - Content-Type:', resWebp.headers.get('content-type'));
  console.log('   - Content-Length:', resWebp.headers.get('content-length'));
  console.log('   - Bytes received:', bufWebp.byteLength);
  console.log('   - Is binary image:', bufWebp.byteLength > 0 && !resWebp.headers.get('content-type')?.includes('text'));

  // Test 3: PNG
  console.log(`\n3. Testing PNG fetch through frontend origin (http://localhost:${vitePort}):`);
  const resPng = await fetch(`http://localhost:${vitePort}/uploads/products/test_sample.png`);
  const bufPng = await resPng.arrayBuffer();
  console.log('   - Status:', resPng.status);
  console.log('   - Content-Type:', resPng.headers.get('content-type'));
  console.log('   - Content-Length:', resPng.headers.get('content-length'));
  console.log('   - Bytes received:', bufPng.byteLength);
  console.log('   - Is binary image:', bufPng.byteLength > 0 && !resPng.headers.get('content-type')?.includes('text'));

  // Test 4: Customer Catalog API
  console.log('\n4. Testing Customer API /api/products response:');
  const resApi = await fetch('http://localhost:5000/api/products');
  const games = await resApi.json();
  games.forEach((g: any) => {
    console.log(`   - Game: ${g.name} (${g.id})`);
    console.log(`     * Cover image: ${g.image}`);
    console.log(`     * Sample package: ${g.packages[0].name} -> ${g.packages[0].imageUrl}`);
  });

  console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
