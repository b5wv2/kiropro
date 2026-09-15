/**
 * Formats numeric values to standard currency format (e.g. $84.42)
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const safeAmount = isNaN(amount) ? 0 : amount;
  if (currency === 'SDG' || currency === 'ج.س') {
    return `${safeAmount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })} ج.س`;
  }
  if (currency === '$' || currency === 'USD') {
    return `$${safeAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }
  return `${safeAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency}`;
}

/**
 * Validates player IDs or digital account identifiers
 */
export function isValidPlayerId(id: string): boolean {
  return id.trim().length >= 4;
}
