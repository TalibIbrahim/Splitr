import { calculateBill } from '@splitr/calculation-engine';
import type { Adjustment, BillInput, CalculationResult, Issue, Paisa } from '@splitr/calculation-engine';
import type { DraftCharge, DraftItem, ReceiptDraft } from '@splitr/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assignRemainingEqually, defaultOrders, describeAdjustment, draftToBillPatch } from '../src/index';
import { $, at } from './helpers';

// ───────────── builders (hand-written from docs/phase2-spec.md §4, §5) ─────────────

const dItem = (name: string, quantity: number, lineTotal: number, unitPrice?: number): DraftItem => ({
  name,
  quantity,
  ...(unitPrice !== undefined ? { unitPrice: $(unitPrice) } : {}),
  lineTotal: $(lineTotal),
  confidence: 'high',
  flags: [],
  sourceText: name,
});

const dCharge = (kind: DraftCharge['kind'], label: string, amount: number, rateBp?: number): DraftCharge =>
  ({
    kind,
    label,
    amount: $(amount),
    ...(rateBp !== undefined ? { rateBp } : {}),
    confidence: 'high',
    sourceText: label,
  }) as DraftCharge;

const draft = (over: Partial<ReceiptDraft> = {}): ReceiptDraft =>
  ({ items: [], charges: [], checks: [], unparsedRows: [], ...over }) as ReceiptDraft;

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const patchOf = (d: ReceiptDraft) => draftToBillPatch(d, counter());

/** Lahore fixture items (see receipt-parser tests): Σ = 464,050 paisa. */
const lahoreItems = (): DraftItem[] => [
  dItem('Zinger Burger', 2, 130000, 65000),
  dItem('Chicken Karahi', 1, 185000),
  dItem('Mint Margarita', 3, 90000, 30000),
  dItem('Fries', 1, 35050),
  dItem('Naan', 4, 24000, 6000),
];
const SUB = 464050;

/** Engine run for a patch with every item assigned equally between two people. */
function run(patch: ReturnType<typeof draftToBillPatch>, extra: Partial<BillInput> = {}): CalculationResult {
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
    ...extra,
  };
  return calculateBill(input);
}
const issues = (r: CalculationResult): Issue[] => (r.ok ? [...r.warnings] : [...r.errors, ...r.warnings]);
const codes = (r: CalculationResult): string[] => issues(r).map((i) => i.code);
const total = (r: CalculationResult): number => {
  if (!r.ok) throw new Error('not ok: ' + JSON.stringify(r.errors));
  return r.breakdown.total;
};
const byKind = (p: ReturnType<typeof draftToBillPatch>, kind: string): Adjustment[] =>
  p.adjustments.filter((a) => a.kind === kind);

const baseOf = (a: Adjustment) => a.base ?? { type: 'items' };
const allocOf = (a: Adjustment) => a.allocation ?? { type: 'proportional' };
const ITEMS_BASE = { type: 'items' };
const AFTER_DISCOUNTS = { type: 'items-after', include: 'all-prior' };

// ───────────── tests ─────────────

describe('§5 draftToBillPatch: items', () => {
  it('§5 items map in order to unassigned, source "receipt", categories [] items with fresh ids', () => {
    const p = patchOf(draft({ items: lahoreItems() }));
    expect(p.items).toHaveLength(5);
    expect(p.items.map((i) => i.name)).toEqual(['Zinger Burger', 'Chicken Karahi', 'Mint Margarita', 'Fries', 'Naan']);
    expect(p.items.map((i) => i.quantity)).toEqual([2, 1, 3, 1, 4]);
    expect(p.items.map((i) => i.lineTotal)).toEqual([130000, 185000, 90000, 35050, 24000]);
    for (const it of p.items) {
      expect(it.assignment).toEqual({ kind: 'unassigned' });
      expect(it.source).toBe('receipt');
      expect(it.categories).toEqual([]);
    }
  });

  it('§5 ids come from the injected newId: unique, in item order, none invented elsewhere', () => {
    const generated: string[] = [];
    let n = 0;
    const newId = () => {
      const id = `gen-${++n}`;
      generated.push(id);
      return id;
    };
    const p = draftToBillPatch(
      draft({ items: lahoreItems(), charges: [dCharge('tax', 'GST', 74248, 1600), dCharge('tip', 'Tip', 5000)] }),
      newId,
    );
    const used = [...p.items.map((i) => i.id), ...p.adjustments.map((a) => a.id)];
    expect(new Set(used).size).toBe(used.length);
    for (const id of used) expect(generated).toContain(id);
    const idx = p.items.map((i) => generated.indexOf(i.id));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx); // ascending = item order
  });

  it('§5 two calls with two counters give identical patches (pure, no hidden state)', () => {
    const d = draft({ items: lahoreItems(), charges: [dCharge('tax', 'GST', 74248, 1600)] });
    expect(draftToBillPatch(d, counter())).toEqual(draftToBillPatch(d, counter()));
  });

  it('§5 does not mutate the draft', () => {
    const d = draft({ items: lahoreItems(), charges: [dCharge('discount', 'Card', 92810, 2000)] });
    const copy = structuredClone(d);
    draftToBillPatch(d, counter());
    expect(d).toEqual(copy);
  });

  it('§5 unitPrice is kept when quantity x unitPrice = lineTotal', () => {
    const p = patchOf(draft({ items: lahoreItems() }));
    expect(p.items.map((i) => i.unitPrice)).toEqual([65000, undefined, 30000, undefined, 6000]);
  });

  it('§5 unitPrice is dropped when inconsistent (2 x 650 != 1,400), lineTotal untouched', () => {
    const bad = { ...dItem('Zinger Burger', 2, 140000, 65000), flags: ['arithmetic' as const], confidence: 'low' as const };
    const p = patchOf(draft({ items: [bad] }));
    expect(at(p.items, 0).unitPrice).toBeUndefined();
    expect(at(p.items, 0).lineTotal).toBe(140000);
    expect(at(p.items, 0).quantity).toBe(2);
  });

  it('§5 consistency is judged on the numbers, not on the flags', () => {
    const flaggedButFine = { ...dItem('Naan', 4, 24000, 6000), flags: ['quantity' as const] };
    expect(at(patchOf(draft({ items: [flaggedButFine] })).items, 0).unitPrice).toBe(6000);
  });

  it('§5 a patch with an inconsistent unitPrice would be an engine error: dropping it avoids LINE_ARITHMETIC_MISMATCH', () => {
    const bad = dItem('Zinger Burger', 2, 140000, 65000);
    const r = run(patchOf(draft({ items: [bad] })));
    expect(codes(r)).not.toContain('LINE_ARITHMETIC_MISMATCH');
  });

  it('§5 empty draft gives an empty patch', () => {
    const p = patchOf(draft());
    expect(p.items).toEqual([]);
    expect(p.adjustments).toEqual([]);
    expect(p.notes).toEqual([]);
    expect(p.printedSubtotal).toBeUndefined();
    expect(p.printedTotal).toBeUndefined();
  });
});

describe('§5 printed values', () => {
  it('§5 printedSubtotal and printedTotal are copied as-is, even when they disagree with the items', () => {
    const p = patchOf(draft({ items: lahoreItems(), printedSubtotal: $(999999), printedTotal: $(123) }));
    expect(p.printedSubtotal).toBe(999999);
    expect(p.printedTotal).toBe(123);
  });

  it('§5/R10.4-5 a mismatching receipt surfaces SUBTOTAL_MISMATCH and TOTAL_MISMATCH instead of being absorbed', () => {
    const p = patchOf(draft({ items: lahoreItems(), printedSubtotal: $(SUB + 100), printedTotal: $(SUB + 5) }));
    const r = run(p);
    expect(r.ok).toBe(false);
    expect(codes(r)).toEqual(expect.arrayContaining(['SUBTOTAL_MISMATCH', 'TOTAL_MISMATCH']));
    expect(p.adjustments).toEqual([]); // nothing was invented to close the gap
  });

  it('§5 absent printed values stay absent', () => {
    const p = patchOf(draft({ items: lahoreItems() }));
    expect('printedSubtotal' in p && p.printedSubtotal !== undefined).toBe(false);
    expect('printedTotal' in p && p.printedTotal !== undefined).toBe(false);
  });
});

describe('§5 discounts', () => {
  it('§5 discount with a matching rate -> cardDiscount preset (base items) with printedAmount', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('discount', 'Card Discount 20%', 92810, 2000)] }));
    expect(p.adjustments).toHaveLength(1);
    const a = at(p.adjustments, 0);
    expect(a).toMatchObject({ kind: 'discount', value: { type: 'rate', bp: 2000 }, printedAmount: 92810, order: defaultOrders.discount, source: 'user' });
    expect(baseOf(a)).toEqual(ITEMS_BASE);
    expect(allocOf(a)).toEqual({ type: 'proportional' });
    expect(a.cap).toBeUndefined();
    expect(p.notes).toEqual([]);
  });

  it('§5 discount whose rate does NOT reproduce the amount -> fixed discount of the printed amount, label from receipt, plus a note', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('discount', 'HBL Offer 20%', 90000, 2000)] }));
    const a = at(p.adjustments, 0);
    expect(a).toMatchObject({ kind: 'discount', value: { type: 'fixed', amount: 90000 }, label: 'HBL Offer 20%', order: defaultOrders.discount });
    expect(p.notes.length).toBeGreaterThanOrEqual(1);
    expect(describeAdjustment(a).kind).toBe('custom');
  });

  it('§5 discount without a rate -> fixed discount', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('discount', 'Voucher', 50000)] }));
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'discount', value: { type: 'fixed', amount: 50000 }, label: 'Voucher' });
  });

  it('§5 a fixed discount reproduces the printed amount in the engine', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('discount', 'Voucher', 50000)] }));
    expect(total(run(p))).toBe(SUB - 50000);
  });

  it('§5 a rate is used only when it reproduces the amount to the paisa: 20% of 464,055 = 92,811 exactly, 92,810 is off by one', () => {
    const items = [dItem('Thing', 1, 464055)];
    const ok = patchOf(draft({ items, charges: [dCharge('discount', 'Card', 92811, 2000)] }));
    expect(at(ok.adjustments, 0).value).toEqual({ type: 'rate', bp: 2000 });
    const off = patchOf(draft({ items, charges: [dCharge('discount', 'Card', 92810, 2000)] }));
    expect(at(off.adjustments, 0).value).toEqual({ type: 'fixed', amount: 92810 });
  });
});

describe('§5 tax', () => {
  it('§5 tax 16% matching on the original subtotal -> tax preset, base original, printedAmount', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('tax', 'GST 16%', 74248, 1600)] }));
    const a = at(p.adjustments, 0);
    expect(a).toMatchObject({ kind: 'tax', value: { type: 'rate', bp: 1600 }, printedAmount: 74248, order: defaultOrders.tax });
    expect(baseOf(a)).toEqual(ITEMS_BASE);
    expect(allocOf(a)).toEqual({ type: 'proportional' });
    expect(p.notes).toEqual([]);
  });

  it('§5 tax matching only AFTER discounts -> base after-discounts (16% of 371,240 = 59,398)', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [dCharge('discount', 'Card Discount 20%', 92810, 2000), dCharge('tax', 'GST 16%', 59398, 1600)],
      }),
    );
    const tax = at(byKind(p, 'tax'), 0);
    expect(tax).toMatchObject({ printedAmount: 59398, value: { type: 'rate', bp: 1600 } });
    expect(baseOf(tax)).toEqual(AFTER_DISCOUNTS);
    expect(tax.order).toBe(defaultOrders.tax);
    expect(codes(run(p))).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
  });

  it('§5 original is tried first: with no discount, original and after-discounts coincide and original wins', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('tax', 'GST', 74248, 1600)] }));
    expect(baseOf(at(p.adjustments, 0))).toEqual(ITEMS_BASE);
  });

  it('§5 tax matching on the original even when a discount exists (74,248 on 464,050)', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [dCharge('discount', 'Card Discount 20%', 92810, 2000), dCharge('tax', 'GST 16%', 74248, 1600)],
      }),
    );
    expect(baseOf(at(byKind(p, 'tax'), 0))).toEqual(ITEMS_BASE);
  });

  it('§5 tax not reproducible (printed rounded to the rupee: 742 vs 742.48) -> fixed adjustment of the printed amount + note', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('tax', 'GST 16%', 74200, 1600)] }));
    const a = at(p.adjustments, 0);
    expect(a).toMatchObject({ kind: 'tax', value: { type: 'fixed', amount: 74200 }, label: 'GST 16%', order: defaultOrders.tax });
    expect(p.notes).toHaveLength(1);
    expect(p.notes[0]).toMatch(/GST/);
    expect(p.notes[0]).toMatch(/742/);
  });

  it('§5 tax without a rate -> fixed tax', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('tax', 'FED', 12345)] }));
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'tax', value: { type: 'fixed', amount: 12345 }, label: 'FED' });
  });

  it('§5 the fixed fallback keeps the engine total equal to the receipt (no ADJUSTMENT_PRINTED_MISMATCH, total = items + printed tax)', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('tax', 'GST 16%', 74200, 1600)] }));
    const r = run(p);
    expect(codes(r)).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
    expect(total(r)).toBe(SUB + 74200);
  });
});

describe('§5 service charge', () => {
  it('§5 service 10% matching on the original -> serviceCharge preset (base items) with printedAmount, order 35', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('service', 'Service Charge 10%', 46405, 1000)] }));
    const a = at(p.adjustments, 0);
    expect(a).toMatchObject({ kind: 'serviceCharge', value: { type: 'rate', bp: 1000 }, printedAmount: 46405, order: defaultOrders.serviceCharge });
    expect(baseOf(a)).toEqual(ITEMS_BASE);
    expect(allocOf(a)).toEqual({ type: 'proportional' });
  });

  it('§5a service on the post-discount base (10% of 371,240 = 37,124) -> explicit service adjustment, items-after [discount ids], rate + printedAmount', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [dCharge('discount', 'Card Discount 20%', 92810, 2000), dCharge('service', 'Service Charge 10%', 37124, 1000)],
      }),
    );
    const disc = at(byKind(p, 'discount'), 0);
    const s = at(byKind(p, 'serviceCharge'), 0);
    expect(s).toMatchObject({ value: { type: 'rate', bp: 1000 }, printedAmount: 37124 });
    expect(baseOf(s).type).toBe('items-after');
    expect((baseOf(s) as unknown as { include: unknown }).include).toEqual([disc.id]);
    expect(p.notes).toEqual([]);
    const r = run(p);
    expect(codes(r)).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
    expect(total(r)).toBe(SUB - 92810 + 37124);
  });

  it('§5 service not reproducible -> fixed serviceCharge + note', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('service', 'Service Charge 10%', 46400, 1000)] }));
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'serviceCharge', value: { type: 'fixed', amount: 46400 } });
    expect(p.notes).toHaveLength(1);
    expect(p.notes[0]).toMatch(/Service/);
  });

  it('§5 service without a rate -> fixed serviceCharge', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('service', 'Service', 20000)] }));
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'serviceCharge', value: { type: 'fixed', amount: 20000 } });
  });
});

describe('§5a tax base search (explicit include-ids, order 36)', () => {
  it('§5a GST 16% on subtotal minus discount PLUS service (16% of 417,645 = 66,823) -> explicit tax, items-after [discount id, service id], order 36', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [
          dCharge('discount', 'Card Discount 20%', 92810, 2000),
          dCharge('service', 'Service Charge 10%', 46405, 1000),
          dCharge('tax', 'GST 16%', 66823, 1600),
        ],
      }),
    );
    const disc = at(byKind(p, 'discount'), 0);
    const svc = at(byKind(p, 'serviceCharge'), 0);
    const tax = at(byKind(p, 'tax'), 0);
    expect(tax).toMatchObject({ value: { type: 'rate', bp: 1600 }, printedAmount: 66823, order: 36 });
    expect(baseOf(tax).type).toBe('items-after');
    const inc = (baseOf(tax) as unknown as { include: string[] }).include;
    expect([...inc].sort()).toEqual([disc.id, svc.id].sort());
    expect(allocOf(tax)).toEqual({ type: 'proportional' });
    expect(svc.order).toBe(35);
    expect(p.notes).toEqual([]);
    const r = run(p);
    expect(codes(r)).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
    expect(total(r)).toBe(SUB - 92810 + 46405 + 66823);
  });

  it('§5a candidate order: with service present, GST on the original (74,248) still wins first', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [
          dCharge('discount', 'Card Discount 20%', 92810, 2000),
          dCharge('service', 'Service Charge 10%', 46405, 1000),
          dCharge('tax', 'GST 16%', 74248, 1600),
        ],
      }),
    );
    const tax = at(byKind(p, 'tax'), 0);
    expect(baseOf(tax)).toEqual(ITEMS_BASE);
    expect(tax.order).toBe(defaultOrders.tax);
  });

  it('§5a with service present, after-discounts (discounts only, 59,398) is tried before the explicit include list', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [
          dCharge('discount', 'Card Discount 20%', 92810, 2000),
          dCharge('service', 'Service Charge 10%', 46405, 1000),
          dCharge('tax', 'GST 16%', 59398, 1600),
        ],
      }),
    );
    const tax = at(byKind(p, 'tax'), 0);
    expect(baseOf(tax)).toEqual(AFTER_DISCOUNTS);
    expect(tax.order).toBe(defaultOrders.tax);
    expect(codes(run(p))).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
  });

  it('§5a none of the candidates matches -> fixed tax of the printed amount plus a note', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [
          dCharge('discount', 'Card Discount 20%', 92810, 2000),
          dCharge('service', 'Service Charge 10%', 46405, 1000),
          dCharge('tax', 'GST 16%', 66800, 1600),
        ],
      }),
    );
    const tax = at(byKind(p, 'tax'), 0);
    expect(tax).toMatchObject({ value: { type: 'fixed', amount: 66800 }, label: 'GST 16%' });
    expect(p.notes).toHaveLength(1);
    expect(p.notes[0]).toMatch(/GST/);
  });

  it('§5a without a service adjustment in the patch, 66,823 is unreachable -> fixed fallback', () => {
    const p = patchOf(
      draft({ items: lahoreItems(), charges: [dCharge('discount', 'Card Discount 20%', 92810, 2000), dCharge('tax', 'GST 16%', 66823, 1600)] }),
    );
    expect(at(byKind(p, 'tax'), 0).value).toEqual({ type: 'fixed', amount: 66823 });
  });
});

describe('§5 tip', () => {
  it('§5 tip -> tip preset, fixed amount, proportional split, order 40', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('tip', 'Tip', 10000)] }));
    const a = at(p.adjustments, 0);
    expect(a).toMatchObject({ kind: 'tip', value: { type: 'fixed', amount: 10000 }, order: defaultOrders.tip });
    expect(a.allocation ?? { type: 'proportional' }).toEqual({ type: 'proportional' });
    expect(describeAdjustment(a)).toEqual({ kind: 'tip', amount: 10000, split: 'proportional' });
  });

  it('§5 a tip with a rate in the draft is still a fixed tip of the printed amount', () => {
    const p = patchOf(draft({ items: lahoreItems(), charges: [dCharge('tip', 'Tip 5%', 23203, 500)] }));
    expect(at(p.adjustments, 0)).toMatchObject({ kind: 'tip', value: { type: 'fixed', amount: 23203 } });
  });
});

describe('§5 adjustments overall', () => {
  it('§5 every adjustment gets a unique id, source "user" and the default order of its kind', () => {
    const p = patchOf(
      draft({
        items: lahoreItems(),
        charges: [
          dCharge('discount', 'Card', 92810, 2000),
          dCharge('service', 'Service', 46405, 1000),
          dCharge('tax', 'GST', 74248, 1600),
          dCharge('tip', 'Tip', 1000),
        ],
      }),
    );
    expect(p.adjustments.map((a) => a.kind)).toEqual(expect.arrayContaining(['discount', 'serviceCharge', 'tax', 'tip']));
    expect(p.adjustments).toHaveLength(4);
    expect(new Set(p.adjustments.map((a) => a.id)).size).toBe(4);
    const order = (k: string) => at(byKind(p, k), 0).order;
    expect(order('discount')).toBe(10);
    expect(order('serviceCharge')).toBe(35);
    expect(order('tax')).toBe(30);
    expect(order('tip')).toBe(40);
    for (const a of p.adjustments) expect(a.source).toBe('user');
  });

  it('§5 two discounts on one receipt both become adjustments (no merging, no dropping)', () => {
    const p = patchOf(
      draft({ items: lahoreItems(), charges: [dCharge('discount', 'Voucher', 10000), dCharge('discount', 'Promo', 5000)] }),
    );
    expect(byKind(p, 'discount').map((a) => a.label).sort()).toEqual(['Promo', 'Voucher']);
    expect(total(run(p))).toBe(SUB - 15000);
  });

  it('§5 equality is judged by the engine: a rate that matches only for the whole item set is evaluated on ALL draft items', () => {
    // 10% of (1000 + 50) = 105 -> matches only if both items are counted
    const items = [dItem('A thing', 1, 100000), dItem('B thing', 1, 5000)];
    const p = patchOf(draft({ items, charges: [dCharge('tax', 'GST 10%', 10500, 1000)] }));
    expect(at(p.adjustments, 0).value).toEqual({ type: 'rate', bp: 1000 });
  });
});

describe('§5 end to end with the engine (every item assigned)', () => {
  const lahore = (over: Partial<ReceiptDraft> = {}) =>
    draft({
      items: lahoreItems(),
      printedSubtotal: $(464050),
      charges: [
        dCharge('discount', 'Card Discount 20%', 92810, 2000),
        dCharge('tax', 'GST 16%', 74248, 1600),
        dCharge('service', 'Service Charge 10%', 46405, 1000),
      ],
      printedTotal: $(491893),
      ...over,
    });

  it('a consistent Lahore receipt: no ADJUSTMENT_PRINTED_MISMATCH, no mismatch of any kind, total = printedTotal 491,893', () => {
    const p = patchOf(lahore());
    const r = run(p);
    expect(codes(r)).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
    expect(codes(r)).not.toContain('SUBTOTAL_MISMATCH');
    expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    expect(codes(r)).not.toContain('LINE_ARITHMETIC_MISMATCH');
    expect(total(r)).toBe(491893);
    expect(p.notes).toEqual([]);
    expect(p.adjustments.every((a) => a.printedAmount !== undefined)).toBe(true);
  });

  it('the same receipt with a rupee-rounded GST (742) falls back to fixed and then the engine surfaces the TOTAL mismatch (never absorbed)', () => {
    const p = patchOf(
      lahore({
        charges: [
          dCharge('discount', 'Card Discount 20%', 92810, 2000),
          dCharge('tax', 'GST 16%', 74200, 1600),
          dCharge('service', 'Service Charge 10%', 46405, 1000),
        ],
      }),
    );
    const r = run(p);
    expect(codes(r)).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
    expect(codes(r)).toContain('TOTAL_MISMATCH'); // 491,845 computed vs 491,893 printed
    const tm = issues(r).find((i) => i.code === 'TOTAL_MISMATCH');
    expect(Math.abs(tm?.difference ?? 0)).toBe(48);
    expect(p.notes.length).toBeGreaterThanOrEqual(1);
  });

  it('a receipt with a tip: total includes it exactly', () => {
    const p = patchOf(lahore({ charges: [...lahore().charges, dCharge('tip', 'Tip', 5000)], printedTotal: $(496893) }));
    const r = run(p);
    expect(codes(r)).not.toContain('TOTAL_MISMATCH');
    expect(total(r)).toBe(496893);
  });

  it('a receipt with a wrong item (arithmetic-flagged): the unit price is dropped and the printed subtotal still exposes the gap', () => {
    const items = lahoreItems();
    items[0] = { ...dItem('Zinger Burger', 2, 140000, 65000), flags: ['arithmetic'], confidence: 'low' };
    const r = run(patchOf(lahore({ items })));
    expect(codes(r)).toContain('SUBTOTAL_MISMATCH');
    expect(codes(r)).not.toContain('LINE_ARITHMETIC_MISMATCH');
  });
});

describe('§5 property: consistent receipts reproduce the printed total', () => {
  // Independent half-up integer rounding (R8.3): round(S*bp/10000)
  const rd = (s: number, bp: number) => Math.floor((s * bp + 5000) / 10000);

  it('for random items and random discount/service/tax rates computed on the original subtotal', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 10000, max: 500000 }), { minLength: 1, maxLength: 6 }),
        fc.constantFrom(0, 500, 1000, 2000, 2500),
        fc.constantFrom(0, 500, 1000, 1250),
        fc.constantFrom(0, 500, 1600),
        (lines, bd, bs, bt) => {
          const items = lines.map((l, i) => dItem(`Dish ${i + 1}`, 1, l));
          const S = lines.reduce((a, b) => a + b, 0);
          const charges: DraftCharge[] = [];
          let T = S;
          if (bd) {
            const d = rd(S, bd);
            charges.push(dCharge('discount', `Discount ${bd / 100}%`, d, bd));
            T -= d;
          }
          if (bs) {
            const s = rd(S, bs);
            charges.push(dCharge('service', `Service Charge ${bs / 100}%`, s, bs));
            T += s;
          }
          if (bt) {
            const t = rd(S, bt);
            charges.push(dCharge('tax', `GST ${bt / 100}%`, t, bt));
            T += t;
          }
          const p = patchOf(draft({ items, charges, printedSubtotal: $(S), printedTotal: $(T) }));
          const r = run(p);
          expect(codes(r)).not.toContain('ADJUSTMENT_PRINTED_MISMATCH');
          expect(codes(r)).not.toContain('SUBTOTAL_MISMATCH');
          expect(codes(r)).not.toContain('TOTAL_MISMATCH');
          expect(total(r)).toBe(T as Paisa);
          // fixed fallbacks must not be needed for rate-reproducible receipts
          for (const a of p.adjustments) expect(a.value.type).toBe('rate');
          expect(p.notes).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
