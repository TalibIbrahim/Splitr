/**
 * Integer-only number formatting helpers (no floats, no Number division on money).
 * All functions work on decimal strings of integers.
 */

/** Inserts thousands separators into a string of digits. */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Plain rupee figure from paisa, with grouping and no currency symbol:
 * 80000 -> "800", 80050 -> "800.50", -5 -> "-0.05", 212500 -> "2,125".
 */
export function rupeesPlain(paisa: number): string {
  const negative = paisa < 0;
  const digits = String(Math.abs(paisa)).padStart(3, '0');
  const whole = digits.slice(0, -2);
  const frac = digits.slice(-2);
  const body = frac === '00' ? groupDigits(whole) : `${groupDigits(whole)}.${frac}`;
  return negative ? `-${body}` : body;
}

/** Basis points as a percentage without a trailing zero: 2000 -> "20%", 1250 -> "12.5%", 1 -> "0.01%". */
export function percentFromBp(bp: number): string {
  const negative = bp < 0;
  const digits = String(Math.abs(bp)).padStart(3, '0');
  const whole = digits.slice(0, -2);
  const frac = digits.slice(-2).replace(/0+$/, '');
  const body = frac === '' ? whole : `${whole}.${frac}`;
  return `${negative ? '-' : ''}${body}%`;
}
