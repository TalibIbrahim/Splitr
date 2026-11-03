import { findAmountTokens, lineAmount, removeSpans } from './amounts';

export type RowKind =
  | 'ignore'
  | 'subtotal'
  | 'discount'
  | 'tax'
  | 'service'
  | 'tip'
  | 'fee'
  | 'total'
  | 'item'
  | 'text';

/**
 * P3 + P17 keyword table, in precedence order. Ignore words are anchored at a word start (and mostly end) so that
 * menu items such as "Vegetable Pakora" (table), "Cashew Chicken" (cash) or "Chicken Changezi" (change) are not dropped.
 */
const KEYWORDS: readonly (readonly [Exclude<RowKind, 'item' | 'text'>, RegExp])[] = [
  [
    'ignore',
    new RegExp(
      [
        String.raw`\b(?:cash|change|tendered|balance|paid|visa|ntn|strn|pos|invoice|table|cover|waiter|server)s?\b`,
        String.raw`\b(?:token|inv|order|kot|host|term|terminal|guest|cashier|shift|chq|signature|software|download|fbr|pra|pntn|cnic|mobile)s?\b`,
        String.raw`\bcard\s*no\b|\bmaster|\bthank`,
        String.raw`\bbill no\b|\bpayment mode\b|\bcredit card\b|\bitems\s*:|\bno of items\b|\brupees\b.*\bonly\b|\bpowered by\b`,
        String.raw`\border taker\b|\bcounter manager\b`,
      ].join('|'),
    ),
  ],
  [
    'subtotal',
    /sub\s*-?\s*total|total before|gross|total value|\bg\.?\s*amount|bill amt w\/o tax|amount w\/o tax|total net amount/,
  ],
  // P17: these contain the word "tax", so they must win over the tax keywords.
  ['total', /amt with tax|amount with tax|net amount/],
  ['discount', /discount|disc\b|\boff\b|promo|voucher/],
  ['tax', /gst|g\.s\.t|\bpst\b|\bp\.s\.t|\bfed\b|\bvat\b|sales? tax|\btax\b/],
  ['fee', /delivery charges?|bag charges?|shopping bag|packing charges?/],
  ['service', /service|s\.?\s*charge|svc/],
  ['tip', /\btip\b|gratuity/],
  ['total', /grand total|net total|net payable|amount due|bill total|payable|\bg\. total|cc total|\btotal\b/],
];

/** "P.S.T CASH@16% / CARD@5%" mentions cash and card but is a tax row, not an ignorable payment row. */
const RATED_TAX = /gst|g\.s\.t|\bpst\b|\bp\.s\.t|\bvat\b|sales? tax/;

const letterCount = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;

/**
 * P3. Classifies a row from its text (keywords are matched case-insensitively on the text without amounts).
 * `item` needs a line amount (P2b) and at least 2 letters; anything else is `text`.
 */
export function classifyRow(text: string): RowKind {
  const amounts = findAmountTokens(text);
  let stripped = removeSpans(text, amounts).toLowerCase();
  // "No Of Items :5" can share a row with a real summary label ("G.Amount: 3,625"): drop that fragment first.
  const itemCount = /\b(?:no of )?items\s*:\s*\d*/g;
  if (itemCount.test(stripped)) {
    stripped = stripped.replace(itemCount, ' ');
    if (letterCount(stripped) < 2) return 'ignore';
  }
  if (RATED_TAX.test(stripped) && stripped.includes('%') && /\b(?:cash|card)\b/.test(stripped)) return 'tax';
  for (const [kind, re] of KEYWORDS) {
    if (re.test(stripped)) return kind;
  }
  if (lineAmount(text, amounts) !== undefined && letterCount(stripped) >= 2) return 'item';
  return 'text';
}
