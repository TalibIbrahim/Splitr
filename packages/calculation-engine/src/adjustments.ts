import { isEligible } from './eligibility';
import { makeIssue } from './issues';
import { largestRemainder, rowsToTrace } from './largest-remainder';
import {
  add,
  cmp,
  div,
  floorQ,
  maxQ,
  mul,
  paisaOf,
  q,
  roundQ,
  toExact,
  ZERO,
  type Q,
} from './rational';
import type {
  Adjustment,
  BasisPoints,
  Issue,
  Item,
  NotAppliedReason,
  Paisa,
  RoundingMode,
  TraceStep,
} from './types';

export interface ShareRow {
  readonly item: Item;
  readonly index: number;
  /** Item shares keyed by participant id (bigint paisa). */
  readonly shares: ReadonlyMap<string, bigint>;
}

export interface AdjustmentComputed {
  readonly adj: Adjustment;
  /** Signed amount (R5.1). */
  readonly amount: bigint;
  readonly applied: boolean;
  readonly notApplied?: NotAppliedReason;
  /** Allocation per participant id (only participants that appear in the allocation rows). */
  readonly allocations: ReadonlyMap<string, bigint>;
}

export interface AdjustmentContext {
  readonly participantIds: readonly string[];
  readonly rows: readonly ShareRow[];
  readonly adjustments: readonly Adjustment[];
  readonly billDate: string | undefined;
  readonly issues: Issue[];
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** R5.3: ascending (order, id). */
export function sortAdjustments(
  adjustments: readonly Adjustment[],
): { adj: Adjustment; index: number }[] {
  return adjustments
    .map((adj, index) => ({ adj, index }))
    .sort((x, y) => (x.adj.order < y.adj.order ? -1 : x.adj.order > y.adj.order ? 1 : cmpStr(x.adj.id, y.adj.id)));
}

const isSubtracting = (a: Adjustment): boolean =>
  a.kind === 'discount' || (a.kind === 'custom' && a.direction === 'subtract');

function withinValidity(a: Adjustment, date: string | undefined): boolean {
  const v = a.validity;
  if (!v) return true;
  if (date === undefined) return false; // unreachable after R3.7 validation
  if (v.from !== undefined && date < v.from) return false;
  if (v.to !== undefined && date > v.to) return false;
  if (v.daysOfWeek && v.daysOfWeek.length > 0) {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!v.daysOfWeek.includes(dow)) return false;
  }
  return true;
}

/** R5-R9: compute every adjustment's amount, allocation and trace, in application order. */
export function computeAdjustments(ctx: AdjustmentContext): { results: AdjustmentComputed[]; trace: TraceStep[] } {
  const sorted = sortAdjustments(ctx.adjustments);
  const position = new Map(sorted.map((s, i) => [s.adj.id, i]));
  const policyOf = (a: Adjustment): string => a.allocation?.type ?? 'proportional';
  /** adjustment id -> item id -> participant id -> exact attribution (R9.5). */
  const attribution = new Map<string, Map<string, Map<string, Q>>>();
  const results: AdjustmentComputed[] = [];
  const trace: TraceStep[] = [];

  sorted.forEach(({ adj, index }, pos) => {
    const path = ['adjustments', index] as const;
    const eligibleRows = ctx.rows.filter((r) => isEligible(r.item, adj.eligibility));
    const baseType = adj.base?.type ?? 'items';

    // R7.2 — resolve included adjustments.
    const included: string[] = [];
    if (adj.base?.type === 'items-after') {
      const wanted =
        adj.base.include === 'all-prior'
          ? sorted.slice(0, pos).map((s) => s.adj.id)
          : [...new Set(adj.base.include)];
      for (const id of wanted) {
        const tp = position.get(id);
        const target = tp === undefined ? undefined : sorted[tp]?.adj;
        if (tp === undefined || target === undefined || tp >= pos) {
          ctx.issues.push(
            makeIssue('ADJUSTMENT_INVALID_BASE', 'error', 'R7.2', `included adjustment "${id}" does not come earlier in application order`, {
              path: [...path, 'base'],
              adjustmentId: adj.id,
            }),
          );
        } else if (policyOf(target) !== 'proportional') {
          ctx.issues.push(
            makeIssue('ADJUSTMENT_INVALID_BASE', 'error', 'R7.2', `included adjustment "${id}" does not use proportional allocation`, {
              path: [...path, 'base'],
              adjustmentId: adj.id,
            }),
          );
        } else {
          included.push(id);
        }
      }
    }

    // Cell weights (item x participant) and per-participant sums.
    interface Cell {
      readonly itemId: string;
      readonly pid: string;
      readonly weight: Q;
    }
    const cells: Cell[] = [];
    const bP = new Map<string, Q>();
    let cellSum = ZERO;
    for (const r of eligibleRows) {
      for (const [pid, share] of r.shares) {
        let w = q(share);
        if (baseType === 'items-after') {
          for (const id of included) {
            const attr = attribution.get(id)?.get(r.item.id)?.get(pid);
            if (attr) w = add(w, attr);
          }
        }
        cells.push({ itemId: r.item.id, pid, weight: w });
        bP.set(pid, add(bP.get(pid) ?? ZERO, w));
        cellSum = add(cellSum, w);
      }
    }
    const B: Q = adj.base?.type === 'fixed' ? q(BigInt(adj.base.amount)) : cellSum;

    // R6.3, R8.1-R8.3 — skip conditions.
    let notApplied: NotAppliedReason | undefined;
    if (eligibleRows.length === 0) notApplied = 'no-eligible-items';
    else if (!withinValidity(adj, ctx.billDate)) notApplied = 'outside-validity';
    else if (adj.minimumSpend !== undefined && cmp(B, q(BigInt(adj.minimumSpend))) < 0) notApplied = 'below-minimum-spend';
    else if (adj.value.type === 'rate' && cmp(B, ZERO) <= 0) notApplied = 'non-positive-base';

    let computed = 0n;
    let capped = false;
    let clamped = false;
    let overridden: { amount: Paisa; reason: string } | undefined;
    let raw: Q | undefined;
    const mode: RoundingMode = adj.rounding ?? 'half-up';
    let magnitude = 0n;

    if (notApplied === undefined) {
      if (adj.value.type === 'rate') {
        raw = div(mul(B, q(BigInt(adj.value.bp))), q(10_000n));
        computed = roundQ(raw, mode);
      } else {
        computed = BigInt(adj.value.amount);
      }
      magnitude = computed;
      if (adj.cap !== undefined && magnitude > BigInt(adj.cap)) {
        magnitude = BigInt(adj.cap);
        capped = true;
      }
      if (isSubtracting(adj)) {
        const limit = floorQ(B) > 0n ? floorQ(B) : 0n;
        if (magnitude > limit) {
          magnitude = limit;
          clamped = true;
        }
      }
    } else {
      ctx.issues.push(
        makeIssue('ADJUSTMENT_NOT_APPLIED', 'warning', notAppliedRule(notApplied), `adjustment "${adj.id}" not applied: ${notApplied}`, {
          path,
          adjustmentId: adj.id,
          reason: notApplied,
        }),
      );
    }
    // R8.7 / R16.3: override is unconditional, even when the adjustment was skipped; never capped or clamped.
    if (adj.override) {
      magnitude = BigInt(adj.override.amount);
      overridden = { amount: paisaOf(magnitude), reason: adj.override.reason };
    }
    const A = isSubtracting(adj) ? -magnitude : magnitude;

    // R8.8 printed amount check.
    if (adj.printedAmount !== undefined && BigInt(adj.printedAmount) !== magnitude) {
      ctx.issues.push(
        makeIssue('ADJUSTMENT_PRINTED_MISMATCH', 'error', 'R8.8', `computed ${magnitude} but receipt prints ${adj.printedAmount}`, {
          path: [...path, 'printedAmount'],
          adjustmentId: adj.id,
          difference: paisaOf(magnitude - BigInt(adj.printedAmount)),
        }),
      );
    }

    trace.push({
      type: 'adjustment',
      adjustmentId: adj.id,
      eligibleItemIds: eligibleRows.map((r) => r.item.id),
      base: toExact(B),
      baseType,
      ...(adj.value.type === 'rate' ? { rateBp: adj.value.bp as BasisPoints, rounding: mode } : {}),
      ...(raw ? { raw: toExact(raw) } : {}),
      computed: paisaOf(computed),
      capped,
      clamped,
      ...(overridden ? { overridden } : {}),
      ...(notApplied ? { notApplied } : {}),
      amount: paisaOf(A),
    });

    // R9.3 — allocation.
    const policy = adj.allocation?.type ?? 'proportional';
    let weights: { id: string; weight: Q }[];
    let fallbackEqual = false;
    let propW = ZERO;
    if (policy === 'proportional') {
      weights = ctx.participantIds.map((pid) => ({ id: pid, weight: maxQ(bP.get(pid) ?? ZERO, ZERO) }));
      for (const w of weights) propW = add(propW, w.weight);
      if (cmp(propW, ZERO) === 0 && A !== 0n) {
        fallbackEqual = true;
        weights = ctx.participantIds.map((pid) => ({ id: pid, weight: q(1n) }));
        ctx.issues.push(
          makeIssue('ALLOCATION_FALLBACK_EQUAL', 'warning', 'R9.3', `adjustment "${adj.id}" has no positive base; allocated equally`, {
            path,
            adjustmentId: adj.id,
          }),
        );
      }
    } else if (adj.allocation?.type === 'equal') {
      weights = (adj.allocation.participantIds ?? ctx.participantIds).map((id) => ({ id, weight: q(1n) }));
    } else if (adj.allocation?.type === 'weights') {
      weights = adj.allocation.entries.map((e) => ({ id: e.participantId, weight: q(BigInt(e.weight)) }));
    } else {
      weights = [];
    }
    const lr = largestRemainder(A, weights);
    trace.push({
      type: 'adjustment-allocation',
      adjustmentId: adj.id,
      policy,
      fallbackEqual,
      allocation: rowsToTrace(A, lr),
    });

    // R9.5 — exact attribution for later `items-after` bases.
    if (policy === 'proportional' && !fallbackEqual && A !== 0n && cmp(propW, ZERO) > 0) {
      const perItem = new Map<string, Map<string, Q>>();
      for (const c of cells) {
        const bp = bP.get(c.pid) ?? ZERO;
        if (cmp(bp, ZERO) <= 0) continue;
        const attr = div(mul(q(A), c.weight), propW);
        let m = perItem.get(c.itemId);
        if (!m) perItem.set(c.itemId, (m = new Map()));
        m.set(c.pid, attr);
      }
      attribution.set(adj.id, perItem);
    }

    results.push({
      adj,
      amount: A,
      applied: notApplied === undefined || overridden !== undefined,
      ...(notApplied ? { notApplied } : {}),
      allocations: new Map(lr.map((r) => [r.id, r.amount])),
    });
  });

  return { results, trace };
}

function notAppliedRule(r: NotAppliedReason): string {
  switch (r) {
    case 'no-eligible-items':
      return 'R6.3';
    case 'outside-validity':
      return 'R8.1';
    case 'below-minimum-spend':
      return 'R8.2';
    case 'non-positive-base':
      return 'R8.3';
  }
}
