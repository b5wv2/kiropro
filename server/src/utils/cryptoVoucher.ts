import crypto from 'crypto';

/**
 * Primary Key Derivation (SEC-FIN-02):
 * Uses dedicated VOUCHERS_ENCRYPTION_KEY or VOUCHER_ENCRYPTION_KEY.
 * NEVER uses JWT_SECRET for new encryptions.
 */
function getVoucherPrimaryEncryptionKey(): Buffer {
  const secret = process.env.VOUCHERS_ENCRYPTION_KEY || process.env.VOUCHER_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: VOUCHERS_ENCRYPTION_KEY must be configured in production environment.');
    }
    return crypto.createHash('sha256').update('kiropro-voucher-encryption-dev-key-32b').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Legacy decryption candidates list for backwards compatibility during key rotation.
 * Validates against GCM authTag to safely decrypt legacy voucher codes without data loss.
 */
function getVoucherDecryptionKeyCandidates(): Buffer[] {
  const candidates: string[] = [];
  const primarySecret = process.env.VOUCHERS_ENCRYPTION_KEY || process.env.VOUCHER_ENCRYPTION_KEY;
  if (primarySecret) candidates.push(primarySecret);
  const oldSecret = process.env.VOUCHERS_ENCRYPTION_KEY_OLD || process.env.VOUCHER_ENCRYPTION_KEY_OLD;
  if (oldSecret) candidates.push(oldSecret);
  if (process.env.NODE_ENV !== 'production') candidates.push('kiropro-voucher-encryption-dev-key-32b');
  if (process.env.ACCOUNT_ENCRYPTION_KEY) candidates.push(process.env.ACCOUNT_ENCRYPTION_KEY);
  if (process.env.JWT_SECRET) candidates.push(process.env.JWT_SECRET);
  candidates.push('kiropro-vouchers-secret-key-32b');

  return candidates.map(s => crypto.createHash('sha256').update(s).digest());
}

/**
 * Encrypts a sensitive digital voucher code using AES-256-GCM (Authenticated Encryption).
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptVoucherCode(plainCode: string): string {
  if (!plainCode || typeof plainCode !== 'string') {
    throw new Error('Voucher code must be a non-empty string');
  }

  const key = getVoucherPrimaryEncryptionKey();
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
 * Supports legacy candidate keys to guarantee zero data loss during key rotation.
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

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const candidateKeys = getVoucherDecryptionKeyCandidates();
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
      // GCM authentication failed for this candidate key, try next
      continue;
    }
  }

  throw new Error('Failed to decrypt voucher code: authentication tag mismatch across all candidate keys.');
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
