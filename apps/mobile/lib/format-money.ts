/**
 * Integer-only money formatting. No float division: paisa is split with Math.trunc and %.
 * Grouping is 3-digit ("1,806", "1,234,567").
 */
export interface MoneyParts {
  negative: boolean;
  /** Whole rupees, grouped: "1,806" */
  rupees: string;
  /** Two-digit paisa, or '' when the amount is whole rupees. */
  paisa: string;
}

function group3(n: number): string {
  let s = String(n);
  let out = '';
  while (s.length > 3) {
    out = ',' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return s + out;
}

export function moneyParts(amount: number): MoneyParts {
  const negative = amount < 0;
  const abs = negative ? -amount : amount;
  const rem = abs % 100;
  const rupees = (abs - rem) / 100; // exact: abs - rem is a multiple of 100
  return {
    negative,
    rupees: group3(rupees),
    paisa: rem === 0 ? '' : (rem < 10 ? '0' : '') + String(rem),
  };
}

const MINUS = '−';
const NBSP = ' ';

/** "Rs 1,806", "Rs 1,806.25", "−Rs 425"; `showSign` adds "+" to positives. */
export function formatMoney(amount: number, opts: { showSign?: boolean } = {}): string {
  const p = moneyParts(amount);
  const sign = p.negative ? MINUS : opts.showSign && amount > 0 ? '+' : '';
  return `${sign}Rs${NBSP}${p.rupees}${p.paisa ? '.' + p.paisa : ''}`;
}

/** Screen-reader text: "1,806 rupees", "1,806 rupees 25 paisa", "minus 425 rupees". */
export function moneyA11yLabel(amount: number): string {
  const p = moneyParts(amount);
  const rupeesWord = p.rupees === '1' && !p.paisa ? 'rupee' : 'rupees';
  return `${p.negative ? 'minus ' : ''}${p.rupees} ${rupeesWord}${p.paisa ? ` ${Number(p.paisa)} paisa` : ''}`;
}

/** Plain rupee text for prefilling an input (no grouping, no "Rs"): 180625 → "1806.25", 180600 → "1806". Integer maths only. */
export function toRupeeInputText(amount: number): string {
  const negative = amount < 0;
  const abs = negative ? -amount : amount;
  const rem = abs % 100;
  const rupees = (abs - rem) / 100;
  return `${negative ? '-' : ''}${rupees}${rem === 0 ? '' : `.${rem < 10 ? '0' : ''}${rem}`}`;
}
