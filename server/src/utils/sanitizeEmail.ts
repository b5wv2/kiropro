/**
 * Sanitizes and normalizes an email address:
 * - Strips invisible zero-width characters (BOM, zero-width space, joiners, directional marks)
 * - Converts non-breaking and unusual unicode spaces to standard ASCII
 * - Trims leading and trailing whitespace
 * - Converts to lowercase
 */
export function sanitizeEmail(rawEmail: string): string {
  if (!rawEmail || typeof rawEmail !== 'string') return '';

  return rawEmail
    // Remove BOM and zero-width characters: \uFEFF, \u200B, \u200C, \u200D, \u200E, \u200F
    .replace(/[\u200B-\u200D\u200E\u200F\uFEFF]/g, '')
    // Replace non-breaking spaces (\u00A0, \u202F) with standard space
    .replace(/[\u00A0\u202F]/g, ' ')
    // Trim standard whitespace
    .trim()
    // Lowercase
    .toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  // Standard RFC 5322 compatible regex check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
