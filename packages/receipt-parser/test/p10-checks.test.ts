import fc from 'fast-check';
import type { ReceiptDraft } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/index';
import { one, row } from './layout';
import { arbRows } from './arbitraries';
import { parse } from './support';

/** Independent recomputation of the P10 checks from the draft's OWN fields. */
export function expectedChecks(d: ReceiptDraft) {
  const sum = d.items.reduce((s, i) => s + i.lineTotal, 0);
  const by = (k: string) => d.charges.filter((c) => c.kind === k).reduce((s, c) => s + c.amount, 0);
  const raw: { kind: string; expected: number; actual: number }[] = [];
  if (d.printedSubtotal !== undefined) raw.push({ kind: 'items-vs-subtotal', expected: d.printedSubtotal, actual: sum });
  if (d.printedTotal !== undefined) {
    const sub = d.printedSubtotal ?? sum;
    raw.push({
      kind: 'summary-vs-total',
      expected: d.printedTotal,
      actual: sub - by('discount') + by('tax') + by('service') + by('tip'),
    });
  }
  for (const it of d.items) {
    if (it.unitPrice !== undefined) {
      raw.push({ kind: 'line-arithmetic', expected: it.lineTotal, actual: it.quantity * it.unitPrice });
    }
  }
  return raw.map((c) => ({ ...c, ok: c.actual === c.expected, difference: c.actual - c.expected }));
}

const pick = (d: ReceiptDraft) =>
  d.checks.map((c) => ({ kind: c.kind, expected: c.expected, actual: c.actual, ok: c.ok, difference: c.difference }));

describe('P10 checks', () => {
  it('P10 items-vs-subtotal: Σ items 950 vs subtotal 1,000 -> not ok, difference -5,000 paisa', () => {
    const d = parse([row('Zinger Burger', '650'), row('Fries', '300'), row('Sub Total', '1,000')]);
    expect(d.checks).toHaveLength(1);
    expect(d.checks[0]).toMatchObject({ kind: 'items-vs-subtotal', ok: false, expected: 100000, actual: 95000, difference: -5000 });
  });

  it('P10 items-vs-subtotal is ok when equal, with difference 0', () => {
    const d = parse([row('Zinger Burger', '650'), row('Fries', '300'), row('Sub Total', '950')]);
    expect(d.checks[0]).toMatchObject({ kind: 'items-vs-subtotal', ok: true, expected: 95000, actual: 95000, difference: 0 });
  });

  it('P10 items higher than the subtotal gives a positive difference (actual - expected)', () => {
    const d = parse([row('Zinger Burger', '650'), row('Fries', '300'), row('Sub Total', '900')]);
    expect(d.checks[0]?.difference).toBe(5000);
  });

  it('P10 no subtotal -> no items-vs-subtotal check', () => {
    const d = parse([row('Zinger Burger', '650'), row('Grand Total', '650')]);
    expect(d.checks.map((c) => c.kind)).toEqual(['summary-vs-total']);
  });

  it('P10 no total -> no summary-vs-total check', () => {
    const d = parse([row('Zinger Burger', '650'), row('Sub Total', '650'), row('GST 16%', '104')]);
    expect(d.checks.map((c) => c.kind)).toEqual(['items-vs-subtotal']);
  });

  it('P10 neither subtotal nor total nor unit prices -> no checks at all', () => {
    expect(parse([row('Zinger Burger', '650')]).checks).toEqual([]);
  });

  it('P10 summary-vs-total uses the PRINTED subtotal when present (1,000 - 200 + 100 + 50 + 30 = 980)', () => {
    const d = parse([
      row('Zinger Burger', '650'),
      row('Fries', '300'), // Σ items 950 != printed subtotal 1,000
      row('Sub Total', '1,000'),
      row('Discount', '200'),
      row('GST', '100'),
      row('Service Charge', '50'),
      row('Tip', '30'),
      row('Grand Total', '980'),
    ]);
    expect(d.checks.map((c) => c.kind)).toEqual(['items-vs-subtotal', 'summary-vs-total']);
    expect(d.checks[1]).toMatchObject({ ok: true, expected: 98000, actual: 98000, difference: 0 });
  });

  it('P10 summary-vs-total falls back to Σ items when there is no subtotal (950 + 152 = 1,102)', () => {
    const d = parse([row('Zinger Burger', '650'), row('Fries', '300'), row('GST 16%', '152'), row('Grand Total', '1,102')]);
    expect(d.checks).toHaveLength(1);
    expect(d.checks[0]).toMatchObject({ kind: 'summary-vs-total', ok: true, actual: 110200 });
  });

  it('P10 summary-vs-total mismatch: sums 1,102 but printed 1,100 -> difference +200', () => {
    const d = parse([row('Zinger Burger', '650'), row('Fries', '300'), row('GST 16%', '152'), row('Grand Total', '1,100')]);
    expect(d.checks[0]).toMatchObject({ kind: 'summary-vs-total', ok: false, expected: 110000, actual: 110200, difference: 200 });
  });

  it('P10 discount subtracts, tax/service/tip add (discount larger than the rest)', () => {
    const d = parse([row('Zinger Burger', '1,000'), row('Discount', '300'), row('Tip', '10'), row('Grand Total', '710')]);
    expect(d.checks[0]).toMatchObject({ ok: true, actual: 71000 });
  });

  it('P10 line-arithmetic: one check per item that has a unitPrice, in item order, after the other checks', () => {
    const d = parse([
      row('2 x Zinger Burger', '650', '1,300'),
      row('Chicken Karahi', '1,850'),
      row('3 x Samosa', '33', '100'),
      row('Sub Total', '3,250'),
      row('Grand Total', '3,250'),
    ]);
    expect(d.checks.map((c) => c.kind)).toEqual(['items-vs-subtotal', 'summary-vs-total', 'line-arithmetic', 'line-arithmetic']);
    // 2 x 650 = 1,300 ok ; 3 x 33 = 99 != 100: |difference| = 100 paisa
    expect(d.checks[2]).toMatchObject({ ok: true, difference: 0 });
    expect(d.checks[3]?.ok).toBe(false);
    expect(Math.abs(d.checks[3]?.difference ?? 0)).toBe(100);
    expect(new Set([d.checks[3]?.expected, d.checks[3]?.actual])).toEqual(new Set([10000, 9900]));
  });

  it('P10 each check is exactly { kind, ok, expected, actual, difference } with difference = actual - expected and ok <=> difference 0', () => {
    const d = parse([row('Zinger Burger', '650'), row('Sub Total', '700'), row('Grand Total', '700'), row('2 x Fries', '100', '250')]);
    for (const c of d.checks) {
      expect(c.difference).toBe(c.actual - c.expected);
      expect(c.ok).toBe(c.difference === 0);
    }
  });

  it('P10 uses only the LAST total / subtotal (earlier duplicates are unparsed)', () => {
    const d = parse([row('Zinger Burger', '650'), row('Total', '9,999'), row('Grand Total', '650')]);
    expect(d.checks[0]).toMatchObject({ kind: 'summary-vs-total', ok: true });
  });

  it('P10 the Lahore-style flow flags an arithmetic mismatch on the item AND on the check', () => {
    const d = parse([one('Chaman Cafe'), row('2 x Zinger Burger', '650', '1,400')]);
    expect(d.items[0]?.flags).toContain('arithmetic');
    expect(d.checks).toHaveLength(1);
    expect(d.checks[0]?.ok).toBe(false);
  });

  it('P10 property: checks equal a recomputation from the draft own fields, for arbitrary receipts', () => {
    fc.assert(
      fc.property(arbRows, (ocr) => {
        const d = parseReceipt(ocr);
        expect(pick(d)).toEqual(expectedChecks(d));
      }),
      { numRuns: 400 },
    );
  });

  it('P10/P5 property: an item has the "arithmetic" flag exactly when quantity x unitPrice != lineTotal', () => {
    fc.assert(
      fc.property(arbRows, (ocr) => {
        const d = parseReceipt(ocr);
        for (const it of d.items) {
          if (it.unitPrice !== undefined) {
            expect(it.flags.includes('arithmetic')).toBe(it.quantity * it.unitPrice !== it.lineTotal);
          } else {
            expect(it.flags.includes('arithmetic')).toBe(false);
          }
        }
      }),
      { numRuns: 400 },
    );
  });
});
