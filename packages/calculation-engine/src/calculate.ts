import { computeAdjustments, type ShareRow } from './adjustments';
import { makeIssue } from './issues';
import { splitItem, type ItemSplit } from './items';
import { paisaOf } from './rational';
import { buildSettlement, roundTotals } from './settlement';
import { validateBill } from './validate';
import type {
  AdjustmentResult,
  BillBreakdown,
  BillInput,
  CalculateBill,
  CalculationResult,
  Issue,
  ParticipantBreakdown,
  TraceStep,
} from './types';

function finish(issues: readonly Issue[]): CalculationResult {
  return {
    ok: false,
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
  };
}

/**
 * R1-R15. Never throws on bad bill input; all issues are collected (R15.1).
 * When an item has an assignment error, total-dependent checks (R10.5, R10.6, R12.1) are skipped
 * because the totals are not trustworthy until the item is fixed.
 */
function run(input: BillInput): CalculationResult {
  const issues: Issue[] = [];
  const { invalidItems, structured } = validateBill(input, issues);
  if (!structured) return finish(issues);
  const blocking = issues.some((i) => i.code === 'INVALID_INPUT');

  // R4 — split every structurally valid item.
  const splits: (ItemSplit | undefined)[] = input.items.map((item, i) => {
    if (invalidItems.has(i)) return undefined;
    const s = splitItem(item, i);
    if (s.issue) issues.push(s.issue);
    return s;
  });
  if (blocking) return finish(issues);

  const itemAssignmentErrors = splits.some((s) => s?.issue?.severity === 'error');
  const participantIds = input.participants.map((p) => p.id);
  const rows: ShareRow[] = input.items.map((item, index) => ({
    item,
    index,
    shares: new Map((splits[index]?.shares ?? []).map((s) => [s.participantId, s.amount])),
  }));

  const trace: TraceStep[] = [];
  input.items.forEach((item, i) => {
    const s = splits[i];
    if (s?.trace && item.lineTotal !== 0) {
      trace.push({ type: 'item-split', itemId: item.id, assignmentKind: item.assignment.kind, allocation: s.trace });
    }
  });

  // R5-R9 — adjustments.
  const { results, trace: adjTrace } = computeAdjustments({
    participantIds,
    rows,
    adjustments: input.adjustments,
    billDate: input.date,
    issues,
  });
  trace.push(...adjTrace);

  // R10 — totals.
  const itemsSubtotal = input.items.reduce((s, it) => s + BigInt(it.lineTotal), 0n);
  const T = results.reduce((s, r) => s + r.amount, itemsSubtotal);
  if (input.printedSubtotal !== undefined && BigInt(input.printedSubtotal) !== itemsSubtotal) {
    issues.push(
      makeIssue('SUBTOTAL_MISMATCH', 'error', 'R10.4', `items subtotal ${itemsSubtotal} but receipt prints ${input.printedSubtotal}`, {
        path: ['printedSubtotal'],
        difference: paisaOf(itemsSubtotal - BigInt(input.printedSubtotal)),
      }),
    );
  }

  const u = BigInt(input.settlementRoundingUnit ?? 100);
  const contributionSum = input.contributions.reduce((s, c) => s + BigInt(c.amount), 0n);
  if (!itemAssignmentErrors) {
    if (input.printedTotal !== undefined && BigInt(input.printedTotal) !== T) {
      issues.push(
        makeIssue('TOTAL_MISMATCH', 'error', 'R10.5', `total ${T} but receipt prints ${input.printedTotal}`, {
          path: ['printedTotal'],
          difference: paisaOf(T - BigInt(input.printedTotal)),
        }),
      );
    }
    if (T < 0n) issues.push(makeIssue('NEGATIVE_TOTAL', 'error', 'R10.6', `bill total is negative (${T})`));
    if (input.contributions.length === 0) {
      issues.push(makeIssue('NO_CONTRIBUTIONS', 'warning', 'R12.1', 'no contributions recorded; settlement skipped'));
    } else if (contributionSum !== T) {
      issues.push(
        makeIssue('CONTRIBUTIONS_MISMATCH', 'error', 'R12.1', `contributions total ${contributionSum} but bill total is ${T}`, {
          path: ['contributions'],
          difference: paisaOf(contributionSum - T),
        }),
      );
    }
  }

  // Participant exact totals (R10.3).
  const exact = participantIds.map((pid) => {
    let items = 0n;
    for (const r of rows) items += r.shares.get(pid) ?? 0n;
    let adj = 0n;
    for (const r of results) adj += r.allocations.get(pid) ?? 0n;
    return { pid, items, total: items + adj };
  });
  if (!itemAssignmentErrors) {
    for (const e of exact) {
      if (e.total < 0n) {
        issues.push(
          makeIssue('NEGATIVE_SHARE', 'warning', 'R10.7', `participant "${e.pid}" has a negative total`, {
            participantId: e.pid,
          }),
        );
      }
    }
  }

  if (issues.some((i) => i.severity === 'error')) return finish(issues);

  // R11 — settlement rounding.
  const { R, rounded, allocation } = roundTotals(exact.map((e) => ({ id: e.pid, t: e.total })), T, u);
  trace.push({
    type: 'settlement-rounding',
    unit: paisaOf(u),
    exactTotal: paisaOf(T),
    roundedTotal: paisaOf(R),
    allocation,
  });

  // R12 — contributions and settlement.
  let settlement: BillBreakdown['settlement'] = null;
  if (input.contributions.length > 0) {
    const built = buildSettlement(participantIds, rounded, input.contributions, T, R);
    settlement = built.settlement;
    trace.push(...built.trace);
  }

  const participants: ParticipantBreakdown[] = exact.map((e) => ({
    participantId: e.pid,
    items: rows
      .filter((r) => r.shares.has(e.pid))
      .map((r) => ({ itemId: r.item.id, amount: paisaOf(r.shares.get(e.pid) ?? 0n) })),
    itemsSubtotal: paisaOf(e.items),
    adjustments: results.map((r) => ({ adjustmentId: r.adj.id, amount: paisaOf(r.allocations.get(e.pid) ?? 0n) })),
    exactTotal: paisaOf(e.total),
    roundedTotal: paisaOf(rounded.get(e.pid) ?? 0n),
    roundingDelta: paisaOf((rounded.get(e.pid) ?? 0n) - e.total),
  }));

  const adjustmentResults: AdjustmentResult[] = results.map((r) => ({
    adjustmentId: r.adj.id,
    label: r.adj.label,
    kind: r.adj.kind,
    amount: paisaOf(r.amount),
    applied: r.applied,
    ...(r.notApplied ? { notAppliedReason: r.notApplied } : {}),
    allocations: participantIds.map((pid) => ({ participantId: pid, amount: paisaOf(r.allocations.get(pid) ?? 0n) })),
  }));

  return {
    ok: true,
    breakdown: {
      itemsSubtotal: paisaOf(itemsSubtotal),
      adjustments: adjustmentResults,
      total: paisaOf(T),
      settlementRoundingUnit: paisaOf(u),
      roundedTotal: paisaOf(R),
      participants,
      settlement,
      trace,
    },
    warnings: issues.filter((i) => i.severity === 'warning'),
  };
}

export const calculateBill: CalculateBill = (input) => {
  try {
    return run(input);
  } catch (e) {
    // paisaOf() signals an out-of-range amount with RangeError (R1.1); everything else is a bug.
    if (e instanceof RangeError) {
      return finish([makeIssue('INVALID_INPUT', 'error', 'R1.1', `amount outside the safe integer range: ${e.message}`)]);
    }
    throw e;
  }
};
