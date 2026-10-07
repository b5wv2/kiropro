import crypto from 'crypto';

/**
 * Key Derivation:
 * Uses CARD_ENCRYPTION_KEY if present, falling back to ACCOUNT_ENCRYPTION_KEY or JWT_SECRET.
 * Always hashes with SHA-256 to guarantee 32 bytes (256 bits) for AES-256-GCM.
 */
function getCardEncryptionKey(): Buffer {
  const rawSecret =
    process.env.CARD_ENCRYPTION_KEY ||
    process.env.ACCOUNT_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'kiropro-secure-virtual-cards-key-32b';
  return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Encrypts a sensitive string (card number or CVV) using AES-256-GCM (Authenticated Encryption).
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptCardData(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Data to encrypt must be a non-empty string');
  }

  const key = getCardEncryptionKey();
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

  const key = getCardEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
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
  const key = getCardEncryptionKey();
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
