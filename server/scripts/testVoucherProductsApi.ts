import express from 'express';
import pool from '../src/db';
import productsRouter from '../src/routes/products';

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/products`;

  try {
    console.log('Testing GET /api/products...');
    const res = await fetch(baseUrl);
    const cats: any[] = await res.json();

    console.log(`Total categories returned: ${cats.length}`);
    for (const c of cats) {
      console.log(`- Category [${c.id}]: "${c.name}", type: "${c.type}", category: "${c.category}", packages: ${c.packages.length}, minPrice: $${c.minPrice}`);
    }

    const ffVoucher = cats.find(c => c.id === 'freefire-vouchers');
    const pubgVoucher = cats.find(c => c.id === 'pubg-vouchers');

    console.log('\n--- Free Fire Vouchers Category ---');
    console.log('Found:', Boolean(ffVoucher));
    if (ffVoucher) {
      console.log('Packages count:', ffVoucher.packages.length);
      console.log('Sample package:', ffVoucher.packages[0]);
    }

    console.log('\n--- PUBG UC Vouchers Category ---');
    console.log('Found:', Boolean(pubgVoucher));
    if (pubgVoucher) {
      console.log('Packages count:', pubgVoucher.packages.length);
      console.log('Sample package:', pubgVoucher.packages[0]);
    }

    console.log('\n--- Testing GET /api/products/freefire-vouchers ---');
    const ffSingleRes = await fetch(`${baseUrl}/freefire-vouchers`);
    console.log('Status:', ffSingleRes.status);
    const ffSingle = await ffSingleRes.json();
    console.log('Category name:', ffSingle.name, 'Packages count:', ffSingle.packages?.length);

    console.log('\n--- Testing GET /api/products/pubg-vouchers ---');
    const pubgSingleRes = await fetch(`${baseUrl}/pubg-vouchers`);
    console.log('Status:', pubgSingleRes.status);
    const pubgSingle = await pubgSingleRes.json();
    console.log('Category name:', pubgSingle.name, 'Packages count:', pubgSingle.packages?.length);

  } finally {
    server.close();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
