/**
 * draftToBillPatch v2 (docs/phase2b-spec.md section 2): card/cash variants, paidWith, informational taxes, fee charges.
 * Hand-written from the spec and docs/calculation-rules.md; the engine decides every money value.
 */
import { calculateBill } from '@splitr/calculation-engine';
import type { Adjustment, BillInput, CalculationResult, Issue } from '@splitr/calculation-engine';
import type { ReceiptDraft } from '@splitr/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assignRemainingEqually, draftChecks, draftToBillPatch } from '../src/index';
import { $, at } from './helpers';

// ───────────── builders (loose: new draft fields may not be in the shared type yet) ─────────────
const dItem = (name: string, quantity: number, lineTotal: number): Record<string, unknown> => ({
  name,
  quantity,
  lineTotal: $(lineTotal),
  confidence: 'high',
  flags: [],
  sourceText: name,
});
const ch = (kind: string, label: string, amount: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind,
  label,
  amount: $(amount),
  confidence: 'high',
  sourceText: label,
  ...extra,
});
const draft = (over: Record<string, unknown>): ReceiptDraft =>
  ({ items: [], charges: [], checks: [], unparsedRows: [], ...over }) as unknown as ReceiptDraft;

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};
type Opts = { paidWith?: 'card' | 'cash' };
const patchOf = (d: ReceiptDraft, opts?: Opts) => (opts ? draftToBillPatch(d, counter(), opts) : draftToBillPatch(d, counter()));

function run(patch: ReturnType<typeof draftToBillPatch>): CalculationResult {
  const input: BillInput = {
    currency: 'PKR',
    participants: [
      { id: 'a', displayName: 'A' },
      { id: 'b', displayName: 'B' },
    ],
    items: assignRemainingEqually(patch.items, ['a', 'b']),
    adjustments: patch.adjustments,
    contributions: [],
    ...(patch.printedSubtotal !== undefined ? { printedSubtotal: patch.printedSubtotal } : {}),
    ...(patch.printedTotal !== undefined ? { printedTotal: patch.printedTotal } : {}),
    settlementRoundingUnit: $(100),
  };
  return calculateBill(input);
}
const issues = (r: CalculationResult): Issue[] => (r.ok ? [...r.warnings] : [...r.errors, ...r.warnings]);
const codes = (r: CalculationResult): string[] => issues(r).map((i) => i.code);
const total = (r: CalculationResult): number => {
  if (!r.ok) throw new Error('not ok: ' + JSON.stringify(r.errors));
  return r.breakdown.total;
};
const byKind = (p: ReturnType<typeof draftToBillPatch>, kind: string): Adjustment[] => p.adjustments.filter((a) => a.kind === kind);
const baseOf = (a: Adjustment) => a.base ?? { type: 'items' };

// ───────────── fixtures: Arcadian small / large (hand-derived in the receipt-parser fixtures) ─────────────
/** 870 + 925 + 180 + 100 = 2,075 rupees. Card 5%: 104 (103.75 rounded to the rupee) -> 2,179. Cash 16%: 332 exact -> 2,407. */
const smallItems = (): Record<string, unknown>[] => [
  dItem('Arcadian Special Sandwich', 1, 87000),
  dItem('CRISPY FRIED FISH BURGER', 1, 92500),
  dItem('PEPSI', 1, 18000),
  dItem('PURE WATER SMALL', 1, 10000),
];
const smallVariants = () => ({
  card: { taxes: [ch('tax', 'GST 5%', 10400, { rateBp: 500 })], discounts: [], printedTotal: $(217900) },
  cash: { taxes: [ch('tax', 'GST 16%', 33200, { rateBp: 1600 })], discounts: [], printedTotal: $(240700) },
});
const small = (over: Record<string, unknown> = {}): ReceiptDraft =>
  draft({ items: smallItems(), printedSubtotal: $(207500), variants: smallVariants(), ...over });

/** 605+605+3,970+1,240+600+990+210+120 = 8,340 rupees. */
const largeItems = (): Record<string, unknown>[] => [
  dItem('CREAM OF MUSHROOM SOUP', 1, 60500),
  dItem('SZECHUAN SOUP', 1, 60500),
  dItem('BORDEAUX OVEN ROASTED', 2, 397000),
  dItem('MOZZARELLA STICKS', 1, 124000),
  dItem('MARGARITA MINT', 1, 60000),
  dItem('LINDT CHOCOLATE', 1, 99000),
  dItem('PURE WATER LARGE', 1, 21000),
  dItem('PURE WATER SMALL', 1, 12000),
];
const large = (over: Record<string, unknown> = {}): ReceiptDraft =>
  draft({
    items: largeItems(),
    printedSubtotal: $(834000),
    variants: {
      card: { discounts: [ch('discount', 'Disc 29.%', 250000)], taxes: [ch('tax', 'GST 5%', 29200, { rateBp: 500 })], printedTotal: $(613200) },
      cash: { discounts: [ch('discount', 'Disc 29.%', 249990)], taxes: [ch('tax', 'GST 16%', 93400, { rateBp: 1600 })], printedTotal: $(677400) },
    },
    ...over,
  });

// ───────────── variants ─────────────
describe('P18/section 2 variants: which side is applied', () => {
  it('section 2 with variants and no paidWith anywhere, the card variant is used', () => {
    const p = patchOf(small());
    expect(p.printedTotal).toBe(217900);
    expect(p.adjustments).toHaveLength(1);
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'tax', label: expect.stringMatching(/GST/) });
  });

  it('section 2 opts.paidWith = "cash" picks the cash variant: its tax and its printed total, never the card one', () => {
    const p = patchOf(small(), { paidWith: 'cash' });
    expect(p.printedTotal).toBe(240700);
    expect(p.adjustments).toHaveLength(1);
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'tax', value: { type: 'rate', bp: 1600 }, printedAmount: 33200 });
    expect(JSON.stringify(p.adjustments)).not.toMatch(/10400/);
  });

  it('section 2 draft.paidWith is the default when no option is given', () => {
    const cash = patchOf(small({ paidWith: 'cash' }));
    expect(cash.printedTotal).toBe(240700);
    const card = patchOf(small({ paidWith: 'card' }));
    expect(card.printedTotal).toBe(217900);
  });

  it('section 2 opts.paidWith wins over draft.paidWith in both directions', () => {
    expect(patchOf(small({ paidWith: 'cash' }), { paidWith: 'card' }).printedTotal).toBe(217900);
    expect(patchOf(small({ paidWith: 'card' }), { paidWith: 'cash' }).printedTotal).toBe(240700);
  });

  it('section 2 a draft without variants ignores opts.paidWith (same patch with or without it)', () => {
    const d = draft({ items: smallItems(), charges: [ch('tax', 'GST 16%', 33200, { rateBp: 1600 })], printedTotal: $(240700) });
    expect(patchOf(d, { paidWith: 'cash' })).toEqual(patchOf(d));
    expect(patchOf(d, { paidWith: 'card' })).toEqual(patchOf(d));
  });

  it('section 2 property: the patch printedTotal is always the chosen variant\'s printedTotal', () => {
    fc.assert(
      fc.property(fc.constantFrom<'card' | 'cash' | undefined>('card', 'cash', undefined), fc.constantFrom<'card' | 'cash' | undefined>('card', 'cash', undefined), (opt, hint) => {
        const d = small(hint ? { paidWith: hint } : {});
        const p = patchOf(d, opt ? { paidWith: opt } : undefined);
        const side = opt ?? hint ?? 'card';
        expect(p.printedTotal).toBe(side === 'card' ? 217900 : 240700);
      }),
    );
  });
});

describe('P18/section 2 variants: notes say which price was used', () => {
  it('section 2 card note names the card price and the rate: "Using the card price: 5% GST"', () => {
    const p = patchOf(small());
    const note = p.notes.find((n) => /card/i.test(n));
    expect(note, `notes: ${JSON.stringify(p.notes)}`).toBeDefined();
    expect(note).toMatch(/5%/);
  });

  it('section 2 cash note names the cash price and the rate', () => {
    const p = patchOf(small(), { paidWith: 'cash' });
    const note = p.notes.find((n) => /cash/i.test(n));
    expect(note, `notes: ${JSON.stringify(p.notes)}`).toBeDefined();
    expect(note).toMatch(/16%/);
  });
});

describe('P18/section 2 Arcadian small through the engine', () => {
  it('card: 5% of 2,075 = 103.75 does not reproduce the printed 104 -> fixed tax of 104, total 2,179 = printed card total, nothing absorbed', () => {
    const p = patchOf(small());
    expect(at(byKind(p, 'tax'), 0).value).toEqual({ type: 'fixed', amount: 10400 });
    const r = run(p);
    expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    expect(codes(r)).not.toContain('SUBTOTAL_MISMATCH');
    expect(total(r)).toBe(217900);
  });

  it('cash: 16% of 2,075 = 332 exactly -> rate adjustment with printedAmount, total 2,407 = printed cash total', () => {
    const p = patchOf(small(), { paidWith: 'cash' });
    const tax = at(byKind(p, 'tax'), 0);
    expect(tax).toMatchObject({ value: { type: 'rate', bp: 1600 }, printedAmount: 33200 });
    expect(baseOf(tax)).toEqual({ type: 'items' });
    const r = run(p);
    expect(codes(r)).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
    expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    expect(total(r)).toBe(240700);
  });
});

describe('P18/section 2 Arcadian large (discount + tax variants) through the engine', () => {
  it('card: discount 2,500 fixed, GST 5% reproduces 292 on the discounted base 5,840 -> total 6,132 = printed, no mismatch', () => {
    // 834,000 - 250,000 = 584,000 ; 5% = 29,200 exactly (5% of the original 834,000 would be 41,700)
    const p = patchOf(large(), { paidWith: 'card' });
    const tax = at(byKind(p, 'tax'), 0);
    expect(tax).toMatchObject({ value: { type: 'rate', bp: 500 }, printedAmount: 29200 });
    expect(baseOf(tax)).toEqual({ type: 'items-after', include: 'all-prior' });
    expect(at(byKind(p, 'discount'), 0).value).toEqual({ type: 'fixed', amount: 250000 });
    const r = run(p);
    expect(codes(r).filter((c) => c !== 'NO_CONTRIBUTIONS')).toEqual([]);
    expect(total(r)).toBe(613200);
  });

  it('P21 cash: the receipt is rupee-rounded (discount 2,499.9, GST 934), so an explicit "Receipt rounding" subtract line of 10 paisa makes the engine reproduce 6,774', () => {
    // 834,000 - 249,990 = 584,010 ; 16% = 93,441.6 -> 93,442 != printed 93,400 -> fixed tax 93,400 (+ note)
    // computed total = 834,000 - 249,990 + 93,400 = 677,410 ; printed 677,400 ; gap 10 paisa < Rs 1 -> rounding line
    const p = patchOf(large(), { paidWith: 'cash' });
    expect(at(byKind(p, 'discount'), 0).value).toEqual({ type: 'fixed', amount: 249990 });
    expect(at(byKind(p, 'tax'), 0).value).toEqual({ type: 'fixed', amount: 93400 });
    const rounding = byKind(p, 'custom');
    expect(rounding).toHaveLength(1);
    expect(at(rounding, 0)).toMatchObject({
      label: 'Receipt rounding',
      kind: 'custom',
      direction: 'subtract',
      value: { type: 'fixed', amount: 10 },
      source: 'reconciliation',
    });
    expect(at(rounding, 0).allocation ?? { type: 'proportional' }).toEqual({ type: 'proportional' });
    expect(p.notes.some((n) => /receipt rounds to whole rupees/i.test(n))).toBe(true);
    expect(p.notes.length).toBeGreaterThanOrEqual(2); // the fixed-tax note and the rounding note
    const r = run(p);
    expect(codes(r).filter((c) => c !== 'NO_CONTRIBUTIONS')).toEqual([]);
    expect(total(r)).toBe(677400);
  });
});

// ───────────── P21 receipt rounding line ─────────────
describe('P21 receipt rounding line', () => {
  /** One item and a variants block (P21 speaks of the chosen variant's printed total). */
  const single = (lineTotal: number, printedTotal: number, over: Record<string, unknown> = {}): ReceiptDraft => {
    const side = { taxes: [], discounts: [], printedTotal: $(printedTotal) };
    return draft({ items: [dItem('Thing', 1, lineTotal)], variants: { card: side, cash: side }, ...over });
  };
  /** The same without variants: a plain printedTotal. */
  const plain = (lineTotal: number, printedTotal: number): ReceiptDraft => draft({ items: [dItem('Thing', 1, lineTotal)], printedTotal: $(printedTotal) });
  const roundingOf = (p: ReturnType<typeof draftToBillPatch>) => byKind(p, 'custom').filter((a) => /rounding/i.test(a.label));

  it('P21 computed total above the whole-rupee printed total by 5 paisa: a subtract line of 5, engine total = printed', () => {
    const p = patchOf(single(100005, 100000));
    expect(roundingOf(p)).toHaveLength(1);
    expect(at(roundingOf(p), 0)).toMatchObject({ label: 'Receipt rounding', direction: 'subtract', value: { type: 'fixed', amount: 5 }, source: 'reconciliation' });
    expect(p.notes.some((n) => /receipt rounds to whole rupees/i.test(n))).toBe(true);
    const r = run(p);
    expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    expect(total(r)).toBe(100000);
  });

  it('P21 computed total below the printed total by 5 paisa: an add line of 5', () => {
    const p = patchOf(single(99995, 100000));
    expect(at(roundingOf(p), 0)).toMatchObject({ direction: 'add', value: { type: 'fixed', amount: 5 }, source: 'reconciliation' });
    expect(total(run(p))).toBe(100000);
  });

  it('P21 the largest gap that still gets a line is 99 paisa (less than Rs 1)', () => {
    const p = patchOf(single(100099, 100000));
    expect(at(roundingOf(p), 0)).toMatchObject({ direction: 'subtract', value: { type: 'fixed', amount: 99 } });
    expect(total(run(p))).toBe(100000);
  });

  it('P21 a gap of exactly Rs 1 gets no line and stays a TOTAL_MISMATCH of 100 paisa', () => {
    const p = patchOf(single(100100, 100000));
    expect(roundingOf(p)).toEqual([]);
    expect(byKind(p, 'custom')).toEqual([]);
    const r = run(p);
    expect(codes(r)).toContain('TOTAL_MISMATCH');
    expect(issues(r).find((i) => i.code === 'TOTAL_MISMATCH')?.difference).toBe(100);
  });

  it('P21 a gap of more than Rs 1 gets no line (Rs 1.50 under)', () => {
    const p = patchOf(single(99850, 100000));
    expect(roundingOf(p)).toEqual([]);
    expect(codes(run(p))).toContain('TOTAL_MISMATCH');
  });

  it('P21 a printed total that is not a whole number of rupees gets no line (Rs 1,000.50 vs computed 1,000.45)', () => {
    const p = patchOf(single(100045, 100050));
    expect(roundingOf(p)).toEqual([]);
    expect(codes(run(p))).toContain('TOTAL_MISMATCH');
  });

  it('P21 a zero gap gets no line and no rounding note', () => {
    const p = patchOf(single(100000, 100000));
    expect(p.adjustments).toEqual([]);
    expect(p.notes.some((n) => /rounds to whole rupees/i.test(n))).toBe(false);
  });

  it('P21 no printed total: nothing to reconcile, no line', () => {
    const p = patchOf(draft({ items: [dItem('Thing', 1, 100005)] }));
    expect(p.adjustments).toEqual([]);
  });

  // PROPOSED ruling: P21 says "the chosen variant's printed total", but receipts with a single price (Gourmet, Daily Deli) are rupee-rounded
  // the same way. Ruling: a plain printedTotal gets the same treatment.
  it('P21-ruling a plain (non-variant) printedTotal gets the same rounding line: 1,000.05 computed vs 1,000 printed', () => {
    const p = patchOf(plain(100005, 100000));
    expect(at(roundingOf(p), 0)).toMatchObject({ label: 'Receipt rounding', direction: 'subtract', value: { type: 'fixed', amount: 5 }, source: 'reconciliation' });
    expect(total(run(p))).toBe(100000);
  });

  it('P21-ruling a plain printedTotal 5 paisa above the computed total gets an add line', () => {
    const p = patchOf(plain(99995, 100000));
    expect(at(roundingOf(p), 0)).toMatchObject({ direction: 'add', value: { type: 'fixed', amount: 5 } });
  });

  it("P21 it judges the CHOSEN variant's printed total: Arcadian large card is exact (no line), cash needs one", () => {
    expect(byKind(patchOf(large(), { paidWith: 'card' }), 'custom')).toEqual([]);
    expect(byKind(patchOf(large(), { paidWith: 'cash' }), 'custom')).toHaveLength(1);
  });

  it('P21 property: any gap of 1..99 paisa to a whole-rupee printed total is closed exactly, in the right direction, with nothing else changed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 5000 }), fc.integer({ min: 1, max: 99 }), fc.boolean(), (rupees, gap, above) => {
        const printed = rupees * 100;
        const computed = above ? printed + gap : printed - gap;
        const p = patchOf(single(computed, printed));
        const line = at(roundingOf(p), 0);
        expect(line.direction).toBe(above ? 'subtract' : 'add');
        expect(line.value).toEqual({ type: 'fixed', amount: gap });
        expect(p.adjustments).toHaveLength(1);
        expect(total(run(p))).toBe(printed);
      }),
    );
  });
});

// ───────────── informational taxes ─────────────
describe('P19/section 2 informational (already included) taxes', () => {
  const optp = (over: Record<string, unknown> = {}): ReceiptDraft =>
    draft({
      items: [dItem('JUM GARLIC MAYO NUGGETS', 1, 105000), dItem('CHK FILLET SANDWICH HOT', 1, 65000), dItem('LARGE MASALA FRIES', 1, 45000)],
      printedSubtotal: $(204800),
      printedTotal: $(215000),
      taxInclusive: true,
      charges: [ch('tax', 'Sale tax (VAT)', 10238, { informational: true })],
      ...over,
    });

  it('section 2 an informational tax produces no adjustment and the note "Prices already include tax"', () => {
    const p = patchOf(optp());
    expect(p.adjustments).toEqual([]);
    expect(p.notes.some((n) => /already include tax/i.test(n))).toBe(true);
  });

  it('section 2 informational + a real service charge: only the service charge becomes an adjustment', () => {
    const p = patchOf(optp({ charges: [ch('service', 'Service Charge', 10000), ch('tax', 'GST', 5000, { rateBp: 500, informational: true })] }));
    expect(p.adjustments.map((a) => a.kind)).toEqual(['serviceCharge']);
  });

  it('section 2 the printed total is copied, and the engine total is the item sum 2,150 = printed payable (tax is not added twice)', () => {
    const p = patchOf(optp({ printedSubtotal: undefined }));
    expect(p.printedTotal).toBe(215000);
    const r = run(p);
    expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    expect(total(r)).toBe(215000);
  });

  it('section 2 a non-informational tax on the same draft still becomes an adjustment', () => {
    const p = patchOf(optp({ taxInclusive: false, printedTotal: $(226238), charges: [ch('tax', 'Sale tax', 10238)] }));
    expect(p.adjustments).toHaveLength(1);
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'tax', value: { type: 'fixed', amount: 10238 } });
  });
});

/**
 * PROPOSED ruling (spec gap): section 5 copies printedSubtotal as-is, but on a taxInclusive receipt the printed subtotal
 * ("Total Net Amount 2,048") is the tax-EXCLUDED amount and is lower than the item sum 2,150 by design, so copying it would
 * raise a false SUBTOTAL_MISMATCH. Ruling: when draft.taxInclusive, do not copy printedSubtotal.
 */
describe('PROPOSED ruling: taxInclusive drafts do not copy the ex-tax printedSubtotal', () => {
  it('P19-ruling printedSubtotal is not copied and the engine reports no SUBTOTAL_MISMATCH', () => {
    const d = draft({
      items: [dItem('JUM GARLIC MAYO NUGGETS', 1, 105000), dItem('CHK FILLET SANDWICH HOT', 1, 65000), dItem('LARGE MASALA FRIES', 1, 45000)],
      printedSubtotal: $(204800),
      printedTotal: $(215000),
      taxInclusive: true,
      charges: [ch('tax', 'Sale tax (VAT)', 10238, { informational: true })],
    });
    const p = patchOf(d);
    expect(p.printedSubtotal).toBeUndefined();
    const r = run(p);
    expect(codes(r).filter((c) => c !== 'NO_CONTRIBUTIONS')).toEqual([]);
    expect(total(r)).toBe(215000);
  });
});

// ───────────── fee ─────────────
describe('section 2 fee charges', () => {
  it('section 2 a fee charge becomes fee({ amount, label }): kind "fee", fixed value, receipt label', () => {
    const p = patchOf(draft({ items: smallItems(), charges: [ch('fee', 'Delivery Charges', 5000)] }));
    expect(p.adjustments).toHaveLength(1);
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'fee', label: 'Delivery Charges', value: { type: 'fixed', amount: 5000 } });
  });

  it('section 2 the fee is added to the engine total exactly: 2,075 + 50 = 2,125', () => {
    const p = patchOf(draft({ items: smallItems(), printedSubtotal: $(207500), printedTotal: $(212500), charges: [ch('fee', 'Delivery Charges', 5000)] }));
    const r = run(p);
    expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    expect(total(r)).toBe(212500);
  });

  it('section 2 fee inside a variant is applied too (taxes and discounts remain the only variant lists, so fee stays top-level)', () => {
    const p = patchOf(small({ charges: [ch('fee', 'Packing Charges', 2000)] }), { paidWith: 'cash' });
    expect(p.adjustments.map((a) => a.kind).sort()).toEqual(['fee', 'tax']);
  });
});

// ───────────── draftChecks(draft, paidWith?) (2.1 addendum) ─────────────
describe('2.1 draftChecks: P10 checks for the chosen variant', () => {
  const check = (kind: string, expected: number, actual: number) => ({ kind, expected: $(expected), actual: $(actual), ok: expected === actual, difference: actual - expected });
  const stale = [check('items-vs-subtotal', 207500, 207500), check('summary-vs-total', 999999, 207500)];
  const summary = (d: ReceiptDraft, side?: 'card' | 'cash') => draftChecks(d, side).find((c) => c.kind === 'summary-vs-total');
  const itemsCheck = (d: ReceiptDraft, side?: 'card' | 'cash') => draftChecks(d, side).find((c) => c.kind === 'items-vs-subtotal');

  it('2.1 card: summary-vs-total uses the card variant (2,075 + 104 = 2,179 vs printed 2,179): ok, difference 0', () => {
    expect(summary(small({ checks: stale }), 'card')).toMatchObject({ expected: 217900, actual: 217900, ok: true, difference: 0 });
  });

  it('2.1 cash: uses the cash variant (2,075 + 332 = 2,407 vs printed 2,407)', () => {
    expect(summary(small({ checks: stale }), 'cash')).toMatchObject({ expected: 240700, actual: 240700, ok: true, difference: 0 });
  });

  it('2.1 no paidWith argument and no hint: the card variant (same default as draftToBillPatch)', () => {
    expect(summary(small({ checks: stale }))).toMatchObject({ expected: 217900, actual: 217900, ok: true });
  });

  it('2.1 Arcadian large card: 8,340 - 2,500 + 292 = 6,132 vs 6,132 ok', () => {
    expect(summary(large({ checks: stale }), 'card')).toMatchObject({ expected: 613200, actual: 613200, ok: true, difference: 0 });
  });

  it('2.1 Arcadian large cash: 834,000 - 249,990 + 93,400 = 677,410 vs printed 677,400: not ok, difference +10 (actual - expected)', () => {
    expect(summary(large({ checks: stale }), 'cash')).toMatchObject({ expected: 677400, actual: 677410, ok: false, difference: 10 });
  });

  it('2.1 items-vs-subtotal is unchanged by the variant choice', () => {
    const d = small({ checks: stale });
    expect(itemsCheck(d, 'card')).toEqual(itemsCheck(d, 'cash'));
    expect(itemsCheck(d, 'card')).toMatchObject({ kind: 'items-vs-subtotal', expected: 207500, actual: 207500, ok: true });
  });

  it('2.1 check order is items-vs-subtotal, then summary-vs-total, each { kind, ok, expected, actual, difference }', () => {
    const cs = draftChecks(small({ checks: stale }), 'cash');
    expect(cs.map((c) => c.kind)).toEqual(['items-vs-subtotal', 'summary-vs-total']);
    for (const c of cs) {
      expect(c.difference).toBe(c.actual - c.expected);
      expect(c.ok).toBe(c.difference === 0);
    }
  });

  it('2.1 informational taxes in the chosen variant are excluded: 1,000 + (informational 160) vs printed 1,000 is ok', () => {
    const d = draft({
      items: [dItem('Thing', 1, 100000)],
      checks: [],
      variants: {
        card: { taxes: [ch('tax', 'GST 16%', 16000, { rateBp: 1600, informational: true })], discounts: [], printedTotal: $(100000) },
        cash: { taxes: [ch('tax', 'GST 16%', 16000, { rateBp: 1600, informational: true })], discounts: [], printedTotal: $(100000) },
      },
    });
    expect(summary(d, 'card')).toMatchObject({ expected: 100000, actual: 100000, ok: true });
  });

  it('2.1 without variants the result equals draft.checks, whatever paidWith is', () => {
    const checks = [check('items-vs-subtotal', 5000, 4000), check('summary-vs-total', 5800, 5800), check('line-arithmetic', 1000, 1000)];
    const d = draft({ items: [dItem('Thing', 1, 4000)], printedSubtotal: $(5000), printedTotal: $(5800), checks });
    expect(draftChecks(d)).toEqual(checks);
    expect(draftChecks(d, 'cash')).toEqual(checks);
    expect(draftChecks(d, 'card')).toEqual(checks);
  });

  it('2.1 does not mutate the draft', () => {
    const d = small({ checks: stale });
    const copy = structuredClone(d);
    draftChecks(d, 'cash');
    expect(d).toEqual(copy);
  });

  it("2.1 property: the summary check follows the chosen side: actual = subtotal - discounts + taxes, ok iff equal to that side's printed total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 500000 }),
        fc.integer({ min: 0, max: 900 }),
        fc.integer({ min: 0, max: 9000 }),
        fc.integer({ min: 0, max: 9000 }),
        fc.integer({ min: -20, max: 20 }),
        fc.constantFrom<'card' | 'cash'>('card', 'cash'),
        (sub, disc, taxCard, taxCash, noise, side) => {
          const taxes = { card: taxCard, cash: taxCash };
          const printed = { card: sub - disc + taxCard + noise, cash: sub - disc + taxCash + 7 };
          const d = draft({
            items: [dItem('Thing', 1, sub)],
            printedSubtotal: $(sub),
            checks: [],
            variants: {
              card: { taxes: [ch('tax', 'GST 5%', taxCard)], discounts: disc ? [ch('discount', 'Disc', disc)] : [], printedTotal: $(printed.card) },
              cash: { taxes: [ch('tax', 'GST 16%', taxCash)], discounts: disc ? [ch('discount', 'Disc', disc)] : [], printedTotal: $(printed.cash) },
            },
          });
          const c = summary(d, side);
          expect(c?.actual).toBe(sub - disc + taxes[side]);
          expect(c?.expected).toBe(printed[side]);
          expect(c?.ok).toBe(c?.actual === c?.expected);
        },
      ),
    );
  });
});
