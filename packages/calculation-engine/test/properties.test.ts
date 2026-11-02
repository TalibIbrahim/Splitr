import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculateBill } from '../src/index';
import type { Adjustment, Assignment, BillBreakdown, BillInput, Item, TraceStep } from '../src/index';
import { $, adj, bill, fixed, rate, roundedBillTotal, sum } from './helpers';

// ───────────────────────── generators of VALID bills ─────────────────────────

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
const CATS = ['food', 'bev', 'nt'] as const;

interface ItemSpec {
  k: number; // lineTotal = k * 1000 (+ extra for non-amount kinds)
  extra: number;
  kind: number; // 0 equal, 1 weights, 2 percent, 3 amounts, 4 units
  mask: number;
  seeds: number[];
  qty: number;
  cats: number;
}
interface AdjSpec {
  kind: number; // 0 discount, 1 tax, 2 serviceCharge, 3 tip, 4 fee, 5 custom
  dir: boolean; // custom: subtract?
  useRate: boolean;
  rateBp: number;
  fixedAmt: number;
  order: number;
  policy: number; // 0 proportional, 1 equal, 2 weights
  pmask: number;
  wseeds: number[];
  base: number; // 0 items, 1 items-after list, 2 fixed, 3 items-after all-prior
  baseMask: number;
  fixedBase: number;
  elig: number; // 0 none, 1 include food, 2 exclude nt
  cap: number; // 0 = none
  minSpend: number; // 0 = none
  rounding: number;
}
interface Spec {
  n: number;
  items: ItemSpec[];
  adjs: AdjSpec[];
  unit: number;
  payers: number[];
  seed: number;
}

const itemSpec: fc.Arbitrary<ItemSpec> = fc.record({
  k: fc.integer({ min: 100, max: 2000 }),
  extra: fc.integer({ min: 0, max: 999 }),
  kind: fc.integer({ min: 0, max: 4 }),
  mask: fc.integer({ min: 1, max: 63 }),
  seeds: fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 8, maxLength: 8 }),
  qty: fc.integer({ min: 1, max: 6 }),
  cats: fc.integer({ min: 0, max: 7 }),
});

const adjSpec: fc.Arbitrary<AdjSpec> = fc.record({
  kind: fc.integer({ min: 0, max: 5 }),
  dir: fc.boolean(),
  useRate: fc.boolean(),
  rateBp: fc.integer({ min: 0, max: 3000 }),
  fixedAmt: fc.integer({ min: 0, max: 50000 }),
  order: fc.integer({ min: 0, max: 3 }),
  policy: fc.integer({ min: 0, max: 2 }),
  pmask: fc.integer({ min: 1, max: 63 }),
  wseeds: fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 6, maxLength: 6 }),
  base: fc.integer({ min: 0, max: 3 }),
  baseMask: fc.integer({ min: 0, max: 15 }),
  fixedBase: fc.integer({ min: 100000, max: 2000000 }),
  elig: fc.integer({ min: 0, max: 2 }),
  cap: fc.oneof(fc.constant(0), fc.integer({ min: 1000, max: 50000 })),
  minSpend: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 3000 })),
  rounding: fc.integer({ min: 0, max: 3 }),
});

const specArb: fc.Arbitrary<Spec> = fc.record({
  n: fc.integer({ min: 2, max: 6 }),
  items: fc.array(itemSpec, { minLength: 1, maxLength: 10 }),
  adjs: fc.array(adjSpec, { minLength: 0, maxLength: 4 }),
  unit: fc.constantFrom(1, 5, 50, 100, 1000),
  payers: fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 6, maxLength: 6 }),
  seed: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
});

function buildItem(s: ItemSpec, idx: number, n: number): Item {
  const pids = IDS.slice(0, n) as readonly string[];
  let mem = pids.filter((_, i) => ((s.mask >> i) & 1) === 1);
  if (mem.length === 0) mem = [pids[0]!];
  const seed = (j: number) => s.seeds[j % 8]!;
  let assignment: Assignment;
  let quantity = 1;
  let lineTotal = s.k * 1000 + (s.kind === 3 ? 0 : s.extra);
  switch (s.kind) {
    case 0:
      assignment = { kind: 'equal', participantIds: mem };
      break;
    case 1:
      assignment = { kind: 'weights', entries: mem.map((id, i) => ({ participantId: id, weight: 1 + (seed(i) % 3) })) };
      break;
    case 2: {
      const m = Math.min(mem.length, 4);
      const counts = new Array<number>(m).fill(0);
      for (let j = 0; j < 4; j++) counts[seed(j) % m]!++;
      assignment = {
        kind: 'percent',
        entries: mem
          .slice(0, m)
          .map((id, i) => ({ participantId: id, bp: (counts[i]! * 2500) as never }))
          .filter((e) => (e.bp as number) > 0),
      };
      break;
    }
    case 3: {
      const m = mem.length;
      const half = Math.max(1, Math.floor(s.k / m));
      const parts: number[] = [];
      let used = 0;
      for (let i = 0; i < m - 1; i++) {
        const p = 1 + (seed(i) % half);
        parts.push(p);
        used += p;
      }
      parts.push(s.k - used);
      lineTotal = s.k * 1000;
      assignment = { kind: 'amounts', entries: mem.map((id, i) => ({ participantId: id, amount: $(parts[i]! * 1000) })) };
      break;
    }
    default: {
      quantity = s.qty;
      const m = Math.min(mem.length, quantity);
      const counts = new Array<number>(m).fill(1);
      for (let j = 0; j < quantity - m; j++) counts[seed(j) % m]!++;
      assignment = { kind: 'units', entries: mem.slice(0, m).map((id, i) => ({ participantId: id, units: counts[i]! })) };
    }
  }
  return {
    id: `item${idx}`,
    name: `item${idx}`,
    quantity,
    lineTotal: $(lineTotal),
    categories: CATS.filter((_, i) => ((s.cats >> i) & 1) === 1),
    assignment,
    source: 'receipt',
  };
}

const KINDS = ['discount', 'tax', 'serviceCharge', 'tip', 'fee', 'custom'] as const;
const ROUNDINGS = ['half-up', 'half-even', 'down', 'up'] as const;

function buildAdjustments(specs: AdjSpec[], n: number, allProportional: boolean): Adjustment[] {
  const pids = IDS.slice(0, n) as readonly string[];
  const withIds = specs.map((s, i) => ({ s, id: `adj${i}` }));
  withIds.sort((x, y) => x.s.order - y.s.order || (x.id < y.id ? -1 : 1));
  const out: Adjustment[] = [];
  const earlierProportional: string[] = [];
  let allEarlierProportional = true;
  let subtractive = 0;
  for (const { s, id } of withIds) {
    let kind = KINDS[s.kind]!;
    let sub = kind === 'discount' || (kind === 'custom' && s.dir);
    if (sub && ++subtractive > 2) {
      kind = 'fee';
      sub = false;
    }
    const value = s.useRate
      ? rate(sub ? s.rateBp % 2001 : s.rateBp)
      : fixed(sub ? s.fixedAmt % 20001 : s.fixedAmt);
    // base
    let base: Adjustment['base'];
    if (s.base === 1 && earlierProportional.length > 0) {
      const inc = earlierProportional.filter((_, i) => ((s.baseMask >> i) & 1) === 1);
      base = inc.length > 0 ? { type: 'items-after', include: inc } : { type: 'items' };
    } else if (s.base === 2 && !sub) {
      base = { type: 'fixed', amount: $(s.fixedBase) };
    } else if (s.base === 3 && out.length > 0 && allEarlierProportional) {
      base = { type: 'items-after', include: 'all-prior' };
    } else {
      base = { type: 'items' };
    }
    // allocation
    const mem = pids.filter((_, i) => ((s.pmask >> i) & 1) === 1);
    const members = mem.length > 0 ? mem : [pids[0]!];
    const proportional = allProportional || s.policy === 0;
    const allocation: Adjustment['allocation'] = proportional
      ? { type: 'proportional' }
      : s.policy === 1
        ? { type: 'equal', participantIds: members }
        : { type: 'weights', entries: members.map((p, i) => ({ participantId: p, weight: s.wseeds[i % 6]! })) };
    const eligibility: Adjustment['eligibility'] =
      s.elig === 1 ? { categories: ['food'] } : s.elig === 2 ? { excludeCategories: ['nt'] } : undefined;
    out.push(
      adj(id, kind, value, {
        order: s.order,
        base,
        allocation,
        rounding: ROUNDINGS[s.rounding]!,
        ...(kind === 'custom' ? { direction: sub ? ('subtract' as const) : ('add' as const) } : {}),
        ...(eligibility ? { eligibility } : {}),
        ...(s.cap > 0 ? { cap: s.cap } : {}),
        ...(s.minSpend > 0 ? { minimumSpend: s.minSpend * 1000 } : {}),
      }),
    );
    if (proportional) earlierProportional.push(id);
    else allEarlierProportional = false;
  }
  return out;
}

interface Prepared {
  input: BillInput;
  breakdown: BillBreakdown;
}

function prepare(spec: Spec, opts: { allProportional?: boolean } = {}): Prepared {
  const participants = IDS.slice(0, spec.n).map((id) => ({ id, displayName: id }));
  const base = bill({
    participants,
    items: spec.items.map((s, i) => buildItem(s, i, spec.n)),
    adjustments: buildAdjustments(spec.adjs, spec.n, opts.allProportional ?? false),
    unit: spec.unit,
  });
  const first = calculateBill(base);
  if (!first.ok) throw new Error(`generator produced an invalid bill: ${JSON.stringify(first.errors)}`);
  const T = first.breakdown.total as number;
  // contributions summing to T: weights 0..5, at least one positive
  const w = spec.payers.slice(0, spec.n).map((x, i) => (i === 0 ? Math.max(1, x) : x));
  const W = sum(w);
  const lastPayer = w.reduce((acc, x, i) => (x > 0 ? i : acc), 0);
  let used = 0;
  const contributions = w.flatMap((x, i) => {
    if (x === 0) return [];
    const amount = i === lastPayer ? T - used : Math.floor((T * x) / W);
    used += amount;
    return [{ participantId: IDS[i]!, amount: $(amount) }];
  });
  const input = { ...base, contributions };
  const r = calculateBill(input);
  if (!r.ok) throw new Error(`generator produced an invalid bill with contributions: ${JSON.stringify(r.errors)}`);
  return { input, breakdown: r.breakdown };
}

const RUNS = { numRuns: 200 };

// ───────────────────────── P1 … P7 ─────────────────────────

describe('property tests (fast-check)', () => {
  it('P1 sum of exact participant totals = T, sum of rounded totals = R', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { breakdown: b, input } = prepare(spec);
        const unit = input.settlementRoundingUnit as number;
        expect(sum(b.participants.map((p) => p.exactTotal as number))).toBe(b.total as number);
        expect(b.total as number).toBe((b.itemsSubtotal as number) + sum(b.adjustments.map((a) => a.amount as number)));
        expect(b.roundedTotal as number).toBe(roundedBillTotal(b.total as number, unit));
        expect(sum(b.participants.map((p) => p.roundedTotal as number))).toBe(b.roundedTotal as number);
        for (const p of b.participants) expect(Math.abs((p.roundedTotal as number) % unit)).toBe(0);
      }),
      RUNS,
    );
  });

  it('P2 item shares sum to lineTotal and adjustment allocations sum to the adjustment amount', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { breakdown: b, input } = prepare(spec);
        for (const it of input.items) {
          const shares = b.participants.flatMap((p) => p.items.filter((x) => x.itemId === it.id).map((x) => x.amount as number));
          expect(sum(shares), `item ${it.id}`).toBe(it.lineTotal as number);
        }
        for (const a of b.adjustments) {
          expect(sum(a.allocations.map((x) => x.amount as number)), `adjustment ${a.adjustmentId}`).toBe(a.amount as number);
        }
        // participant view agrees with the adjustment view
        for (const a of b.adjustments) {
          const viaParticipants = sum(
            b.participants.flatMap((p) => p.adjustments.filter((x) => x.adjustmentId === a.adjustmentId).map((x) => x.amount as number)),
          );
          expect(viaParticipants).toBe(a.amount as number);
        }
      }),
      RUNS,
    );
  });

  it('P3 shuffling every input array gives identical keyed results; running twice is deep-equal', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { input, breakdown } = prepare(spec);
        expect(calculateBill(input)).toEqual(calculateBill(input)); // R2.1
        const shuffled = shuffleInput(input, spec.seed);
        const r = calculateBill(shuffled);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(canonical(r.breakdown)).toEqual(canonical(breakdown));
        // adjustments listed in application order regardless of input order
        expect(r.breakdown.adjustments.map((a) => a.adjustmentId)).toEqual(breakdown.adjustments.map((a) => a.adjustmentId));
        // participants listed in INPUT order
        expect(r.breakdown.participants.map((p) => p.participantId)).toEqual(shuffled.participants.map((p) => p.id));
      }),
      RUNS,
    );
  });

  it('P4 with no negative items and only proportional allocations, no participant total is negative', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { breakdown: b } = prepare(spec, { allProportional: true });
        for (const p of b.participants) expect(p.exactTotal as number, p.participantId).toBeGreaterThanOrEqual(0);
      }),
      RUNS,
    );
  });

  it('P5 |roundingDelta| < u for every participant and |residual| <= u/2', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { breakdown: b, input } = prepare(spec);
        const unit = input.settlementRoundingUnit as number;
        for (const p of b.participants) expect(Math.abs(p.roundingDelta as number)).toBeLessThan(unit);
        expect(b.settlement).not.toBeNull();
        expect(Math.abs(b.settlement!.residual.amount as number) * 2).toBeLessThanOrEqual(unit);
        expect(b.settlement!.residual.amount as number).toBe((b.roundedTotal as number) - (b.total as number));
      }),
      RUNS,
    );
  });

  it('P6 sum of net = 0; transfers are positive, at most n-1, and zero every balance', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { breakdown: b, input } = prepare(spec);
        const s = b.settlement!;
        expect(sum(s.balances.map((x) => x.net as number))).toBe(0);
        expect(s.transfers.length).toBeLessThanOrEqual(input.participants.length - 1);
        const net = new Map(s.balances.map((x) => [x.participantId, x.net as number]));
        for (const t of s.transfers) {
          expect(t.amount as number).toBeGreaterThan(0);
          expect(t.from).not.toBe(t.to);
          net.set(t.from, net.get(t.from)! + (t.amount as number));
          net.set(t.to, net.get(t.to)! - (t.amount as number));
        }
        for (const [id, v] of net) expect(v, `balance of ${id} after transfers`).toBe(0);
      }),
      RUNS,
    );
  });

  it('P7 a discount never exceeds max(0, floor(base)) and never exceeds its cap (no overrides)', () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const { breakdown: b, input } = prepare(spec);
        for (const a of input.adjustments) {
          const subtracting = a.kind === 'discount' || (a.kind === 'custom' && a.direction === 'subtract');
          if (!subtracting) continue;
          const res = b.adjustments.find((x) => x.adjustmentId === a.id)!;
          const mag = Math.abs(res.amount as number);
          expect(res.amount as number).toBeLessThanOrEqual(0);
          if (a.cap !== undefined) expect(mag).toBeLessThanOrEqual(a.cap as number);
          // trace base (works for every base type)
          const step = b.trace.find((s): s is Extract<TraceStep, { type: 'adjustment' }> => s.type === 'adjustment' && s.adjustmentId === a.id)!;
          const floorBase = BigInt(step.base.numerator) / BigInt(step.base.denominator); // base >= 0 here; negative handled below
          const bound = BigInt(step.base.numerator) < 0n ? 0n : floorBase;
          expect(BigInt(mag) <= bound).toBe(true);
          // independent check for the original-subtotal base
          if (!a.base || a.base.type === 'items') {
            const B = sum(input.items.filter((it) => isEligible(it, a)).map((it) => it.lineTotal as number));
            expect(mag).toBeLessThanOrEqual(Math.max(0, B));
          }
        }
      }),
      RUNS,
    );
  });
});

// ───────────────────────── helpers ─────────────────────────

function isEligible(it: Item, a: Adjustment): boolean {
  const e = a.eligibility;
  if (!e) return true;
  const hasInclude = e.itemIds !== undefined || e.categories !== undefined;
  const included = !hasInclude || (e.itemIds?.includes(it.id) ?? false) || it.categories.some((c) => e.categories?.includes(c) ?? false);
  const excluded = (e.excludeItemIds?.includes(it.id) ?? false) || it.categories.some((c) => e.excludeCategories?.includes(c) ?? false);
  return included && !excluded;
}

/** Order-independent view of a result, keyed by id. */
function canonical(b: BillBreakdown): unknown {
  const keyed = <T extends object>(xs: readonly T[], key: (x: T) => string, val: (x: T) => unknown) =>
    Object.fromEntries([...xs].sort((p, q) => (key(p) < key(q) ? -1 : 1)).map((x) => [key(x), val(x)]));
  return {
    itemsSubtotal: b.itemsSubtotal,
    total: b.total,
    roundedTotal: b.roundedTotal,
    participants: keyed(
      b.participants,
      (p) => p.participantId,
      (p) => ({
        items: keyed(p.items, (x) => x.itemId, (x) => x.amount),
        adjustments: keyed(p.adjustments, (x) => x.adjustmentId, (x) => x.amount),
        itemsSubtotal: p.itemsSubtotal,
        exactTotal: p.exactTotal,
        roundedTotal: p.roundedTotal,
        roundingDelta: p.roundingDelta,
      }),
    ),
    adjustments: keyed(
      b.adjustments,
      (a) => a.adjustmentId,
      (a) => ({
        amount: a.amount,
        applied: a.applied,
        reason: a.notAppliedReason,
        allocations: keyed(a.allocations, (x) => x.participantId, (x) => x.amount),
      }),
    ),
    settlement: b.settlement && {
      balances: keyed(b.settlement.balances, (x) => x.participantId, (x) => [x.contributed, x.share, x.net]),
      residual: b.settlement.residual,
      transfers: b.settlement.transfers.map((t) => `${t.from}>${t.to}:${t.amount as number}`).sort(),
    },
  };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInput(input: BillInput, seed: number): BillInput {
  const rand = rng(seed);
  const sh = <X>(xs: readonly X[] | undefined): X[] | undefined => {
    if (!xs) return undefined;
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const shAssign = (a: Assignment): Assignment => {
    switch (a.kind) {
      case 'unassigned':
        return a;
      case 'equal':
        return { kind: 'equal', participantIds: sh(a.participantIds)! };
      case 'weights':
        return { kind: 'weights', entries: sh(a.entries)! };
      case 'percent':
        return { kind: 'percent', entries: sh(a.entries)! };
      case 'amounts':
        return { kind: 'amounts', entries: sh(a.entries)! };
      case 'units':
        return { kind: 'units', entries: sh(a.entries)! };
    }
  };
  const shAdj = (a: Adjustment): Adjustment => {
    const e = a.eligibility;
    const eligibility = e
      ? {
          ...(e.itemIds ? { itemIds: sh(e.itemIds)! } : {}),
          ...(e.categories ? { categories: sh(e.categories)! } : {}),
          ...(e.excludeItemIds ? { excludeItemIds: sh(e.excludeItemIds)! } : {}),
          ...(e.excludeCategories ? { excludeCategories: sh(e.excludeCategories)! } : {}),
        }
      : undefined;
    const base: Adjustment['base'] =
      a.base?.type === 'items-after' && a.base.include !== 'all-prior'
        ? { type: 'items-after', include: sh(a.base.include)! }
        : a.base;
    const al = a.allocation;
    const allocation: Adjustment['allocation'] =
      al?.type === 'equal' && al.participantIds
        ? { type: 'equal', participantIds: sh(al.participantIds)! }
        : al?.type === 'weights'
          ? { type: 'weights', entries: sh(al.entries)! }
          : al;
    const { eligibility: _e, base: _b, allocation: _a, ...rest } = a;
    void _e;
    void _b;
    void _a;
    return {
      ...rest,
      ...(eligibility ? { eligibility } : {}),
      ...(base ? { base } : {}),
      ...(allocation ? { allocation } : {}),
    };
  };
  return {
    ...input,
    participants: sh(input.participants)!,
    items: sh(input.items.map((i) => ({ ...i, assignment: shAssign(i.assignment) })))!,
    adjustments: sh(input.adjustments.map(shAdj))!,
    contributions: sh(input.contributions)!,
  };
}
