import { findAmountTokens, lineAmount, removeSpans } from './amounts';

export type RowKind =
  | 'ignore'
  | 'subtotal'
  | 'discount'
  | 'tax'
  | 'service'
  | 'tip'
  | 'total'
  | 'item'
  | 'text';

/**
 * P3 keyword table, in precedence order. Ignore words are anchored at a word start (and mostly end) so that
 * menu items such as "Vegetable Pakora" (table), "Cashew Chicken" (cash) or "Chicken Changezi" (change) are not dropped.
 */
const KEYWORDS: readonly (readonly [Exclude<RowKind, 'item' | 'text'>, RegExp])[] = [
  [
    'ignore',
    /\b(?:cash|change|tendered|balance|paid|visa|ntn|strn|pos|invoice|table|cover|waiter|server)s?\b|\bcard\s*no\b|\bmaster|\bthank/,
  ],
  ['subtotal', /sub\s*-?\s*total|total before|gross/],
  ['discount', /discount|disc\b|\boff\b|promo|voucher/],
  ['tax', /gst|\bpst\b|\bfed\b|\bvat\b|sales tax|\btax\b/],
  ['service', /service|s\.?\s*charge|svc/],
  ['tip', /\btip\b|gratuity/],
  ['total', /grand total|net total|net payable|amount payable|amount due|bill total|\btotal\b/],
];

const letterCount = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;

/**
 * P3. Classifies a row from its text (keywords are matched case-insensitively on the text without amounts).
 * `item` needs a line amount (P2b) and at least 2 letters; anything else is `text`.
 */
export function classifyRow(text: string): RowKind {
  const amounts = findAmountTokens(text);
  const stripped = removeSpans(text, amounts).toLowerCase();
  for (const [kind, re] of KEYWORDS) {
    if (re.test(stripped)) return kind;
  }
  if (lineAmount(text, amounts) !== undefined && letterCount(stripped) >= 2) return 'item';
  return 'text';
}
