import crypto from 'crypto';

/**
 * Primary Key Derivation (SEC-FIN-02):
 * Uses dedicated CARD_ENCRYPTION_KEY.
 * NEVER uses JWT_SECRET for new encryptions.
 */
function getCardPrimaryEncryptionKey(): Buffer {
  const rawSecret = process.env.CARD_ENCRYPTION_KEY;
  if (!rawSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: CARD_ENCRYPTION_KEY must be configured in production environment.');
    }
    // Dedicated dev card fallback (NOT JWT_SECRET)
    return crypto.createHash('sha256').update('kiropro-card-encryption-dev-key-32b').digest();
  }
  return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Legacy decryption candidates list for backwards compatibility during key rotation.
 * Validates against GCM authTag to safely decrypt legacy rows without data loss.
 */
function getCardDecryptionKeyCandidates(): Buffer[] {
  const candidates: string[] = [];
  if (process.env.CARD_ENCRYPTION_KEY) candidates.push(process.env.CARD_ENCRYPTION_KEY);
  if (process.env.CARD_ENCRYPTION_KEY_OLD) candidates.push(process.env.CARD_ENCRYPTION_KEY_OLD);
  if (process.env.NODE_ENV !== 'production') candidates.push('kiropro-card-encryption-dev-key-32b');
  if (process.env.ACCOUNT_ENCRYPTION_KEY) candidates.push(process.env.ACCOUNT_ENCRYPTION_KEY);
  if (process.env.JWT_SECRET) candidates.push(process.env.JWT_SECRET);
  candidates.push('kiropro-secure-virtual-cards-key-32b');

  return candidates.map(secret => crypto.createHash('sha256').update(secret).digest());
}

/**
 * Encrypts a sensitive string (card number or CVV) using AES-256-GCM (Authenticated Encryption).
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptCardData(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Data to encrypt must be a non-empty string');
  }

  const key = getCardPrimaryEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts data encrypted with AES-256-GCM.
 * Validates cryptographic tag to prevent tampering or corruption.
 * Supports legacy candidate keys to guarantee zero data loss during key rotation.
 */
export function decryptCardData(encryptedPayload: string): string {
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

  const candidateKeys = getCardDecryptionKeyCandidates();
  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      // GCM tag verification failed with this key, try next candidate
      continue;
    }
  }

  throw new Error('Failed to decrypt card data: authentication tag mismatch across all candidate keys.');
}

/**
 * Strips whitespace, dashes, and non-digits from card numbers.
 */
export function cleanCardNumber(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '');
}

/**
 * Extracts last 4 digits of a card number.
 */
export function extractLast4(cleanNum: string): string {
  const sanitized = cleanCardNumber(cleanNum);
  return sanitized.length >= 4 ? sanitized.slice(-4) : sanitized;
}

/**
 * Formats a clean 16-digit card number with grouping spaces: XXXX XXXX XXXX XXXX
 */
export function formatCardNumber(cleanNum: string): string {
  const sanitized = cleanCardNumber(cleanNum);
  return sanitized.replace(/(\d{4})/g, '$1 ').trim();
}

/**
 * Masks a card number for safe public and admin list rendering: •••• •••• •••• 7619
 */
export function maskCardNumber(cleanNumOrLast4: string): string {
  const last4 = extractLast4(cleanNumOrLast4);
  return `•••• •••• •••• ${last4}`;
}

/**
 * Validates expiration date format MM/YY and ensures future/current validity.
 */
export function isValidExpDate(exp: string): boolean {
  if (!exp || typeof exp !== 'string') return false;
  const match = exp.trim().match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!match || !match[1] || !match[2]) return false;

  const month = parseInt(match[1], 10);
  const year2Digit = parseInt(match[2], 10);
  const fullYear = 2000 + year2Digit;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  if (fullYear < currentYear) return false;
  if (fullYear === currentYear && month < currentMonth) return false;
  if (fullYear > currentYear + 20) return false; // Sanity check

  return true;
}

/**
 * Validates CVV: 3 digits (or 4 for specialty cards).
 */
export function isValidCvv(cvv: string): boolean {
  if (!cvv || typeof cvv !== 'string') return false;
  return /^\d{3,4}$/.test(cvv.trim());
}

/**
 * Validates 16-digit card number using standard Luhn Algorithm (Mod 10).
 */
export function isValidLuhn(cleanNum: string): boolean {
  if (!/^\d{16}$/.test(cleanNum)) return false;

  let sum = 0;
  let alternate = false;

  for (let i = cleanNum.length - 1; i >= 0; i--) {
    const char = cleanNum[i];
    if (!char) continue;
    let n = parseInt(char, 10);

    if (alternate) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }

    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/**
 * Generates a deterministic HMAC-SHA256 fingerprint for a card number.
 * Used for zero-duplicate database lookups without storing or exposing plaintext PAN.
 */
export function hashCardNumber(cleanNum: string): string {
  const sanitized = cleanCardNumber(cleanNum);
  if (!sanitized) return '';
  const key = getCardPrimaryEncryptionKey();
  return crypto.createHmac('sha256', key).update(sanitized).digest('hex');
}

/**
 * Splits a CSV line taking into account double quotes.
 * E.g., '123,"10/27",456,1.00' => ['123', '10/27', '456', '1.00']
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  let delimiter = ',';
  if (!line.includes(',') && (line.includes(';') || line.includes('\t') || line.includes('|'))) {
    if (line.includes(';')) delimiter = ';';
    else if (line.includes('\t')) delimiter = '\t';
    else if (line.includes('|')) delimiter = '|';
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detects card network based on standard BIN prefixes.
 * Visa: starts with 4
 * Mastercard: starts with 51-55 or 2221-2720
 */
export function detectCardNetwork(cleanNum: string): 'VISA' | 'MASTERCARD' | 'UNKNOWN' {
  if (!cleanNum || typeof cleanNum !== 'string') return 'UNKNOWN';
  if (cleanNum.startsWith('4')) return 'VISA';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(cleanNum)) {
    return 'MASTERCARD';
  }
  return 'UNKNOWN';
}
