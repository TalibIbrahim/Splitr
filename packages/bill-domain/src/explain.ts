import type { AdjustmentResult, BillBreakdown, Paisa, ParticipantId, TraceStep } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { percentFromBp, rupeesPlain } from './format';

export interface ExplainLine {
  kind: 'item' | 'items-subtotal' | 'adjustment' | 'exact' | 'rounding' | 'final';
  /** Item name / "Items" / adjustment label / "Exact share" / "Rounded" / "Your share" or "{name}'s share". */
  label: string;
  /** Signed contribution, except for 'items-subtotal', 'exact' and 'final', which are running totals. */
  amount: Paisa;
  /** "split 4 ways" | "1 of 2" | "50%" | "20% of 2,125" (rupee figures grouped, no "Rs"). */
  context?: string;
}

type AdjustmentStep = Extract<TraceStep, { type: 'adjustment' }>;
type ItemSplitStep = Extract<TraceStep, { type: 'item-split' }>;

function itemContext(bill: Bill, itemId: string, pid: ParticipantId): string | undefined {
  const item = bill.items.find((i) => i.id === itemId);
  if (!item) return undefined;
  const a = item.assignment;
  switch (a.kind) {
    case 'equal':
      return a.participantIds.length > 1 ? `split ${a.participantIds.length} ways` : undefined;
    case 'units': {
      const mine = a.entries.find((e) => e.participantId === pid);
      return mine ? `${mine.units} of ${item.quantity}` : undefined;
    }
    case 'weights': {
      const mine = a.entries.find((e) => e.participantId === pid);
      const sum = a.entries.reduce((s, e) => s + e.weight, 0);
      return mine ? `${mine.weight} of ${sum}` : undefined;
    }
    case 'percent': {
      const mine = a.entries.find((e) => e.participantId === pid);
      return mine ? percentFromBp(mine.bp) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The participant's own base for a rate adjustment, taken from the trace and the breakdown:
 * their item shares of the eligible items, plus (for `items-after`) their allocations of the included
 * earlier adjustments. Display only.
 */
function participantBase(
  breakdown: BillBreakdown,
  step: AdjustmentStep,
  bill: Bill,
  pid: ParticipantId,
): number {
  // Proportional allocation weights in the trace are exactly each participant's b_p.
  if (step.baseType !== 'fixed') {
    const alloc = breakdown.trace.find(
      (t) => t.type === 'adjustment-allocation' && t.adjustmentId === step.adjustmentId,
    );
    if (alloc && alloc.type === 'adjustment-allocation' && alloc.policy === 'proportional' && !alloc.fallbackEqual) {
      const row = alloc.allocation.rows.find((r) => r.participantId === pid);
      if (row) return row.weight.rounded;
    }
  }
  let base = 0;
  for (const t of breakdown.trace) {
    if (t.type !== 'item-split') continue;
    const split: ItemSplitStep = t;
    if (!step.eligibleItemIds.includes(split.itemId)) continue;
    const row = split.allocation.rows.find((r) => r.participantId === pid);
    if (row) base += row.amount;
  }
  if (step.baseType === 'items-after') {
    const def = bill.adjustments.find((a) => a.id === step.adjustmentId);
    const include = def?.base?.type === 'items-after' ? def.base.include : 'all-prior';
    const idx = breakdown.adjustments.findIndex((a) => a.adjustmentId === step.adjustmentId);
    const prior: readonly AdjustmentResult[] =
      include === 'all-prior'
        ? breakdown.adjustments.slice(0, Math.max(idx, 0))
        : breakdown.adjustments.filter((a) => include.includes(a.adjustmentId));
    for (const a of prior) {
      base += a.allocations.find((x) => x.participantId === pid)?.amount ?? 0;
    }
  }
  return base;
}

/** D6. "How you got to 1,806". Every amount comes from the breakdown/trace. */
export function explainParticipant(breakdown: BillBreakdown, bill: Bill, pid: ParticipantId): ExplainLine[] {
  const pb = breakdown.participants.find((p) => p.participantId === pid);
  if (!pb) return [];
  const lines: ExplainLine[] = [];

  for (const it of pb.items) {
    const name = bill.items.find((i) => i.id === it.itemId)?.name ?? it.itemId;
    const context = itemContext(bill, it.itemId, pid);
    lines.push({ kind: 'item', label: name, amount: it.amount, ...(context ? { context } : {}) });
  }

  lines.push({ kind: 'items-subtotal', label: 'Items', amount: pb.itemsSubtotal });

  for (const adj of pb.adjustments) {
    if (adj.amount === 0) continue;
    const result = breakdown.adjustments.find((a) => a.adjustmentId === adj.adjustmentId);
    const step = breakdown.trace.find(
      (t): t is AdjustmentStep => t.type === 'adjustment' && t.adjustmentId === adj.adjustmentId,
    );
    let context: string | undefined;
    if (step && step.rateBp !== undefined) {
      const base = step.baseType === 'fixed' ? step.base.rounded : participantBase(breakdown, step, bill, pid);
      context = `${percentFromBp(step.rateBp)} of ${rupeesPlain(base)}`;
    }
    lines.push({
      kind: 'adjustment',
      label: result?.label ?? adj.adjustmentId,
      amount: adj.amount,
      ...(context ? { context } : {}),
    });
  }

  lines.push({ kind: 'exact', label: 'Exact share', amount: pb.exactTotal });
  if (pb.roundingDelta !== 0) lines.push({ kind: 'rounding', label: 'Rounded', amount: pb.roundingDelta });

  const name = bill.participants.find((p) => p.id === pid)?.displayName ?? pid;
  lines.push({
    kind: 'final',
    label: bill.meParticipantId === pid ? 'Your share' : `${name}'s share`,
    amount: pb.roundedTotal,
  });
  return lines;
}
