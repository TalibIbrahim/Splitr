import type { CalculationResult } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { isTransferPaid } from './transfers';

/** D9. True when the result is ok, has a settlement, and every transfer is marked paid. */
export function canSettle(bill: Bill, result: CalculationResult): boolean {
  if (!result.ok) return false;
  const settlement = result.breakdown.settlement;
  if (settlement === null) return false;
  return settlement.transfers.every((t) => isTransferPaid(bill, t));
}

/** D9. Freezes the bill: status settled, settledAt, and finalSnapshot = the breakdown. Throws if not settleable. */
export function settleBill(bill: Bill, result: CalculationResult, nowIso: string): Bill {
  if (!result.ok || !canSettle(bill, result)) {
    throw new Error('Bill cannot be settled: result is not ok, has no settlement, or has unpaid transfers');
  }
  return { ...bill, status: 'settled', settledAt: nowIso, finalSnapshot: result.breakdown };
}

/** D9. Returns the bill to `open` and drops the frozen snapshot. */
export function reopenBill(bill: Bill): Bill {
  return { ...bill, status: 'open', settledAt: null, finalSnapshot: null };
}
