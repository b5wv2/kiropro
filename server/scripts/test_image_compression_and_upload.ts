import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import pool from '../src/db';
import { JWT_SECRET } from '../src/config';

const API_BASE = 'http://localhost:5000/api';

// Helper to create a valid minimal WebP buffer of given size
function createFakeWebPBuffer(targetSizeBytes: number): Buffer {
  const buf = Buffer.alloc(targetSizeBytes, 0x42);
  // RIFF header
  buf.write('RIFF', 0, 4, 'ascii');
  // RIFF size (file size - 8)
  buf.writeUInt32LE(targetSizeBytes - 8, 4);
  // WEBP fourcc
  buf.write('WEBP', 8, 4, 'ascii');
  // VP8 chunk header
  buf.write('VP8 ', 12, 4, 'ascii');
  buf.writeUInt32LE(targetSizeBytes - 20, 16);
  return buf;
}

// Helper to create a valid minimal JPEG buffer of given size
function createFakeJpegBuffer(targetSizeBytes: number): Buffer {
  const buf = Buffer.alloc(targetSizeBytes, 0xAA);
  buf[0] = 0xFF;
  buf[1] = 0xD8;
  buf[2] = 0xFF;
  buf[3] = 0xE0;
  // SOI, APP0 marker
  buf[buf.length - 2] = 0xFF;
  buf[buf.length - 1] = 0xD9; // EOI
  return buf;
}

async function runTests() {
  console.log('=== KIROPRO MARKETPLACE IMAGE COMPRESSION & UPLOAD TEST SUITE ===\n');

  // 1. Fetch active user from DB to sign authentic token
  const userRes = await pool.query(`SELECT id, email, role FROM "User" LIMIT 1`);
  if (!userRes.rows.length) {
    throw new Error('No user found in database to authenticate test.');
  }
  const user = userRes.rows[0];
  console.log(`Authenticated as test user: ${user.email} (${user.id})`);

  const token = jwt.sign(
    { id: user.id, role: user.role || 'USER', email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  // Helper for multipart upload using standard fetch & FormData
  async function uploadFiles(files: Array<{ name: string; buffer: Buffer; mime: string }>) {
    const formData = new FormData();
    for (const f of files) {
      const blob = new Blob([f.buffer], { type: f.mime });
      formData.append('images', blob, f.name);
    }

    const res = await fetch(`${API_BASE}/marketplace/upload-images`, {
      method: 'POST',
      headers: authHeaders,
      body: formData
    });

    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  // TEST 1: Small WebP image (< 100 KB)
  console.log('--- TEST 1: Uploading small compressed WebP image (64 KB) ---');
  const smallWebp = createFakeWebPBuffer(64 * 1024);
  const res1 = await uploadFiles([{ name: 'account_stat_small.webp', buffer: smallWebp, mime: 'image/webp' }]);
  console.log(`Status: ${res1.status}`);
  if (res1.status === 200 && res1.json?.images?.length === 1) {
    console.log('✓ SUCCESS: Small WebP image uploaded and validated correctly.');
    console.log(`  Uploaded URL: ${res1.json.images[0].imageUrl}, Size: ${res1.json.images[0].fileSize} bytes`);
  } else {
    console.error('✗ FAILED:', res1.json);
  }

  // TEST 2: Typical compressed target size WebP image (1.5 MB)
  console.log('\n--- TEST 2: Uploading typical compressed WebP image (1.5 MB) ---');
  const targetWebp = createFakeWebPBuffer(Math.round(1.5 * 1024 * 1024));
  const res2 = await uploadFiles([{ name: 'pubg_inventory_compressed.webp', buffer: targetWebp, mime: 'image/webp' }]);
  console.log(`Status: ${res2.status}`);
  if (res2.status === 200 && res2.json?.images?.length === 1) {
    console.log('✓ SUCCESS: 1.5 MB WebP image uploaded successfully.');
    console.log(`  Uploaded URL: ${res2.json.images[0].imageUrl}, Size: ${res2.json.images[0].fileSize} bytes`);
  } else {
    console.error('✗ FAILED:', res2.json);
  }

  // TEST 3: Fallback JPEG image (1.2 MB)
  console.log('\n--- TEST 3: Uploading compressed JPEG fallback (1.2 MB) ---');
  const jpegBuf = createFakeJpegBuffer(Math.round(1.2 * 1024 * 1024));
  const res3 = await uploadFiles([{ name: 'freefire_lobby.jpg', buffer: jpegBuf, mime: 'image/jpeg' }]);
  console.log(`Status: ${res3.status}`);
  if (res3.status === 200 && res3.json?.images?.length === 1) {
    console.log('✓ SUCCESS: JPEG fallback image accepted.');
  } else {
    console.error('✗ FAILED:', res3.json);
  }

  // TEST 4: File exceeding 10 MB (Simulating an uncompressed raw 12 MB file that shouldn't bypass server)
  console.log('\n--- TEST 4: Uploading oversized file (> 10 MB, e.g. 11 MB) ---');
  const oversizedBuf = createFakeWebPBuffer(11 * 1024 * 1024);
  const res4 = await uploadFiles([{ name: 'huge_raw_uncompressed.webp', buffer: oversizedBuf, mime: 'image/webp' }]);
  console.log(`Status: ${res4.status}`);
  if (res4.status === 400 && res4.json?.error?.includes('10 MB')) {
    console.log('✓ SUCCESS: Server strictly rejected oversized image > 10 MB as expected.');
    console.log(`  Server error message: "${res4.json.error}"`);
  } else {
    console.warn(`Unexpected response: status=${res4.status}`, res4.json);
  }

  // TEST 5: Uploading 10 compressed images (Max Allowed)
  console.log('\n--- TEST 5: Uploading exactly 10 compressed WebP images in one batch ---');
  const tenFiles = [];
  for (let i = 1; i <= 10; i++) {
    tenFiles.push({
      name: `compressed_img_${i}.webp`,
      buffer: createFakeWebPBuffer(200 * 1024), // 200 KB each
      mime: 'image/webp'
    });
  }
  const res5 = await uploadFiles(tenFiles);
  console.log(`Status: ${res5.status}`);
  if (res5.status === 200 && res5.json?.images?.length === 10) {
    console.log('✓ SUCCESS: 10 images batch accepted and processed.');
  } else {
    console.error('✗ FAILED:', res5.json);
  }

  // TEST 6: Uploading 11 images (Exceeding max count 10)
  console.log('\n--- TEST 6: Uploading 11 images (exceeding max count limit of 10) ---');
  const elevenFiles = [];
  for (let i = 1; i <= 11; i++) {
    elevenFiles.push({
      name: `compressed_img_${i}.webp`,
      buffer: createFakeWebPBuffer(50 * 1024),
      mime: 'image/webp'
    });
  }
  const res6 = await uploadFiles(elevenFiles);
  console.log(`Status: ${res6.status}`);
  if (res6.status === 400 && res6.json?.error?.includes('10 صور')) {
    console.log('✓ SUCCESS: Server strictly enforced 10 images limit.');
    console.log(`  Server error message: "${res6.json.error}"`);
  } else {
    console.warn(`Unexpected response: status=${res6.status}`, res6.json);
  }

  // TEST 7: Corrupted / invalid file signature (Security check)
  console.log('\n--- TEST 7: Corrupted file with .webp extension but invalid signature ---');
  const fakeBadBuf = Buffer.from('NOT A WEBP FILE AT ALL, JUST RANDOM DATA FOR TEST');
  const res7 = await uploadFiles([{ name: 'fake_corrupt.webp', buffer: fakeBadBuf, mime: 'image/webp' }]);
  console.log(`Status: ${res7.status}`);
  if (res7.status === 400 && res7.json?.error?.includes('تالف أو ليس صورة صالحة')) {
    console.log('✓ SUCCESS: Server magic bytes check caught corrupt/fake file.');
  } else {
    console.warn(`Unexpected response: status=${res7.status}`, res7.json);
  }

  // TEST 8: End-to-End Listing Creation with Compressed Images & Public Retrieval
  console.log('\n--- TEST 8: End-to-End Listing Creation with Compressed Images ---');
  const uploadImg1 = createFakeWebPBuffer(250 * 1024);
  const uploadImg2 = createFakeWebPBuffer(180 * 1024);
  const uploadBatch = await uploadFiles([
    { name: 'cover_primary.webp', buffer: uploadImg1, mime: 'image/webp' },
    { name: 'secondary_stats.webp', buffer: uploadImg2, mime: 'image/webp' }
  ]);

  if (uploadBatch.status !== 200 || !uploadBatch.json?.images?.length) {
    throw new Error('Failed to upload test images for listing creation');
  }

  const uploadedImages = uploadBatch.json.images;
  console.log(`✓ Uploaded ${uploadedImages.length} images for listing creation.`);

  // Fetch user wallet ID
  const walletRes = await pool.query(`SELECT id FROM "Wallet" WHERE "userId" = $1 LIMIT 1`, [user.id]);
  let walletId = walletRes.rows[0]?.id;
  if (!walletId) {
    const newWallet = await pool.query(
      `INSERT INTO "Wallet" ("id", "userId", "balance", "currency", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, 10000, 'SDG', NOW(), NOW())
       RETURNING id`,
      [user.id]
    );
    walletId = newWallet.rows[0].id;
  }

  // Create mock payment record in DB
  const payInsert = await pool.query(
    `INSERT INTO account_listing_payments (
      user_id, wallet_id, duration_days, amount, currency, status, is_consumed, created_at, updated_at
    ) VALUES ($1, $2, 15, 3000, 'SDG', 'PAID', false, NOW(), NOW())
    RETURNING id`,
    [user.id, walletId]
  );
  const paymentId = payInsert.rows[0].id;

  // Post listing via API
  const listingPayload = {
    paymentId,
    game: 'PUBG_MOBILE',
    title: 'حساب ببجي مميز - اختبار ضغط الصور',
    price: 45000,
    isNegotiable: true,
    accountLevel: '61-80',
    bindingType: 'Google',
    description: 'حساب متكامل يحتوي على سكنات أسلحة ميثك ومستوى عال، تم رفع الصور بعد الضغط.',
    sellerWhatsapp: '+249912345678',
    images: uploadedImages.map((img: any, idx: number) => ({
      storageKey: img.storageKey,
      imageUrl: img.imageUrl,
      isPrimary: idx === 0,
      sortOrder: idx,
      fileSize: img.fileSize,
      mimeType: img.mimeType
    }))
  };

  const createRes = await fetch(`${API_BASE}/marketplace/listings`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(listingPayload)
  });

  const createJson = await createRes.json();
  if ((createRes.status !== 200 && createRes.status !== 201) || !createJson.listing) {
    throw new Error(`Failed to create listing: ${JSON.stringify(createJson)}`);
  }

  const createdListing = createJson.listing;
  console.log(`✓ SUCCESS: Listing created with ID: ${createdListing.id}, Code: ${createdListing.publicCode}`);

  // Publish listing directly in DB to test public viewing
  await pool.query(
    `UPDATE account_listings 
     SET status = 'PUBLISHED', published_at = NOW(), starts_at = NOW(), expires_at = NOW() + INTERVAL '15 days'
     WHERE id = $1`,
    [createdListing.id]
  );

  // Fetch from public endpoint: GET /api/marketplace/listings/:code
  const publicRes = await fetch(`${API_BASE}/marketplace/listings/${createdListing.publicCode}`);
  const publicJson = await publicRes.json();
  console.log(`Public Listing Status: ${publicRes.status}`);

  if (publicRes.status === 200 && publicJson.listing?.images?.length === 2) {
    console.log('✓ SUCCESS: Public listing fetched successfully with compressed images.');
    console.log('  Image 1 URL:', publicJson.listing.images[0].image_url);
    console.log('  Image 2 URL:', publicJson.listing.images[1].image_url);

    // Verify static serving of the first image
    const imgUrl = `http://localhost:5000${publicJson.listing.images[0].image_url}`;
    const imgFetch = await fetch(imgUrl);
    console.log(`  Static Image HTTP Status: ${imgFetch.status} (Content-Type: ${imgFetch.headers.get('content-type')})`);
    if (imgFetch.status === 200) {
      console.log('✓ SUCCESS: Static image serving is fully working and returns 200 OK.');
    }
  } else {
    console.error('✗ FAILED to fetch public listing images:', publicJson);
  }

  // Cleanup test listing and images from DB & disk
  await pool.query(`DELETE FROM account_listing_images WHERE listing_id = $1`, [createdListing.id]);
  await pool.query(`DELETE FROM account_listing_events WHERE listing_id = $1`, [createdListing.id]);
  await pool.query(`DELETE FROM account_listings WHERE id = $1`, [createdListing.id]);
  await pool.query(`DELETE FROM account_listing_payments WHERE id = $1`, [paymentId]);
  console.log('✓ Cleanup completed cleanly.');

  console.log('\n=== ALL SERVER UPLOAD PIPELINE TESTS COMPLETED ===');
  await pool.end();
}

runTests().catch(async (err) => {
  console.error('Test error:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
