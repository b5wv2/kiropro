import fs from 'fs';
import path from 'path';
import pool from '../src/db';
import { decryptCardData } from '../src/utils/cryptoCard';
import crypto from 'crypto';

function hashCard(cleanNum: string): string {
  const secret = process.env.CARD_ENCRYPTION_KEY || process.env.ACCOUNT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'kiropro-secure-virtual-cards-key-32b';
  const key = crypto.createHash('sha256').update(secret).digest();
  return crypto.createHmac('sha256', key).update(cleanNum).digest('hex');
}

async function run() {
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, '../migrations/033_card_hash_fingerprint.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('Applied migration 033 successfully.');

    // Backfill any cards that do not have card_hash
    const rows = await client.query(`SELECT id, card_number_encrypted FROM kiropro_cards_inventory WHERE card_hash IS NULL`);
    console.log(`Backfilling ${rows.rows.length} cards...`);
    for (const r of rows.rows) {
      try {
        const decrypted = decryptCardData(r.card_number_encrypted);
        const clean = decrypted.replace(/\D/g, '');
        const h = hashCard(clean);
        await client.query(`UPDATE kiropro_cards_inventory SET card_hash = $1 WHERE id = $2`, [h, r.id]);
      } catch (err: any) {
        console.warn(`Failed to backfill card ${r.id}:`, err.message);
      }
    }
    console.log('Backfill complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
