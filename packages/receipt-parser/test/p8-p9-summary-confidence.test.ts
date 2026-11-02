import { describe, expect, it } from 'vitest';
import { one, row } from './layout';
import { item, parse, unparsedText } from './support';

const it1 = row('Zinger Burger', '1,000');

describe('P8 summary values', () => {
  describe('rate', () => {
    const rates: [string, number | undefined][] = [
      ['GST 16%', 1600],
      ['GST 16.5 %', 1650],
      ['GST 16.5%', 1650],
      ['GST 16.50%', 1650],
      ['GST @ 5 %', 500],
      ['GST 0.5%', 50],
      ['GST 16 %', 1600],
      ['GST 12.345%', undefined], // more than 2 decimals is ignored
      ['GST', undefined],
    ];
    for (const [text, bp] of rates) {
      it(`P8 "${text}" -> rateBp ${bp}`, () => {
        const d = parse([it1, row(text, '160')]);
        expect(d.charges).toHaveLength(1);
        expect(d.charges[0]).toMatchObject({ kind: 'tax', amount: 16000 });
        expect(d.charges[0]?.rateBp).toBe(bp);
      });
    }

    it('P8 service and discount rows carry rates too', () => {
      const d = parse([it1, row('Service Charge 10%', '100'), row('Discount 20%', '200')]);
      expect(d.charges).toMatchObject([
        { kind: 'service', rateBp: 1000, amount: 10000 },
        { kind: 'discount', rateBp: 2000, amount: 20000 },
      ]);
    });

    it('P8 the percentage is never taken as the amount ("GST 16%" alone gives no tax entry with amount 16)', () => {
      const d = parse([it1, row('GST 16%')]);
      expect(d.charges.every((c) => c.amount !== 1600 && c.amount !== 16)).toBe(true);
    });
  });

  describe('sign convention: magnitude only', () => {
    const forms = ['-1,234', '(1,234)', '(1,234.00)', '1,234', '-1234.00'];
    for (const f of forms) {
      it(`P8 discount printed as "${f}" has amount 123400`, () => {
        const d = parse([it1, row('Discount', f)]);
        expect(d.charges).toHaveLength(1);
        expect(d.charges[0]).toMatchObject({ kind: 'discount', amount: 123400 });
        expect(d.charges[0]?.amount).toBeGreaterThan(0);
      });
    }

    it('P8 a minus sign on any summary row is ignored too', () => {
      const d = parse([it1, row('GST 16%', '-160'), row('Grand Total', '-1,160')]);
      expect(d.charges[0]?.amount).toBe(16000);
      expect(d.printedTotal).toBe(116000);
    });
  });

  describe('repeated rows', () => {
    it('P8 several discount rows are separate entries, in document order', () => {
      const d = parse([it1, row('Card Discount 10%', '100'), row('Promo Voucher', '50')]);
      expect(d.charges).toMatchObject([
        { kind: 'discount', amount: 10000, rateBp: 1000 },
        { kind: 'discount', amount: 5000 },
      ]);
    });

    it('P8 several tax rows are separate entries (GST + PST)', () => {
      const d = parse([it1, row('GST 16%', '160'), row('PST 5%', '50')]);
      expect(d.charges.map((c) => [c.kind, c.amount, c.rateBp])).toEqual([
        ['tax', 16000, 1600],
        ['tax', 5000, 500],
      ]);
    });

    it('P8 several service and tip rows are separate entries', () => {
      const d = parse([it1, row('Service Charge', '100'), row('S.Charge', '20'), row('Tip', '30'), row('Gratuity', '40')]);
      expect(d.charges.map((c) => [c.kind, c.amount])).toEqual([
        ['service', 10000],
        ['service', 2000],
        ['tip', 3000],
        ['tip', 4000],
      ]);
    });

    it('P8 duplicate "Total" rows: the LAST wins, earlier ones go to unparsedRows', () => {
      const d = parse([it1, row('Total', '1,111'), row('GST 16%', '160'), row('Grand Total', '1,160')]);
      expect(d.printedTotal).toBe(116000);
      expect(unparsedText(d)).toMatch(/Total/);
      expect(unparsedText(d)).toContain('1,111');
      expect(unparsedText(d)).not.toContain('1,160');
    });

    it('P8 last total wins even when the later one is smaller (position, not magnitude)', () => {
      const d = parse([it1, row('Total', '9,999'), row('Total', '1,000')]);
      expect(d.printedTotal).toBe(100000);
      expect(unparsedText(d)).toContain('9,999');
    });

    it('P8 duplicate subtotal rows: the LAST wins, earlier goes to unparsedRows', () => {
      const d = parse([it1, row('Sub Total', '999'), row('Sub Total', '1,000')]);
      expect(d.printedSubtotal).toBe(100000);
      expect(unparsedText(d)).toContain('999');
      expect(unparsedText(d)).not.toMatch(/1,000/);
    });

    it('P8 three totals: only the last is used, the two earlier ones are unparsed', () => {
      const d = parse([it1, row('Total', '1'), row('Net Total', '2'), row('Grand Total', '3')]);
      expect(d.printedTotal).toBe(300);
      expect(d.unparsedRows).toHaveLength(2);
    });
  });

  describe('entries', () => {
    it('P8 charge has a label from the receipt and the source row text', () => {
      const d = parse([it1, row('GST 16%', '160')]);
      expect(d.charges[0]?.label).toMatch(/gst/i);
      expect(d.charges[0]?.sourceText).toMatch(/GST/);
      expect(d.charges[0]?.sourceText).toContain('160');
    });

    it('P8 a summary row with no amount produces no charge and no printed value', () => {
      const d = parse([it1, one('Sub Total'), one('Discount'), one('Grand Total')]);
      expect(d.charges).toEqual([]);
      expect(d.printedSubtotal).toBeUndefined();
      expect(d.printedTotal).toBeUndefined();
    });
  });
});

describe('P9 confidence', () => {
  const conf = (c: number | undefined) => parse([[{ text: 'Zinger Burger', x: 20, ...(c !== undefined ? { confidence: c } : {}) }, { text: '650', x: 620 }]]);

  it('P9 a line with confidence < 0.6 makes the item low', () => {
    expect(item(conf(0.59), 0).confidence).toBe('low');
    expect(item(conf(0.1), 0).confidence).toBe('low');
    expect(item(conf(0), 0).confidence).toBe('low');
  });

  it('P9 confidence exactly 0.6 or above is high', () => {
    expect(item(conf(0.6), 0).confidence).toBe('high');
    expect(item(conf(0.99), 0).confidence).toBe('high');
    expect(item(conf(1), 0).confidence).toBe('high');
  });

  it('P9 missing confidence is high', () => {
    expect(item(conf(undefined), 0).confidence).toBe('high');
  });

  it('P9 ANY line in the row counts: one bad amount line among good ones makes the row low', () => {
    const d = parse([
      [
        { text: 'Zinger', x: 20, confidence: 0.95 },
        { text: 'Burger', x: 100, confidence: 0.9 },
        { text: '650', x: 620, confidence: 0.3 },
      ],
    ]);
    expect(item(d, 0).confidence).toBe('low');
  });

  it('P9 low confidence on one row does not taint the neighbours', () => {
    const d = parse([
      [{ text: 'Zinger Burger', x: 20, confidence: 0.2 }, { text: '650', x: 620 }],
      row('Fries', '300'),
    ]);
    expect(d.items.map((i) => i.confidence)).toEqual(['low', 'high']);
  });

  it('P9 any flag makes the item low even with perfect OCR confidence', () => {
    const d = parse([[{ text: '2 x Zinger Burger', x: 20, confidence: 1 }, { text: '650', x: 400, confidence: 1 }, { text: '1,400', x: 620, confidence: 1 }]]);
    expect(item(d, 0).flags).toContain('arithmetic');
    expect(item(d, 0).confidence).toBe('low');
  });

  it('P9 low OCR confidence alone does not invent arithmetic/quantity/name flags', () => {
    const f = item(parse([[{ text: 'Zinger Burger', x: 20, confidence: 0.1 }, { text: '650', x: 620 }]]), 0).flags;
    expect(f).not.toContain('arithmetic');
    expect(f).not.toContain('quantity');
    expect(f).not.toContain('name');
  });

  it('P9 summary entries follow the same rule', () => {
    const d = parse([
      it1,
      [{ text: 'GST 16%', x: 20, confidence: 0.4 }, { text: '160', x: 620 }],
      [{ text: 'Service Charge', x: 20 }, { text: '100', x: 620, confidence: 0.59 }],
      row('Tip', '30'),
    ]);
    expect(d.charges.map((c) => c.confidence)).toEqual(['low', 'low', 'high']);
  });
});
