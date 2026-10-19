import dotenv from 'dotenv';
dotenv.config();

const secret = (process.env.G2BULK_WEBHOOK_SECRET || process.env.WHSEC_G2BULK || '').trim();

console.log('=== G2BULK WEBHOOK CONFIGURATION STATUS ===');
console.log('Environment variable G2BULK_WEBHOOK_SECRET configured:', Boolean(secret));
if (secret) {
  console.log('Format valid (starts with whsec_):', secret.startsWith('whsec_'));
  console.log('Key length:', secret.length);
  try {
    const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const buf = Buffer.from(rawSecret, 'base64');
    console.log('Base64 decode successful, byte length:', buf.length);
  } catch (err: any) {
    console.error('Base64 decoding failed:', err.message);
  }
} else {
  console.log('G2BULK_WEBHOOK_SECRET is NOT set in server/.env.');
}
