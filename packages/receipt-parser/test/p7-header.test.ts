import { describe, expect, it } from 'vitest';
import { one, row } from './layout';
import { names, parse } from './support';

const withDate = (text: string) => parse([one('Chaman Cafe'), one(text), row('Zinger Burger', '650')]);

describe('P7 date', () => {
  const valid: [string, string][] = [
    ['02/11/2026', '2026-11-02'],
    ['2/11/2026', '2026-11-02'],
    ['02-11-2026', '2026-11-02'],
    ['02.11.2026', '2026-11-02'],
    ['02.11.26', '2026-11-02'],
    ['15.03.99', '2099-03-15'], // two-digit years are 20yy
    ['03/04/2026', '2026-04-03'], // day-first (PK): 3 April, not March 4
    ['13/02/2026', '2026-02-13'],
    ['29/02/2024', '2024-02-29'], // leap day
    ['31/12/2025', '2025-12-31'],
    ['2 Nov 2026', '2026-11-02'],
    ['02 Nov 2026', '2026-11-02'],
    ['15 Mar 2025', '2025-03-15'],
    ['1 Jan 2026', '2026-01-01'],
    ['31 Dec 2026', '2026-12-31'],
  ];
  for (const [text, iso] of valid) {
    it(`P7 "${text}" -> ${iso}`, () => {
      expect(withDate(`Date: ${text}`).date).toBe(iso);
      expect(withDate(text).date).toBe(iso);
    });
  }

  const invalid = ['31/04/2026', '29/02/2025', '00/01/2026', '32/01/2026', '15/00/2026', '31 Feb 2026', '30.02.26'];
  for (const text of invalid) {
    it(`P7 invalid date "${text}" is ignored (no date, no throw)`, () => {
      expect(withDate(`Date: ${text}`).date).toBeUndefined();
    });
  }

  it('P7b invalid day-first but valid month-first uses month-first: "02/13/2026" is 13 Feb 2026, "12/31/2023" is 31 Dec 2023', () => {
    expect(withDate('Date: 02/13/2026').date).toBe('2026-02-13');
    expect(withDate('Date: 12/31/2023').date).toBe('2023-12-31');
  });

  it('P7b day-first still wins when both readings are valid: "02/11/2026" is 2 Nov 2026', () => {
    expect(withDate('Date: 02/11/2026').date).toBe('2026-11-02');
  });

  it('P7 the date is found anywhere, including the footer after the totals', () => {
    const d = parse([one('Chaman Cafe'), row('Zinger Burger', '650'), row('Grand Total', '650'), one('Printed 02/11/2026 21:43')]);
    expect(d.date).toBe('2026-11-02');
  });

  it('P7 date and time on one row: the time does not disturb the date', () => {
    const d = parse([one('Chaman Cafe'), [{ text: '02/11/2026', x: 20 }, { text: '21:43', x: 300 }], row('Fries', '300')]);
    expect(d.date).toBe('2026-11-02');
  });

  it('P7 no date -> undefined', () => {
    expect(parse([one('Chaman Cafe'), row('Fries', '300')]).date).toBeUndefined();
  });

  it('P7 a date row is not an item ("Date 2 Nov 2026" has digit tokens and letters)', () => {
    const d = parse([one('Chaman Cafe'), one('Date: 2 Nov 2026'), row('Fries', '300')]);
    expect(names(d)).toEqual(['Fries']);
  });

  it('P7 the date is exposed as an IsoDate string (YYYY-MM-DD)', () => {
    expect(withDate('02/11/2026').date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('P7 restaurantName', () => {
  it('P7 first header row with >= 3 letters and no amount', () => {
    const d = parse([one('Chaman Cafe'), one('Gulberg Lahore'), row('Fries', '300')]);
    expect(d.restaurantName).toBe('Chaman Cafe');
  });

  it('P7 skips header rows that contain an amount', () => {
    // "Table 5" is an ignore row (P3) that carries an amount and 5 letters: still not a restaurant name
    const d = parse([row('Table', '5'), one('Chaman Cafe'), row('Fries', '300')]);
    expect(d.restaurantName).toBe('Chaman Cafe');
  });

  it('P7 skips rows with fewer than 3 letters', () => {
    const d = parse([one('**'), one('No'), one('Chaman Cafe'), row('Fries', '300')]);
    expect(d.restaurantName).toBe('Chaman Cafe');
  });

  it('P7 prefers the tallest line among the first 3 rows', () => {
    const d = parse([one('Welcome'), { cells: one('Zaika Restaurant'), height: 40 }, one('Tel: 042-35761234'), row('Fries', '300')]);
    expect(d.restaurantName).toBe('Zaika Restaurant');
  });

  it('P7 a tall line beyond the first 3 rows is not preferred', () => {
    const d = parse([
      one('Welcome'),
      one('Gulberg Lahore'),
      one('Tel: 042-35761234'),
      { cells: one('Special Offer Today'), height: 50 },
      row('Fries', '300'),
    ]);
    expect(d.restaurantName).toBe('Welcome');
  });

  it('P7 header rows are only those before the first item: with no header there is no name', () => {
    const d = parse([row('Fries', '300'), one('Chaman Cafe')]);
    expect(d.restaurantName).toBeUndefined();
  });

  it('P7 empty draft has no name and no date', () => {
    const d = parse([]);
    expect(d.restaurantName).toBeUndefined();
    expect(d.date).toBeUndefined();
  });
});
