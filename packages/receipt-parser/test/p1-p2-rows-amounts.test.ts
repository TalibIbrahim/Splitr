import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/index';
import { layout, one, row, shuffled, type Cell } from './layout';
import { item, names, parse, P } from './support';

describe('P1 rows', () => {
  it('P1 lines whose centres differ by <= 0.5 x median height share a row (name + amount split into 2 lines, 8px apart)', () => {
    const d = parse([
      [
        { text: 'Zinger', x: 20 },
        { text: 'Burger', x: 100, dy: 8 },
        { text: '650', x: 620, dy: -2 },
      ],
    ]);
    expect(d.items).toHaveLength(1);
    expect(item(d, 0)).toMatchObject({ name: 'Zinger Burger', lineTotal: 65000 });
  });

  it('P1 boundary: centres exactly 0.5 x median apart (10px of 20) are the same row', () => {
    const d = parse([[{ text: 'Burger', x: 20 }, { text: '500', x: 620, dy: 10 }]]);
    expect(d.items).toHaveLength(1);
  });

  it('P1 boundary: centres 11px apart (> 10) are different rows, so there is no item', () => {
    const d = parse([[{ text: 'Burger', x: 20 }, { text: '500', x: 620, dy: 11 }]]);
    expect(d.items).toEqual([]);
  });

  it('P1 tolerance uses the MEDIAN height, not the mean or max (tall header lines must not widen it)', () => {
    // 3 header lines are 80px tall; every other line is 20px => median 20, tolerance 10.
    // "Burger" and "500" are 15 apart: different rows (a mean-based tolerance would merge them).
    const d = parse([
      { cells: one('GRAND HOTEL'), height: 80 },
      { cells: one('Mall Road Lahore'), height: 80 },
      { cells: one('Welcome Guests'), height: 80 },
      row('Karahi', '900'),
      row('Naan', '60'),
      row('Chai', '120'),
      row('Salad', '200'),
      row('Rice', '300'),
      row('Daal', '250'),
      [{ text: 'Burger', x: 20 }, { text: '500', x: 620, dy: 15 }],
    ]);
    expect(names(d)).toEqual(['Karahi', 'Naan', 'Chai', 'Salad', 'Rice', 'Daal']);
  });

  it('P1 rows are ordered top to bottom whatever the input order', () => {
    const rows = [row('Alpha Dish', '100'), row('Bravo Dish', '200'), row('Charlie Dish', '300'), row('Delta Dish', '400')];
    const ocr = layout(rows);
    const rev = { ...ocr, lines: [...ocr.lines].reverse() };
    expect(names(parseReceipt(rev))).toEqual(['Alpha Dish', 'Bravo Dish', 'Charlie Dish', 'Delta Dish']);
  });

  it('P1 lines in a row are joined left to right with a single space', () => {
    const cells: Cell[] = [
      { text: 'Tikka', x: 20 },
      { text: 'Masala', x: 100 },
      { text: 'Special', x: 200 },
      { text: '800', x: 620 },
    ];
    const ocr = layout([cells]);
    for (const seed of [1, 2, 3, 4]) {
      const d = parseReceipt({ ...ocr, lines: shuffled(ocr.lines, seed) });
      expect(item(d, 0).name).toBe('Tikka Masala Special');
      expect(item(d, 0).sourceText.replace(/\s+/g, ' ')).toContain('Tikka Masala Special');
    }
  });
});

const lineTotalOf = (...cells: string[]): number | undefined => {
  const d = parse([row('Burger', ...cells)]);
  return d.items[0]?.lineTotal;
};
const isItem = (...cells: string[]): boolean => parse([row('Burger', ...cells)]).items.length === 1;

describe('P2 amount tokens', () => {
  const ok: [string, number][] = [
    ['500', 50000],
    ['1,234', 123400],
    ['1,234,567', 123456700],
    ['1234.5', 123450],
    ['1234.50', 123450],
    ['1,806.25', 180625],
    ['Rs.1,234', 123400],
    ['Rs1234', 123400],
    ['rs.1234', 123400],
    ['PKR1,234', 123400],
    ['pkr 1,234', 123400],
    ['Rs 1,234', 123400],
    ['Rs. 1,234', 123400],
    ['1,234/-', 123400],
    ['Rs.1,234/-', 123400],
    ['0.50', 50],
    ['99999999', 9999999900],
  ];
  for (const [tok, paisa] of ok) {
    it(`P2 "${tok}" is an amount worth ${paisa} paisa`, () => {
      expect(lineTotalOf(tok)).toBe(paisa);
    });
  }

  it('P2 thousands commas must be groups of 3: "1,23" is not an amount', () => {
    expect(isItem('1,23')).toBe(false);
    expect(isItem('12,34,567')).toBe(false);
    expect(lineTotalOf('1,23', '500')).toBe(50000); // right-most real amount still found
  });

  it('P2 percentages are not amounts ("16%", "16.5%")', () => {
    expect(isItem('16%')).toBe(false);
    expect(isItem('16.5%')).toBe(false);
  });

  it('P2 numbers immediately followed by a letter are not amounts ("2x", "3pcs")', () => {
    expect(isItem('2x')).toBe(false);
    expect(isItem('3pcs')).toBe(false);
  });

  it('P2 dates and times are not amounts', () => {
    expect(isItem('02/11/2026')).toBe(false);
    expect(isItem('21:43')).toBe(false);
    expect(isItem('02-11-2026')).toBe(false);
    expect(isItem('02.11.26')).toBe(false);
  });

  it('P2 >9 digits without commas (phone/invoice) is not an amount; 8 digits is', () => {
    expect(isItem('03001234567')).toBe(false);
    expect(isItem('1234567890')).toBe(false);
    expect(isItem('12345678')).toBe(true);
  });

  it('P2 three decimals are not an amount', () => {
    expect(isItem('1.234')).toBe(false);
  });

  it('P2 line amount is the RIGHT-MOST amount token, regardless of line order in the input', () => {
    const ocr = layout([row('Zinger Burger', '650.00', '1,300.00')]);
    for (const seed of [1, 2, 3]) {
      const d = parseReceipt({ ...ocr, lines: shuffled(ocr.lines, seed) });
      expect(item(d, 0).lineTotal).toBe(P(130000));
    }
  });

  it('P2 conversion is exact integer maths (no float drift): 0.29, 1.15, 4.35, 8.2, 1,000,000.07', () => {
    expect(lineTotalOf('0.29')).toBe(29);
    expect(lineTotalOf('1.15')).toBe(115);
    expect(lineTotalOf('4.35')).toBe(435);
    expect(lineTotalOf('8.2')).toBe(820);
    expect(lineTotalOf('1,000,000.07')).toBe(100000007);
  });
});
