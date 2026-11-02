import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRupees } from '../src/index';

const ok = (paisa: number) => ({ ok: true, paisa });
const bad = (reason: string) => ({ ok: false, reason });

describe('D2 parseRupees', () => {
  describe('accepts (spec examples)', () => {
    it.each([
      ['1806', 180600],
      ['1,806', 180600],
      ['1806.5', 180650],
      ['1806.25', 180625],
      [' Rs 1,806 ', 180600],
      ['-200', -20000],
    ])('D2 parseRupees accepts %j -> %i paisa', (text, paisa) => {
      expect(parseRupees(text)).toEqual(ok(paisa));
    });
  });

  describe('accepts (edge cases implied by the spec)', () => {
    it.each([
      ['0', 0],
      ['0.5', 50],
      ['0.05', 5],
      ['1806.0', 180600],
      ['1806.00', 180600],
      ['1806.50', 180650],
      ['Rs1806', 180600], // "letters other than a leading Rs" -> Rs without a space is a leading Rs
      ['Rs 200', 20000],
      ['1,234,567', 123456700],
      ['100000000', 10_000_000_000], // exactly Rs 100 000 000 is NOT above the limit
      ['100000000.00', 10_000_000_000],
    ])('D2 parseRupees accepts %j -> %i paisa', (text, paisa) => {
      expect(parseRupees(text)).toEqual(ok(paisa));
    });
  });

  describe('rejects', () => {
    it('D2 parseRupees rejects empty string as empty', () => {
      expect(parseRupees('')).toEqual(bad('empty'));
    });
    it('D2 parseRupees rejects whitespace-only as empty', () => {
      expect(parseRupees('   ')).toEqual(bad('empty'));
    });
    it.each(['1.234', '1.230', '0.001', '1806.255', '5.1234'])(
      'D2 parseRupees rejects three or more decimals: %j',
      (text) => {
        expect(parseRupees(text)).toEqual(bad('too-many-decimals'));
      },
    );
    it.each(['1.2.3', '1..2', '1806.5.0'])('D2 parseRupees rejects more than one dot: %j', (text) => {
      const r = parseRupees(text);
      expect(r.ok).toBe(false);
    });
    it('D2 parseRupees reports a double dot with two-digit parts as invalid', () => {
      expect(parseRupees('1.2.3')).toEqual(bad('invalid'));
    });
    it.each(['abc', '12abc', 'Rs abc', '1e3', 'NaN', 'Infinity', 'PKR 100', '10 Rs', 'R 100', '$100', '12-3'])(
      'D2 parseRupees rejects letters/other symbols: %j',
      (text) => {
        expect(parseRupees(text)).toEqual(bad('invalid'));
      },
    );
    it.each(['100000000.01', '100000001', '999999999', '-100000001'])(
      'D2 parseRupees rejects values above Rs 100 000 000: %j',
      (text) => {
        expect(parseRupees(text)).toEqual(bad('too-large'));
      },
    );
    it('D2 parseRupees rejects absurdly huge values without precision loss or throwing', () => {
      expect(parseRupees('99999999999999999999999')).toEqual(bad('too-large'));
      expect(parseRupees('1' + '0'.repeat(400))).toEqual(bad('too-large'));
      expect(parseRupees('9007199254740993')).toEqual(bad('too-large'));
    });
  });

  describe('never uses floats', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([
      ['0.29', 29],
      ['1.15', 115],
      ['4.35', 435],
      ['0.07', 7],
      ['19.99', 1999],
      ['8.2', 820],
      ['1.1', 110],
      ['0.58', 58],
      ['2.675', null], // three decimals -> rejected, not rounded
    ])('D2 parseRupees float trap %j', (text, paisa) => {
      if (paisa === null) expect(parseRupees(text)).toEqual(bad('too-many-decimals'));
      else expect(parseRupees(text)).toEqual(ok(paisa));
    });

    it('D2 parseRupees never calls parseFloat', () => {
      const a = vi.spyOn(globalThis, 'parseFloat');
      const b = vi.spyOn(Number, 'parseFloat');
      parseRupees('1806.25');
      parseRupees(' Rs 1,806 ');
      parseRupees('-200');
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });

    it('D2 parseRupees result is always a safe integer', () => {
      for (const t of ['100000000', '99999999.99', '0.01', '-99999999.99']) {
        const r = parseRupees(t);
        expect(r.ok && Number.isSafeInteger(r.paisa)).toBe(true);
      }
    });
  });

  describe('property', () => {
    const LIMIT = 10_000_000_000; // Rs 100 000 000 in paisa

    const fmt = (p: number, opts: { group: boolean; prefix: boolean; pad: boolean }): string => {
      const neg = p < 0;
      const abs = Math.abs(p);
      const whole = Math.trunc(abs / 100);
      const cents = String(abs % 100).padStart(2, '0');
      let w = String(whole);
      if (opts.group) w = w.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      let s = `${w}.${cents}`;
      if (neg) s = '-' + s;
      if (opts.prefix) s = 'Rs ' + s;
      if (opts.pad) s = `  ${s} `;
      return s;
    };

    it('D2 parseRupees(format(p)) === p for any paisa in range, with and without grouping / Rs / padding', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -LIMIT, max: LIMIT }),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (p, group, prefix, pad) => {
            const text = fmt(p, { group, prefix: prefix && p >= 0, pad });
            const r = parseRupees(text);
            expect(r).toEqual({ ok: true, paisa: p === 0 ? 0 : p });
          },
        ),
        { numRuns: 500 },
      );
    });

    it('D2 parseRupees one-decimal and whole-rupee forms agree with integer maths', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 9_999_999 }), fc.integer({ min: 0, max: 9 }), (rupees, tenth) => {
          expect(parseRupees(`${rupees}.${tenth}`)).toEqual({ ok: true, paisa: rupees * 100 + tenth * 10 });
          expect(parseRupees(`${rupees}`)).toEqual({ ok: true, paisa: rupees * 100 });
        }),
        { numRuns: 300 },
      );
    });

    it('D2 parseRupees rejects every value above the limit', () => {
      fc.assert(
        fc.property(fc.integer({ min: LIMIT + 1, max: LIMIT * 10 }), (p) => {
          const r = parseRupees(fmt(p, { group: false, prefix: false, pad: false }));
          expect(r).toEqual({ ok: false, reason: 'too-large' });
        }),
        { numRuns: 200 },
      );
    });

    it('D2 parseRupees never throws on arbitrary strings and ok results are safe integers within range', () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          const r = parseRupees(s);
          if (r.ok) {
            expect(Number.isSafeInteger(r.paisa)).toBe(true);
            expect(Math.abs(r.paisa)).toBeLessThanOrEqual(LIMIT);
          } else {
            expect(['empty', 'invalid', 'too-many-decimals', 'too-large']).toContain(r.reason);
          }
        }),
        { numRuns: 500 },
      );
    });
  });
});
