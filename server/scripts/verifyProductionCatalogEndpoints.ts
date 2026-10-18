import 'dotenv/config';
import express from 'express';
import pool from '../src/db';
import productsRouter from '../src/routes/products';
import vouchersRouter from '../src/routes/vouchers';

async function verifyCatalogEndpoints() {
  console.log('======================================================================');
  console.log('🔍 VERIFYING PRODUCTION CATALOG ENDPOINTS WITH LIVE FLAGS');
  console.log('======================================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);
  app.use('/api/vouchers', vouchersRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Test /api/vouchers/catalog
    console.log('--- Checking GET /api/vouchers/catalog ---');
    const vRes = await fetch(`${baseUrl}/api/vouchers/catalog`);
    const vData = await vRes.json();

    console.log(`HTTP ${vRes.status} | Exchange Rate: ${vData.exchangeRate}`);
    let totalVouchers = 0;
    let purchasableCount = 0;

    for (const cat of (vData.categories || [])) {
      console.log(`Category: ${cat.name} (${cat.gameKey}) -> ${cat.items.length} items`);
      for (const item of cat.items) {
        totalVouchers++;
        if (item.isPurchasable) purchasableCount++;
        console.log(`   - [${item.isPurchasable ? '✓ PURCHASABLE' : '✗ BLOCKED'}] ${item.title}: $${item.priceUsd} (${item.priceSdg.toLocaleString()} SDG) - Stock: ${item.stock}`);
      }
    }

    console.log(`\nTotal Vouchers: ${totalVouchers} | Purchasable in Production: ${purchasableCount}\n`);

    // 2. Test /api/products (Store Front)
    console.log('--- Checking GET /api/products (Free Fire & PUBG Cards) ---');
    const pRes = await fetch(`${baseUrl}/api/products`);
    const pData = await pRes.json();
    const categories = Array.isArray(pData) ? pData : (pData.products || []);

    const ffCard = categories.find((c: any) => c.id === 'freefire-vouchers' || c.gameId === 'freefire-vouchers');
    const pubgCard = categories.find((c: any) => c.id === 'pubg-vouchers' || c.gameId === 'pubg-vouchers');

    console.log(`Free Fire Card found: ${Boolean(ffCard)} with ${ffCard?.packages?.length || 0} packages`);
    console.log(`PUBG Card found: ${Boolean(pubgCard)} with ${pubgCard?.packages?.length || 0} packages\n`);

    if (ffCard?.packages) {
      console.log('Sample Free Fire Packages:');
      for (const pkg of ffCard.packages.slice(0, 3)) {
        console.log(`   - ${pkg.name}: isPurchasable = ${pkg.isPurchasable}, inStock = ${pkg.inStock}`);
      }
    }

    if (pubgCard?.packages) {
      console.log('Sample PUBG Packages:');
      for (const pkg of pubgCard.packages.slice(0, 3)) {
        console.log(`   - ${pkg.name}: isPurchasable = ${pkg.isPurchasable}, inStock = ${pkg.inStock}`);
      }
    }

  } finally {
    server.close();
    await pool.end();
  }
}

verifyCatalogEndpoints().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
