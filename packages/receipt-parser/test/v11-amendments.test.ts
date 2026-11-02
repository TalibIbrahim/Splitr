/** Phase 2 spec §3.1 (v1.1) amendments: P2b, P3a, P5a, P6a, P10a. */
import { describe, expect, it } from 'vitest';
import { one, row } from './layout';
import { item, names, parse } from './support';

describe('P2b trailing amount', () => {
  it('P2b "12 MM Alam Road" has no line amount and is not an item', () => {
    const d = parse([one('BURGER SHACK'), one('12 MM Alam Road'), row('Fries', '300')]);
    expect(names(d)).toEqual(['Fries']);
    expect(d.restaurantName).toBe('BURGER SHACK');
  });

  it('P2b the right-most amount must END the row: "Fries 300 extra" and "Coke 345 ml" are not items', () => {
    expect(parse([one('Fries 300 extra')]).items).toEqual([]);
    expect(parse([one('Coke 345 ml')]).items).toEqual([]);
  });

  it('P2b a trailing "/-" is allowed ("Fries 300/-", "Fries 300 /-")', () => {
    for (const t of ['Fries 300/-', 'Fries 300 /-', 'Fries Rs.300/-']) {
      expect(item(parse([one(t)]), 0).lineTotal, t).toBe(30000);
    }
  });

  it('P2b a trailing "Rs" or "PKR" is ignored ("Fries 300 Rs", "Fries 300 PKR")', () => {
    for (const t of ['Fries 300 Rs', 'Fries 300 PKR', 'Fries 300 rs']) {
      expect(item(parse([one(t)]), 0).lineTotal, t).toBe(30000);
    }
  });

  it('P2b "Date: 2 Nov 2026" is not an item (digits inside a recognised date are never amounts) and the date is still read', () => {
    const d = parse([one('Chaman Cafe'), one('Date: 2 Nov 2026'), row('Fries', '300')]);
    expect(names(d)).toEqual(['Fries']);
    expect(d.date).toBe('2026-11-02');
  });

  it('P2b digits of every P7 date format are not amounts, even as the last token of the row', () => {
    for (const t of ['Date 02/11/2026', 'Date 02-11-2026', 'Date 02.11.26', 'Date 2 Nov 2026', 'Served 15 Mar 2025']) {
      expect(parse([one(t)]).items, t).toEqual([]);
    }
  });

  it('P2b a real amount after a date on the same row is still the line amount', () => {
    const d = parse([one('Chaman Cafe'), one('Fries 2 Nov 2026 300')]);
    expect(d.items[0]?.lineTotal).toBe(30000);
  });
});

describe('P3a ignore keywords match whole words', () => {
  it('P3a "Chicken Tender 650" is an item', () => {
    const d = parse([row('Chicken Tender', '650')]);
    expect(d.items).toMatchObject([{ name: 'Chicken Tender', lineTotal: 65000 }]);
  });

  it('P3a "Cash Tendered 5,000" is ignored (never an item or a total), before and after the summary', () => {
    const d = parse([row('Zinger Burger', '650'), row('Cash Tendered', '5,000'), row('Fries', '300'), row('Grand Total', '950'), row('Cash Tendered', '5,000')]);
    expect(names(d)).toEqual(['Zinger Burger', 'Fries']);
    expect(d.printedTotal).toBe(95000);
    expect(d.charges).toEqual([]);
  });

  it('P3a "Vegetable Soup 250" is not ignored (table is inside "vegetable")', () => {
    expect(names(parse([row('Vegetable Soup', '250')]))).toEqual(['Vegetable Soup']);
  });

  it('P3a other embedded keywords stay items: Cashew Nuts, Posh Burger, Tableside Guacamole, Coverage Platter, Balanced Diet Bowl', () => {
    const d = parse([
      row('Cashew Nuts', '400'),
      row('Posh Burger', '500'),
      row('Tableside Guacamole', '450'),
      row('Coverage Platter', '300'),
      row('Balanced Diet Bowl', '350'),
    ]);
    expect(names(d)).toEqual(['Cashew Nuts', 'Posh Burger', 'Tableside Guacamole', 'Coverage Platter', 'Balanced Diet Bowl']);
  });

  it('P3a whole-word ignore keywords still ignore ("Cash 5,000", "Table 4", "POS Fee 10", "Card No xxxx 1234", "Paid 650")', () => {
    for (const t of ['Cash', 'Table', 'POS Fee', 'Card No xxxx', 'Paid', 'Change']) {
      const d = parse([row('Zinger Burger', '650'), row(t, '5,000')]);
      expect(names(d), t).toEqual(['Zinger Burger']);
    }
  });

  it('P3a prefix matches for thank and master: "Thanks 100", "Thankyou 100", "Mastercard 5,000", "Master Card 5,000"', () => {
    for (const t of ['Thanks', 'Thankyou', 'Thank you', 'Mastercard', 'MasterCard', 'Master Card']) {
      const d = parse([row('Zinger Burger', '650'), row(t, '5,000')]);
      expect(names(d), t).toEqual(['Zinger Burger']);
    }
  });
});

describe('P5a conservative quantity', () => {
  it('P5a "7 Up 150" -> name "7 Up", quantity 1, line total 150', () => {
    const it0 = item(parse([row('7 Up', '150')]), 0);
    expect(it0).toMatchObject({ name: '7 Up', quantity: 1, lineTotal: 15000, flags: [] });
    expect(it0.unitPrice).toBeUndefined();
  });

  it('P5a "3 Garlic Naan 80 240" (3 numeric tokens, 3 x 80 = 240) -> quantity 3, unit 80', () => {
    expect(item(parse([row('3 Garlic Naan', '80', '240')]), 0)).toMatchObject({
      name: 'Garlic Naan', quantity: 3, unitPrice: 8000, lineTotal: 24000, flags: [],
    });
  });

  it('P5a "2 x Seekh 2,900" (explicit marker, single amount) -> quantity 2, line total 2,900', () => {
    const it0 = item(parse([row('2 x Seekh', '2,900')]), 0);
    expect(it0).toMatchObject({ name: 'Seekh', quantity: 2, lineTotal: 290000 });
  });

  it('P5a bare leading integer whose arithmetic does not hold stays in the name ("3 Garlic Naan 80 250" -> quantity 1)', () => {
    const it0 = item(parse([row('3 Garlic Naan', '80', '250')]), 0);
    expect(it0.quantity).toBe(1);
    expect(it0.name.startsWith('3 Garlic Naan')).toBe(true);
    expect(it0.lineTotal).toBe(25000);
  });

  it('P5a bare leading integer with only 2 numeric tokens stays in the name ("2 Chicken Karahi 1,850")', () => {
    const it0 = item(parse([row('2 Chicken Karahi', '1,850')]), 0);
    expect(it0).toMatchObject({ name: '2 Chicken Karahi', quantity: 1, lineTotal: 185000 });
  });

  it('P5a a separate bare quantity column needs the arithmetic too ("4 | Naan | 60 | 250" is not quantity 4)', () => {
    const it0 = item(parse([[{ text: '4', x: 20 }, { text: 'Naan', x: 70 }, { text: '60', x: 470 }, { text: '250', x: 620 }]]), 0);
    expect(it0.quantity).toBe(1);
    expect(it0.lineTotal).toBe(25000);
  });

  it('P5a explicit markers always count, even when the arithmetic fails (flagged arithmetic)', () => {
    for (const t of ['2 x Zinger Burger', '2x Zinger Burger', '2 × Zinger Burger', 'Zinger Burger x2', 'Zinger Burger ×2']) {
      const it0 = item(parse([row(t, '650', '1,400')]), 0);
      expect(it0.quantity, t).toBe(2);
      expect(it0.flags, t).toContain('arithmetic');
    }
  });

  it('P5a "Naan x4 240" explicit trailing marker, single amount', () => {
    expect(item(parse([row('Naan x4', '240')]), 0)).toMatchObject({ name: 'Naan', quantity: 4, lineTotal: 24000 });
  });
});

describe('P6a only consumed tokens are removed from the name', () => {
  it('P6a "7 Up 150": the leading 7 is part of the name', () => {
    expect(item(parse([row('7 Up', '150')]), 0).name).toBe('7 Up');
  });

  it('P6a a size number that is not a quantity/unit/line stays ("Pizza 12 inch 1,200")', () => {
    const it0 = item(parse([row('Pizza 12 inch', '1,200')]), 0);
    expect(it0.name).toBe('Pizza 12 inch');
    expect(it0.lineTotal).toBe(120000);
    expect(it0.quantity).toBe(1);
  });

  it('P6a consumed qty marker, unit and line are removed ("3 Garlic Naan 80 240" -> "Garlic Naan")', () => {
    expect(item(parse([row('3 Garlic Naan', '80', '240')]), 0).name).toBe('Garlic Naan');
  });

  it('P6a consumed explicit markers are removed ("2 x Seekh 2,900" -> "Seekh"; "Naan x4 240" -> "Naan")', () => {
    expect(item(parse([row('2 x Seekh', '2,900')]), 0).name).toBe('Seekh');
    expect(item(parse([row('Naan x4', '240')]), 0).name).toBe('Naan');
  });
});

describe('P10a check orientation: expected = printed, actual = computed', () => {
  it('P10a items-vs-subtotal: expected = printed subtotal 1,000, actual = Σ items 950, difference -50', () => {
    const d = parse([row('Zinger Burger', '650'), row('Fries', '300'), row('Sub Total', '1,000')]);
    expect(d.checks[0]).toMatchObject({ kind: 'items-vs-subtotal', expected: 100000, actual: 95000, difference: -5000, ok: false });
  });

  it('P10a summary-vs-total: expected = printed total, actual = computed (items 950 + GST 152 = 1,102 vs printed 1,100 -> +2)', () => {
    const d = parse([row('Zinger Burger', '650'), row('Fries', '300'), row('GST 16%', '152'), row('Grand Total', '1,100')]);
    expect(d.checks[0]).toMatchObject({ kind: 'summary-vs-total', expected: 110000, actual: 110200, difference: 200, ok: false });
  });

  it('P10a line-arithmetic: expected = printed lineTotal 1,400, actual = qty x unit = 1,300, difference -100', () => {
    const d = parse([row('2 x Zinger Burger', '650', '1,400')]);
    expect(d.checks).toHaveLength(1);
    expect(d.checks[0]).toMatchObject({ kind: 'line-arithmetic', expected: 140000, actual: 130000, difference: -10000, ok: false });
  });
});
