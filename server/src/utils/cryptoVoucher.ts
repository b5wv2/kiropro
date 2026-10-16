import crypto from 'crypto';

/**
 * Key derivation:
 * Uses ACCOUNT_ENCRYPTION_KEY if set, otherwise JWT_SECRET.
 * Always hashes with SHA-256 to produce exactly 32 bytes (256 bits) for AES-256.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ACCOUNT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'kiropro-vouchers-secret-key-32b';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a sensitive digital voucher code using AES-256-GCM (Authenticated Encryption).
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptVoucherCode(plainCode: string): string {
  if (!plainCode || typeof plainCode !== 'string') {
    throw new Error('Voucher code must be a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plainCode.trim(), 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted voucher code.
 * Validates the authentication tag to guarantee integrity and authenticity.
 */
export function decryptVoucherCode(encryptedPayload: string): string {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new Error('Invalid encrypted voucher payload');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted voucher payload');
  }

  const [ivHex, tagHex, dataHex] = parts;
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Incomplete encrypted voucher payload');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Masks a voucher code for safe display in summaries or listings.
 * Shows only the last 4 characters, concealing the rest.
 * Example: "ABCD-1234-EFGH-5678" -> "••••-••••-••••-5678"
 */
export function maskVoucherCode(code: string): string {
  if (!code || typeof code !== 'string') return '••••';
  const clean = code.trim();
  if (clean.length <= 4) return '••••';
  const last4 = clean.slice(-4);
  return `••••-••••-${last4}`;
}
