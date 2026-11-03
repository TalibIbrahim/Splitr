import { toBasisPoints, toPaisa, type BasisPoints, type Paisa } from '@splitr/calculation-engine';
import type {
  DraftCharge,
  DraftConfidence,
  DraftFlag,
  DraftItem,
  OcrResult,
  ReceiptCheck,
  ReceiptDraft,
  VariantTotals,
} from '@splitr/shared-types';
import { findAmountTokens, lineAmount, removeSpans, trailingSuffix, type AmountToken } from './amounts';
import { classifyRow, type RowKind } from './classify';
import { numericTokens, parseColumnHeader, quantityOf, type ColumnHeader } from './columns';
import { parseDate } from './date';
import { groupRows, type Row } from './rows';

const LOW_CONFIDENCE = 0.6;
const SUMMARY_KINDS: ReadonlySet<RowKind> = new Set(['subtotal', 'discount', 'tax', 'service', 'tip', 'fee', 'total']);
/** P18: kinds that can be printed twice on one row (card and cash). */
const PAIR_KINDS: ReadonlySet<RowKind> = new Set(['tax', 'discount', 'total']);
const FLAG_ORDER: readonly DraftFlag[] = ['arithmetic', 'quantity', 'name', 'ocr-confidence'];
/** P19 / P18 tolerance: one rupee. */
const ONE_RUPEE = 100;
/** P16: maximum vertical gap between an item row and its wrapped name, in median row heights. */
const WRAP_GAP = 1.6;
/** P15: a leading item code (1-6 digits or 1-3 capitals) followed by the real name. */
const CODE_LEAD = /^(?:\d{1,6}|[A-Z]{1,3})\s+(?=\p{L})/u;

interface ClassifiedRow {
  readonly row: Row;
  readonly kind: RowKind;
  readonly amounts: AmountToken[];
}

type Side = 'card' | 'cash';

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
const letters = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const trimPunct = (s: string): string => collapse(s.replace(/^[\s:;,@=\-–—*#.]+|[\s:;,@=\-.]+$/g, ''));

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function confidenceOf(row: Row, flags: readonly DraftFlag[]): DraftConfidence {
  return flags.length > 0 || (row.minConfidence !== undefined && row.minConfidence < LOW_CONFIDENCE) ? 'low' : 'high';
}

/** Integer basis points from the pieces of a percentage; more than 2 decimals is ignored (P8). */
function bpOf(whole: string | undefined, frac: string | undefined): BasisPoints | undefined {
  const f = frac ?? '';
  if (whole === undefined || f.length > 2) return undefined;
  return toBasisPoints(Number(whole) * 100 + Number(f.padEnd(2, '0')));
}

/** P8. `16%`, `16.5 %` or `29.%` becomes integer basis points by string maths. */
function parseRateBp(text: string): BasisPoints | undefined {
  const m = /(\d{1,3})(?:\.(\d+))?\s*%/.exec(text);
  return m === null ? undefined : bpOf(m[1], m[2]);
}

// ───────────── items ─────────────

interface QuantityParse {
  /** Raw quantity text found by (a)/(b)/(P14), if any. */
  candidate?: string;
  unit?: AmountToken;
  line: AmountToken;
  removed: { start: number; end: number }[];
}

const isIntQuantity = (t: AmountToken): boolean => quantityOf(t.value) !== undefined && /^\d+(?:\.0+)?$/.test(t.text);

/** P14. The right-most (q, u, l) or (u, q, l) window of amount tokens with q x u = l. */
function findTriple(amounts: readonly AmountToken[]): { q: AmountToken; u: AmountToken; l: AmountToken } | undefined {
  for (let end = amounts.length - 1; end >= 2; end--) {
    const a = amounts[end - 2];
    const b = amounts[end - 1];
    const l = amounts[end];
    if (a === undefined || b === undefined || l === undefined) continue;
    const qa = isIntQuantity(a) ? quantityOf(a.value) : undefined;
    if (qa !== undefined && qa * b.value === l.value) return { q: a, u: b, l };
    const qb = isIntQuantity(b) ? quantityOf(b.value) : undefined;
    if (qb !== undefined && qb * a.value === l.value) return { q: b, u: a, l };
  }
  return undefined;
}

/** P5 / P14. Works out the quantity marker, unit price and line amount of an item row. `amounts` is non-empty. */
function parseQuantity(text: string, amounts: [AmountToken, ...AmountToken[]]): QuantityParse {
  let candidate: string | undefined;
  let marker: { start: number; end: number } | undefined;
  let remaining: AmountToken[] = amounts;

  const explicitLead = /^\s*(\d+)\s*[x×](?=\s|$)/i.exec(text);
  const triple = findTriple(amounts);
  if (explicitLead !== null) {
    // (a) "N x", "Nx", "N ×" prefix.
    candidate = explicitLead[1];
    marker = { start: 0, end: explicitLead[0].length };
    remaining = amounts.filter((a) => a.start >= (marker?.end ?? 0));
  } else if (triple !== undefined) {
    // P14: (q, u, l) or (u, q, l) with q x u = l.
    candidate = String((quantityOf(triple.q.value) ?? 1));
    marker = { start: triple.q.start, end: triple.q.end };
    remaining = [triple.u, triple.l];
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
    const line = amounts[amounts.length - 1] ?? amounts[0];
    return { line, removed: [{ start: line.start, end: line.end }] };
  }
  // (c) marker plus exactly two amounts: unit, then line.
  const unit = remaining.length === 2 ? remaining[0] : undefined;
  const removed = [marker, { start: last.start, end: last.end }];
  if (unit !== undefined) removed.push({ start: unit.start, end: unit.end });
  return { ...(candidate !== undefined ? { candidate } : {}), ...(unit !== undefined ? { unit } : {}), line: last, removed };
}

interface ItemParts {
  /** Name with consumed tokens removed; the code and "Item n" fallbacks are applied later. */
  name: string;
  quantity: number;
  unitPrice?: Paisa;
  lineTotal: Paisa;
  flags: Set<DraftFlag>;
}

/** P14 with a header: the last k numeric tokens map to the header's columns. Undefined on a count mismatch. */
function parseWithHeader(c: ClassifiedRow, header: ColumnHeader): ItemParts | undefined {
  const k = header.columns.length;
  const tokens = numericTokens(c.row.text, c.amounts);
  if (k === 0 || tokens.length < k) return undefined;
  const tail = tokens.slice(-k);
  const byCol = new Map<string, AmountToken | undefined>();
  header.columns.forEach((col, idx) => byCol.set(col, tail[idx]?.amount));
  const line = byCol.get('amount');
  if (line === undefined) return undefined;
  const flags = new Set<DraftFlag>();
  let quantity = 1;
  const qtyTok = byCol.get('qty');
  if (header.columns.includes('qty')) {
    const q = qtyTok === undefined ? undefined : quantityOf(qtyTok.value);
    if (q === undefined) flags.add('quantity');
    else quantity = q;
  }
  const rate = byCol.get('rate');
  let unitPrice: Paisa | undefined;
  if (rate !== undefined && header.columns.includes('qty') && !header.columns.includes('tax')) {
    unitPrice = rate.value;
    if (quantity * rate.value !== line.value) flags.add('arithmetic');
  }
  const name = trimPunct(removeSpans(c.row.text, [...tail.map((t) => ({ start: t.start, end: t.end })), ...trailingSuffix(c.row.text)]));
  return { name, quantity, ...(unitPrice !== undefined ? { unitPrice } : {}), lineTotal: line.value, flags };
}

function parseItemRow(c: ClassifiedRow, header: ColumnHeader | undefined): ItemParts | undefined {
  const [first, ...rest] = c.amounts;
  if (first === undefined) return undefined;
  if (header !== undefined) {
    const mapped = parseWithHeader(c, header);
    if (mapped !== undefined) return mapped;
  }
  const q = parseQuantity(c.row.text, [first, ...rest]);
  const flags = new Set<DraftFlag>();
  let quantity = 1;
  if (q.candidate !== undefined) {
    const n = q.candidate.length <= 3 ? Number(q.candidate) : 0;
    if (Number.isInteger(n) && n >= 1 && n <= 999) quantity = n;
    else flags.add('quantity');
  }
  if (q.unit !== undefined && quantity * q.unit.value !== q.line.value) flags.add('arithmetic');
  return {
    name: trimPunct(removeSpans(c.row.text, [...q.removed, ...trailingSuffix(c.row.text)])),
    quantity,
    ...(q.unit !== undefined ? { unitPrice: q.unit.value } : {}),
    lineTotal: q.line.value,
    flags,
  };
}

/** P15. The name without its leading item code, when the code strip applies and a real name remains. */
function stripCode(name: string): string {
  const m = CODE_LEAD.exec(name);
  return m !== null && letters(name.slice(m[0].length)) >= 2 ? name.slice(m[0].length) : name;
}

function finalizeItem(parts: ItemParts, row: Row, index: number, strip: boolean): DraftItem {
  const flags = new Set(parts.flags);
  let name = strip ? stripCode(parts.name) : parts.name;
  if (letters(name) < 2) {
    name = `Item ${String(index + 1)}`;
    flags.add('name');
  }
  if (row.minConfidence !== undefined && row.minConfidence < LOW_CONFIDENCE) flags.add('ocr-confidence');
  const ordered = FLAG_ORDER.filter((f) => flags.has(f));
  return {
    name,
    quantity: parts.quantity,
    ...(parts.unitPrice !== undefined ? { unitPrice: parts.unitPrice } : {}),
    lineTotal: parts.lineTotal,
    confidence: confidenceOf(row, ordered),
    flags: ordered,
    sourceText: row.text,
  };
}

// ───────────── charges ─────────────

const DEFAULT_LABELS = {
  discount: 'Discount',
  tax: 'Tax',
  service: 'Service charge',
  tip: 'Tip',
  fee: 'Fee',
} as const;

function buildCharge(
  row: Row,
  kind: DraftCharge['kind'],
  line: AmountToken,
  rateBp: BasisPoints | undefined = parseRateBp(row.text),
): DraftCharge {
  const label = trimPunct(removeSpans(row.text, [{ start: line.start, end: line.end }, ...trailingSuffix(row.text)])) || DEFAULT_LABELS[kind];
  return {
    kind,
    label,
    amount: toPaisa(Math.abs(line.value)),
    ...(rateBp !== undefined ? { rateBp } : {}),
    confidence: confidenceOf(row, []),
    sourceText: row.text,
  };
}

interface RateOption {
  readonly bp: BasisPoints;
  readonly side?: Side;
}

/** P18. Rates of a row such as `P.S.T CASH@16% / CARD@5%`, each with the payment word next to it, if any. */
function rateOptions(text: string): RateOption[] {
  const lower = text.toLowerCase();
  const out: RateOption[] = [];
  for (const m of lower.matchAll(/(\d{1,3})(?:\.(\d+))?\s*%/g)) {
    const bp = bpOf(m[1], m[2]);
    if (bp === undefined) continue;
    const before = /(cash|card|credit)\s*@?\s*$/.exec(lower.slice(0, m.index ?? 0));
    const after = /^\s*@?\s*(cash|card|credit)/.exec(lower.slice((m.index ?? 0) + m[0].length));
    const word = before?.[1] ?? after?.[1];
    out.push({ bp, ...(word === undefined ? {} : { side: word === 'cash' ? ('cash' as const) : ('card' as const) }) });
  }
  return out;
}

/** P18. Which rate reproduces the printed amount from the subtotal (within a rupee). */
function pickRate(options: readonly RateOption[], base: number, amount: number): RateOption | undefined {
  const sorted = [...options].sort((a, b) => a.bp - b.bp);
  const withSide = sorted.map((o, i) => ({ ...o, side: o.side ?? (i === sorted.length - 1 ? ('cash' as const) : ('card' as const)) }));
  let best: { o: RateOption; diff: number } | undefined;
  for (const o of withSide) {
    const diff = Math.abs(Math.floor((base * o.bp + 5000) / 10000) - amount);
    if (diff <= ONE_RUPEE && (best === undefined || diff < best.diff)) best = { o, diff };
  }
  return best?.o;
}

interface PairSegment {
  readonly row: Row;
  readonly rate?: BasisPoints;
  readonly cardWord: boolean;
}

interface PairRow {
  readonly kind: DraftCharge['kind'] | 'total';
  readonly left: PairSegment;
  readonly right: PairSegment;
}

/** P18. A summary row that holds two labelled amounts of the same kind (card and cash). */
function splitPair(c: ClassifiedRow): PairRow | undefined {
  if (!PAIR_KINDS.has(c.kind) || c.amounts.length !== 2) return undefined;
  const [a1] = c.amounts;
  if (a1 === undefined || lineAmount(c.row.text, c.amounts) === undefined) return undefined;
  const texts = [c.row.text.slice(0, a1.end).trim(), c.row.text.slice(a1.end).trim()] as const;
  if (texts.some((t) => letters(removeSpans(t, findAmountTokens(t))) < 2)) return undefined;
  if (texts.some((t) => classifyRow(t) !== c.kind)) return undefined;
  const seg = (text: string): PairSegment => {
    const rate = parseRateBp(text);
    return {
      row: { ...c.row, text },
      ...(rate !== undefined ? { rate } : {}),
      cardWord: /\b(?:cc|card|credit)\b/i.test(text),
    };
  };
  return { kind: c.kind as PairRow['kind'], left: seg(texts[0]), right: seg(texts[1]) };
}

/** P18. Is the left half the card price? Undefined when the row gives no evidence. */
function leftIsCardOf(p: PairRow): boolean | undefined {
  if (p.kind === 'total') {
    if (p.left.cardWord !== p.right.cardWord) return p.left.cardWord;
    return undefined;
  }
  if (p.left.rate !== undefined && p.right.rate !== undefined && p.left.rate !== p.right.rate) {
    return p.left.rate < p.right.rate;
  }
  return undefined;
}

/** P18. `paidWith` hint from text such as `PAYMENT MODE : Cash`, `CREDIT CARD`, `MASTER` or `VISA`. */
function paidWithHint(rows: readonly ClassifiedRow[]): Side | undefined {
  for (const { row } of rows) {
    const m = /payment\s*mode\s*[:-]?\s*(cash|card|credit)/i.exec(row.text);
    if (m !== null) return (m[1] ?? '').toLowerCase() === 'cash' ? 'cash' : 'card';
  }
  for (const { row } of rows) {
    if (/credit\s*card|\bmaster\s*card\b|\bmaster\b|\bvisa\b/i.test(row.text)) return 'card';
  }
  return undefined;
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
 * P1-P20. Turns OCR output into an editable draft. Pure and deterministic; never throws on bad input
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

  // P13. The column header is the first header-shaped row that comes before any summary row with an amount.
  const firstAmountSummary = classified.findIndex((c) => SUMMARY_KINDS.has(c.kind) && c.amounts.length > 0);
  let header: ColumnHeader | undefined;
  let headerIdx = -1;
  for (let i = 0; i < classified.length && header === undefined; i++) {
    if (firstAmountSummary !== -1 && i >= firstAmountSummary) break;
    const c = classified[i];
    const h = c === undefined ? undefined : parseColumnHeader(c.row.text, c.amounts.length > 0);
    if (h !== undefined) {
      header = h;
      headerIdx = i;
    }
  }

  const isSummary = (c: ClassifiedRow): boolean => SUMMARY_KINDS.has(c.kind);
  const firstSummary =
    header === undefined
      ? classified.findIndex(isSummary)
      : classified.findIndex((c, i) => i > headerIdx && isSummary(c));
  const firstBody = classified.findIndex((c) => c.kind === 'item' || isSummary(c));
  const headerRows =
    header !== undefined ? classified.slice(0, headerIdx) : firstBody === -1 ? classified : classified.slice(0, firstBody);

  const inRegion = (i: number): boolean => (header === undefined || i > headerIdx) && (firstSummary === -1 || i < firstSummary);
  const isItemRow = (c: ClassifiedRow, i: number): boolean => {
    if (c.kind === 'item') return true;
    // A header's tax% column can end the row with a percentage, which makes it look like text.
    return (
      header !== undefined &&
      i > headerIdx &&
      c.kind === 'text' &&
      c.amounts.length > 0 &&
      /%\s*$/.test(c.row.text) &&
      letters(removeSpans(c.row.text, c.amounts)) >= 2
    );
  };

  // P17b: inside a headed item region, a row that fills every header numeric column is an item despite ignore words.
  if (header !== undefined && header.columns.length >= 2) {
    const k = header.columns.length;
    classified.forEach((c, i) => {
      if (c.kind !== 'ignore' || !inRegion(i)) return;
      if (numericTokens(c.row.text, c.amounts).length >= k && lineAmount(c.row.text, c.amounts) !== undefined) {
        classified[i] = { ...c, kind: 'item' };
      }
    });
  }

  // Item rows first, so that the item-code rule (P15) can look at all of them.
  // A row that holds fewer numbers than the header has columns, followed by a name fragment with the rest of them
  // ("DESI MURGHA KARAHI 2500 1" / "FULL 2500"), is one wrapped item (P16 with P14).
  const merged = new Map<number, ClassifiedRow>();
  const consumed = new Set<number>();
  if (header !== undefined) {
    const k = header.columns.length;
    classified.forEach((c, i) => {
      if (!inRegion(i) || consumed.has(i) || !isItemRow(c, i) || numericTokens(c.row.text, c.amounts).length >= k) return;
      const next = classified[i + 1];
      if (next === undefined || !inRegion(i + 1) || (next.kind !== 'item' && next.kind !== 'text')) return;
      if (letters(removeSpans(next.row.text, next.amounts)) < 2) return;
      const text = `${c.row.text} ${next.row.text}`;
      const amounts = findAmountTokens(text);
      if (numericTokens(text, amounts).length < k) return;
      merged.set(i, { row: { ...c.row, text }, kind: 'item', amounts });
      consumed.add(i + 1);
    });
  }
  const parts = new Map<number, ItemParts>();
  classified.forEach((c, i) => {
    if (!inRegion(i) || !isItemRow(c, i) || consumed.has(i)) return;
    const p = parseItemRow(merged.get(i) ?? c, header);
    if (p !== undefined) parts.set(i, p);
  });
  // P15: without a code column in the header, codes are recognised only when every item row starts with one.
  const codeRows = [...parts.values()].filter((p) => CODE_LEAD.test(p.name)).length;
  const strip = header?.codeColumn === true || (codeRows >= 2 && codeRows === parts.size);
  const wrapGap = WRAP_GAP * median(classified.map((c) => c.row.height));

  const items: DraftItem[] = [];
  const charges: DraftCharge[] = [];
  const unparsed = new Set<number>();
  const pairs: PairRow[] = [];
  const dualRows: { chargeIdx: number; options: RateOption[]; amount: Paisa }[] = [];
  let subtotalIdx = -1;
  let totalIdx = -1;
  let lastItem: { rowIdx: number; itemIdx: number; wrapped: boolean } | undefined;

  classified.forEach((c, i) => {
    if (c.kind === 'ignore' || consumed.has(i) || (header !== undefined && i === headerIdx)) return;
    if (isSummary(c)) {
      const pair = splitPair(c);
      if (pair !== undefined) {
        pairs.push(pair);
        return;
      }
      const line = lineAmount(c.row.text, c.amounts);
      if (line === undefined) {
        unparsed.add(i);
      } else if (c.kind === 'subtotal') {
        if (subtotalIdx !== -1) unparsed.add(subtotalIdx);
        subtotalIdx = i;
      } else if (c.kind === 'total') {
        if (totalIdx !== -1) unparsed.add(totalIdx);
        totalIdx = i;
      } else if (toPaisa(Math.abs(line.value)) !== 0) {
        const kind = c.kind as DraftCharge['kind'];
        const options = kind === 'tax' ? rateOptions(c.row.text) : [];
        if (options.length >= 2 && c.amounts.length === 1) {
          // One amount, two rates: the rate is chosen later, once the subtotal is known.
          dualRows.push({ chargeIdx: charges.length, options, amount: toPaisa(Math.abs(line.value)) });
          charges.push(buildCharge(c.row, kind, line, undefined));
        } else {
          charges.push(buildCharge(c.row, kind, line));
        }
      }
      return;
    }
    if (isItemRow(c, i) && inRegion(i)) {
      const p = parts.get(i);
      if (p === undefined) {
        unparsed.add(i);
      } else {
        items.push(finalizeItem(p, (merged.get(i) ?? c).row, items.length, strip));
        lastItem = { rowIdx: consumed.has(i + 1) ? i + 1 : i, itemIdx: items.length - 1, wrapped: false };
      }
      return;
    }
    if (c.kind === 'item' || isItemRow(c, i)) {
      unparsed.add(i); // item-shaped but outside the item region
      return;
    }
    // kind 'text'
    if (inRegion(i)) {
      const prev = classified[i - 1];
      const target = lastItem;
      const hasLetters = letters(c.row.text) >= 2;
      if (
        hasLetters &&
        c.amounts.length === 0 &&
        target !== undefined &&
        !target.wrapped &&
        target.rowIdx === i - 1 &&
        prev !== undefined &&
        c.row.centreY - prev.row.centreY <= wrapGap
      ) {
        // P16: one wrapped continuation per item.
        const item = items[target.itemIdx];
        if (item !== undefined) {
          items[target.itemIdx] = { ...item, name: `${item.name} ${trimPunct(c.row.text)}` };
          target.wrapped = true;
          return;
        }
      }
      if (header !== undefined && letters(c.row.text) === 0) return; // a bare code or number row (P15)
    }
    unparsed.add(i);
  });

  const nameRow = pickRestaurantName(headerRows);
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
  const itemsSum = sum(items.map((it) => it.lineTotal));

  // P18. One amount with two rates: the rate that reproduces the amount from the subtotal wins.
  let dualPaidWith: Side | undefined;
  for (const d of dualRows) {
    const picked = pickRate(d.options, printedSubtotal ?? itemsSum, d.amount);
    const ch = charges[d.chargeIdx];
    if (picked === undefined || ch === undefined) continue;
    charges[d.chargeIdx] = { ...ch, rateBp: picked.bp };
    dualPaidWith ??= picked.side;
  }

  // P18. Card and cash variants from paired rows. The orientation (left = card?) comes from the first row that shows it.
  let variants: ReceiptDraft['variants'];
  if (pairs.length > 0) {
    const globalLeftIsCard = pairs.map(leftIsCardOf).find((v) => v !== undefined) ?? true;
    const make = (): { taxes: DraftCharge[]; discounts: DraftCharge[]; printedTotal?: Paisa } => ({
      taxes: [],
      discounts: [],
    });
    const card = make();
    const cash = make();
    for (const p of pairs) {
      const leftIsCard = leftIsCardOf(p) ?? globalLeftIsCard;
      const halves: [PairSegment, typeof card][] = leftIsCard
        ? [
            [p.left, card],
            [p.right, cash],
          ]
        : [
            [p.left, cash],
            [p.right, card],
          ];
      for (const [seg, target] of halves) {
        const line = lineAmount(seg.row.text);
        if (line === undefined) continue;
        const amount = toPaisa(Math.abs(line.value));
        if (p.kind === 'total') target.printedTotal = amount;
        else if (amount !== 0) {
          const charge = buildCharge(seg.row, p.kind, line);
          (p.kind === 'tax' ? target.taxes : target.discounts).push(charge);
        }
      }
    }
    variants = { card, cash };
  }
  const hint = paidWithHint(classified);
  const paidWith: Side | null | undefined = hint ?? dualPaidWith ?? (variants !== undefined ? null : undefined);

  // P19. Tax already included in the item prices.
  const hasTax = charges.some((ch) => ch.kind === 'tax');
  const taxInclusive =
    hasTax &&
    items.length > 0 &&
    printedTotal !== undefined &&
    Math.abs(itemsSum - printedTotal) <= ONE_RUPEE &&
    (printedSubtotal === undefined || printedSubtotal < itemsSum);
  const finalCharges: DraftCharge[] = taxInclusive
    ? charges.map((ch) => (ch.kind === 'tax' ? { ...ch, informational: true } : ch))
    : charges;

  const checks: ReceiptCheck[] = [];
  if (printedSubtotal !== undefined && !taxInclusive) checks.push(check('items-vs-subtotal', printedSubtotal, itemsSum));
  const chosen: VariantTotals | undefined = paidWith === null || paidWith === undefined ? undefined : variants?.[paidWith];
  const totalForCheck = variants === undefined ? printedTotal : (printedTotal ?? chosen?.printedTotal);
  if (totalForCheck !== undefined) {
    const by = (k: DraftCharge['kind']): number =>
      sum(finalCharges.filter((ch) => ch.kind === k && ch.informational !== true).map((ch) => ch.amount));
    const variantTaxes = printedTotal === undefined && chosen !== undefined ? sum(chosen.taxes.map((t) => t.amount)) : 0;
    const variantDiscounts = printedTotal === undefined && chosen !== undefined ? sum(chosen.discounts.map((t) => t.amount)) : 0;
    const computed =
      (taxInclusive ? itemsSum : (printedSubtotal ?? itemsSum)) -
      by('discount') -
      variantDiscounts +
      by('tax') +
      variantTaxes +
      by('service') +
      by('tip') +
      by('fee');
    checks.push(check('summary-vs-total', totalForCheck, computed));
  }
  for (const it of items) {
    if (it.unitPrice !== undefined) checks.push(check('line-arithmetic', it.lineTotal, it.quantity * it.unitPrice));
  }

  return {
    ...(restaurantName !== undefined ? { restaurantName } : {}),
    ...(date !== undefined ? { date } : {}),
    items,
    ...(printedSubtotal !== undefined ? { printedSubtotal } : {}),
    charges: finalCharges,
    ...(printedTotal !== undefined ? { printedTotal } : {}),
    checks,
    unparsedRows: [...unparsed].sort((a, b) => a - b).map((i) => classified[i]?.row.text ?? ''),
    ...(variants !== undefined ? { variants } : {}),
    ...(paidWith !== undefined ? { paidWith } : {}),
    ...(taxInclusive ? { taxInclusive: true } : {}),
  };
}
