import 'dotenv/config';
import pool from '../src/db';

async function run() {
  console.log('--- CHECKING table schemas ---');
  const alCols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'account_listings'
  `);
  console.log('account_listings columns:', alCols.rows.map(r => `${r.column_name} (${r.data_type}, null:${r.is_nullable})`));

  const alpCols = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'account_listing_payments'
  `);
  console.log('account_listing_payments columns:', alpCols.rows.map(r => `${r.column_name} (${r.data_type}, null:${r.is_nullable})`));

  const constrRes = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) as def 
    FROM pg_constraint 
    WHERE conrelid = 'account_listings'::regclass
  `);
  console.log('account_listings constraints:', constrRes.rows);

  const statusesRes = await pool.query(`
    SELECT DISTINCT status FROM account_listings
  `);
  console.log('Existing statuses in account_listings:', statusesRes.rows);

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
    LIMIT 10
  `);
  console.log('\n--- Recent account_listings ---');
  console.log(listingsRes.rows);

  const paymentsRes = await pool.query(`
    SELECT id, user_id, wallet_id, duration_days, amount, currency, status, is_consumed, listing_id, created_at 
    FROM account_listing_payments 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.log('\n--- Recent account_listing_payments ---');
  console.log(paymentsRes.rows);

  await pool.end();
}

run().catch(async (err) => {
  console.error('Check error:', err);
  await pool.end().catch(() => {});
});
