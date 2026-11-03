/**
 * Regression fixtures from 7 real Lahore receipts (8 transcriptions: OPTP has two receipts in one photo).
 * Every receipt is parsed from BOTH OCR segmentations (P20): `merged` (one OcrLine per visual row) and `cells`
 * (one OcrLine per column cell). Expectations are hand-derived in the fixture files (docs/phase2b-spec.md P13-P20).
 * Tests are split by concern so one gap does not hide the others.
 */
import { describe, expect, it } from 'vitest';
import { shuffled } from './layout';
import { arcadianLarge } from './fixtures/real/arcadian-large';
import { arcadianSmall } from './fixtures/real/arcadian-small';
import { buttKarahi } from './fixtures/real/butt-karahi';
import { dailyDeli } from './fixtures/real/daily-deli';
import { gourmet } from './fixtures/real/gourmet';
import { optpLeft, optpRight } from './fixtures/real/optp';
import { steakAway } from './fixtures/real/steak-away';
import type { ExpCharge, RealFixture } from './fixtures/real/types';
import { parseLoose, type LooseCharge } from './support-v2';

const FIXTURES: RealFixture[] = [gourmet, buttKarahi, arcadianSmall, arcadianLarge, dailyDeli, steakAway, optpLeft, optpRight];
const SEGS = ['merged', 'cells'] as const;

const chargeMatches = (actual: LooseCharge[], expected: ExpCharge[]) => {
  expect(actual.map((c) => ({ kind: c.kind, amount: c.amount }))).toEqual(expected.map((c) => ({ kind: c.kind, amount: c.amount })));
  expected.forEach((e, i) => {
    const a = actual[i] as LooseCharge;
    if (e.rateBp !== undefined) expect(a.rateBp, `rate of ${a.label}`).toBe(e.rateBp);
    expect(a.informational ?? false, `informational of ${a.label}`).toBe(e.informational ?? false);
  });
};

for (const fx of FIXTURES) {
  for (const seg of SEGS) {
    const ocr = fx[seg];
    const e = fx.expected;
    const isRightOptp = fx === optpRight;

    describe(`real receipt: ${fx.name} [${seg}]`, () => {
      const d = parseLoose(ocr);
      // For the OPTP right receipt the "POS Service Fee" row is a spec gap (P3 'pos' ignore vs a real Rs 1 item): see the ruling test below.
      const items = isRightOptp ? d.items.filter((i) => !/^POS\b/i.test(i.name)) : d.items;

      it('P13/P14/P15/P16/P20 items: names, quantities, unit prices and line totals', () => {
        expect(items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal }))).toEqual(
          e.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
        );
      });

      it('P13 header-area rows (name, date, table, invoice, NTN, ...) never become items', () => {
        for (const it of d.items) {
          for (const frag of e.headerFragments) {
            expect(it.name.toLowerCase(), `item "${it.name}" contains header text "${frag}"`).not.toContain(frag.toLowerCase());
          }
        }
        // and no item carries a placeholder-shaped line total from a header row (e.g. "0057", "001", "32", "25")
        expect(d.items.length).toBeLessThanOrEqual(e.items.length + (isRightOptp ? 1 : 0));
      });

      it('P7 restaurant name', () => {
        expect(d.restaurantName ?? '').toMatch(e.restaurantName);
      });

      it('P8/P17 printed subtotal', () => {
        expect(d.printedSubtotal).toBe(e.printedSubtotal);
      });

      if (e.printedTotal !== undefined) {
        it('P8/P17 printed total (last total wins)', () => {
          expect(d.printedTotal).toBe(e.printedTotal);
        });
      }

      if (e.unparsedContains) {
        it('P8/P17 an earlier total goes to unparsedRows and is not the printed total', () => {
          for (const frag of e.unparsedContains ?? []) expect(d.unparsedRows.join('\n')).toContain(frag);
          expect(d.charges.some((c) => c.amount === 765000)).toBe(false);
        });
      }

      if (e.charges) {
        it('P17 charges: kind, amount, rate; zero amounts dropped; informational only when tax is included', () => {
          chargeMatches(d.charges, e.charges ?? []);
        });
      }

      if (e.variants) {
        const v = e.variants;
        it('P18 card/cash variants: card = lower rate / cc total, cash = the other; left matched with left', () => {
          expect(d.variants, 'variants').toBeDefined();
          const dv = d.variants as NonNullable<typeof d.variants>;
          for (const side of ['card', 'cash'] as const) {
            chargeMatches(dv[side].taxes, v[side].taxes);
            chargeMatches(dv[side].discounts, v[side].discounts);
            expect(dv[side].printedTotal, `${side} printed total`).toBe(v[side].printedTotal);
          }
        });
      } else {
        it('P18 no variants when the receipt prints a single price', () => {
          expect(d.variants).toBeUndefined();
        });
      }

      it('P18 paidWith hint', () => {
        expect(d.paidWith ?? null).toBe(e.paidWith);
      });

      it('P19 taxInclusive', () => {
        expect(d.taxInclusive === true).toBe(e.taxInclusive);
      });

      if (e.checksOk) {
        it('P10 every check passes (receipt arithmetic is exact)', () => {
          expect(d.checks.length).toBeGreaterThan(0);
          expect(d.checks.filter((c) => !c.ok)).toEqual([]);
        });
      }

      it('P11 determinism: repeated runs and shuffled line order give a deep-equal draft', () => {
        expect(parseLoose(ocr)).toEqual(d);
        for (const seed of [1, 2, 3]) {
          expect(parseLoose({ ...ocr, lines: shuffled(ocr.lines, seed) })).toEqual(d);
        }
      });
    });
  }

  describe(`real receipt: ${fx.name} [P20 segmentation independence]`, () => {
    it('P20 one line per visual row and one line per cell give the same draft', () => {
      const a = parseLoose(fx.merged);
      const b = parseLoose(fx.cells);
      expect(b.items).toEqual(a.items);
      expect(b.charges).toEqual(a.charges);
      expect(b.variants).toEqual(a.variants);
      expect(b.printedSubtotal).toBe(a.printedSubtotal);
      expect(b.printedTotal).toBe(a.printedTotal);
      expect(b.paidWith ?? null).toBe(a.paidWith ?? null);
      expect(b.taxInclusive).toBe(a.taxInclusive);
      expect(b.restaurantName).toBe(a.restaurantName);
      expect(b.date).toBe(a.date);
    });
  });
}

describe('real receipts: P7 dates the spec decides', () => {
  for (const fx of FIXTURES.filter((f) => f.expected.date)) {
    for (const seg of SEGS) {
      it(`P7 ${fx.name} [${seg}] day-first date ${fx.expected.date}`, () => {
        expect(parseLoose(fx[seg]).date).toBe(fx.expected.date);
      });
    }
  }
});

describe('real receipts: P7 slash dates with 1-2 digit day/month and 2-4 digit years (1.1 ruling)', () => {
  for (const fx of FIXTURES.filter((f) => f.expected.rulingDate && !/OPTP/.test(f.name))) {
    for (const seg of SEGS) {
      it(`P7 (1.1) ${fx.name} [${seg}] day-first date ${fx.expected.rulingDate}`, () => {
        expect(parseLoose(fx[seg]).date).toBe(fx.expected.rulingDate);
      });
    }
  }
});

describe('real receipts: P7b month-first fallback (OPTP prints 12/31/2023)', () => {
  for (const fx of [optpLeft, optpRight]) {
    for (const seg of SEGS) {
      it(`P7b ${fx.name} [${seg}] day-first is invalid (month 31), so month-first gives ${fx.expected.rulingDate}`, () => {
        expect(parseLoose(fx[seg]).date).toBe(fx.expected.rulingDate);
      });
    }
  }
});

describe('real receipts: P17b header-filling rows are items despite ignore words (OPTP right "POS Service Fee")', () => {
  for (const seg of SEGS) {
    it(`P17b [${seg}] "POS Service Fee 1 1 16.00 0 1" fills all 5 header columns: item, qty 1, line total Rs 1`, () => {
      const d = parseLoose(optpRight[seg]);
      const pos = d.items.find((i) => /^POS Service Fee/.test(i.name));
      expect(pos, 'POS Service Fee item').toBeDefined();
      expect(pos?.quantity).toBe(1);
      expect(pos?.lineTotal).toBe(100);
      // with it, items add up to the payable amount exactly: 1 + 1,050 + 650 + 450 = 2,151
      expect(d.items.reduce((s, i) => s + i.lineTotal, 0)).toBe(215100);
    });
  }
});

describe('real receipts: 1.1 variant rulings (top-level charges / printedTotal, empty-fraction rate)', () => {
  for (const fx of [arcadianSmall, arcadianLarge, steakAway]) {
    for (const seg of SEGS) {
      it(`1.1 ${fx.name} [${seg}] variant charges are not duplicated at top level and paired totals leave printedTotal unset`, () => {
        const d = parseLoose(fx[seg]);
        expect(d.charges).toEqual([]);
        expect(d.printedTotal).toBeUndefined();
      });
    }
  }
  for (const seg of SEGS) {
    it(`1.1 Arcadian large [${seg}] "Disc 29.%" has an empty-fraction percentage: no rateBp`, () => {
      const d = parseLoose(arcadianLarge[seg]);
      expect(d.variants?.card.discounts[0]?.rateBp).toBeUndefined();
      expect(d.variants?.cash.discounts[0]?.rateBp).toBeUndefined();
    });
  }
});
