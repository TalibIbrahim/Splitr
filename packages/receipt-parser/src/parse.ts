import { toBasisPoints, toPaisa, type BasisPoints, type Paisa } from '@splitr/calculation-engine';
import type {
  DraftCharge,
  DraftConfidence,
  DraftFlag,
  DraftItem,
  OcrResult,
  ReceiptCheck,
  ReceiptDraft,
} from '@splitr/shared-types';
import { findAmountTokens, lineAmount, removeSpans, type AmountToken } from './amounts';
import { classifyRow, type RowKind } from './classify';
import { parseDate } from './date';
import { groupRows, type Row } from './rows';

const LOW_CONFIDENCE = 0.6;
const SUMMARY_KINDS: ReadonlySet<RowKind> = new Set(['subtotal', 'discount', 'tax', 'service', 'tip', 'total']);
const FLAG_ORDER: readonly DraftFlag[] = ['arithmetic', 'quantity', 'name', 'ocr-confidence'];

interface ClassifiedRow {
  readonly row: Row;
  readonly kind: RowKind;
  readonly amounts: AmountToken[];
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
const letters = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const trimPunct = (s: string): string => collapse(s.replace(/^[\s:;,@=\-–—*#.]+|[\s:;,@=\-.]+$/g, ''));

function confidenceOf(row: Row, flags: readonly DraftFlag[]): DraftConfidence {
  return flags.length > 0 || (row.minConfidence !== undefined && row.minConfidence < LOW_CONFIDENCE) ? 'low' : 'high';
}

/** P8. `16%` or `16.5 %` becomes integer basis points by string maths; more than 2 decimals is ignored. */
function parseRateBp(text: string): BasisPoints | undefined {
  const m = /(\d{1,3})(?:\.(\d+))?\s*%/.exec(text);
  if (m === null) return undefined;
  const frac = m[2] ?? '';
  if (frac.length > 2) return undefined;
  return toBasisPoints(Number(m[1]) * 100 + Number(frac.padEnd(2, '0')));
}

interface QuantityParse {
  /** Raw quantity text found by (a)/(b), if any. */
  candidate?: string;
  unit?: AmountToken;
  line: AmountToken;
  removed: { start: number; end: number }[];
}

/** P5. Works out the quantity marker, unit price and line amount of an item row. `amounts` is non-empty. */
function parseQuantity(text: string, amounts: [AmountToken, ...AmountToken[]]): QuantityParse {
  let candidate: string | undefined;
  let marker: { start: number; end: number } | undefined;
  let remaining: AmountToken[] = amounts;

  const explicitLead = /^\s*(\d+)\s*[x×](?=\s|$)/i.exec(text);
  const first = amounts[0];
  if (explicitLead !== null) {
    // (a) "N x", "Nx", "N ×" prefix.
    candidate = explicitLead[1];
    marker = { start: 0, end: explicitLead[0].length };
    remaining = amounts.filter((a) => a.start >= (marker?.end ?? 0));
  } else if (
    /^\d+$/.test(first.text) &&
    first.start === text.search(/\S/) &&
    amounts.length === 3 &&
    Number(first.text) * (amounts[1]?.value ?? 0) === amounts[2]?.value
  ) {
    // P5a: a bare leading integer is a quantity only as (qty, unit, line) with qty x unit = line.
    candidate = first.text;
    marker = { start: first.start, end: first.end };
    remaining = amounts.slice(1);
  } else {
    // (b) trailing "xN" / "× N".
    const m = [...text.matchAll(/(^|\s)[x×]\s*(\d+)(?=\s|$)/gi)].pop();
    if (m !== undefined) {
      const start = (m.index ?? 0) + (m[1] ?? '').length;
      const end = (m.index ?? 0) + m[0].length;
      candidate = m[2];
      marker = { start, end };
      remaining = amounts.filter((a) => a.end <= start || a.start >= end);
    }
  }

  const last = remaining[remaining.length - 1];
  if (marker === undefined || last === undefined) {
    // No usable marker (or it swallowed every amount): the right-most amount is the line amount, quantity 1.
    const line = amounts[amounts.length - 1] ?? first;
    return { line, removed: [{ start: line.start, end: line.end }] };
  }
  // (c) marker plus exactly two amounts: unit, then line.
  const unit = remaining.length === 2 ? remaining[0] : undefined;
  const removed = [marker, { start: last.start, end: last.end }];
  if (unit !== undefined) removed.push({ start: unit.start, end: unit.end });
  return { ...(candidate !== undefined ? { candidate } : {}), ...(unit !== undefined ? { unit } : {}), line: last, removed };
}

function buildItem(c: ClassifiedRow, index: number): DraftItem | undefined {
  const [first, ...rest] = c.amounts;
  if (first === undefined) return undefined;
  const { row } = c;
  const q = parseQuantity(row.text, [first, ...rest]);
  const flags = new Set<DraftFlag>();

  let quantity = 1;
  if (q.candidate !== undefined) {
    const n = q.candidate.length <= 3 ? Number(q.candidate) : 0;
    if (Number.isInteger(n) && n >= 1 && n <= 999) quantity = n;
    else flags.add('quantity');
  }
  if (q.unit !== undefined && quantity * q.unit.value !== q.line.value) flags.add('arithmetic');

  let name = trimPunct(removeSpans(row.text, q.removed));
  if (letters(name) < 2) {
    name = `Item ${String(index + 1)}`;
    flags.add('name');
  }
  if (row.minConfidence !== undefined && row.minConfidence < LOW_CONFIDENCE) flags.add('ocr-confidence');
  const ordered = FLAG_ORDER.filter((f) => flags.has(f));
  return {
    name,
    quantity,
    ...(q.unit !== undefined ? { unitPrice: q.unit.value } : {}),
    lineTotal: q.line.value,
    confidence: confidenceOf(row, ordered),
    flags: ordered,
    sourceText: row.text,
  };
}

const DEFAULT_LABELS = { discount: 'Discount', tax: 'Tax', service: 'Service charge', tip: 'Tip' } as const;

function buildCharge(c: ClassifiedRow, kind: DraftCharge['kind'], line: AmountToken): DraftCharge {
  const rateBp = parseRateBp(c.row.text);
  const label = trimPunct(removeSpans(c.row.text, [{ start: line.start, end: line.end }])) || DEFAULT_LABELS[kind];
  return {
    kind,
    label,
    amount: toPaisa(Math.abs(line.value)),
    ...(rateBp !== undefined ? { rateBp } : {}),
    confidence: confidenceOf(c.row, []),
    sourceText: c.row.text,
  };
}

function check(kind: ReceiptCheck['kind'], expected: number, actual: number): ReceiptCheck {
  return {
    kind,
    ok: expected === actual,
    expected: toPaisa(expected),
    actual: toPaisa(actual),
    difference: toPaisa(actual - expected),
  };
}

const NOT_HEADER = /\b(?:tel|phone|ph|cell|mobile|date|time|www|http)\b|@|\.com|\d{1,2}:\d{2}/i;

/** P7. Picks the restaurant name row from the header rows. */
function pickRestaurantName(header: readonly ClassifiedRow[]): ClassifiedRow | undefined {
  const candidates = header
    .map((c, i) => ({ c, i }))
    .filter(
      ({ c }) =>
        c.kind === 'text' &&
        c.amounts.length === 0 &&
        letters(c.row.text) >= 3 &&
        parseDate(c.row.text) === undefined &&
        !NOT_HEADER.test(c.row.text),
    );
  const top = candidates.filter(({ i }) => i < 3);
  if (top.length === 0) return candidates[0]?.c;
  return top.reduce((best, cur) => (cur.c.row.height > best.c.row.height ? cur : best)).c;
}

/**
 * P1-P11. Turns OCR output into an editable draft. Pure and deterministic; never throws on bad input
 * (unusable rows end up in `unparsedRows`). Money is integer paisa throughout.
 */
export function parseReceipt(ocr: OcrResult): ReceiptDraft {
  // Input is untrusted at runtime, so tolerate a missing `lines` even though the type says otherwise.
  const lines = Array.isArray((ocr as { lines?: unknown } | undefined)?.lines) ? ocr.lines : [];
  const rows = groupRows(lines);
  const classified: ClassifiedRow[] = rows.map((row) => ({
    row,
    kind: classifyRow(row.text),
    amounts: findAmountTokens(row.text),
  }));

  const firstBody = classified.findIndex((c) => c.kind === 'item' || SUMMARY_KINDS.has(c.kind));
  const firstSummary = classified.findIndex((c) => SUMMARY_KINDS.has(c.kind));
  const header = firstBody === -1 ? classified : classified.slice(0, firstBody);

  const items: DraftItem[] = [];
  const charges: DraftCharge[] = [];
  const unparsed = new Set<number>();
  let subtotalIdx = -1;
  let totalIdx = -1;

  classified.forEach((c, i) => {
    if (c.kind === 'ignore') return;
    if (c.kind === 'item') {
      const item = firstSummary !== -1 && i > firstSummary ? undefined : buildItem(c, items.length);
      if (item === undefined) unparsed.add(i);
      else items.push(item);
      return;
    }
    if (SUMMARY_KINDS.has(c.kind)) {
      const line = lineAmount(c.row.text, c.amounts);
      if (line === undefined) {
        unparsed.add(i);
      } else if (c.kind === 'subtotal') {
        if (subtotalIdx !== -1) unparsed.add(subtotalIdx);
        subtotalIdx = i;
      } else if (c.kind === 'total') {
        if (totalIdx !== -1) unparsed.add(totalIdx);
        totalIdx = i;
      } else {
        charges.push(buildCharge(c, c.kind as DraftCharge['kind'], line));
      }
      return;
    }
    unparsed.add(i); // kind 'text'
  });

  const nameRow = pickRestaurantName(header);
  const restaurantName = nameRow === undefined ? undefined : collapse(nameRow.row.text);
  if (nameRow !== undefined) unparsed.delete(classified.indexOf(nameRow));

  let date: string | undefined;
  for (let i = 0; i < classified.length && date === undefined; i++) {
    const c = classified[i];
    const d = c === undefined ? undefined : parseDate(c.row.text);
    if (d !== undefined) {
      date = d;
      if (c?.kind === 'text') unparsed.delete(i);
    }
  }

  const amountAt = (i: number): Paisa | undefined => {
    const v = classified[i]?.amounts.at(-1)?.value;
    return v === undefined ? undefined : toPaisa(Math.abs(v));
  };
  const printedSubtotal = subtotalIdx === -1 ? undefined : amountAt(subtotalIdx);
  const printedTotal = totalIdx === -1 ? undefined : amountAt(totalIdx);

  const checks: ReceiptCheck[] = [];
  const itemsSum = sum(items.map((it) => it.lineTotal));
  if (printedSubtotal !== undefined) checks.push(check('items-vs-subtotal', printedSubtotal, itemsSum));
  if (printedTotal !== undefined) {
    const by = (k: DraftCharge['kind']): number => sum(charges.filter((ch) => ch.kind === k).map((ch) => ch.amount));
    const computed = (printedSubtotal ?? itemsSum) - by('discount') + by('tax') + by('service') + by('tip');
    checks.push(check('summary-vs-total', printedTotal, computed));
  }
  for (const it of items) {
    if (it.unitPrice !== undefined) checks.push(check('line-arithmetic', it.lineTotal, it.quantity * it.unitPrice));
  }

  return {
    ...(restaurantName !== undefined ? { restaurantName } : {}),
    ...(date !== undefined ? { date } : {}),
    items,
    ...(printedSubtotal !== undefined ? { printedSubtotal } : {}),
    charges,
    ...(printedTotal !== undefined ? { printedTotal } : {}),
    checks,
    unparsedRows: [...unparsed].sort((a, b) => a - b).map((i) => classified[i]?.row.text ?? ''),
  };
}
