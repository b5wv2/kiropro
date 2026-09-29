import crypto from 'crypto';

/**
 * Key Derivation:
 * Uses ACCOUNT_ENCRYPTION_KEY if present, falling back to JWT_SECRET.
 * Always hashes with SHA-256 to ensure exactly 32 bytes (256 bits) for AES-256.
 */
function getEncryptionKey(): Buffer {
  const rawSecret = process.env.ACCOUNT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'kiropro-digital-accounts-secret-key-32b';
  return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Encrypts a password using AES-256-GCM (Authenticated Encryption).
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptPassword(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts a password encrypted with AES-256-GCM.
 * Validates cryptographic tag to prevent tampering or corruption.
 */
export function decryptPassword(encryptedPayload: string): string {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new Error('Invalid encrypted payload');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted payload structure is invalid');
  }

  const [ivHex, tagHex, dataHex] = parts;
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Encrypted payload parts are incomplete');
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
 * Validates email format strictly.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) && clean.length <= 255;
}
