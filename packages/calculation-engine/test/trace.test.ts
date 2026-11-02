import { describe, expect, it } from 'vitest';
import type { AllocationTrace, BillBreakdown, TraceStep } from '../src/index';
import { allFixtures, assignment as A, charges as C, discounts as D, fixtureA, fixtureB, settlement as S } from './fixtures';
import { mustOk } from './helpers';

type Step<K extends TraceStep['type']> = Extract<TraceStep, { type: K }>;
const steps = <K extends TraceStep['type']>(b: BillBreakdown, type: K): Step<K>[] =>
  b.trace.filter((s): s is Step<K> => s.type === type);

/** R13.2 — rebuild each participant's exact total from the trace alone. */
function rebuild(b: BillBreakdown): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(b.participants.map((p) => [p.participantId, 0]));
  for (const s of steps(b, 'item-split')) {
    for (const r of s.allocation.rows) out[r.participantId] = (out[r.participantId] ?? 0) + (r.amount as number);
  }
  for (const s of steps(b, 'adjustment-allocation')) {
    for (const r of s.allocation.rows) out[r.participantId] = (out[r.participantId] ?? 0) + (r.amount as number);
  }
  return out;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));

/** Visits every Exact-shaped object anywhere in the trace. */
function allExacts(value: unknown, out: { numerator: string; denominator: string; rounded: number }[] = []) {
  if (Array.isArray(value)) value.forEach((v) => allExacts(v, out));
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.numerator === 'string' && typeof o.denominator === 'string') {
      out.push(o as unknown as { numerator: string; denominator: string; rounded: number });
    } else {
      Object.values(o).forEach((v) => allExacts(v, out));
    }
  }
  return out;
}

const okFixtures = allFixtures.filter((f) => f.expect.ok);

describe('R13 trace', () => {
  it('R13.2 Fixture A: each exactTotal is rebuilt from the trace alone', () => {
    const b = mustOk(fixtureA.input).breakdown;
    expect(rebuild(b)).toEqual({ p1: 360000, p2: 270000, p3: 180000, p4: 90000 });
    for (const p of b.participants) expect(rebuild(b)[p.participantId]).toBe(p.exactTotal as number);
  });

  it('R13.2 Fixture B: each exactTotal is rebuilt from the trace alone ("How you got to 1,806")', () => {
    const b = mustOk(fixtureB.input).breakdown;
    expect(rebuild(b)).toEqual({ mahhee: 180625, hamza: 263500, ali: 225250, saad: 180625 });
    for (const p of b.participants) expect(rebuild(b)[p.participantId]).toBe(p.exactTotal as number);
  });

  it.each(okFixtures.map((f) => [f.rules.join(',') + ' ' + f.name, f] as const))('R13.2 rebuild from trace: %s', (_n, f) => {
    const b = mustOk(f.input).breakdown;
    const rebuilt = rebuild(b);
    for (const p of b.participants) expect(rebuilt[p.participantId], p.participantId).toBe(p.exactTotal as number);
  });

  it('R13.1 has an item-split step for every assigned item and an adjustment step for every adjustment', () => {
    const b = mustOk(fixtureB.input).breakdown;
    expect(steps(b, 'item-split').map((s) => s.itemId).sort()).toEqual(['daal', 'doodh', 'karahi', 'margarita', 'naan', 'seekh']);
    expect(steps(b, 'adjustment').map((s) => s.adjustmentId).sort()).toEqual(['card', 'gst']);
    expect(steps(b, 'adjustment-allocation').map((s) => s.adjustmentId).sort()).toEqual(['card', 'gst']);
    expect(steps(b, 'settlement-rounding')).toHaveLength(1);
    expect(steps(b, 'rounding-residual')).toHaveLength(1);
  });

  it('R13.1 item-split steps carry the assignment kind and total (Seekh is units)', () => {
    const b = mustOk(fixtureB.input).breakdown;
    const seekh = steps(b, 'item-split').find((s) => s.itemId === 'seekh')!;
    expect(seekh.assignmentKind).toBe('units');
    expect(seekh.allocation.total as number).toBe(290000);
    expect(seekh.allocation.rows.map((r) => [r.participantId, r.amount as number]).sort()).toEqual([
      ['ali', 145000],
      ['hamza', 145000],
    ]);
  });

  it('R13.1 adjustment step records base, type, rate, raw value and final amount (Fixture A)', () => {
    const b = mustOk(fixtureA.input).breakdown;
    const d = steps(b, 'adjustment').find((s) => s.adjustmentId === 'disc')!;
    expect(d.baseType).toBe('items');
    expect(d.base).toMatchObject({ numerator: '1000000', denominator: '1' });
    expect(d.rateBp as number).toBe(2000);
    expect(d.raw).toMatchObject({ numerator: '200000', denominator: '1' });
    expect(d.computed as number).toBe(200000);
    expect(d.capped).toBe(false);
    expect(d.clamped).toBe(false);
    expect(d.amount as number).toBe(-200000);
    expect(d.eligibleItemIds.slice().sort()).toEqual(['i1', 'i2', 'i3', 'i4']);
    const t = steps(b, 'adjustment').find((s) => s.adjustmentId === 'tax')!;
    expect(t.amount as number).toBe(100000);
  });

  it('R13.1 skipped adjustments keep their reason in the trace', () => {
    const b = mustOk(D.minimumSpendNotMet.input).breakdown;
    const s = steps(b, 'adjustment')[0]!;
    expect(s.notApplied).toBe('below-minimum-spend');
    expect(s.amount as number).toBe(0);
  });

  it('R13.1 allocation rows are self-consistent: floor + bonus = amount (non-negative totals)', () => {
    for (const f of okFixtures) {
      const b = mustOk(f.input).breakdown;
      const all: AllocationTrace[] = [
        ...steps(b, 'item-split').map((s) => s.allocation),
        ...steps(b, 'adjustment-allocation').map((s) => s.allocation),
      ];
      for (const a of all) {
        if ((a.total as number) < 0) continue;
        expect(a.rows.reduce((acc, r) => acc + (r.amount as number), 0), f.name).toBe(a.total as number);
        for (const r of a.rows) {
          expect((r.floor as number) + (r.bonus as number), `${f.name} ${r.participantId}`).toBe(r.amount as number);
          expect(r.bonus as number).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('R13.1 equal split 1000 among 3 records weight 1, quota 1000/3, remainder 1/3 and who got the leftover paisa', () => {
    const b = mustOk(S.settlementCustomUnit.input).breakdown;
    const split = steps(b, 'item-split')[0]!;
    const a = split.allocation.rows.find((r) => r.participantId === 'a')!;
    expect(a.weight).toMatchObject({ numerator: '1', denominator: '1' });
    expect(a.quota).toMatchObject({ numerator: '1000', denominator: '3', rounded: 333 });
    expect(a.remainder).toMatchObject({ numerator: '1', denominator: '3' });
    expect(a.floor as number).toBe(333);
    expect(a.bonus as number).toBe(1);
    expect(split.allocation.rows.filter((r) => (r.bonus as number) > 0).map((r) => r.participantId)).toEqual(['a']);
  });

  it('R13.1 quota = total x weight / sum(weights) for every item split (cross-multiplied, exact)', () => {
    for (const f of okFixtures) {
      const b = mustOk(f.input).breakdown;
      for (const s of steps(b, 'item-split')) {
        if ((s.allocation.total as number) <= 0) continue;
        const W = s.allocation.rows.reduce((acc, r) => acc + BigInt(r.weight.numerator) / BigInt(r.weight.denominator), 0n);
        for (const r of s.allocation.rows) {
          const w = BigInt(r.weight.numerator) / BigInt(r.weight.denominator);
          // quota.num / quota.den == total * w / W
          expect(BigInt(r.quota.numerator) * W, `${f.name} ${s.itemId} ${r.participantId}`).toBe(
            BigInt(s.allocation.total as number) * w * BigInt(r.quota.denominator),
          );
          // floor
          expect(BigInt(r.quota.numerator) / BigInt(r.quota.denominator)).toBe(BigInt(r.floor as number));
        }
      }
    }
  });

  it('R13.1 settlement-rounding step: unit, exact and rounded totals, per-person rounded amounts', () => {
    const b = mustOk(fixtureB.input).breakdown;
    const s = steps(b, 'settlement-rounding')[0]!;
    expect(s.unit as number).toBe(100);
    expect(s.exactTotal as number).toBe(850000);
    expect(s.roundedTotal as number).toBe(850000);
    const amounts = Object.fromEntries(s.allocation.rows.map((r) => [r.participantId, r.amount as number]));
    expect(amounts).toEqual({ mahhee: 180600, hamza: 263500, ali: 225300, saad: 180600 });
  });

  it('R13.1 rounding-residual step records the residual and its holder', () => {
    const b = mustOk(S.settlementNegativeResidual.input).breakdown;
    const r = steps(b, 'rounding-residual')[0]!;
    expect(r.residual as number).toBe(-40);
    expect(r.participantId).toBe('a');
  });

  it('R13.1 transfer steps mirror settlement.transfers in order', () => {
    const b = mustOk(fixtureB.input).breakdown;
    expect(steps(b, 'transfer').map((t) => [t.from, t.to, t.amount as number])).toEqual([
      ['ali', 'hamza', 225300],
      ['mahhee', 'hamza', 180600],
      ['saad', 'hamza', 180600],
    ]);
    expect(b.settlement!.transfers.map((t) => [t.from, t.to, t.amount as number])).toEqual(
      steps(b, 'transfer').map((t) => [t.from, t.to, t.amount as number]),
    );
  });

  it('R13.1 allocation step names the policy and whether the equal fallback was used', () => {
    const tip = steps(mustOk(C.tipEqual.input).breakdown, 'adjustment-allocation')[0]!;
    expect(tip.policy).toBe('equal');
    expect(tip.fallbackEqual).toBe(false);
    const fee = steps(mustOk(C.fallbackEqual.input).breakdown, 'adjustment-allocation')[0]!;
    expect(fee.fallbackEqual).toBe(true);
  });

  it('R13.3 every Exact in the trace is reduced with a positive denominator and decimal strings', () => {
    let count = 0;
    for (const f of okFixtures) {
      const b = mustOk(f.input).breakdown;
      for (const e of allExacts(b.trace)) {
        count++;
        expect(e.numerator, f.name).toMatch(/^-?\d+$/);
        expect(e.denominator, f.name).toMatch(/^\d+$/);
        const n = BigInt(e.numerator);
        const d = BigInt(e.denominator);
        expect(d > 0n, `${f.name}: denominator ${e.denominator}`).toBe(true);
        expect(gcd(n, d), `${f.name}: ${e.numerator}/${e.denominator} not reduced`).toBe(1n);
        expect(Number.isInteger(e.rounded)).toBe(true);
      }
    }
    expect(count).toBeGreaterThan(100);
  });

  it('R13.3 `rounded` is the half-up display value: 1000/3 -> 333, 2000/3 -> 667', () => {
    const input = A.weightsSplit.input; // 1000 with weights a:1, b:2
    const rows = steps(mustOk(input).breakdown, 'item-split')[0]!.allocation.rows;
    expect(rows.find((r) => r.participantId === 'a')!.quota).toMatchObject({ numerator: '1000', denominator: '3', rounded: 333 });
    expect(rows.find((r) => r.participantId === 'b')!.quota).toMatchObject({ numerator: '2000', denominator: '3', rounded: 667 });
  });

  it('R13.3 exact zero is written 0/1', () => {
    const zeros = okFixtures.flatMap((f) => allExacts(mustOk(f.input).breakdown.trace)).filter((e) => e.numerator === '0');
    expect(zeros.length).toBeGreaterThan(0);
    for (const z of zeros) expect(z.denominator).toBe('1');
  });
});
