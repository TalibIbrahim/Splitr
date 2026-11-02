import { toPaisa, type Paisa } from '@splitr/calculation-engine';

export type ParseRupeesResult =
  | { ok: true; paisa: Paisa }
  | { ok: false; reason: 'empty' | 'invalid' | 'too-many-decimals' | 'too-large' };

/** Rs 100 000 000 expressed in whole rupees (the maximum accepted magnitude). */
const MAX_WHOLE_RUPEES = 100_000_000;

/**
 * D2. Parses user-typed rupees into integer paisa. String/integer arithmetic only: never parseFloat.
 * Accepts "1806", "1,806", "1806.5", "1806.25", " Rs 1,806 ", "-200". A leading "Rs" (any case) is allowed.
 */
export function parseRupees(text: string): ParseRupeesResult {
  let s = text.trim();
  s = s.replace(/^rs\.?/i, '').trim(); // C1: "Rs", "rs", "Rs." (common on receipts)
  if (s === '') return { ok: false, reason: 'empty' };

  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }

  // Digits with at most one dot; both sides of the dot are required when a dot is present.
  if (!/^[\d,]+(\.\d*)?$/.test(s)) return { ok: false, reason: 'invalid' };
  const dotParts = s.split('.');
  const rawWhole = dotParts[0] ?? '';
  const fracText = dotParts[1] ?? '';
  if (dotParts.length === 2 && fracText === '') return { ok: false, reason: 'invalid' };
  // Commas are thousands separators only: 1,806 / 1,234,567.
  if (rawWhole.includes(',') ? !/^\d{1,3}(,\d{3})+$/.test(rawWhole) : rawWhole === '') {
    return { ok: false, reason: 'invalid' };
  }
  const wholeText = rawWhole.replace(/,/g, '');
  if (fracText.length > 2) return { ok: false, reason: 'too-many-decimals' };

  const wholeTrimmed = wholeText.replace(/^0+(?=\d)/, '');
  if (wholeTrimmed.length > 9) return { ok: false, reason: 'too-large' };
  const whole = wholeTrimmed === '' ? 0 : Number(wholeTrimmed);
  const frac = Number(fracText.padEnd(2, '0'));
  if (whole > MAX_WHOLE_RUPEES || (whole === MAX_WHOLE_RUPEES && frac > 0)) {
    return { ok: false, reason: 'too-large' };
  }

  const magnitude = whole * 100 + frac;
  return { ok: true, paisa: toPaisa(negative ? -magnitude : magnitude) };
}
