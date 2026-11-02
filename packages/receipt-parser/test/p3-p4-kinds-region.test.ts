import { describe, expect, it } from 'vitest';
import { one, row } from './layout';
import { names, parse, unparsedText } from './support';

const base = [row('Zinger Burger', '650')];

describe('P3 row kinds (first match wins, in table order)', () => {
  const summary: [string, string, string][] = [
    // text, expected kind, bucket
    ['Sub Total', 'subtotal', 'sub'],
    ['SubTotal', 'subtotal', 'sub'],
    ['Sub-Total', 'subtotal', 'sub'],
    ['Sub - Total', 'subtotal', 'sub'],
    ['Total Before Tax', 'subtotal', 'sub'],
    ['Gross Amount', 'subtotal', 'sub'],
    ['Discount', 'discount', 'charge'],
    ['Disc 10%', 'discount', 'charge'],
    ['20% Off', 'discount', 'charge'],
    ['Promo Code', 'discount', 'charge'],
    ['Voucher', 'discount', 'charge'],
    ['GST 16%', 'tax', 'charge'],
    ['PST', 'tax', 'charge'],
    ['FED', 'tax', 'charge'],
    ['VAT', 'tax', 'charge'],
    ['Sales Tax', 'tax', 'charge'],
    ['Tax', 'tax', 'charge'],
    ['Service Charge', 'service', 'charge'],
    ['S.Charge', 'service', 'charge'],
    ['S Charge', 'service', 'charge'],
    ['SVC 10%', 'service', 'charge'],
    ['Tip', 'tip', 'charge'],
    ['Gratuity', 'tip', 'charge'],
    ['Grand Total', 'total', 'total'],
    ['Net Total', 'total', 'total'],
    ['Net Payable', 'total', 'total'],
    ['Amount Payable', 'total', 'total'],
    ['Amount Due', 'total', 'total'],
    ['Bill Total', 'total', 'total'],
    ['Total', 'total', 'total'],
    ['TOTAL', 'total', 'total'],
  ];
  for (const [text, kind, bucket] of summary) {
    it(`P3 "${text}" is a ${kind} row (keywords are case-insensitive)`, () => {
      for (const t of [text, text.toLowerCase()]) {
        const d = parse([...base, row(t, '500')]);
        expect(d.items, t).toHaveLength(1);
        if (bucket === 'sub') expect(d.printedSubtotal, t).toBe(50000);
        else if (bucket === 'total') expect(d.printedTotal, t).toBe(50000);
        else {
          expect(d.charges, t).toHaveLength(1);
          expect(d.charges[0]?.kind, t).toBe(kind);
          expect(d.charges[0]?.amount, t).toBe(50000);
        }
      }
    });
  }

  const ignored = [
    'Cash',
    'Change',
    'Tendered',
    'Balance',
    'Card No xxxx',
    'Paid',
    'Visa',
    'MasterCard',
    'NTN',
    'STRN',
    'POS Fee',
    'Invoice',
    'Table',
    'Cover',
    'Waiter',
    'Server',
    'Thank you',
  ];
  for (const text of ignored) {
    it(`P3 "${text} 5,000" is ignore: it is never an item, charge, subtotal or total`, () => {
      const d = parse([...base, row('Sub Total', '650'), row(text, '5,000'), row('Grand Total', '650')]);
      expect(d.items).toHaveLength(1);
      expect(d.charges).toEqual([]);
      expect(d.printedSubtotal).toBe(65000);
      expect(d.printedTotal).toBe(65000);
    });
  }

  it('P3 ignore wins over total: "Total Paid" / "Total Cash" are not the total', () => {
    const d = parse([...base, row('Grand Total', '650'), row('Total Paid', '1,000'), row('Total Cash', '2,000')]);
    expect(d.printedTotal).toBe(65000);
  });

  it('P3 subtotal wins over total: "Sub Total" is not a total', () => {
    const d = parse([...base, row('Sub Total', '650')]);
    expect(d.printedSubtotal).toBe(65000);
    expect(d.printedTotal).toBeUndefined();
  });

  it('P3 discount wins over total and tax wins over service ("Total Discount", "Service Tax")', () => {
    const d = parse([...base, row('Total Discount', '50'), row('Service Tax 5%', '30')]);
    expect(d.printedTotal).toBeUndefined();
    expect(d.charges.map((c) => c.kind)).toEqual(['discount', 'tax']);
  });

  it('P3 "off" and "disc" are word-bounded: "Coffee 300" is an item, not a discount', () => {
    const d = parse([row('Coffee', '300'), row('Discotheque Chai', '120')]);
    expect(names(d)).toEqual(['Coffee', 'Discotheque Chai']);
    expect(d.charges).toEqual([]);
  });

  it('P3 "tax" / "tip" / "fed" / "pst" / "vat" are word-bounded ("Tipsy Mocktail", "Fedora Cake" are items)', () => {
    const d = parse([row('Tipsy Mocktail', '400'), row('Fedora Cake', '500'), row('Pasta', '700')]);
    expect(names(d)).toEqual(['Tipsy Mocktail', 'Fedora Cake', 'Pasta']);
    expect(d.charges).toEqual([]);
  });

  it('P3 item needs a line amount and >= 2 letters; other rows are text', () => {
    const d = parse([one('Welcome to our restaurant'), row('Zinger Burger', '650'), row('B', '100'), row('Fries', '')]);
    expect(names(d)).toEqual(['Zinger Burger']);
  });
});

describe('P4 item region', () => {
  it('P4 item-shaped rows after the first summary row go to unparsedRows, not items', () => {
    const d = parse([row('Zinger Burger', '650'), row('Sub Total', '650'), row('Late Soda', '120'), row('Grand Total', '650')]);
    expect(names(d)).toEqual(['Zinger Burger']);
    expect(unparsedText(d)).toContain('Late Soda');
  });

  it('P4 every summary kind closes the item region (discount, tax, service, tip, total)', () => {
    for (const closer of ['Discount', 'GST 16%', 'Service Charge', 'Tip', 'Grand Total', 'Sub Total']) {
      const d = parse([row('Zinger Burger', '650'), row(closer, '50'), row('Late Soda', '120')]);
      expect(names(d), closer).toEqual(['Zinger Burger']);
      expect(unparsedText(d), closer).toContain('Late Soda');
    }
  });

  it('P4 a summary row BEFORE any item pushes every later item to unparsedRows', () => {
    const d = parse([row('Grand Total', '650'), row('Zinger Burger', '650'), row('Fries', '300')]);
    expect(d.items).toEqual([]);
    expect(unparsedText(d)).toContain('Zinger Burger');
    expect(unparsedText(d)).toContain('Fries');
  });

  it('P4 ignore rows do not close the item region ("Table 4" between header and items)', () => {
    const d = parse([one('Chaman Cafe'), row('Table 4', '4'), row('Zinger Burger', '650'), row('Waiter Ali', '1'), row('Fries', '300')]);
    expect(names(d)).toEqual(['Zinger Burger', 'Fries']);
  });

  it('P4 items after the summary do not alter the items-vs-subtotal check', () => {
    const d = parse([row('Zinger Burger', '650'), row('Sub Total', '650'), row('Late Soda', '120')]);
    expect(d.checks.find((c) => c.kind === 'items-vs-subtotal')).toMatchObject({ ok: true, actual: 65000 });
  });
});
