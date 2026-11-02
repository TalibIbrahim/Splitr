import { calculateBill, type BillBreakdown, type CalculationResult } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { toBillInput } from './bill-input';
import { isTransferPaid } from './transfers';

/** D9. True when the result is ok, has a settlement, and every transfer is marked paid. */
export function canSettle(bill: Bill, result: CalculationResult): boolean {
  if (!result.ok) return false;
  const settlement = result.breakdown.settlement;
  if (settlement === null) return false;
  return settlement.transfers.every((t) => isTransferPaid(bill, t));
}

/** D9. Freezes the bill: status settled, settledAt, and finalSnapshot = the breakdown without its trace (D9b). Throws if not settleable. */
export function settleBill(bill: Bill, result: CalculationResult, nowIso: string): Bill {
  if (!result.ok || !canSettle(bill, result)) {
    throw new Error('Bill cannot be settled: result is not ok, has no settlement, or has unpaid transfers');
  }
  return { ...bill, status: 'settled', settledAt: nowIso, finalSnapshot: { ...result.breakdown, trace: [] } };
}

/** D9. Returns the bill to `open` and drops the frozen snapshot. */
export function reopenBill(bill: Bill): Bill {
  return { ...bill, status: 'open', settledAt: null, finalSnapshot: null };
}

/**
 * D9b. Rebuilds the step-by-step for a settled bill. The engine is deterministic, so the recalculated breakdown replaces the
 * slimmed snapshot when every participant's exact and rounded totals match; otherwise only the snapshot amounts are trustworthy.
 */
export function explainSettled(
  bill: Bill,
): { kind: 'steps'; breakdown: BillBreakdown } | { kind: 'snapshot-only' } {
  const snap = bill.finalSnapshot;
  if (!snap) return { kind: 'snapshot-only' };
  const result = calculateBill(toBillInput(bill));
  if (!result.ok) return { kind: 'snapshot-only' };
  const fresh = result.breakdown;
  const same =
    fresh.participants.length === snap.participants.length &&
    snap.participants.every((sp) => {
      const fp = fresh.participants.find((p) => p.participantId === sp.participantId);
      return fp !== undefined && fp.exactTotal === sp.exactTotal && fp.roundedTotal === sp.roundedTotal;
    });
  return same ? { kind: 'steps', breakdown: fresh } : { kind: 'snapshot-only' };
}
