import type { Exact, Paisa, RoundingMode } from './types';

/** Exact rational: reduced, d > 0. BigInt only; no floating point anywhere (R1.3). */
export interface Q {
  readonly n: bigint;
  readonly d: bigint;
}

const abs = (a: bigint): bigint => (a < 0n ? -a : a);

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function q(n: bigint, d: bigint = 1n): Q {
  if (d === 0n) throw new RangeError('zero denominator');
  let nn = n;
  let dd = d;
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  if (nn === 0n) return { n: 0n, d: 1n };
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

export const ZERO: Q = { n: 0n, d: 1n };

export const add = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Q, b: Q): Q => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export const div = (a: Q, b: Q): Q => q(a.n * b.d, a.d * b.n);
export const neg = (a: Q): Q => ({ n: -a.n, d: a.d });
export const sign = (a: Q): -1 | 0 | 1 => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);
export const cmp = (a: Q, b: Q): -1 | 0 | 1 => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};
export const maxQ = (a: Q, b: Q): Q => (cmp(a, b) >= 0 ? a : b);

/** Floor division for b > 0. */
export function floorDiv(a: bigint, b: bigint): bigint {
  const quo = a / b;
  return a % b < 0n ? quo - 1n : quo;
}

export const floorQ = (a: Q): bigint => floorDiv(a.n, a.d);
export const ceilQ = (a: Q): bigint => -floorDiv(-a.n, a.d);

/** Round a NON-NEGATIVE rational to an integer using an adjustment rounding mode (R8.3). */
export function roundQ(x: Q, mode: RoundingMode): bigint {
  if (x.n < 0n) throw new RangeError('roundQ expects a non-negative value');
  switch (mode) {
    case 'down':
      return floorQ(x);
    case 'up':
      return ceilQ(x);
    case 'half-up':
      return floorDiv(2n * x.n + x.d, 2n * x.d);
    case 'half-even': {
      const fl = floorQ(x);
      const twiceRem = 2n * (x.n - fl * x.d);
      if (twiceRem < x.d) return fl;
      if (twiceRem > x.d) return fl + 1n;
      return fl % 2n === 0n ? fl : fl + 1n;
    }
  }
}

/** Half away from zero, any sign. Used for display `rounded` and preview. */
export function roundHalfAway(x: Q): bigint {
  return x.n < 0n ? -roundQ(neg(x), 'half-up') : roundQ(x, 'half-up');
}

/** Convert a bigint to a branded Paisa. Throws RangeError if not a safe integer (caught by calculateBill). */
export function paisaOf(b: bigint): Paisa {
  const n = Number(b);
  if (!Number.isSafeInteger(n) || BigInt(n) !== b) {
    throw new RangeError('amount exceeds the safe integer range');
  }
  return (n === 0 ? 0 : n) as Paisa;
}

export function toExact(x: Q): Exact {
  return {
    numerator: x.n.toString(),
    denominator: x.d.toString(),
    rounded: paisaOf(roundHalfAway(x)),
  };
}
