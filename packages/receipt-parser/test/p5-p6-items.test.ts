import { describe, expect, it } from 'vitest';
import { one, qtyRow, row } from './layout';
import { item, parse } from './support';

const first = (...rows: ReturnType<typeof row>[]) => item(parse(rows), 0);

describe('P5 quantity', () => {
  it('P5(a) leading "2 x" with 2+ amounts sets quantity 2 (unit 650, line 1,300)', () => {
    expect(first(row('2 x Zinger Burger', '650', '1,300'))).toMatchObject({
      name: 'Zinger Burger', quantity: 2, unitPrice: 65000, lineTotal: 130000, flags: [], confidence: 'high',
    });
  });

  it('P5(a) "2x" and "2 ×" prefixes behave the same', () => {
    for (const label of ['2x Zinger Burger', '2 × Zinger Burger', '2X Zinger Burger']) {
      expect(first(row(label, '650', '1,300')), label).toMatchObject({
        name: 'Zinger Burger', quantity: 2, unitPrice: 65000, lineTotal: 130000,
      });
    }
  });

  it('P5(a) a separate integer quantity column "3 | Mint Margarita | 300 | 900" sets quantity 3', () => {
    expect(first(qtyRow('3', 'Mint Margarita', '300', '900'))).toMatchObject({
      name: 'Mint Margarita', quantity: 3, unitPrice: 30000, lineTotal: 90000, flags: [],
    });
  });

  it('P5(b) trailing "x4" / "×4" sets quantity 4', () => {
    for (const label of ['Naan x4', 'Naan ×4', 'Naan X4']) {
      expect(first(row(label, '60', '240')), label).toMatchObject({ name: 'Naan', quantity: 4, lineTotal: 24000 });
    }
  });

  it('P5(b) trailing xN with a single amount keeps that amount as the line total', () => {
    expect(first(row('Naan x4', '240'))).toMatchObject({ name: 'Naan', quantity: 4, lineTotal: 24000 });
  });

  it('P5(c) leading integer + exactly two amounts is qty, unit, line', () => {
    expect(first(row('5 Chai', '120', '600'))).toMatchObject({
      name: 'Chai', quantity: 5, unitPrice: 12000, lineTotal: 60000,
    });
  });

  it('P5(d) otherwise quantity 1 and no unit price', () => {
    const it0 = first(row('Chicken Karahi', '1,850'));
    expect(it0).toMatchObject({ name: 'Chicken Karahi', quantity: 1, lineTotal: 185000, flags: [] });
    expect(it0.unitPrice).toBeUndefined();
  });

  it('P5 unit x quantity must equal the line total, otherwise the item is flagged "arithmetic" and low confidence', () => {
    const it0 = first(row('2 x Zinger Burger', '650', '1,400'));
    expect(it0.flags).toContain('arithmetic');
    expect(it0.confidence).toBe('low');
    expect(it0).toMatchObject({ quantity: 2, unitPrice: 65000, lineTotal: 140000 });
  });

  it('P5 a consistent item has no arithmetic flag even with fractional rupees (3 x 33.33 = 99.99)', () => {
    const it0 = first(row('3 x Samosa', '33.33', '99.99'));
    expect(it0).toMatchObject({ quantity: 3, unitPrice: 3333, lineTotal: 9999, flags: [] });
  });

  it('P5 quantity 0 -> quantity 1 and flag "quantity" (low confidence)', () => {
    const it0 = first(row('0 x Zinger Burger', '650', '650'));
    expect(it0.quantity).toBe(1);
    expect(it0.flags).toContain('quantity');
    expect(it0.confidence).toBe('low');
    expect(it0.lineTotal).toBe(65000);
  });

  it('P5 quantity 1000 -> quantity 1 and flag "quantity"', () => {
    const it0 = first(row('1000 x Pen', '6', '6000'));
    expect(it0.quantity).toBe(1);
    expect(it0.flags).toContain('quantity');
    expect(it0.lineTotal).toBe(600000);
  });

  it('P5 quantity 999 is allowed', () => {
    expect(first(row('999 x Pen', '1', '999'))).toMatchObject({ quantity: 999, unitPrice: 100, lineTotal: 99900, flags: [] });
  });

  it('P5 quantity 1 is allowed and not flagged', () => {
    expect(first(row('1 x Zinger Burger', '650', '650'))).toMatchObject({ quantity: 1, flags: [] });
  });

  it('P5 trailing x0 / x1000 are also out of range', () => {
    for (const label of ['Naan x0', 'Naan x1000']) {
      const it0 = first(row(label, '60', '240'));
      expect(it0.quantity, label).toBe(1);
      expect(it0.flags, label).toContain('quantity');
    }
  });
});

describe('P6 item name', () => {
  it('P6 amount tokens and quantity markers are removed, whitespace collapsed and trimmed', () => {
    expect(first(row('  2  x   Zinger    Burger  ', 'Rs.650', 'Rs.1,300/-')).name).toBe('Zinger Burger');
  });

  it('P6 a name with fewer than 2 letters becomes "Item 1" and is flagged "name" (low confidence)', () => {
    const it0 = first(row('B x2', '100', '200'));
    expect(it0.name).toBe('Item 1');
    expect(it0.flags).toContain('name');
    expect(it0.confidence).toBe('low');
    expect(it0).toMatchObject({ quantity: 2, lineTotal: 20000 });
  });

  it('P6 "2 x B" style (marker removed leaves one letter) is also named "Item n"', () => {
    const it0 = first(row('2 x B', '100', '200'));
    expect(it0.name).toBe('Item 1');
    expect(it0.flags).toContain('name');
  });

  it('P6 n is the 1-based position of the item in the draft', () => {
    const d = parse([row('Zinger Burger', '650'), row('Q x2', '100', '200'), row('Fries', '300')]);
    expect(d.items.map((i) => i.name)).toEqual(['Zinger Burger', 'Item 2', 'Fries']);
    expect(d.items[1]?.flags).toContain('name');
    expect(d.items[0]?.flags).not.toContain('name');
  });

  it('P6 sourceText keeps the original row text', () => {
    const it0 = first(row('2 x Zinger Burger', '650', '1,300'));
    expect(it0.sourceText).toContain('Zinger Burger');
    expect(it0.sourceText).toContain('1,300');
  });

  it('P6 multi-flag items list every flag', () => {
    const it0 = first(row('0 x B', '100', '300'));
    expect(it0.flags).toEqual(expect.arrayContaining(['quantity', 'name']));
  });

  it('P6 digits inside names survive ("Coke 345ml" keeps "345ml": a number followed by a letter is not an amount)', () => {
    expect(first(row('Coke 345ml', '120')).name).toBe('Coke 345ml');
  });

  it('P6 a lone amount row has no item', () => {
    expect(parse([one('1,300')]).items).toEqual([]);
  });
});
