import fc from 'fast-check';
import type { OcrResult } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../src/index';
import { arbAnyOcr, arbRows } from './arbitraries';
import { lahoreReceipt } from './fixtures';
import { layout, one, row, shuffled } from './layout';

const deepFreeze = <T>(o: T): T => {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
};

describe('P11 determinism', () => {
  it('P11 the same OcrResult always gives a deep-equal draft', () => {
    const ocr = lahoreReceipt();
    const a = parseReceipt(ocr);
    expect(parseReceipt(ocr)).toEqual(a);
    expect(parseReceipt(structuredClone(ocr))).toEqual(a);
  });

  it('P11 the input is not mutated (a deeply frozen OcrResult parses fine)', () => {
    const ocr = deepFreeze(lahoreReceipt());
    expect(() => parseReceipt(ocr)).not.toThrow();
  });

  it('P11 shuffling lines gives the same draft (Lahore fixture, 20 shuffles, with jitter)', () => {
    const ocr = lahoreReceipt('(928.10)', { jitter: 4, seed: 7 });
    const base = parseReceipt(ocr);
    for (let seed = 1; seed <= 20; seed++) {
      expect(parseReceipt({ ...ocr, lines: shuffled(ocr.lines, seed) })).toEqual(base);
    }
  });

  it('P11 reversing lines gives the same draft', () => {
    const ocr = lahoreReceipt();
    expect(parseReceipt({ ...ocr, lines: [...ocr.lines].reverse() })).toEqual(parseReceipt(ocr));
  });

  it('P11 property: shuffling lines never changes the draft', () => {
    fc.assert(
      fc.property(arbRows, fc.integer({ min: 1, max: 1e6 }), (ocr, seed) => {
        expect(parseReceipt({ ...ocr, lines: shuffled(ocr.lines, seed) })).toEqual(parseReceipt(ocr));
      }),
      { numRuns: 300 },
    );
  });

  it('P11 property: parsing twice gives deep-equal drafts, whatever the OCR', () => {
    fc.assert(
      fc.property(arbAnyOcr, (ocr) => {
        expect(parseReceipt(ocr)).toEqual(parseReceipt(ocr));
      }),
      { numRuns: 200 },
    );
  });

  it('P11 ties: two lines with identical position but different text are ordered deterministically', () => {
    const ocr: OcrResult = {
      imageWidth: 800,
      imageHeight: 200,
      lines: [
        { text: 'Zinger', frame: { x: 20, y: 40, width: 60, height: 20 } },
        { text: 'Burger', frame: { x: 20, y: 40, width: 60, height: 20 } },
        { text: '650', frame: { x: 620, y: 40, width: 30, height: 20 } },
      ],
    };
    const a = parseReceipt(ocr);
    const b = parseReceipt({ ...ocr, lines: [ocr.lines[1]!, ocr.lines[0]!, ocr.lines[2]!] });
    expect(b).toEqual(a);
  });
});

describe('robustness: never throws, garbage -> empty draft', () => {
  it('empty OCR result gives an empty draft', () => {
    const d = parseReceipt({ imageWidth: 0, imageHeight: 0, lines: [] });
    expect(d).toEqual({ items: [], charges: [], checks: [], unparsedRows: [] });
  });

  it('whitespace-only lines give an empty draft', () => {
    const d = parseReceipt(layout([one('   '), one(''), one('\t')]));
    expect(d.items).toEqual([]);
    expect(d.charges).toEqual([]);
    expect(d.checks).toEqual([]);
    expect(d.printedTotal).toBeUndefined();
  });

  it('garbage strings give no items/charges/totals and land in unparsedRows', () => {
    const d = parseReceipt(layout([one('@@@ ### !!!'), one('~~~~ ^^^^'), one('||| \\\\ ///'), one('lorem ipsum dolor')]));
    expect(d.items).toEqual([]);
    expect(d.charges).toEqual([]);
    expect(d.printedSubtotal).toBeUndefined();
    expect(d.printedTotal).toBeUndefined();
    expect(d.checks).toEqual([]);
    expect(d.unparsedRows.length).toBeGreaterThan(0);
  });

  it('absurd numbers do not throw or produce unsafe integers', () => {
    const d = parseReceipt(
      layout([
        row('Big Item', '99,999,999,999,999,999,999'),
        row('Huge Item', '999999999999999999999999'),
        row('Grand Total', '1e400'),
        row('Neg', '-0'),
      ]),
    );
    for (const it of d.items) expect(Number.isSafeInteger(it.lineTotal)).toBe(true);
  });

  it('degenerate frames (zero height, negative size, huge coordinates) do not throw', () => {
    const ocr: OcrResult = {
      imageWidth: 100,
      imageHeight: 100,
      lines: [
        { text: 'Burger', frame: { x: 0, y: 0, width: 0, height: 0 } },
        { text: '500', frame: { x: -5, y: -1e9, width: -3, height: -4 } },
        { text: 'Fries 300', frame: { x: 1e12, y: 1e12, width: 1e12, height: 1e12 } },
      ],
    };
    expect(() => parseReceipt(ocr)).not.toThrow();
  });

  it('property: never throws on an arbitrary OcrResult and always returns a well-formed draft', () => {
    fc.assert(
      fc.property(arbAnyOcr, (ocr) => {
        const d = parseReceipt(ocr);
        expect(Array.isArray(d.items)).toBe(true);
        expect(Array.isArray(d.charges)).toBe(true);
        expect(Array.isArray(d.checks)).toBe(true);
        expect(Array.isArray(d.unparsedRows)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('property: draft invariants hold for arbitrary receipts (quantity 1..999, safe integer paisa, names, flags vs confidence)', () => {
    fc.assert(
      fc.property(fc.oneof(arbRows, arbAnyOcr), (ocr) => {
        const d = parseReceipt(ocr);
        d.items.forEach((it, i) => {
          expect(Number.isInteger(it.quantity) && it.quantity >= 1 && it.quantity <= 999).toBe(true);
          expect(Number.isSafeInteger(it.lineTotal)).toBe(true);
          if (it.unitPrice !== undefined) expect(Number.isSafeInteger(it.unitPrice)).toBe(true);
          expect(it.name).toBe(it.name.trim());
          expect(it.name.length).toBeGreaterThan(0);
          if (it.flags.includes('name')) expect(it.name).toBe(`Item ${i + 1}`);
          if (it.flags.length > 0) expect(it.confidence).toBe('low');
          expect(new Set(it.flags).size).toBe(it.flags.length);
        });
        for (const c of d.charges) {
          expect(Number.isSafeInteger(c.amount)).toBe(true);
          expect(c.amount).toBeGreaterThanOrEqual(0);
          if (c.rateBp !== undefined) expect(Number.isInteger(c.rateBp)).toBe(true);
        }
        if (d.date !== undefined) expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
      { numRuns: 400 },
    );
  });
});

describe('scenario fixtures', () => {
  it('items after the summary are unparsed (late item, duplicate Total)', () => {
    const d = parseReceipt(
      layout([
        one('Chaman Cafe'),
        row('Zinger Burger', '650'),
        row('Total', '650'),
        row('Late Soda', '120'),
        row('Grand Total', '650'),
      ]),
    );
    expect(d.items.map((i) => i.name)).toEqual(['Zinger Burger']);
    expect(d.printedTotal).toBe(65000);
    const u = d.unparsedRows.join('\n');
    expect(u).toContain('Late Soda');
    expect(u).toMatch(/Total.*650/);
  });

  it('a low-confidence line in the middle of a receipt only taints its own row (P9) and the draft still checks out', () => {
    const d = parseReceipt(
      layout([
        one('Chaman Cafe'),
        row('Zinger Burger', '650'),
        [
          { text: 'Chicken Karahi', x: 20, confidence: 0.45 },
          { text: '1,850', x: 620, confidence: 0.9 },
        ],
        row('Fries', '300'),
        row('Sub Total', '2,800'),
      ]),
    );
    expect(d.items.map((i) => i.confidence)).toEqual(['high', 'low', 'high']);
    expect(d.checks[0]).toMatchObject({ kind: 'items-vs-subtotal', ok: true });
  });
});
