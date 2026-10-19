import crypto from 'crypto';

/**
 * Primary Key Derivation (SEC-FIN-02):
 * Uses dedicated ACCOUNT_ENCRYPTION_KEY.
 * NEVER uses JWT_SECRET for new encryptions.
 */
function getAccountPrimaryEncryptionKey(): Buffer {
  const rawSecret = process.env.ACCOUNT_ENCRYPTION_KEY;
  if (!rawSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: ACCOUNT_ENCRYPTION_KEY must be configured in production environment.');
    }
    return crypto.createHash('sha256').update('kiropro-account-encryption-dev-key-32b').digest();
  }
  return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Legacy decryption candidates list for backwards compatibility during key rotation.
 * Validates against GCM authTag to safely decrypt legacy accounts without data loss.
 */
function getAccountDecryptionKeyCandidates(): Buffer[] {
  const candidates: string[] = [];
  if (process.env.ACCOUNT_ENCRYPTION_KEY) candidates.push(process.env.ACCOUNT_ENCRYPTION_KEY);
  if (process.env.ACCOUNT_ENCRYPTION_KEY_OLD) candidates.push(process.env.ACCOUNT_ENCRYPTION_KEY_OLD);
  if (process.env.NODE_ENV !== 'production') candidates.push('kiropro-account-encryption-dev-key-32b');
  if (process.env.JWT_SECRET) candidates.push(process.env.JWT_SECRET);
  candidates.push('kiropro-digital-accounts-secret-key-32b');

  return candidates.map(s => crypto.createHash('sha256').update(s).digest());
}

/**
 * Encrypts a password using AES-256-GCM (Authenticated Encryption).
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptPassword(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  const key = getAccountPrimaryEncryptionKey();
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
 * Supports legacy candidate keys to guarantee zero data loss during key rotation.
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

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const candidateKeys = getAccountDecryptionKeyCandidates();
  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final()
      ]);
      return decrypted.toString('utf8');
    } catch {
      // GCM tag authentication failed for this key, try next candidate
      continue;
    }
  }

  throw new Error('Failed to decrypt password: authentication tag mismatch across all candidate keys.');
}

/**
 * Validates email format strictly.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) && clean.length <= 255;
}
