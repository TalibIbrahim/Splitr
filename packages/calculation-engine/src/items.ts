import { makeIssue } from './issues';
import { largestRemainder, rowsToTrace, type LrRow } from './largest-remainder';
import { paisaOf, q, roundHalfAway } from './rational';
import type { AllocationTrace, Issue, Item, ItemAssignmentStatus } from './types';

export interface ItemSplit {
  readonly status: ItemAssignmentStatus;
  /** Shares keyed by participant, sorted by id. Empty when nothing is allocated. */
  readonly shares: readonly { readonly participantId: string; readonly amount: bigint }[];
  /** Present when the item was split without error. */
  readonly trace?: AllocationTrace;
  /** R4 error or warning, if any. */
  readonly issue?: Issue;
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * R4 / R9.2. Assumes the item is structurally valid (see validate.ts).
 * Under-assigned items allocate the assigned part, over-assigned items allocate nothing (R14.1).
 */
export function splitItem(item: Item, index: number): ItemSplit {
  const total = BigInt(item.lineTotal);
  const a = item.assignment;
  const path = ['items', index, 'assignment'] as const;
  const fromRows = (rows: readonly LrRow[], allocTotal: bigint) => ({
    shares: rows.map((r) => ({ participantId: r.id, amount: r.amount })),
    trace: rowsToTrace(allocTotal, rows),
  });
  const mismatch = (
    code: 'ITEM_UNDER_ASSIGNED' | 'ITEM_OVER_ASSIGNED',
    rule: string,
    what: string,
    difference?: bigint,
  ): Issue =>
    makeIssue(code, 'error', rule, `${what} is ${code === 'ITEM_UNDER_ASSIGNED' ? 'under' : 'over'}-assigned`, {
      path,
      itemId: item.id,
      ...(difference !== undefined && Number.isSafeInteger(Number(difference)) ? { difference: paisaOf(difference) } : {}),
    });

  switch (a.kind) {
    case 'unassigned':
      if (total === 0n) {
        return {
          status: 'zero',
          shares: [],
          issue: makeIssue('ITEM_UNASSIGNED', 'warning', 'R4.1', 'zero-value item is unassigned', { path, itemId: item.id }),
        };
      }
      return {
        status: 'unassigned',
        shares: [],
        issue: makeIssue('ITEM_UNASSIGNED', 'error', 'R4.1', 'item has no assignment', { path, itemId: item.id }),
      };

    case 'equal': {
      const rows = largestRemainder(total, a.participantIds.map((id) => ({ id, weight: q(1n) })));
      return { status: 'assigned', ...fromRows(rows, total) };
    }

    case 'weights': {
      const rows = largestRemainder(total, a.entries.map((e) => ({ id: e.participantId, weight: q(BigInt(e.weight)) })));
      return { status: 'assigned', ...fromRows(rows, total) };
    }

    case 'percent':
    case 'units': {
      const isPercent = a.kind === 'percent';
      const entries = a.entries.map((e) => ({
        id: e.participantId,
        w: BigInt('bp' in e ? e.bp : e.units),
      }));
      const expected = isPercent ? 10_000n : BigInt(item.quantity);
      const sum = entries.reduce((s, e) => s + e.w, 0n);
      const rule = isPercent ? 'R4.4' : 'R4.6';
      const weights = entries.map((e) => ({ id: e.id, weight: q(e.w) }));
      if (sum === expected) {
        const rows = largestRemainder(total, weights);
        return { status: 'assigned', ...fromRows(rows, total) };
      }
      if (sum > expected) {
        return { status: 'over', shares: [], issue: mismatch('ITEM_OVER_ASSIGNED', rule, a.kind) };
      }
      // Under-assigned: allocate the assigned part (preview semantics, R14.1).
      const assignedPart = sum === 0n ? 0n : roundHalfAway(q(total * sum, expected));
      const rows = largestRemainder(assignedPart, weights);
      return {
        status: 'under',
        shares: rows.map((r) => ({ participantId: r.id, amount: r.amount })),
        issue: mismatch('ITEM_UNDER_ASSIGNED', rule, a.kind),
      };
    }

    case 'amounts': {
      const entries = a.entries.map((e) => ({ id: e.participantId, amount: BigInt(e.amount) })).sort(byId);
      const sum = entries.reduce((s, e) => s + e.amount, 0n);
      const absSum = sum < 0n ? -sum : sum;
      const absTotal = total < 0n ? -total : total;
      const shares = entries.map((e) => ({ participantId: e.id, amount: e.amount }));
      if (absSum === absTotal) {
        const rows: LrRow[] = entries.map((e) => ({
          id: e.id,
          weight: q(e.amount),
          quota: q(e.amount),
          floor: e.amount,
          remainder: q(0n),
          bonus: 0n,
          amount: e.amount,
        }));
        return { status: 'assigned', shares, trace: rowsToTrace(total, rows) };
      }
      if (absSum > absTotal) {
        return { status: 'over', shares: [], issue: mismatch('ITEM_OVER_ASSIGNED', 'R4.5', 'amounts', sum - total) };
      }
      return { status: 'under', shares, issue: mismatch('ITEM_UNDER_ASSIGNED', 'R4.5', 'amounts', sum - total) };
    }
  }
}
