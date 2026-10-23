/**
 * Normalizes a validated positive monetary amount without floating-point
 * arithmetic.
 *
 * Examples:
 *   "100"   -> "100.00"
 *   "100.5" -> "100.50"
 *   "0.01"  -> "0.01"
 */
export function normalizeAmount(amount: string): string {
  const [integerPart = '0', fractionalPart = ''] = amount.split('.');

  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '');

  return `${normalizedInteger}.${fractionalPart.padEnd(2, '0')}`;
}
