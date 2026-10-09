const { Pool } = require('pg');
require('dotenv').config({ path: 'server/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('--- CHECKING UploadedAsset table schema and constraints ---');
  const schemaRes = await pool.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'UploadedAsset'
  `);
  console.log('UploadedAsset columns:', schemaRes.rows);

  const constrRes = await pool.query(`
    SELECT conname, contype 
    FROM pg_constraint 
    WHERE conrelid = ' "UploadedAsset" '::regclass
  `);
  console.log('UploadedAsset constraints:', constrRes.rows);

  const assetsRes = await pool.query(`
    SELECT filename, "mimeType", "fileSize", octet_length("dataBase64") as b64_len 
    FROM "UploadedAsset" 
    WHERE filename LIKE 'mkt_%' 
    LIMIT 10
  `);
  console.log('\n--- Marketplace assets in UploadedAsset table ---');
  console.log(assetsRes.rows);

  const imagesRes = await pool.query(`
    SELECT id, listing_id, image_url, storage_key, is_primary, sort_order, file_size 
    FROM account_listing_images 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.log('\n--- Recent account_listing_images ---');
  console.log(imagesRes.rows);

  const listingsRes = await pool.query(`
    SELECT id, public_code, title, status, seller_user_id, seller_whatsapp, duration_days, created_at 
    FROM account_listings 
    ORDER BY created_at DESC 
    LIMIT 5
  `);
  console.log('\n--- Recent account_listings ---');
  console.log(listingsRes.rows);

  const paymentsRes = await pool.query(`
    SELECT id, user_id, wallet_id, duration_days, amount, currency, status, is_consumed, listing_id, created_at 
    FROM account_listing_payments 
    ORDER BY created_at DESC 
    LIMIT 5
  `);
  console.log('\n--- Recent account_listing_payments ---');
  console.log(paymentsRes.rows);

  await pool.end();
}

run().catch(err => {
  console.error('Check error:', err);
  pool.end();
});
