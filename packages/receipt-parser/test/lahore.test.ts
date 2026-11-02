import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/index';
import { lahoreReceipt, LAHORE } from './fixtures';
import { P } from './support';

describe('Lahore dine-in fixture (P1-P10 end to end)', () => {
  for (const printed of ['(928.10)', '-928.10', '928.10']) {
    it(`P8 discount printed as "${printed}" is a magnitude of 92810 with rate 2000`, () => {
      const d = parseReceipt(lahoreReceipt(printed));
      const disc = d.charges.filter((c) => c.kind === 'discount');
      expect(disc).toHaveLength(1);
      expect(disc[0]).toMatchObject({ amount: LAHORE.discount, rateBp: 2000 });
    });
  }

  it('P7 header: name, day-first date, phone/time/NTN rows never become items', () => {
    const d = parseReceipt(lahoreReceipt());
    expect(d.restaurantName).toBe('BURGER SHACK');
    expect(d.date).toBe('2026-11-02');
    expect(d.items.map((i) => i.name)).toEqual([
      'Zinger Burger',
      'Chicken Karahi',
      'Mint Margarita',
      'Fries',
      'Naan',
    ]);
  });

  it('P5/P6 items carry quantity, unit price and line total (hand-derived)', () => {
    const d = parseReceipt(lahoreReceipt());
    expect(d.items).toMatchObject([
      { quantity: 2, unitPrice: 65000, lineTotal: 130000, flags: [], confidence: 'high' },
      { quantity: 1, lineTotal: 185000, flags: [], confidence: 'high' },
      { quantity: 3, unitPrice: 30000, lineTotal: 90000, flags: [], confidence: 'high' },
      { quantity: 1, lineTotal: 35050, flags: [], confidence: 'high' },
      { quantity: 4, unitPrice: 6000, lineTotal: 24000, flags: [], confidence: 'high' },
    ]);
    expect(d.items.reduce((s, i) => s + i.lineTotal, 0)).toBe(LAHORE.itemsTotal);
  });

  it('P8 summary: subtotal, GST 16%, service 10%, total; cash/change ignored', () => {
    const d = parseReceipt(lahoreReceipt());
    expect(d.printedSubtotal).toBe(P(464050));
    expect(d.printedTotal).toBe(P(LAHORE.total));
    expect(d.charges).toMatchObject([
      { kind: 'discount', amount: LAHORE.discount, rateBp: 2000, confidence: 'high' },
      { kind: 'tax', amount: LAHORE.gst, rateBp: 1600, confidence: 'high' },
      { kind: 'service', amount: LAHORE.service, rateBp: 1000, confidence: 'high' },
    ]);
    expect(d.charges).toHaveLength(3);
    // Cash 5,000 / Change 81.07 must not leak anywhere
    expect(JSON.stringify(d.charges)).not.toMatch(/500000|8107/);
  });

  it('P10 all checks pass, in order: subtotal, summary, then line-arithmetic per item with a unit price', () => {
    const d = parseReceipt(lahoreReceipt());
    expect(d.checks.map((c) => c.kind)).toEqual([
      'items-vs-subtotal',
      'summary-vs-total',
      'line-arithmetic', // Zinger
      'line-arithmetic', // Margarita
      'line-arithmetic', // Naan
    ]);
    expect(d.checks.every((c) => c.ok && c.difference === 0)).toBe(true);
    expect(d.checks[1]).toMatchObject({ expected: LAHORE.total, actual: LAHORE.total });
  });

  it('P4 nothing but noise reaches items; the dashes row is not an item', () => {
    const d = parseReceipt(lahoreReceipt());
    expect(d.items).toHaveLength(5);
    expect(d.unparsedRows.join('|')).not.toMatch(/Zinger|Karahi/);
  });

  it('P1 jitter: baseline jitter within tolerance gives the same draft as perfect alignment', () => {
    const clean = parseReceipt(lahoreReceipt('(928.10)'));
    for (const seed of [1, 2, 3, 4, 5]) {
      const jittered = parseReceipt(lahoreReceipt('(928.10)', { jitter: 4, seed }));
      expect(jittered).toEqual(clean);
    }
  });
});
