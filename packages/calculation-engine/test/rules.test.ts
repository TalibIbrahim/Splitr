import { describe, expect, it, vi } from 'vitest';
import { allocateLargestRemainder, calculateBill, toBasisPoints, toPaisa } from '../src/index';
import type { BillBreakdown, BillInput, TraceStep } from '../src/index';
import {
  assignment as A,
  charges as C,
  discounts as D,
  fixtureA,
  fixtureB,
  lines as L,
  overrides as O,
  reconciliation as Rc,
  settlement as S,
  taxes as T,
} from './fixtures';
import { allFixtures } from './fixtures';
import { $, adj, paid, adjAmounts, bill, eq, exactTotals, fixed, item, mustFail, mustOk, people, rate, roundedTotals } from './helpers';
import { checkFixture } from './run-fixture';

type AdjStep = Extract<TraceStep, { type: 'adjustment' }>;
type AllocStep = Extract<TraceStep, { type: 'adjustment-allocation' }>;
const adjStep = (b: BillBreakdown, id: string): AdjStep => {
  const s = b.trace.find((x): x is AdjStep => x.type === 'adjustment' && x.adjustmentId === id);
  if (!s) throw new Error(`no adjustment trace step for ${id}`);
  return s;
};
const allocStep = (b: BillBreakdown, id: string): AllocStep => {
  const s = b.trace.find((x): x is AllocStep => x.type === 'adjustment-allocation' && x.adjustmentId === id);
  if (!s) throw new Error(`no allocation trace step for ${id}`);
  return s;
};

// ───────────────────────── every fixture, with its expected values ─────────────────────────

describe('fixtures (hand-derived expectations, see test/fixtures/*.ts)', () => {
  for (const f of allFixtures) {
    it(`${f.rules.join(',')} ${f.name}`, () => checkFixture(f));
  }
});

// ───────────────────────── R1 Representation ─────────────────────────

describe('R1 representation', () => {
  it('R1.1 toPaisa / toBasisPoints accept safe integers and throw RangeError otherwise', () => {
    expect(toPaisa(150) as number).toBe(150);
    expect(toPaisa(-5) as number).toBe(-5);
    expect(toBasisPoints(2000) as number).toBe(2000);
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => toPaisa(bad)).toThrow(RangeError);
      expect(() => toBasisPoints(bad)).toThrow(RangeError);
    }
  });

  it('R1.1 non-integer / non-finite / unsafe money in the input is INVALID_INPUT', () => {
    for (const bad of [100.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const r = mustFail(bill({ participants: people('a'), items: [item('x', bad, eq('a'))] }));
      expect(r.errors.map((e) => e.code)).toContain('INVALID_INPUT');
    }
  });

  it('R1.2 a discount of exactly 10000 bp is allowed, 10001 bp is INVALID_INPUT', () => {
    const ok = mustOk(
      bill({ participants: people('a'), items: [item('x', 5000, eq('a'))], adjustments: [adj('d', 'discount', rate(10000))] }),
    );
    expect(adjAmounts(ok.breakdown)).toEqual({ d: -5000 });
    const bad = mustFail(
      bill({ participants: people('a'), items: [item('x', 5000, eq('a'))], adjustments: [adj('d', 'discount', rate(10001))] }),
    );
    expect(bad.errors.map((e) => e.code)).toEqual(['INVALID_INPUT']);
  });

  it('R1.2 non-discount rates above 10000 bp are allowed (200% fee)', () => {
    const ok = mustOk(
      bill({ participants: people('a'), items: [item('x', 5000, eq('a'))], adjustments: [adj('f', 'fee', rate(20000))], unit: 1 }),
    );
    expect(adjAmounts(ok.breakdown)).toEqual({ f: 10000 });
  });

  it('R1.3 large values are computed exactly and the raw value is the exact rational', () => {
    const r = mustOk(T.largeValuesExact.input);
    const s = adjStep(r.breakdown, 'tax');
    expect(s.raw?.numerator).toBe('13332000000000003333');
    expect(s.raw?.denominator).toBe('10000');
    expect(s.computed as number).toBe(1333200000000000);
  });

  it('R1.3 rounding happens only at the listed points: exact attribution is not rounded before the later tax', () => {
    checkFixture(T.exactAttribution);
  });

  it('R1.4 pure: frozen input, no randomness, no clock', () => {
    const deepFreeze = <X>(o: X): X => {
      if (o && typeof o === 'object') {
        Object.freeze(o);
        for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
      }
      return o;
    };
    const input = deepFreeze(structuredClone(fixtureB.input)) as BillInput;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2001-01-01T00:00:00Z'));
      const first = calculateBill(input);
      vi.setSystemTime(new Date('2099-12-31T23:59:59Z'));
      const second = calculateBill(input);
      expect(second).toEqual(first);
    } finally {
      vi.useRealTimers();
      random.mockRestore();
    }
  });

  it('R1.4 dates come from the input: validity weekday is derived from bill.date, not today', () => {
    checkFixture(Rc.validityFixtures[3]!); // Monday matches
    checkFixture(Rc.validityFixtures[8]!); // Sunday/Saturday does not
  });
});

// ───────────────────────── R2 Determinism and ordering ─────────────────────────

describe('R2 determinism and ordering', () => {
  it('R2.1 same input twice gives deep-equal output (also across a structured clone)', () => {
    for (const f of [fixtureA, fixtureB, T.taxAfterDiscount, S.settlementResidualTie]) {
      const r1 = calculateBill(f.input);
      const r2 = calculateBill(structuredClone(f.input));
      expect(r2).toEqual(r1);
      expect(JSON.stringify(r2)).toBe(JSON.stringify(r1));
    }
  });

  it('R2.2 ties compare IDs by code-unit order, not locale', () => {
    checkFixture(L.codeUnitOrderUpper);
    checkFixture(L.codeUnitOrderDigits);
  });

  it('R2.3 reversing every input array of Fixture B changes no amount (keyed by id)', () => {
    const rev = <X>(xs: readonly X[]) => [...xs].reverse();
    const flipped: BillInput = {
      ...fixtureB.input,
      participants: rev(fixtureB.input.participants),
      items: rev(fixtureB.input.items).map((i) =>
        i.assignment.kind === 'equal'
          ? { ...i, assignment: { kind: 'equal' as const, participantIds: rev(i.assignment.participantIds) } }
          : i.assignment.kind === 'units'
            ? { ...i, assignment: { kind: 'units' as const, entries: rev(i.assignment.entries) } }
            : i,
      ),
      adjustments: rev(fixtureB.input.adjustments),
      contributions: rev(fixtureB.input.contributions),
    };
    const a = mustOk(fixtureB.input).breakdown;
    const b = mustOk(flipped).breakdown;
    expect(exactTotals(b)).toEqual(exactTotals(a));
    expect(roundedTotals(b)).toEqual(roundedTotals(a));
    expect(adjAmounts(b)).toEqual(adjAmounts(a));
    expect(b.settlement?.transfers).toEqual(a.settlement?.transfers);
    // output lists participants in INPUT order
    expect(b.participants.map((p) => p.participantId)).toEqual(['saad', 'ali', 'hamza', 'mahhee']);
    expect(a.participants.map((p) => p.participantId)).toEqual(['mahhee', 'hamza', 'ali', 'saad']);
  });

  it('R2.3 adjustments are listed in application order (order, id), not input order', () => {
    const input = bill({
      participants: people('a'),
      items: [item('x', 10000, eq('a'))],
      adjustments: [
        adj('z', 'fee', fixed(1), { order: 1 }),
        adj('a', 'fee', fixed(1), { order: 2 }),
        adj('m', 'fee', fixed(1), { order: 1 }),
      ],
      unit: 1,
    });
    expect(mustOk(input).breakdown.adjustments.map((x) => x.adjustmentId)).toEqual(['m', 'z', 'a']);
  });

  it('R2.3 stable tie-break regardless of listing order', () => {
    checkFixture(L.tieStableReverse);
    checkFixture(A.equalSplit);
  });

  it('R2.4 duplicate or empty ids are INVALID_INPUT', () => {
    for (const f of L.lineErrors.filter((x) => x.rules.includes('R2.4'))) checkFixture(f);
  });
});

// ───────────────────────── R3 Input validation ─────────────────────────

describe('R3 input validation', () => {
  it('R3.1 needs at least one participant', () => {
    checkFixture(L.lineErrors.find((f) => f.name === 'zero participants is invalid')!);
  });
  it('R3.1 zero items is allowed (total 0)', () => checkFixture(L.zeroItems));
  it('R3.2 quantity must be an integer >= 1', () => {
    for (const f of L.lineErrors.filter((x) => x.rules.includes('R3.2'))) checkFixture(f);
  });
  it('R3.2 lineTotal may be negative (void) or 0 (free)', () => {
    checkFixture(L.voidItem);
    checkFixture(A.complimentary);
  });
  it('R3.3 quantity x unitPrice must equal lineTotal', () => {
    checkFixture(L.unitPriceMatches);
    checkFixture(L.lineErrors.find((f) => f.rules.includes('R3.3') && !f.expect.ok)!);
  });
  it('R3.3 lineTotal stays authoritative: a matching line is taken as-is', () => {
    expect(mustOk(L.unitPriceMatches.input).breakdown.itemsSubtotal as number).toBe(4500);
  });
  it('R3.4 unknown IDs, duplicate participants and non-positive weights/units are INVALID_INPUT', () => {
    for (const f of L.lineErrors.filter((x) => x.rules.includes('R3.4'))) checkFixture(f);
    checkFixture(Rc.contributionUnknownParticipant);
  });
  it('R3.5 settlementRoundingUnit must be an integer >= 1; default is 100', () => {
    for (const f of L.lineErrors.filter((x) => x.rules.includes('R3.5'))) checkFixture(f);
    expect(mustOk(bill({ participants: people('a'), items: [item('x', 1000, eq('a'))] })).breakdown.settlementRoundingUnit as number).toBe(100);
  });
  it('R3.6 override.reason must be non-empty', () => {
    checkFixture(L.lineErrors.find((f) => f.rules.includes('R3.6'))!);
    checkFixture(D.overrideDiscount);
  });
  it('R3.7 validity requires bill.date in YYYY-MM-DD', () => {
    for (const f of L.lineErrors.filter((x) => x.rules.includes('R3.7'))) checkFixture(f);
  });
  it('R3.7 an adjustment without validity does not need bill.date', () => {
    expect(mustOk(bill({ participants: people('a'), items: [item('x', 1000, eq('a'))], adjustments: [adj('t', 'tax', rate(100))] })).breakdown.total as number).toBe(1010);
  });
});

// ───────────────────────── R4 Item assignment ─────────────────────────

describe('R4 item assignment', () => {
  it('R4.1 unassigned non-zero item is an ITEM_UNASSIGNED error', () => checkFixture(A.assignmentErrors[0]!));
  it('R4.1 unassigned zero-priced item is a warning and contributes nothing', () => checkFixture(A.zeroUnassigned));
  it('R4.2 equal split gives leftover paisa to lowest id', () => checkFixture(A.equalSplit));
  it('R4.2 trace records who received the leftover paisa', () => {
    const b = mustOk(A.equalSplit.input).breakdown;
    const step = b.trace.find((s) => s.type === 'item-split' && s.itemId === 'x');
    expect(step?.type).toBe('item-split');
    if (step?.type !== 'item-split') return;
    const bonus = Object.fromEntries(step.allocation.rows.map((r) => [r.participantId, r.bonus as number]));
    expect(bonus).toEqual({ a: 1, b: 0, c: 0 });
    expect(Object.fromEntries(step.allocation.rows.map((r) => [r.participantId, r.floor as number]))).toEqual({ a: 333, b: 333, c: 333 });
  });
  it('R4.3 weights (fraction 1/3 + 2/3) split 1000 into 333 / 667', () => checkFixture(A.weightsSplit));
  it('R4.4 percent entries that sum to 10000 bp split like weights', () => checkFixture(A.percentSplit));
  it('R4.4 percent under 10000 bp is ITEM_UNDER_ASSIGNED, over is ITEM_OVER_ASSIGNED', () => {
    checkFixture(A.assignmentErrors[1]!);
    checkFixture(A.assignmentErrors[2]!);
  });
  it('R4.5 amounts are used as-is', () => checkFixture(A.amountsSplit));
  it('R4.5 amounts must sum to lineTotal (under / over / negative-line magnitude / wrong sign)', () => {
    for (const i of [3, 4, 5, 6]) checkFixture(A.assignmentErrors[i]!);
  });
  it('R4.6 units split money like weights (Seekh x2 -> 1450 each; 2:1 of 1000 -> 667/333)', () => {
    checkFixture(A.seekhUnits);
    checkFixture(A.unitsSplit);
  });
  it('R4.6 units must sum to quantity', () => {
    checkFixture(A.assignmentErrors[7]!);
    checkFixture(A.assignmentErrors[8]!);
  });
  it('R4.7 negative lineTotal splits by magnitude and negates (symmetric rounding)', () => checkFixture(A.negativeSplitSymmetric));
  it('R4.7 the negative split is exactly the negation of the positive largest-remainder split', () => {
    const pos = allocateLargestRemainder($(1001), ['a', 'b', 'c'].map((id) => ({ id, weight: 1 })));
    const b = mustOk(
      bill({
        participants: people('a', 'b', 'c'),
        items: [item('x', 5000, eq('a', 'b', 'c')), item('void', -1001, eq('c', 'b', 'a'))],
        unit: 1,
      }),
    ).breakdown;
    const voidShares = Object.fromEntries(
      b.participants.map((p) => [p.participantId, p.items.find((i) => i.itemId === 'void')?.amount ?? 0]),
    );
    for (const id of ['a', 'b', 'c']) expect(voidShares[id]).toBe(-(pos.get(id) as number));
  });
  it('R4.8 an item is attributed to whoever it is assigned to (the person covering it)', () => checkFixture(A.coversItem));
});

// ───────────────────────── R5 Adjustments ─────────────────────────

describe('R5 adjustments: definition and order', () => {
  it('R5.1 discount subtracts; tax / serviceCharge / tip / fee add; custom states its direction', () => {
    checkFixture(D.percentDiscount);
    checkFixture(C.serviceCharge);
    checkFixture(C.tipEqual);
    checkFixture(C.fixedFee);
    checkFixture(C.customSubtract);
    checkFixture(C.customAdd);
    const b = mustOk(fixtureA.input).breakdown;
    expect(b.adjustments.find((x) => x.adjustmentId === 'disc')!.amount as number).toBeLessThan(0);
    expect(b.adjustments.find((x) => x.adjustmentId === 'tax')!.amount as number).toBeGreaterThan(0);
  });
  it('R5.1 a custom adjustment must declare its direction', () => {
    checkFixture(L.lineErrors.find((f) => f.rules.includes('R5.1'))!);
  });
  it('R5.2 value is either a rate (bp of the base) or a fixed magnitude', () => {
    checkFixture(D.percentDiscount);
    checkFixture(D.fixedDiscount);
  });
  it('R5.3 applied in ascending (order, id); array position is irrelevant', () => {
    checkFixture(T.orderNotArrayPosition);
    checkFixture(Rc.sameOrderLowerIdIsEarlier);
  });
});

// ───────────────────────── R6 Eligibility ─────────────────────────

describe('R6 eligibility', () => {
  it('R6.1 include = itemIds OR categories', () => checkFixture(D.includeUnion));
  it('R6.1 exclusion wins over inclusion', () => {
    checkFixture(D.exclusionWins);
    checkFixture(D.excludedCategory);
  });
  it('R6.2 mixed tax rates by category, non-taxable items untouched', () => {
    checkFixture(T.mixedTaxRates);
    checkFixture(T.nonTaxableExcluded);
  });
  it('R6.3 no eligible item: amount 0 and ADJUSTMENT_NOT_APPLIED (no-eligible-items)', () => {
    checkFixture(D.noEligible);
    const b = mustOk(D.noEligible.input).breakdown;
    const step = adjStep(b, 'd');
    expect(step.notApplied).toBe('no-eligible-items');
    expect(b.adjustments[0]!.applied).toBe(false);
    expect(b.adjustments[0]!.notAppliedReason).toBe('no-eligible-items');
  });
});

// ───────────────────────── R7 Base ─────────────────────────

describe('R7 base', () => {
  it('R7.1 items base = eligible item shares (tax on original subtotal, Fixture A)', () => {
    const b = mustOk(fixtureA.input).breakdown;
    for (const id of ['disc', 'tax']) {
      const s = adjStep(b, id);
      expect(s.baseType).toBe('items');
      expect(s.base.numerator).toBe('1000000');
      expect(s.base.denominator).toBe('1');
    }
  });
  it('R7.1 tax on selected items uses only their shares', () => checkFixture(T.taxSelectedItems));
  it('R7.2 items-after [disc] = items plus the exact attribution of the discount (tax after discount)', () => {
    checkFixture(T.taxAfterDiscount);
    const s = adjStep(mustOk(T.taxAfterDiscount.input).breakdown, 'tax');
    expect(s.baseType).toBe('items-after');
    expect(s.base.numerator).toBe('800000');
    expect(s.base.denominator).toBe('1');
  });
  it('R7.2 all-prior includes every earlier adjustment', () => {
    checkFixture(T.taxAllPrior);
    checkFixture(D.stackedAllPrior);
  });
  it('R7.2 stacked discounts', () => checkFixture(D.stackedDiscounts));
  it('R7.2 includes must be earlier and proportional, otherwise ADJUSTMENT_INVALID_BASE', () => {
    for (const f of Rc.invalidBaseFixtures) checkFixture(f);
  });
  it('R7.2 an adjustment with the same order and a lower id counts as earlier', () => checkFixture(Rc.sameOrderLowerIdIsEarlier));
  it('R7.3 fixed base: B = printed taxable amount, weights = eligible item shares', () => {
    checkFixture(T.taxFixedBase);
    const s = adjStep(mustOk(T.taxFixedBase.input).breakdown, 'tax');
    expect(s.baseType).toBe('fixed');
    expect(s.base.numerator).toBe('80000');
  });
});

// ───────────────────────── R8 Amount of an adjustment ─────────────────────────

describe('R8 amount of an adjustment', () => {
  it('R8.1 outside validity dates: amount 0 + outside-validity warning', () => {
    for (const f of Rc.validityFixtures) checkFixture(f);
    const s = adjStep(mustOk(Rc.validityFixtures[6]!.input).breakdown, 'd');
    expect(s.notApplied).toBe('outside-validity');
    expect(s.amount as number).toBe(0);
  });
  it('R8.1 weekdays are computed in UTC from bill.date (2026-11-02 is Monday = 1; 2026-11-01 is Sunday = 0)', () => {
    const mk = (date: string, d: number[]) =>
      bill({
        participants: people('a'),
        date,
        items: [item('x', 10000, eq('a'))],
        adjustments: [adj('d', 'discount', rate(1000), { validity: { daysOfWeek: d } })],
        unit: 1,
      });
    expect(adjAmounts(mustOk(mk('2026-11-01', [0])).breakdown)).toEqual({ d: -1000 });
    expect(adjAmounts(mustOk(mk('2026-11-01', [1])).breakdown)).toEqual({ d: 0 });
    expect(adjAmounts(mustOk(mk('2026-11-07', [6])).breakdown)).toEqual({ d: -1000 });
  });
  it('R8.2 minimum spend: B below it skips the adjustment, B equal applies it', () => {
    checkFixture(D.minimumSpendNotMet);
    checkFixture(D.minimumSpendBoundary);
    expect(adjStep(mustOk(D.minimumSpendNotMet.input).breakdown, 'd').notApplied).toBe('below-minimum-spend');
  });
  it('R8.2 minimum spend compares against a fixed base amount', () => checkFixture(T.taxFixedBaseMinimumSpend));
  it('R8.3 rate on non-positive base is not applied (non-positive-base)', () => {
    checkFixture(T.nonPositiveBaseNegative);
    checkFixture(T.nonPositiveBaseZero);
    expect(adjStep(mustOk(T.nonPositiveBaseZero.input).breakdown, 'tax').notApplied).toBe('non-positive-base');
  });
  it('R8.3 rate = round(B x bp / 10000) with half-up default, half-even, down, up', () => {
    for (const f of T.roundingModes) checkFixture(f);
    checkFixture(T.discountRounding);
    const s = adjStep(mustOk(T.roundingModes[1]!.input).breakdown, 'tax'); // half-even, 1005
    expect(s.rounding).toBe('half-even');
    expect(s.raw?.numerator).toBe('201');
    expect(s.raw?.denominator).toBe('2');
    expect(s.computed as number).toBe(100);
    expect(s.rateBp as number).toBe(1000);
  });
  it('R8.4 fixed value is used as the magnitude', () => checkFixture(D.fixedDiscount));
  it('R8.5 cap limits the magnitude and the trace marks it capped', () => {
    checkFixture(D.cappedDiscount);
    checkFixture(D.capNotBinding);
    const s = adjStep(mustOk(D.cappedDiscount.input).breakdown, 'd');
    expect(s.capped).toBe(true);
    expect(s.amount as number).toBe(-15000);
    expect(adjStep(mustOk(D.capNotBinding.input).breakdown, 'd').capped).toBe(false);
  });
  it('R8.6 a discount never exceeds its base and the trace marks it clamped', () => {
    checkFixture(D.discountClamp);
    checkFixture(C.customSubtractClamp);
    const s = adjStep(mustOk(D.discountClamp.input).breakdown, 'd');
    expect(s.clamped).toBe(true);
    expect(s.amount as number).toBe(-40000);
  });
  it('R8.7 override replaces the magnitude; the computed value and the reason stay in the trace', () => {
    checkFixture(D.overrideDiscount);
    checkFixture(D.overrideBeatsCap);
    const s = adjStep(mustOk(D.overrideDiscount.input).breakdown, 'd');
    expect(s.computed as number).toBe(10000);
    expect(s.overridden).toEqual({ amount: 8000, reason: 'manager comp' });
    expect(s.amount as number).toBe(-8000);
  });
  it('R8.8 printedAmount that differs from the final amount is ADJUSTMENT_PRINTED_MISMATCH', () => {
    checkFixture(Rc.printedAmountMismatch);
    checkFixture(Rc.printedAmountMatches);
  });
  it('R8.8 an override that equals printedAmount resolves the mismatch', () => checkFixture(Rc.overrideFixesPrinted));
});

// ───────────────────────── R9 Allocation and rounding ─────────────────────────

describe('R9 allocation and rounding', () => {
  it('R9.1 largest remainder with ties to the lower id inside a bill', () => {
    checkFixture(A.manyPeople);
    checkFixture(C.exactReconciliation);
  });
  it('R9.1 negative amounts allocate by magnitude then negate', () => checkFixture(D.negativeEqualAllocation));
  it('R9.2 item splits use largest remainder', () => {
    checkFixture(A.equalSplit);
    checkFixture(A.percentSplit);
    checkFixture(A.unitsSplit);
  });
  it('R9.3 proportional (default) allocates by participant base', () => {
    checkFixture(D.percentDiscount);
    expect(allocStep(mustOk(D.percentDiscount.input).breakdown, 'd').policy).toBe('proportional');
  });
  it('R9.3 proportional with zero total weight falls back to equal with a warning', () => {
    checkFixture(C.fallbackEqual);
    expect(allocStep(mustOk(C.fallbackEqual.input).breakdown, 'fee').fallbackEqual).toBe(true);
    expect(allocStep(mustOk(D.percentDiscount.input).breakdown, 'd').fallbackEqual).toBe(false);
  });
  it('R9.3 equal policy (all participants, or a subset)', () => {
    checkFixture(C.tipEqual);
    checkFixture(C.tipEqualSubset);
  });
  it('R9.3 weights policy ("Hamza covers the service charge", "tip split 1:2")', () => {
    checkFixture(C.serviceChargeCovered);
    checkFixture(C.tipWeights);
    expect(allocStep(mustOk(C.tipWeights.input).breakdown, 'tip').policy).toBe('weights');
  });
  it('R9.4 only the four listed points round: Fixture B has exact quarter-paisa quantities that stay exact', () => {
    checkFixture(fixtureB);
    checkFixture(T.exactAttribution);
  });
  it('R9.5 attribution is exact and only feeds later bases', () => {
    checkFixture(T.exactAttribution);
    checkFixture(C.taxOnServiceCharge);
  });
});

// ───────────────────────── R10 Totals and reconciliation ─────────────────────────

describe('R10 totals and reconciliation', () => {
  it('R10.1 itemsSubtotal = sum of lineTotals', () => {
    expect(mustOk(L.voidItem.input).breakdown.itemsSubtotal as number).toBe(8000);
  });
  it('R10.2 total = itemsSubtotal + signed adjustments', () => {
    const b = mustOk(fixtureB.input).breakdown;
    expect(b.itemsSubtotal as number).toBe(1000000);
    expect(b.total as number).toBe(850000);
  });
  it('R10.3 sum of exact participant totals equals T exactly', () => {
    checkFixture(C.exactReconciliation);
    checkFixture(T.exactAttribution);
  });
  it('R10.4 printedSubtotal mismatch is SUBTOTAL_MISMATCH', () => checkFixture(Rc.printedSubtotalMismatch));
  it('R10.5 printedTotal mismatch is TOTAL_MISMATCH with the difference; matching passes', () => {
    checkFixture(Rc.printedTotalMismatch);
    checkFixture(Rc.printedMatches);
  });
  it('R10.5 the gap is never absorbed: the only remedy is an explicit reconciliation adjustment', () => {
    checkFixture(C.reconciliationAdjustment);
    const r = mustFail(Rc.printedTotalMismatch.input);
    expect(r.errors).toHaveLength(1);
  });
  it('R10.6 negative total is NEGATIVE_TOTAL', () => checkFixture(L.negativeTotal));
  it('R10.7 negative participant total is allowed with a NEGATIVE_SHARE warning', () => {
    checkFixture(L.negativeShare);
    checkFixture(T.nonPositiveBaseNegative);
  });
  it('R10.7 a shared refund does not raise NEGATIVE_SHARE', () => checkFixture(L.refundShared));
});

// ───────────────────────── R11 Settlement rounding ─────────────────────────

describe('R11 settlement rounding', () => {
  it('R11.1 rounded total R = u * floor((2T + u) / 2u) (halves go up)', () => {
    checkFixture(S.settlementResidualToPayer);
    checkFixture(S.settlementNegativeResidual);
    checkFixture(S.settlementHalfUp);
    checkFixture(S.settlementBelowHalf);
  });
  it('R11.2 floor each person, k units to the largest remainders, ties to lower id', () => {
    checkFixture(S.settlementResidualToPayer);
    checkFixture(S.settlementCustomUnit);
    checkFixture(C.taxOnServiceCharge);
  });
  it('R11.3 roundingDelta is recorded per participant and traced; unit 1 means rounded == exact', () => {
    const b = mustOk(fixtureB.input).breakdown;
    expect(b.participants.map((p) => p.roundingDelta as number)).toEqual([-25, 0, 50, -25]);
    const step = b.trace.find((s) => s.type === 'settlement-rounding');
    expect(step?.type).toBe('settlement-rounding');
    if (step?.type !== 'settlement-rounding') return;
    expect(step.unit as number).toBe(100);
    expect(step.exactTotal as number).toBe(850000);
    expect(step.roundedTotal as number).toBe(850000);
    checkFixture(A.equalSplit); // unit 1
  });
  it('R11.4 Fixture B rounds to 1806 / 2635 / 2253 / 1806 (Ali +50)', () => {
    checkFixture(fixtureB);
    expect(roundedTotals(mustOk(fixtureB.input).breakdown)).toEqual({ mahhee: 180600, hamza: 263500, ali: 225300, saad: 180600 });
  });
});

// ───────────────────────── R12 Contributions and settlement ─────────────────────────

describe('R12 contributions and settlement', () => {
  it('R12.1 several entries for one person add up', () => checkFixture(A.multiplePayers));
  it('R12.1 no contributions: settlement null with a NO_CONTRIBUTIONS warning', () => {
    checkFixture(Rc.noContributions);
    checkFixture(fixtureA);
  });
  it('R12.1 contributions must sum to T exactly, otherwise CONTRIBUTIONS_MISMATCH', () => {
    checkFixture(Rc.contributionsMismatch);
    checkFixture(Rc.contributionNonPositive);
  });
  it('R12.2 rounding residual goes to the largest contributor', () => checkFixture(S.settlementResidualToPayer));
  it('R12.2 residual ties go to the lower id; negative residual works', () => {
    checkFixture(S.settlementResidualTie);
    checkFixture(S.settlementNegativeResidual);
  });
  it('R12.2 the residual is recorded in the trace', () => {
    const b = mustOk(S.settlementResidualToPayer.input).breakdown;
    const step = b.trace.find((s) => s.type === 'rounding-residual');
    expect(step).toBeDefined();
    if (step?.type !== 'rounding-residual') return;
    expect(step.residual as number).toBe(50);
    expect(step.participantId).toBe('a');
  });
  it('R12.3 net = contributed - rounded (+ residual for the holder); sums to zero', () => {
    checkFixture(S.settlementResidualToPayer);
    checkFixture(S.settlementHalfUp);
    checkFixture(S.settlementBelowHalf);
  });
  it('R12.4 transfers: greedy largest debtor to largest creditor, ties to lower id (Fixture B)', () => {
    checkFixture(fixtureB);
    checkFixture(A.multiplePayers);
    checkFixture(A.manyPeople);
    checkFixture(A.onePerson);
  });
});

// ───────────────────────── R15 Result shape ─────────────────────────

describe('R15 result shape', () => {
  it('R15.1 ok: true carries breakdown and warnings and no errors', () => {
    const r = calculateBill(fixtureA.input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.breakdown).toBeDefined();
    expect(Array.isArray(r.warnings)).toBe(true);
    expect('errors' in r).toBe(false);
  });
  it('R15.1 ok: false carries errors and warnings and no breakdown', () => {
    const r = calculateBill(L.negativeTotal.input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThan(0);
    expect(Array.isArray(r.warnings)).toBe(true);
    expect('breakdown' in r).toBe(false);
  });
  it('R15.1 collects all issues rather than stopping at the first', () => checkFixture(L.collectsAllIssues));
  it('R15.1 a bill with warnings only is still ok: true', () => {
    const r = calculateBill(Rc.noContributions.input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.severity)).toEqual(['warning']);
  });
  it('R15.1 a failing bill still lists its warnings', () => {
    const r = mustFail(
      bill({
        participants: people('a'),
        items: [item('free', 0, { kind: 'unassigned' }), item('x', 700, { kind: 'unassigned' })],
      }),
    );
    expect(r.errors.map((e) => e.code)).toEqual(['ITEM_UNASSIGNED']);
    expect(r.warnings.map((w) => w.code)).toContain('ITEM_UNASSIGNED');
  });
});

// ───────────────────────── R16 clarifications (v1.1) ─────────────────────────

describe('R16 clarifications', () => {
  it('R16.1 mismatch differences are signed: computed - printed (total, subtotal, printedAmount), sum - T (contributions), lineTotal - qty x unitPrice', () => {
    checkFixture(Rc.printedTotalMismatch); // -500
    checkFixture(Rc.printedSubtotalMismatch); // +100
    checkFixture(Rc.printedAmountMismatch); // -100
    checkFixture(Rc.contributionsMismatch); // -1000
    checkFixture(L.lineErrors[0]!); // +100
    checkFixture(A.assignmentErrors[3]!); // amounts under: sum - lineTotal = -100
    checkFixture(A.assignmentErrors[4]!); // amounts over: +100
  });

  it('R16.2 INVALID_INPUT cites R1.1 for non-safe-integer money and bp, R1.2 for bp range, specific rules for shape problems', () => {
    const wanted: [string, string][] = [
      ['non-integer lineTotal 100.5 is invalid', 'R1.1'],
      ['NaN lineTotal is invalid', 'R1.1'],
      ['lineTotal beyond the safe-integer range is invalid', 'R1.1'],
      ['fractional adjustment fixed amount is invalid', 'R1.1'],
      ['fractional basis points are invalid', 'R1.1'],
      ['discount rate above 10000 bp is invalid', 'R1.2'],
      ['negative rate is invalid', 'R1.2'],
      ['duplicate participant ids', 'R2.4'],
      ['quantity 0 is invalid', 'R3.2'],
      ['assignment references an unknown participant', 'R3.4'],
      ['custom adjustment without a direction', 'R5.1'],
    ];
    for (const [name, rule] of wanted) {
      const f = L.lineErrors.find((x) => x.name === name);
      expect(f, name).toBeDefined();
      checkFixture(f!);
      expect(f!.expect.ok ? undefined : f!.expect.errors[0]!.rule, name).toBe(rule);
    }
  });

  it('R16.3 override beats a minimum-spend skip: amount -300, applied, trace keeps notApplied and overridden, warning kept', () => {
    checkFixture(O.overrideBeatsMinimumSpend);
    const b = mustOk(O.overrideBeatsMinimumSpend.input).breakdown;
    const s = adjStep(b, 'd');
    expect(s.notApplied).toBe('below-minimum-spend');
    expect(s.overridden).toEqual({ amount: 300, reason: 'manager comp' });
    expect(s.amount as number).toBe(-300);
    expect(b.adjustments[0]!.applied).toBe(true);
    expect(b.adjustments[0]!.amount as number).toBe(-300);
  });

  it('R16.3 override on an adjustment with no eligible items still sets the amount', () => {
    checkFixture(O.overrideNoEligible);
    const b = mustOk(O.overrideNoEligible.input).breakdown;
    const s = adjStep(b, 'd');
    expect(s.notApplied).toBe('no-eligible-items');
    expect(s.overridden?.amount as number).toBe(500);
    expect(b.adjustments[0]!.applied).toBe(true);
  });

  it('R16.3 override larger than cap and base is not capped or clamped', () => {
    checkFixture(O.overrideExceedsCapAndBase);
    const s = adjStep(mustOk(O.overrideExceedsCapAndBase.input).breakdown, 'd');
    // the amount ignores both cap (1000) and base (40000); trace flags describe the computed pipeline, so they are not asserted
    expect(s.computed as number).toBe(4000); // R16.9: before cap, clamp and override
    expect(s.amount as number).toBe(-50000);
  });

  it('R16.4 fixed fee on a zero base is applied with equal fallback', () => {
    checkFixture(C.fallbackEqual);
  });

  it('R16.4 fixed discount on a zero base clamps to 0', () => {
    checkFixture(O.fixedDiscountZeroBase);
    const s = adjStep(mustOk(O.fixedDiscountZeroBase.input).breakdown, 'd');
    expect(s.clamped).toBe(true);
    expect(s.notApplied).toBeUndefined();
    expect(s.amount as number).toBe(0);
  });

  it('R16.5 unassigned item + wrong printedTotal reports ITEM_UNASSIGNED but not TOTAL_MISMATCH', () => {
    checkFixture(O.unassignedSuppressesTotalMismatch);
    const codes = mustFail(O.unassignedSuppressesTotalMismatch.input).errors.map((e) => e.code);
    expect(codes).not.toContain('TOTAL_MISMATCH');
  });

  it('R16.5 unassigned item + wrong printedSubtotal still reports SUBTOTAL_MISMATCH', () => {
    checkFixture(O.unassignedKeepsSubtotalMismatch);
  });

  it('R16.5 NEGATIVE_TOTAL and contribution checks are also not evaluated while an assignment error exists', () => {
    const r = mustFail(
      bill({
        participants: people('a'),
        items: [item('x', 1000, { kind: 'unassigned' }), item('ref', -5000, eq('a'))],
        contributions: paid({ a: 1 }),
      }),
    );
    expect(r.errors.map((e) => e.code)).toEqual(['ITEM_UNASSIGNED']);
  });

  it('R16.8 missing item entries count as 0; allocations and participant adjustments list every participant / adjustment, zeros included', () => {
    const b = mustOk(C.tipEqualSubset.input).breakdown; // tip goes to b and c only
    const tip = b.adjustments.find((x) => x.adjustmentId === 'tip')!;
    expect(tip.allocations.map((x) => x.participantId).sort()).toEqual(['a', 'b', 'c']);
    expect(tip.allocations.find((x) => x.participantId === 'a')!.amount as number).toBe(0);
    for (const p of b.participants) expect(p.adjustments.map((x) => x.adjustmentId)).toEqual(['tip']);
    const a = b.participants.find((p) => p.participantId === 'a')!;
    expect(a.items.find((i) => i.itemId === 'i2')?.amount ?? 0).toBe(0);
  });

  it('R16.9 trace computed is the magnitude before cap/clamp (20000 / 50000), the amount is after (-15000 / -40000)', () => {
    const s = adjStep(mustOk(D.cappedDiscount.input).breakdown, 'd');
    expect(s.computed as number).toBe(20000);
    expect(s.amount as number).toBe(-15000);
    const c = adjStep(mustOk(D.discountClamp.input).breakdown, 'd');
    expect(c.computed as number).toBe(50000);
    expect(c.amount as number).toBe(-40000);
  });
});
