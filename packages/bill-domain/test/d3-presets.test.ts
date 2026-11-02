import type { Adjustment, AdjustmentBase, AllocationPolicy } from '@splitr/calculation-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cardDiscount,
  defaultOrders,
  describeAdjustment,
  fee,
  serviceCharge,
  tax,
  tip,
  type PresetDescription,
} from '../src/index';
import { $, bp, calc, fixtureB, okBreakdown } from './helpers';

const baseOf = (a: Adjustment): AdjustmentBase => a.base ?? { type: 'items' };
const allocOf = (a: Adjustment): AllocationPolicy => a.allocation ?? { type: 'proportional' };

/** Rebuild an adjustment from its description (used for round-trip checks). */
function rebuild(id: string, order: number, d: PresetDescription): Adjustment | null {
  switch (d.kind) {
    case 'cardDiscount':
      return cardDiscount(id, order, {
        rateBp: d.rateBp,
        ...(d.printedAmount !== undefined ? { printedAmount: d.printedAmount } : {}),
        ...(d.capPaisa !== undefined ? { capPaisa: d.capPaisa } : {}),
        label: d.label,
      });
    case 'tax':
      return tax(id, order, { rateBp: d.rateBp, base: d.base, label: d.label, ...(d.printedAmount !== undefined ? { printedAmount: d.printedAmount } : {}), });
    case 'serviceCharge':
      return serviceCharge(id, order, { rateBp: d.rateBp, label: d.label, ...(d.printedAmount !== undefined ? { printedAmount: d.printedAmount } : {}), });
    case 'tip':
      return tip(id, order, { amount: d.amount, split: d.split, ...(d.printedAmount !== undefined ? { printedAmount: d.printedAmount } : {}), });
    case 'fee':
      return fee(id, order, { amount: d.amount, label: d.label, ...(d.printedAmount !== undefined ? { printedAmount: d.printedAmount } : {}), });
    case 'custom':
      return null;
  }
}

describe('D3 presets', () => {
  it('D3 defaultOrders are discount 10, tax 30, service 35 (phase2 v1.1), tip 40, fee 50', () => {
    expect(defaultOrders).toEqual({ discount: 10, serviceCharge: 35, tax: 30, tip: 40, fee: 50 });
  });

  describe('builders', () => {
    it('D3 cardDiscount builds a proportional discount on items with default label', () => {
      const a = cardDiscount('d1', 10, { rateBp: bp(2000) });
      expect(a).toMatchObject({
        id: 'd1',
        order: 10,
        kind: 'discount',
        label: 'Card discount',
        value: { type: 'rate', bp: 2000 },
        source: 'user',
      });
      expect(baseOf(a)).toEqual({ type: 'items' });
      expect(allocOf(a)).toEqual({ type: 'proportional' });
      expect(a.cap).toBeUndefined();
    });
    it('D3 cardDiscount applies capPaisa as cap and a custom label', () => {
      const a = cardDiscount('d1', 11, { rateBp: bp(1500), capPaisa: $(300000), label: 'HBL 15%' });
      expect(a.cap).toBe(300000);
      expect(a.label).toBe('HBL 15%');
      expect(a.order).toBe(11);
      expect(a.value).toEqual({ type: 'rate', bp: 1500 });
    });
    it('D3 tax on the original bill uses base items, proportional, default label', () => {
      const a = tax('t1', 30, { rateBp: bp(500), base: 'original' });
      expect(a).toMatchObject({ id: 't1', order: 30, kind: 'tax', label: 'Tax', value: { type: 'rate', bp: 500 }, source: 'user' });
      expect(baseOf(a)).toEqual({ type: 'items' });
      expect(allocOf(a)).toEqual({ type: 'proportional' });
    });
    it("D3 tax after discounts uses base items-after with include 'all-prior'", () => {
      const a = tax('t1', 30, { rateBp: bp(1600), base: 'after-discounts', label: 'GST' });
      expect(a.label).toBe('GST');
      expect(a.kind).toBe('tax');
      expect(baseOf(a)).toEqual({ type: 'items-after', include: 'all-prior' });
      expect(allocOf(a)).toEqual({ type: 'proportional' });
    });
    it('D3 serviceCharge builds base items, proportional, default label', () => {
      const a = serviceCharge('s1', 20, { rateBp: bp(1000) });
      expect(a).toMatchObject({ id: 's1', order: 20, kind: 'serviceCharge', label: 'Service charge', value: { type: 'rate', bp: 1000 }, source: 'user' });
      expect(baseOf(a)).toEqual({ type: 'items' });
      expect(allocOf(a)).toEqual({ type: 'proportional' });
      expect(serviceCharge('s1', 20, { rateBp: bp(1000), label: 'Svc' }).label).toBe('Svc');
    });
    it('D3 tip equal builds a fixed tip with equal allocation', () => {
      const a = tip('p1', 40, { amount: $(50000), split: 'equal' });
      expect(a).toMatchObject({ id: 'p1', order: 40, kind: 'tip', label: 'Tip', value: { type: 'fixed', amount: 50000 }, source: 'user' });
      expect(allocOf(a).type).toBe('equal');
      const alloc = allocOf(a);
      if (alloc.type === 'equal') expect(alloc.participantIds).toBeUndefined();
    });
    it('D3 tip proportional builds a fixed tip with proportional allocation', () => {
      const a = tip('p1', 40, { amount: $(50000), split: 'proportional' });
      expect(a.kind).toBe('tip');
      expect(a.value).toEqual({ type: 'fixed', amount: 50000 });
      expect(allocOf(a)).toEqual({ type: 'proportional' });
    });
    it('D3 fee builds a fixed proportional fee with the given label', () => {
      const a = fee('f1', 50, { amount: $(20000), label: 'Delivery' });
      expect(a).toMatchObject({ id: 'f1', order: 50, kind: 'fee', label: 'Delivery', value: { type: 'fixed', amount: 20000 }, source: 'user' });
      expect(allocOf(a)).toEqual({ type: 'proportional' });
    });
    it('D3 builders pass id and order through unchanged', () => {
      expect(tax('zzz', 7, { rateBp: bp(1), base: 'original' })).toMatchObject({ id: 'zzz', order: 7 });
      expect(fee('a b', 0, { amount: $(1), label: 'x' })).toMatchObject({ id: 'a b', order: 0 });
    });
  });

  describe('describeAdjustment', () => {
    it('D3 describeAdjustment cardDiscount without cap', () => {
      const d = describeAdjustment(cardDiscount('d', 10, { rateBp: bp(2000) }));
      expect(d).toEqual({ kind: 'cardDiscount', rateBp: 2000, label: 'Card discount' });
      expect((d as { capPaisa?: number }).capPaisa).toBeUndefined();
    });
    it('D3 describeAdjustment cardDiscount with cap and label', () => {
      expect(describeAdjustment(cardDiscount('d', 10, { rateBp: bp(2000), capPaisa: $(100000), label: 'X' }))).toEqual({
        kind: 'cardDiscount', rateBp: 2000, capPaisa: 100000, label: 'X',
      });
    });
    it('D3 describeAdjustment tax original and after-discounts', () => {
      expect(describeAdjustment(tax('t', 30, { rateBp: bp(500), base: 'original' }))).toEqual({
        kind: 'tax', rateBp: 500, base: 'original', label: 'Tax',
      });
      expect(describeAdjustment(tax('t', 30, { rateBp: bp(1600), base: 'after-discounts', label: 'GST' }))).toEqual({
        kind: 'tax', rateBp: 1600, base: 'after-discounts', label: 'GST',
      });
    });
    it('D3 describeAdjustment serviceCharge, tip and fee', () => {
      expect(describeAdjustment(serviceCharge('s', 20, { rateBp: bp(1000) }))).toEqual({ kind: 'serviceCharge', rateBp: 1000, label: 'Service charge' });
      expect(describeAdjustment(tip('p', 40, { amount: $(5000), split: 'equal' }))).toEqual({ kind: 'tip', amount: 5000, split: 'equal' });
      expect(describeAdjustment(tip('p', 40, { amount: $(5000), split: 'proportional' }))).toEqual({ kind: 'tip', amount: 5000, split: 'proportional' });
      expect(describeAdjustment(fee('f', 50, { amount: $(700), label: 'Packing' }))).toEqual({ kind: 'fee', amount: 700, label: 'Packing' });
    });

    it('D3 describeAdjustment round-trips every preset (property: build -> describe -> rebuild equals original)', () => {
      const label = fc.string({ minLength: 1, maxLength: 12 });
      const rate = fc.integer({ min: 0, max: 10000 });
      const money = fc.integer({ min: 0, max: 100_000_000 });
      const presets = fc.oneof(
        fc.record({ rate, cap: fc.option(money, { nil: undefined }), label: fc.option(label, { nil: undefined }) }).map(
          (r) => cardDiscount('x', 10, { rateBp: bp(r.rate), ...(r.cap !== undefined ? { capPaisa: $(r.cap) } : {}), ...(r.label !== undefined ? { label: r.label } : {}) }),
        ),
        fc.record({ rate, base: fc.constantFrom('original' as const, 'after-discounts' as const), label: fc.option(label, { nil: undefined }) }).map(
          (r) => tax('x', 30, { rateBp: bp(r.rate), base: r.base, ...(r.label !== undefined ? { label: r.label } : {}) }),
        ),
        fc.record({ rate, label: fc.option(label, { nil: undefined }) }).map(
          (r) => serviceCharge('x', 20, { rateBp: bp(r.rate), ...(r.label !== undefined ? { label: r.label } : {}) }),
        ),
        fc.record({ amount: money, split: fc.constantFrom('equal' as const, 'proportional' as const) }).map(
          (r) => tip('x', 40, { amount: $(r.amount), split: r.split }),
        ),
        fc.record({ amount: money, label }).map((r) => fee('x', 50, { amount: $(r.amount), label: r.label })),
      );
      fc.assert(
        fc.property(presets, (adj) => {
          const d = describeAdjustment(adj);
          expect(d.kind).not.toBe('custom');
          expect(rebuild(adj.id, adj.order, d)).toEqual(adj);
        }),
        { numRuns: 300 },
      );
    });

    it('D3a every builder accepts printedAmount; describeAdjustment ignores it for matching and returns it; rebuild is identical', () => {
      const pr = $(12345);
      const built: Adjustment[] = [
        cardDiscount('x', 10, { rateBp: bp(2000), printedAmount: pr }),
        tax('x', 30, { rateBp: bp(1600), base: 'original', printedAmount: pr }),
        tax('x', 30, { rateBp: bp(1600), base: 'after-discounts', printedAmount: pr }),
        serviceCharge('x', 35, { rateBp: bp(1000), printedAmount: pr }),
        tip('x', 40, { amount: $(5000), split: 'proportional', printedAmount: pr }),
        fee('x', 50, { amount: $(700), label: 'Packing', printedAmount: pr }),
      ];
      for (const adj of built) {
        expect(adj.printedAmount).toBe(pr);
        const d = describeAdjustment(adj);
        expect(d.kind).not.toBe('custom');
        expect((d as { printedAmount?: number }).printedAmount).toBe(pr);
        expect(rebuild(adj.id, adj.order, d)).toEqual(adj);
      }
    });

    it('D3a without printedAmount the description has none and builders add none', () => {
      const a = tax('x', 30, { rateBp: bp(500), base: 'original' });
      expect(a.printedAmount).toBeUndefined();
      expect((describeAdjustment(a) as { printedAmount?: number }).printedAmount).toBeUndefined();
    });

    it('D3a property: printedAmount round-trips for all five presets', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100_000_000 }), fc.integer({ min: 0, max: 10000 }), (m, r) => {
          const pr = $(m);
          for (const adj of [
            cardDiscount('x', 10, { rateBp: bp(r), printedAmount: pr }),
            tax('x', 30, { rateBp: bp(r), base: 'after-discounts', printedAmount: pr }),
            serviceCharge('x', 35, { rateBp: bp(r), printedAmount: pr }),
            tip('x', 40, { amount: $(m), split: 'equal', printedAmount: pr }),
            fee('x', 50, { amount: $(m), label: 'F', printedAmount: pr }),
          ]) {
            expect(rebuild(adj.id, adj.order, describeAdjustment(adj))).toEqual(adj);
          }
        }),
        { numRuns: 100 },
      );
    });

    const customs: [string, Adjustment][] = [
      ['kind custom', { ...fee('c', 50, { amount: $(100), label: 'X' }), kind: 'custom', direction: 'add' }],
      ['discount with eligibility', { ...cardDiscount('d', 10, { rateBp: bp(2000) }), eligibility: { categories: ['food'] } }],
      ['discount with items-after base', { ...cardDiscount('d', 10, { rateBp: bp(2000) }), base: { type: 'items-after', include: ['x'] } }],
      ['discount with fixed value', { ...cardDiscount('d', 10, { rateBp: bp(2000) }), value: { type: 'fixed', amount: $(500) } }],
      ['discount with minimumSpend', { ...cardDiscount('d', 10, { rateBp: bp(2000) }), minimumSpend: $(100000) }],
      ['discount with override', { ...cardDiscount('d', 10, { rateBp: bp(2000) }), override: { amount: $(1), reason: 'because' } }],
      ['discount from a receipt source', { ...cardDiscount('d', 10, { rateBp: bp(2000) }), source: 'receipt' }],
      ['tax with rounding mode down', { ...tax('t', 30, { rateBp: bp(500), base: 'original' }), rounding: 'down' }],
      ['tax with a fixed taxable amount', { ...tax('t', 30, { rateBp: bp(500), base: 'original' }), base: { type: 'fixed', amount: $(1000) } }],
      ['tax after discounts naming one id', { ...tax('t', 30, { rateBp: bp(500), base: 'original' }), base: { type: 'items-after', include: ['d'] } }],
      ['service charge with equal allocation', { ...serviceCharge('s', 20, { rateBp: bp(1000) }), allocation: { type: 'equal' } }],
      ['tip with weights allocation', { ...tip('p', 40, { amount: $(5000), split: 'equal' }), allocation: { type: 'weights', entries: [{ participantId: 'a', weight: 1 }] } }],
      ['tip equal limited to some participants', { ...tip('p', 40, { amount: $(5000), split: 'equal' }), allocation: { type: 'equal', participantIds: ['a'] } }],
      ['fee with validity', { ...fee('f', 50, { amount: $(100), label: 'Z' }), validity: { from: '2026-01-01' } }],
      ['fee with eligibility exclusion', { ...fee('f', 50, { amount: $(100), label: 'Z' }), eligibility: { excludeCategories: ['x'] } }],
    ];
    it.each(customs)('D3 describeAdjustment returns custom for a hand-made non-preset: %s', (_name, adj) => {
      expect(describeAdjustment(adj)).toEqual({ kind: 'custom' });
    });
  });

  describe('Fixture B built from presets', () => {
    it('D3 Fixture B presets yield engine total 850000 and the rules-doc rounded shares', () => {
      const b = okBreakdown(fixtureB());
      expect(b.itemsSubtotal).toBe(1000000);
      expect(b.total).toBe(850000);
      expect(b.roundedTotal).toBe(850000);
      expect(b.adjustments.map((a) => a.amount)).toEqual([-200000, 50000]);
      expect(b.participants.map((p) => p.participantId)).toEqual(['mahhee', 'hamza', 'ali', 'saad']);
      expect(b.participants.map((p) => p.exactTotal)).toEqual([180625, 263500, 225250, 180625]);
      expect(b.participants.map((p) => p.roundedTotal)).toEqual([180600, 263500, 225300, 180600]);
      expect(b.settlement?.transfers).toEqual([
        { from: 'ali', to: 'hamza', amount: 225300 },
        { from: 'mahhee', to: 'hamza', amount: 180600 },
        { from: 'saad', to: 'hamza', amount: 180600 },
      ]);
    });
    it('D3 default-order presets make "after-discounts" tax valid (tip after tax)', () => {
      const bill = fixtureB({
        adjustments: [
          cardDiscount('d', defaultOrders.discount, { rateBp: bp(2000) }),
          tax('t', defaultOrders.tax, { rateBp: bp(500), base: 'after-discounts' }),
          tip('p', defaultOrders.tip, { amount: $(30000), split: 'equal' }),
        ],
        contributions: [{ participantId: 'hamza', amount: $(1000000 - 200000 + 40000 + 30000) }],
      });
      const r = calc(bill);
      expect(r.ok).toBe(true);
      if (r.ok) {
        // tax = 5% of (1,000,000 - 200,000) = 40,000
        expect(r.breakdown.adjustments.map((a) => a.amount)).toEqual([-200000, 40000, 30000]);
        expect(r.breakdown.total).toBe(870000);
      }
    });
  });
});
