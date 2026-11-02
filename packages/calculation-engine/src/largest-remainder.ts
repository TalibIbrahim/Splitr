import { add, cmp, floorQ, mul, neg, q, sub, toExact, ZERO, div, type Q } from './rational';
import type { AllocateLargestRemainder, AllocationTrace, Paisa } from './types';
import { paisaOf } from './rational';

export interface LrRow {
  readonly id: string;
  readonly weight: Q;
  readonly quota: Q;
  readonly floor: bigint;
  readonly remainder: Q;
  readonly bonus: bigint;
  readonly amount: bigint;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * R9.1 largest remainder with exact rational weights. Rows are returned sorted by id (R2.2/R2.3).
 * For negative totals the magnitude is allocated and quota/floor/bonus/amount are negated
 * (the remainder stays the positive fractional part used for ranking).
 */
export function largestRemainder(total: bigint, weights: readonly { id: string; weight: Q }[]): LrRow[] {
  const sorted = [...weights].sort((a, b) => byId(a.id, b.id));
  if (total === 0n) {
    return sorted.map((w) => ({
      id: w.id,
      weight: w.weight,
      quota: ZERO,
      floor: 0n,
      remainder: ZERO,
      bonus: 0n,
      amount: 0n,
    }));
  }
  const negative = total < 0n;
  const magnitude = negative ? -total : total;
  let sumW = ZERO;
  for (const w of sorted) {
    if (cmp(w.weight, ZERO) < 0) throw new RangeError('negative weight');
    sumW = add(sumW, w.weight);
  }
  if (cmp(sumW, ZERO) <= 0) throw new RangeError('weights must sum to a positive value');

  const base = sorted.map((w) => {
    const quota = div(mul(q(magnitude), w.weight), sumW);
    const fl = floorQ(quota);
    return { w, quota, fl, rem: sub(quota, q(fl)) };
  });
  const floorSum = base.reduce((s, r) => s + r.fl, 0n);
  let k = magnitude - floorSum;
  const ranked = [...base].sort((a, b) => cmp(b.rem, a.rem) || byId(a.w.id, b.w.id));
  const winners = new Set<string>();
  for (const r of ranked) {
    if (k <= 0n) break;
    winners.add(r.w.id);
    k -= 1n;
  }
  return base.map((r) => {
    const bonus = winners.has(r.w.id) ? 1n : 0n;
    const amount = r.fl + bonus;
    return {
      id: r.w.id,
      weight: r.w.weight,
      quota: negative ? neg(r.quota) : r.quota,
      floor: negative ? -r.fl : r.fl,
      remainder: r.rem,
      bonus: negative ? -bonus : bonus,
      amount: negative ? -amount : amount,
    };
  });
}

export function rowsToTrace(total: bigint, rows: readonly LrRow[]): AllocationTrace {
  return {
    total: paisaOf(total),
    rows: rows.map((r) => ({
      participantId: r.id,
      weight: toExact(r.weight),
      quota: toExact(r.quota),
      floor: paisaOf(r.floor),
      remainder: toExact(r.remainder),
      bonus: paisaOf(r.bonus),
      amount: paisaOf(r.amount),
    })),
  };
}

/** Public R9.1 helper. Throws RangeError on invalid arguments. */
export const allocateLargestRemainder: AllocateLargestRemainder = (total, weights) => {
  if (!Number.isSafeInteger(total)) throw new RangeError('total must be a safe integer');
  const ws = weights.map((w) => {
    let big: bigint;
    if (typeof w.weight === 'bigint') {
      big = w.weight;
    } else {
      if (!Number.isSafeInteger(w.weight)) throw new RangeError('weight must be a safe integer');
      big = BigInt(w.weight);
    }
    if (big < 0n) throw new RangeError('weight must be non-negative');
    return { id: w.id, weight: q(big) };
  });
  const rows = largestRemainder(BigInt(total), ws);
  const byKey = new Map(rows.map((r) => [r.id, r.amount]));
  const out = new Map<string, Paisa>();
  for (const w of weights) out.set(w.id, paisaOf(byKey.get(w.id) ?? 0n));
  return out;
};
