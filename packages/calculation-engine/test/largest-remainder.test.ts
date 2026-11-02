import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocateLargestRemainder } from '../src/index';
import { $ } from './helpers';

type W = { id: string; weight: number | bigint };
const lr = (total: number, weights: W[]): Record<string, number> =>
  Object.fromEntries([...allocateLargestRemainder($(total), weights)].map(([k, v]) => [k, v as number]));
const ws = (m: Record<string, number>): W[] => Object.entries(m).map(([id, weight]) => ({ id, weight }));

/** Independent oracle straight from R9.1, BigInt only. */
function oracle(total: number, weights: W[]): Record<string, number> {
  const T = BigInt(total);
  if (T < 0n) {
    const pos = oracle(-total, weights);
    return Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, v === 0 ? 0 : -v]));
  }
  const w = weights.map((x) => ({ id: x.id, w: BigInt(x.weight) }));
  const W = w.reduce((a, x) => a + x.w, 0n);
  const rows = w.map((x) => ({ id: x.id, floor: (T * x.w) / W, frac: (T * x.w) % W })); // frac / W is the fractional part
  let k = T - rows.reduce((a, r) => a + r.floor, 0n);
  const order = [...rows].sort((p, q) => {
    const d = q.frac - p.frac; // all share denominator W
    if (d !== 0n) return d > 0n ? 1 : -1;
    return p.id < q.id ? -1 : 1;
  });
  const bonus = new Map<string, bigint>();
  for (const r of order) {
    if (k > 0n) {
      // k never exceeds the number of rows with a non-zero fraction, so zero weights are never reached
      bonus.set(r.id, 1n);
      k -= 1n;
    }
  }
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.floor + (bonus.get(r.id) ?? 0n))]));
}

describe('R9.1 largest remainder (direct)', () => {
  it('R9.1 1000 among three equal weights -> 334 / 333 / 333 (ties to the lowest id)', () => {
    expect(lr(1000, ws({ a: 1, b: 1, c: 1 }))).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('R9.1 ties are broken by id, not by array position', () => {
    expect(lr(1, ws({ c: 1, b: 1, a: 1 }))).toEqual({ a: 1, b: 0, c: 0 });
    expect(lr(2, [{ id: 'c', weight: 1 }, { id: 'a', weight: 1 }, { id: 'b', weight: 1 }])).toEqual({ a: 1, b: 1, c: 0 });
  });

  it('R9.1 ties use plain code-unit comparison', () => {
    expect(lr(1, ws({ a: 1, B: 1 }))).toEqual({ a: 0, B: 1 });
    expect(lr(1, ws({ a2: 1, a10: 1 }))).toEqual({ a2: 0, a10: 1 });
  });

  it('R9.1 weights 1:2 of 1000 -> 333 / 667 (largest fraction wins, not lowest id)', () => {
    expect(lr(1000, ws({ a: 1, b: 2 }))).toEqual({ a: 333, b: 667 });
  });

  it('R9.1 the largest fractional part beats a lower id: 5 over 3:3:1 -> 2 / 2 / 1', () => {
    // quotas 15/7 = 2.14, 2.14, 5/7 = 0.71 -> floors 2,2,0 -> leftover 1 to c
    expect(lr(5, ws({ a: 3, b: 3, c: 1 }))).toEqual({ a: 2, b: 2, c: 1 });
  });

  it('R9.1 several leftovers go to the k largest fractions: 5 over 1:1:2 -> 1 / 1 / 3', () => {
    // quotas 1.25 1.25 2.5 -> floors 1,1,2 -> leftover 1 -> c (.5)
    expect(lr(5, ws({ a: 1, b: 1, c: 2 }))).toEqual({ a: 1, b: 1, c: 3 });
    // 2 over three equal: quotas .667 each, k = 2 -> a, b
    expect(lr(2, ws({ a: 1, b: 1, c: 1 }))).toEqual({ a: 1, b: 1, c: 0 });
  });

  it('R9.1 exact quotas need no leftover', () => {
    expect(lr(10, ws({ a: 3, b: 3, c: 4 }))).toEqual({ a: 3, b: 3, c: 4 });
  });

  it('R9.1 zero total gives all zeros', () => {
    expect(lr(0, ws({ a: 1, b: 2 }))).toEqual({ a: 0, b: 0 });
  });

  it('R9.1 a zero weight receives 0 and keeps its key', () => {
    expect(lr(100, ws({ a: 0, b: 1, c: 1 }))).toEqual({ a: 0, b: 50, c: 50 });
    expect(lr(1, ws({ a: 0, b: 1, c: 1 }))).toEqual({ a: 0, b: 1, c: 0 });
    expect(lr(7, ws({ a: 0, b: 0, c: 5 }))).toEqual({ a: 0, b: 0, c: 7 });
  });

  it('R9.1 negative total: compute LR(-T) and negate (symmetric rounding)', () => {
    expect(lr(-1000, ws({ a: 1, b: 1, c: 1 }))).toEqual({ a: -334, b: -333, c: -333 });
    expect(lr(-1, ws({ c: 1, b: 1, a: 1 }))).toEqual({ a: -1, b: 0, c: 0 });
    expect(lr(-1000, ws({ a: 1, b: 2 }))).toEqual({ a: -333, b: -667 });
    expect(lr(-5, ws({ a: 3, b: 3, c: 1 }))).toEqual({ a: -2, b: -2, c: -1 });
  });

  it('R9.1 negative total with a zero weight and zero total never yields -0 surprises', () => {
    const r = allocateLargestRemainder($(-10), ws({ a: 0, b: 1 }));
    expect(r.get('a')).toBe(0);
    expect(Object.is(r.get('a'), -0)).toBe(false);
    expect(r.get('b')).toBe(-10);
  });

  it('R9.1 weights may be bigint, or a mix of number and bigint', () => {
    expect(lr(1000, [{ id: 'a', weight: 10n ** 30n }, { id: 'b', weight: 2n * 10n ** 30n }])).toEqual({ a: 333, b: 667 });
    expect(lr(1000, [{ id: 'a', weight: 1 }, { id: 'b', weight: 2n }])).toEqual({ a: 333, b: 667 });
  });

  it('R9.1 exact for values beyond float precision (no binary floating point)', () => {
    const big = Number.MAX_SAFE_INTEGER; // 9007199254740991
    expect(lr(1000, ws({ a: big, b: big, c: big }))).toEqual({ a: 334, b: 333, c: 333 });
    // 9007199254740991 / 3 = 3002399751580330.33 -> floors x3 = ...990, leftover 1 -> a
    expect(lr(big, ws({ a: 1, b: 1, c: 1 }))).toEqual({ a: 3002399751580331, b: 3002399751580330, c: 3002399751580330 });
    // nearly equal huge weights: tiny difference decides the leftover
    expect(lr(1, [{ id: 'a', weight: big - 1 }, { id: 'b', weight: big }])).toEqual({ a: 0, b: 1 });
  });

  it('R9.1 returns a Map keyed by id with an entry per weight, summing to the total', () => {
    const r = allocateLargestRemainder($(999), ws({ x: 1, y: 2, z: 3 }));
    expect(r).toBeInstanceOf(Map);
    expect([...r.keys()].sort()).toEqual(['x', 'y', 'z']);
    expect([...r.values()].reduce((a, v) => a + (v as number), 0)).toBe(999);
  });

  it('R9.1 is deterministic and ignores input order (property, oracle-checked)', () => {
    const arb = fc
      .record({
        total: fc.integer({ min: -2_000_000, max: 2_000_000 }),
        weights: fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 8 }).filter((a) => a.some((x) => x > 0)),
        perm: fc.integer({ min: 0, max: 10_000 }),
      })
      .map(({ total, weights, perm }) => {
        const list = weights.map((weight, i) => ({ id: `id${String.fromCharCode(97 + i)}`, weight }));
        const shuffled = [...list];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (perm * (i + 7)) % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        return { total, list, shuffled };
      });
    fc.assert(
      fc.property(arb, ({ total, list, shuffled }) => {
        const a = lr(total, list);
        const b = lr(total, shuffled);
        expect(b).toEqual(a);
        expect(a).toEqual(oracle(total, list));
        const s = Object.values(a).reduce((x, y) => x + y, 0);
        expect(s).toBe(total);
        // each share within one paisa of its exact quota
        const Wsum = list.reduce((x, y) => x + (y.weight as number), 0);
        for (const { id, weight } of list) {
          const q = (Math.abs(total) * (weight as number)) / Wsum;
          expect(Math.abs(a[id]!)).toBeGreaterThanOrEqual(Math.floor(q) - 1e-6);
          expect(Math.abs(a[id]!)).toBeLessThanOrEqual(Math.ceil(q) + 1e-6);
          if (weight === 0) expect(a[id]).toBe(0);
        }
        // symmetry
        const neg = lr(-total, list);
        for (const id of Object.keys(a)) expect(neg[id]).toBe(a[id] === 0 ? 0 : -a[id]!);
      }),
      { numRuns: 300 },
    );
  });

  it('R16.10 total 0 with all-zero weights returns all zeros', () => {
    expect(lr(0, ws({ a: 0, b: 0 }))).toEqual({ a: 0, b: 0 });
  });

  it('R16.10 non-zero total with all-zero weights throws RangeError', () => {
    expect(() => allocateLargestRemainder($(100), ws({ a: 0, b: 0 }))).toThrow(RangeError);
    expect(() => allocateLargestRemainder($(-100), ws({ a: 0 }))).toThrow(RangeError);
  });

  it('R16.10 negative or unsafe weights, or an unsafe total, throw RangeError', () => {
    expect(() => allocateLargestRemainder($(100), ws({ a: -1, b: 2 }))).toThrow(RangeError);
    expect(() => allocateLargestRemainder($(100), ws({ a: Number.MAX_SAFE_INTEGER + 1, b: 1 }))).toThrow(RangeError);
    expect(() => allocateLargestRemainder($(100), [{ id: 'a', weight: -1n }, { id: 'b', weight: 2n }])).toThrow(RangeError);
    expect(() => allocateLargestRemainder((Number.MAX_SAFE_INTEGER + 1) as never, ws({ a: 1 }))).toThrow(RangeError);
  });
});
