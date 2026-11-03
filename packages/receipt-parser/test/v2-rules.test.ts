/**
 * Parser v2 rules P13-P20 (docs/phase2b-spec.md section 1), one focused test (or table) per rule, small synthetic layouts.
 * Expectations are hand-derived from the spec; nothing here was read from the implementation.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { layout, layoutVisual, one, row, Sec, shuffled, V, type Cell } from './layout';
import { itemNames, parseLoose, parseRows } from './support-v2';

const c = (text: string, x: number): Cell => ({ text, x });
/** Right-aligned numeric cells: the last one sits at x=620, the others 80px apart to its left. */
const nums = (...vals: string[]): Cell[] => vals.map((v, i) => c(v, 620 - 80 * (vals.length - 1 - i)));
/** name at the left + numeric columns */
const r = (name: string, ...vals: string[]): Cell[] => [c(name, 20), ...nums(...vals)];
/** column header row: label at left + numeric column labels */
const hdr = (first: string, ...labels: string[]): Cell[] => [c(first, 20), ...nums(...labels)];
/** two summary entries on one visual line: left label/amount, right label/amount */
const pair = (l1: string, a1: string, l2: string, a2: string): Cell[] => [c(l1, 20), c(a1, 250), c(l2, 400), c(a2, 620)];
const NAME = (): Cell[] => one('CAFE ROYAL');

// ───────────────────────── P13 column header row ─────────────────────────
describe('P13 column header row', () => {
  it('P13 a header row containing "total" is never a summary row: items after it are kept', () => {
    const d = parseRows([NAME(), hdr('Description', 'Qty', 'Rate', 'Total'), r('Burger', '2', '300', '600'), r('Fries', '1', '150', '150'), row('Sub Total', '750')]);
    expect(itemNames(d)).toEqual(['Burger', 'Fries']);
    expect(d.printedSubtotal).toBe(75000);
    expect(d.printedTotal).toBeUndefined();
  });

  it('P13 keywords are case-insensitive whole words, "amoun" counts: QTY + AMOUN is a header', () => {
    const d = parseRows([NAME(), hdr('ITEM DESCRIPTION', 'QTY', 'AMOUN'), r('Burger', '2', '600'), row('Sub Total', '600')]);
    expect(d.items).toMatchObject([{ name: 'Burger', quantity: 2, lineTotal: 60000 }]);
  });

  it('P13 a row with a single header word is not a header: "Total 500" stays a summary row', () => {
    const d = parseRows([NAME(), row('Burger', '500'), row('Total', '500')]);
    expect(d.printedTotal).toBe(50000);
    expect(itemNames(d)).toEqual(['Burger']);
  });

  it('P13 rows before the header are header-area text and never items, even when they end with an amount', () => {
    const d = parseRows([NAME(), row('Kitchen Copy', '500'), row('Ref Slip', '77'), hdr('Description', 'Qty', 'Amount'), r('Burger', '1', '450'), row('Sub Total', '450')]);
    expect(itemNames(d)).toEqual(['Burger']);
  });

  it('P13 the item region ends at the first summary row: item-shaped rows after it are not items', () => {
    const d = parseRows([NAME(), hdr('Description', 'Qty', 'Amount'), r('Burger', '1', '450'), row('Sub Total', '450'), row('Extra Thing', '99')]);
    expect(itemNames(d)).toEqual(['Burger']);
  });

  it('P13 numeric columns are mapped in header order: Qty Rate Amount and Rate Qty Amount give the same item', () => {
    const a = parseRows([NAME(), hdr('Description', 'Qty', 'Rate', 'Amount'), r('Karahi', '2', '1,000', '2,000'), row('Sub Total', '2,000')]);
    const b = parseRows([NAME(), hdr('Description', 'Rate', 'Qty', 'Amount'), r('Karahi', '1,000', '2', '2,000'), row('Sub Total', '2,000')]);
    for (const d of [a, b]) expect(d.items).toMatchObject([{ name: 'Karahi', quantity: 2, unitPrice: 100000, lineTotal: 200000 }]);
  });

  it('P13/P14 with a header the columns decide, not a search: Qty 2, Rate 300, Amount 650 is flagged arithmetic and keeps the printed amount', () => {
    const d = parseRows([NAME(), hdr('Description', 'Qty', 'Rate', 'Amount'), r('Dish', '2', '300', '650'), row('Sub Total', '650')]);
    expect(d.items[0]).toMatchObject({ quantity: 2, lineTotal: 65000 });
    expect(d.items[0]?.flags).toContain('arithmetic');
  });

  it('P4 (no header) items are the item-shaped rows before the first summary row', () => {
    const d = parseRows([NAME(), row('Burger', '450'), row('Fries', '150'), row('Sub Total', '600'), row('Late Row', '12')]);
    expect(itemNames(d)).toEqual(['Burger', 'Fries']);
  });
});

// ───────────────────────── P14 numeric tokens ─────────────────────────
describe('P14 numeric tokens in item rows', () => {
  it('P14 with a header the LAST k tokens map to the header columns; digits in the name stay in the name ("7 Up 2 300")', () => {
    const d = parseRows([NAME(), hdr('Description', 'Qty', 'Amount'), r('7 Up', '2', '300'), r('Burger', '1', '450'), row('Sub Total', '750')]);
    expect(d.items[0]).toMatchObject({ name: '7 Up', quantity: 2, lineTotal: 30000 });
    expect(d.items[0]?.unitPrice).toBeUndefined();
  });

  it('P14 header with a gst column: line total is the printed Total column, unitPrice is not set (OPTP)', () => {
    const d = parseRows([
      NAME(),
      hdr('Description', 'Price', 'Qty', 'Tax%', 'GST', 'Total'),
      r('Jum Nuggets', '1000', '1', '5.00', '50', '1050'),
      r('Chk Fillet', '619', '1', '5.00', '31', '650'),
      row('Total Net Amount', '1,619'),
    ]);
    expect(d.items).toMatchObject([
      { name: 'Jum Nuggets', quantity: 1, lineTotal: 105000 },
      { name: 'Chk Fillet', quantity: 1, lineTotal: 65000 },
    ]);
    for (const it of d.items) expect(it.unitPrice).toBeUndefined();
  });

  it('P14 a decimal with an all-zero fraction is an integer quantity: "Soup 2.00 3970" under Qty | Value', () => {
    const d = parseRows([NAME(), hdr('Item Name', 'Qty', 'Value'), r('Soup', '2.00', '3970'), r('Tea', '1.00', '120'), row('Sub Total', '4090')]);
    expect(d.items).toMatchObject([
      { name: 'Soup', quantity: 2, lineTotal: 397000 },
      { name: 'Tea', quantity: 1, lineTotal: 12000 },
    ]);
  });

  it('P14 no header: (q, u, l) found from the right: "Naan 2.00 60 120" -> qty 2, unit 60, line 120', () => {
    const d = parseRows([NAME(), r('Naan', '2.00', '60', '120'), row('Sub Total', '120')]);
    expect(d.items[0]).toMatchObject({ name: 'Naan', quantity: 2, unitPrice: 6000, lineTotal: 12000 });
  });

  it('P14 no header: (u, q, l) is also accepted: "Karahi 1,850 2 3,700" -> qty 2, unit 1,850, line 3,700 (1,850 is not a valid quantity)', () => {
    const d = parseRows([NAME(), r('Karahi', '1,850', '2', '3,700'), row('Sub Total', '3,700')]);
    expect(d.items[0]).toMatchObject({ name: 'Karahi', quantity: 2, unitPrice: 185000, lineTotal: 370000 });
  });

  it('P14 the first match from the right wins: tokens 3 2 6 12 -> (2, 6, 12), not (3, 2, 6)', () => {
    const d = parseRows([NAME(), r('Combo', '3', '2', '6', '12'), row('Sub Total', '12')]);
    expect(d.items[0]).toMatchObject({ quantity: 2, unitPrice: 600, lineTotal: 1200 });
  });

  it('P14 no match: the line total is the right-most token and quantity is 1 ("Fish 2 3 100")', () => {
    const d = parseRows([NAME(), r('Fish', '2', '3', '100'), row('Sub Total', '100')]);
    expect(d.items[0]).toMatchObject({ quantity: 1, lineTotal: 10000 });
  });

  it('P14 quantity must be 1..999: "Fish 1000 2 2000" is not read as qty 1000', () => {
    const d = parseRows([NAME(), r('Fish', '1000', '2', '2000'), row('Sub Total', '2000')]);
    expect(d.items[0]?.lineTotal).toBe(200000);
    // (u=1000, q=2, l=2000) is a valid (u, q, l) reading: quantity 2, never 1000
    expect(d.items[0]?.quantity).toBe(2);
  });
});

// ───────────────────────── P15 item codes ─────────────────────────
describe('P15 item codes', () => {
  const codeHeader = (): Cell[] => [c('C.No', 20), c('Item Name', 90), c('Qty', 420), c('Rate', 520), c('Value', 620)];
  const codeRow = (code: string, name: string, q: string, u: string, l: string): Cell[] => [c(code, 20), c(name, 90), c(q, 430), c(u, 520), c(l, 620)];

  it('P15 header with a C.No column: numeric and uppercase-letter codes are stripped from names (164 / WB)', () => {
    const d = parseRows([
      NAME(),
      codeHeader(),
      codeRow('164', 'White Chicken Boti', '2', '1,075', '2,150'),
      codeRow('WB', 'Woven Bag', '2', '19', '38'),
      row('Total Value', '2,188'),
    ]);
    expect(d.items).toMatchObject([
      { name: 'White Chicken Boti', quantity: 2, unitPrice: 107500, lineTotal: 215000 },
      { name: 'Woven Bag', quantity: 2, unitPrice: 1900, lineTotal: 3800 },
    ]);
  });

  it('P15 no code header but 2+ rows start with a code token followed by letters: codes are stripped', () => {
    const d = parseRows([NAME(), row('101 Zinger Burger', '450'), row('102 Fries', '150'), row('Sub Total', '600')]);
    expect(itemNames(d)).toEqual(['Zinger Burger', 'Fries']);
    expect(d.items.map((i) => i.lineTotal)).toEqual([45000, 15000]);
  });

  it('P15 uppercase-letter codes (1-3 letters) count the same way when 2+ rows have them', () => {
    const d = parseRows([NAME(), row('WB Woven Bag', '38'), row('CH Chai', '60'), row('Sub Total', '98')]);
    expect(itemNames(d)).toEqual(['Woven Bag', 'Chai']);
  });

  it('P15 a single row starting with a number keeps it ("7 Up")', () => {
    const d = parseRows([NAME(), row('7 Up', '150'), row('Fries', '150'), row('Sub Total', '300')]);
    expect(itemNames(d)).toEqual(['7 Up', 'Fries']);
  });

  it('P15 a row holding only a code-shaped token ("2.230") is ignored: no item, no wrapped name, no lost neighbour', () => {
    const d = parseRows([NAME(), row('Alfredo Pasta', '950'), one('2.230'), row('Fries', '145'), one('2.245'), row('Sub Total', '1,095')]);
    expect(itemNames(d)).toEqual(['Alfredo Pasta', 'Fries']);
    expect(d.items.reduce((s, i) => s + i.lineTotal, 0)).toBe(109500);
  });
});

// ───────────────────────── P16 wrapped names ─────────────────────────
describe('P16 wrapped names', () => {
  const TIGHT = { pitch: 30 }; // vertical gap 1.5 x line height (<= 1.6)
  const FAR = { pitch: 80 };

  it('P16 an amount-less row directly below an item row (gap <= 1.6 x line height) is appended to the name', () => {
    const d = parseLoose(layout([NAME(), row('CHEESY MUSHROOM (BEEF)', '660'), one('HALF CUT +'), row('Fries', '145'), row('Sub Total', '805')], TIGHT));
    expect(itemNames(d)).toEqual(['CHEESY MUSHROOM (BEEF) HALF CUT +', 'Fries']);
    expect(d.items.map((i) => i.lineTotal)).toEqual([66000, 14500]);
  });

  it('P16 at most ONE continuation per item; further amount-less rows are ignored (not items, not part of the name)', () => {
    const d = parseLoose(layout([NAME(), row('Alfredo Pasta', '950'), one('ALL SIDES'), one('EXTRA CHEESE'), row('Fries', '145'), row('Sub Total', '1,095')], TIGHT));
    expect(itemNames(d)).toEqual(['Alfredo Pasta ALL SIDES', 'Fries']);
  });

  it('P16 a row farther than 1.6 x line height is not a continuation and is not an item', () => {
    const d = parseLoose(layout([NAME(), row('Alfredo Pasta', '950'), one('Burgers'), row('Fries', '145'), row('Sub Total', '1,095')], FAR));
    expect(itemNames(d)).toEqual(['Alfredo Pasta', 'Fries']);
  });

  it('P16 a category heading above the first item is not part of any name', () => {
    const d = parseLoose(layout([NAME(), one('Burgers'), row('Zinger', '450'), row('Sub Total', '450')], TIGHT));
    expect(itemNames(d)).toEqual(['Zinger']);
  });

  it('P16 a continuation row needs 2+ letters ("+" alone is not appended)', () => {
    const d = parseLoose(layout([NAME(), row('Zinger', '450'), one('+'), row('Sub Total', '450')], TIGHT));
    expect(itemNames(d)).toEqual(['Zinger']);
  });
});

// ───────────────────────── P17 Pakistani summary wording ─────────────────────────
describe('P17 Pakistani summary wording', () => {
  const base = (...mid: Cell[][]): Cell[][] => [NAME(), row('Zinger Burger', '450'), ...mid, row('Fries', '150'), row('Sub Total', '600')];

  const IGNORE: [string, string][] = [
    ['Table', '5'], ['Token :', '32'], ['Inv', '6,149'], ['Invoice', '6149'], ['Order', '77'], ['KOT', '12'], ['Host', '5'],
    ['Term', '2'], ['Terminal', '2'], ['Cover', '4'], ['Guest', '2'], ['Cashier', '7'], ['Shift', '3'], ['Chq#', '1000'],
    ['Bill No', '1234'], ['Payment Mode', '5'], ['Credit Card', '5'], ['Items:', '9'], ['No of Items', '9'], ['Signature', '5'],
    ['Download', '5'], ['Powered by', '5'], ['Software', '5'], ['FBR', '123'], ['PRA', '123'], ['PNTN', '1234567'], ['CNIC', '123'],
    ['Mobile', '5'], ['Order Taker', '5'], ['Counter Manager', '5'],
  ];
  it.each(IGNORE)('P17 ignore: a "%s %s" row is neither an item nor a charge', (label, amount) => {
    const d = parseRows(base(row(label, amount)));
    expect(itemNames(d)).toEqual(['Zinger Burger', 'Fries']);
    expect(d.charges).toEqual([]);
    expect(d.printedSubtotal).toBe(60000);
  });

  it('P17 ignore: "RUPEES ... ONLY" is not an item', () => {
    const d = parseRows(base(one('RUPEES SEVEN THOUSAND SIX HUNDRED FIFTY ONLY')));
    expect(itemNames(d)).toEqual(['Zinger Burger', 'Fries']);
  });

  const SUBTOTAL = ['Total Value', 'G.Amount', 'G Amount', 'Gross Amount', 'Bill Amt W/O Tax', 'Amount W/O Tax', 'Total Net Amount'];
  it.each(SUBTOTAL)('P17 subtotal wording "%s"', (label) => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row(label, '1,000')]);
    expect(d.printedSubtotal).toBe(100000);
    expect(d.printedTotal).toBeUndefined();
    expect(itemNames(d)).toEqual(['Zinger Burger']);
  });

  const TOTAL = ['Net Amount', 'Payable', 'Amt With Tax', 'Amount With Tax', 'G. Total', 'Grand Total'];
  it.each(TOTAL)('P17 total wording "%s"', (label) => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row(label, '1,000')]);
    expect(d.printedTotal).toBe(100000);
    expect(d.printedSubtotal).toBeUndefined();
    expect(itemNames(d)).toEqual(['Zinger Burger']);
  });

  it('P17/P8 the LAST total wins; an earlier "Grand Total" printed before the service charge goes to unparsedRows', () => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row('Sub Total', '1,000'), row('Grand Total', '1,000'), row('Service Charges', '100'), row('G. Total', '1,100')]);
    expect(d.printedTotal).toBe(110000);
    expect(d.charges).toMatchObject([{ kind: 'service', amount: 10000 }]);
    expect(d.charges).toHaveLength(1);
    expect(d.unparsedRows.join('\n')).toMatch(/Grand Total/);
  });

  it.each(['P.S.T', 'PST', 'G.S.T', 'GST', 'Sale Tax', 'Sales Tax', 'VAT'])('P17 tax wording "%s"', (label) => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row('Sub Total', '1,000'), row(label, '160')]);
    expect(d.charges).toMatchObject([{ kind: 'tax', amount: 16000 }]);
    expect(d.charges).toHaveLength(1);
  });

  it.each(['Delivery Charges', 'Bag Charges', 'Shopping Bag', 'Packing Charges', 'Cloth Shopping Bag Charges'])('P17 fee wording "%s" is a fee charge', (label) => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row('Sub Total', '1,000'), row(label, '50')]);
    expect(d.charges).toMatchObject([{ kind: 'fee', amount: 5000 }]);
    expect(d.charges).toHaveLength(1);
  });

  it('P17 "Disc" is a discount (magnitude)', () => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row('Sub Total', '1,000'), row('Disc', '100')]);
    expect(d.charges).toMatchObject([{ kind: 'discount', amount: 10000 }]);
  });

  it.each(['Delivery Charges', 'Discount', 'Disc', 'Service Charge', 'GST', 'Packing Charges'])('P17 zero amounts: a "%s 0" charge is dropped', (label) => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row('Sub Total', '1,000'), row(label, '0')]);
    expect(d.charges).toEqual([]);
  });

  it('P17 amount suffix: "(Rs)", "Rs" and "PKR" after the amount are allowed on summary and item rows', () => {
    const d = parseRows([
      NAME(),
      row('Zinger Burger', '450 (Rs)'),
      row('Fries', '150 Rs'),
      row('Total Value', '600 (Rs)'),
      row('GST', '96 PKR'),
      row('Grand Total', '696 (Rs)'),
    ]);
    expect(d.items.map((i) => i.lineTotal)).toEqual([45000, 15000]);
    expect(itemNames(d)).toEqual(['Zinger Burger', 'Fries']);
    expect(d.printedSubtotal).toBe(60000);
    expect(d.charges).toMatchObject([{ kind: 'tax', amount: 9600 }]);
    expect(d.printedTotal).toBe(69600);
  });
});

// ───────────────────────── P18 card / cash variants ─────────────────────────
describe('P18 card/cash variants', () => {
  /** Arcadian small: subtotal 2,075; GST 5% = 104 -> 2,179 (card); GST 16% = 332 -> 2,407 (cash). */
  const arcadian = (flip: boolean): Cell[][] => {
    const gst = flip ? pair('GST 16%:', '332', 'GST 5%:', '104') : pair('GST 5%:', '104', 'GST 16%:', '332');
    const tot = flip ? pair('Amt With Tax:', '2407', 'Amt With Tax:', '2179') : pair('Amt With Tax:', '2179', 'Amt With Tax:', '2407');
    return [NAME(), hdr('Item Name', 'Qty', 'Value'), r('Sandwich', '1', '870'), r('Fish Burger', '1', '925'), r('Pepsi', '1', '180'), r('Water', '1', '100'), row('Bill Amt W/O Tax:', '2075'), gst, tot];
  };

  for (const flip of [false, true]) {
    it(`P18 same-row GST pair${flip ? ' (cash printed on the left)' : ''}: lower rate = card, higher = cash; totals follow their row side`, () => {
      const d = parseRows(arcadian(flip));
      expect(d.printedSubtotal).toBe(207500);
      expect(d.variants?.card.taxes).toMatchObject([{ kind: 'tax', amount: 10400, rateBp: 500 }]);
      expect(d.variants?.cash.taxes).toMatchObject([{ kind: 'tax', amount: 33200, rateBp: 1600 }]);
      expect(d.variants?.card.printedTotal).toBe(217900);
      expect(d.variants?.cash.printedTotal).toBe(240700);
      expect(d.variants?.card.taxes).toHaveLength(1);
      expect(d.variants?.cash.taxes).toHaveLength(1);
    });
  }

  it('P18 a discount pair "Disc 29.%: 2500   Disc 29.%: 2499.9": left matched with left (card = the 5% side)', () => {
    const d = parseRows([
      NAME(),
      hdr('Item Name', 'Qty', 'Value'),
      r('Soup', '1', '5000'),
      r('Salad', '1', '3340'),
      row('Bill Amt W/O Tax:', '8340'),
      pair('Disc 29.%:', '2500', 'Disc 29.%:', '2499.9'),
      pair('GST 5%:', '292', 'GST 16%:', '934'),
      pair('Amt With Tax:', '6132', 'Amt With Tax:', '6774'),
    ]);
    expect(d.variants?.card.discounts).toMatchObject([{ kind: 'discount', amount: 250000 }]);
    expect(d.variants?.cash.discounts).toMatchObject([{ kind: 'discount', amount: 249990 }]);
    expect(d.variants?.card.taxes).toMatchObject([{ amount: 29200, rateBp: 500 }]);
    expect(d.variants?.cash.taxes).toMatchObject([{ amount: 93400, rateBp: 1600 }]);
    expect(d.variants?.card.printedTotal).toBe(613200);
    expect(d.variants?.cash.printedTotal).toBe(677400);
  });

  for (const flip of [false, true]) {
    it(`P18 totals labelled "Cc Total" are card and the other is cash, wherever they are printed (${flip ? 'Net Amount first' : 'Cc Total first'})`, () => {
      const gst = flip ? pair('GST(16 %):', '580', 'GST(5 %):', '181') : pair('GST(5 %):', '181', 'GST(16 %):', '580');
      const tot = flip ? pair('Net Amount:', '4,205', 'Cc Total:', '3,806') : pair('Cc Total:', '3,806', 'Net Amount:', '4,205');
      const d = parseRows([NAME(), row('Pasta', '3,625'), row('G.Amount:', '3,625'), gst, tot]);
      expect(d.variants?.card.printedTotal).toBe(380600);
      expect(d.variants?.cash.printedTotal).toBe(420500);
      expect(d.variants?.card.taxes).toMatchObject([{ amount: 18100, rateBp: 500 }]);
      expect(d.variants?.cash.taxes).toMatchObject([{ amount: 58000, rateBp: 1600 }]);
    });
  }

  it('P18 one amount with two rates "P.S.T CASH@16% / CARD@5% 898": the rate that reproduces the amount (16% of 5,613) and paidWith cash', () => {
    const d = parseRows([NAME(), row('Zinger Burger', '5,613'), row('Total Value', '5,613'), row('P.S.T CASH@16% / CARD@5%', '898')]);
    expect(d.charges).toMatchObject([{ kind: 'tax', amount: 89800, rateBp: 1600 }]);
    expect(d.charges).toHaveLength(1);
    expect(d.paidWith).toBe('cash');
    expect(d.variants).toBeUndefined();
  });

  it('P18 same text with 281 (5% of 5,613 = 280.65): rate 500 and paidWith card', () => {
    const d = parseRows([NAME(), row('Zinger Burger', '5,613'), row('Total Value', '5,613'), row('P.S.T CASH@16% / CARD@5%', '281')]);
    expect(d.charges).toMatchObject([{ kind: 'tax', amount: 28100, rateBp: 500 }]);
    expect(d.paidWith).toBe('card');
  });

  it.each([
    ['PAYMENT MODE : Cash', 'cash'],
    ['Payment Mode:Cash', 'cash'],
    ['CREDIT CARD', 'card'],
    ['Payment Mode:MASTER', 'card'],
    ['VISA', 'card'],
  ] as const)('P18 paidWith hint from "%s" is %s', (text, expected) => {
    const d = parseRows([NAME(), row('Zinger Burger', '450'), one(text), row('Total', '450')]);
    expect(d.paidWith).toBe(expected);
    expect(d.items).toHaveLength(1);
  });

  it('P18 no payment text: paidWith is null/absent, and a single-price receipt has no variants', () => {
    const d = parseRows([NAME(), row('Zinger Burger', '450'), row('Sub Total', '450'), row('GST 16%', '72'), row('Total', '522')]);
    expect(d.paidWith ?? null).toBeNull();
    expect(d.variants).toBeUndefined();
    expect(d.charges).toMatchObject([{ kind: 'tax', amount: 7200, rateBp: 1600 }]);
  });

  it('P18 property: the lower tax rate is always card and the higher cash, whichever side it is printed on', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 9999 }), fc.boolean(), (s, flip) => {
        const t5 = Math.floor((s * 5 + 50) / 100);
        const t16 = Math.floor((s * 16 + 50) / 100);
        const gst = flip ? pair('GST 16%:', String(t16), 'GST 5%:', String(t5)) : pair('GST 5%:', String(t5), 'GST 16%:', String(t16));
        const d = parseRows([NAME(), row('Zinger Burger', String(s)), row('Bill Amt W/O Tax:', String(s)), gst]);
        expect(d.variants?.card.taxes[0]).toMatchObject({ amount: t5 * 100, rateBp: 500 });
        expect(d.variants?.cash.taxes[0]).toMatchObject({ amount: t16 * 100, rateBp: 1600 });
      }),
      { numRuns: 100 },
    );
  });
});

// ───────────────────────── P19 tax already included ─────────────────────────
describe('P19 tax already included', () => {
  const optp = (payable: string, subtotal = '2,048'): Cell[][] => [
    NAME(),
    row('Jum Nuggets', '1,050'),
    row('Chk Fillet', '650'),
    row('Large Fries', '450'),
    row('Total Net Amount', subtotal),
    row('Sale tax (VAT)', '102.38'),
    row('Payable (PKR)', payable),
  ];

  it('P19 sum of items 2,150 = payable 2,150 and printed subtotal 2,048 is lower: taxInclusive, tax is informational', () => {
    const d = parseRows(optp('2,150'));
    expect(d.taxInclusive).toBe(true);
    expect(d.charges).toMatchObject([{ kind: 'tax', amount: 10238, informational: true }]);
    expect(d.printedSubtotal).toBe(204800);
    expect(d.printedTotal).toBe(215000);
  });

  it('P19 tolerance is +-1 rupee: payable 2,151 is still inclusive, 2,152 is not', () => {
    expect(parseRows(optp('2,151')).taxInclusive).toBe(true);
    expect(parseRows(optp('2,149')).taxInclusive).toBe(true);
    expect(parseRows(optp('2,152')).taxInclusive === true).toBe(false);
  });

  it('P19 needs a tax charge: same numbers without a tax row are not taxInclusive', () => {
    const d = parseRows([NAME(), row('Jum Nuggets', '1,050'), row('Chk Fillet', '650'), row('Large Fries', '450'), row('Total Net Amount', '2,048'), row('Payable (PKR)', '2,150')]);
    expect(d.taxInclusive === true).toBe(false);
  });

  it('P19 needs a printed subtotal LOWER than the items: items = total but subtotal = items is not inclusive', () => {
    const d = parseRows([NAME(), row('Jum Nuggets', '1,050'), row('Chk Fillet', '650'), row('Large Fries', '450'), row('Sub Total', '2,150'), row('GST 5%', '108'), row('Total', '2,150')]);
    expect(d.taxInclusive === true).toBe(false);
    expect(d.charges[0]?.informational ?? false).toBe(false);
  });

  it('P19 an ordinary tax-on-top receipt keeps its tax as a real (non-informational) charge', () => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row('Sub Total', '1,000'), row('GST 16%', '160'), row('Total', '1,160')]);
    expect(d.taxInclusive === true).toBe(false);
    expect(d.charges).toMatchObject([{ kind: 'tax', amount: 16000, rateBp: 1600 }]);
    expect(d.charges[0]?.informational ?? false).toBe(false);
  });

  it('P19 with no printed subtotal, items = total and a tax row is inclusive ("when present")', () => {
    const d = parseRows([NAME(), row('Zinger Burger', '1,000'), row('GST 5%', '48'), row('Total', '1,000')]);
    expect(d.taxInclusive).toBe(true);
    expect(d.charges[0]?.informational).toBe(true);
  });
});

// ───────────────────────── P20 segmentation robustness ─────────────────────────
describe('P20 amount-to-name association works for one line per row and one line per cell', () => {
  const rows = [
    Sec(['CAFE ROYAL', 20, { h: 40 }]),
    Sec(['Description', 20], ['Qty', 420], ['Rate', 500], ['Amount', 620]),
    V(['Zinger Burger', 20], ['2', 430], ['650', 510], ['1,300', 610]),
    V(['Chicken Karahi', 20], ['1', 430], ['1,850', 500], ['1,850', 610]),
    V(['Naan', 20], ['4', 430], ['60', 520], ['240', 620]),
    Sec(['Sub Total', 20], ['3,390', 600]),
    V(['GST 16%', 20], ['542', 620]),
    V(['Net Amount', 20], ['3,932', 600]),
  ];
  for (const seg of ['merged', 'cells'] as const) {
    it(`P20 [${seg}] items, subtotal, tax and total are associated correctly`, () => {
      const d = parseLoose(layoutVisual(rows, seg));
      expect(d.items).toMatchObject([
        { name: 'Zinger Burger', quantity: 2, unitPrice: 65000, lineTotal: 130000 },
        { name: 'Chicken Karahi', quantity: 1, unitPrice: 185000, lineTotal: 185000 },
        { name: 'Naan', quantity: 4, unitPrice: 6000, lineTotal: 24000 },
      ]);
      expect(d.printedSubtotal).toBe(339000);
      expect(d.charges).toMatchObject([{ kind: 'tax', amount: 54200, rateBp: 1600 }]);
      expect(d.printedTotal).toBe(393200);
    });
  }

  it('P20 property: random header-table receipts give identical items in both segmentations and match the generated data', () => {
    const NAMES = ['Zinger Burger', 'Chicken Karahi', 'Mint Margarita', 'Fries Large', 'Garlic Naan', 'Mango Lassi'];
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: fc.constantFrom(...NAMES), qty: fc.integer({ min: 1, max: 9 }), unit: fc.integer({ min: 10, max: 999 }) }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 1000 }),
        (list, seed) => {
          const total = list.reduce((s, i) => s + i.qty * i.unit, 0);
          const vrows = [
            Sec(['CAFE ROYAL', 20, { h: 40 }]),
            Sec(['Description', 20], ['Qty', 420], ['Rate', 500], ['Amount', 620]),
            ...list.map((i) => V([i.name, 20], [String(i.qty), 430], [String(i.unit), 510], [String(i.qty * i.unit), 620])),
            Sec(['Sub Total', 20], [String(total), 620]),
          ];
          const expected = list.map((i) => ({ name: i.name, quantity: i.qty, unitPrice: i.unit * 100, lineTotal: i.qty * i.unit * 100 }));
          const merged = parseLoose(layoutVisual(vrows, 'merged'));
          const cells = parseLoose(layoutVisual(vrows, 'cells'));
          expect(merged.items).toMatchObject(expected);
          expect(merged.items).toHaveLength(list.length);
          expect(cells.items).toEqual(merged.items);
          expect(cells.printedSubtotal).toBe(total * 100);
          // P11 with v2 rules: shuffled lines give the same draft
          const ocr = layoutVisual(vrows, 'cells');
          expect(parseLoose({ ...ocr, lines: shuffled(ocr.lines, seed) })).toEqual(cells);
        },
      ),
      { numRuns: 60 },
    );
  });
});
