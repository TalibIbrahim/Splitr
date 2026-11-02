import type { CalculationResult } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';

export type BillState = 'needs-review' | 'unassigned' | 'ready' | 'reconciled' | 'settled';

/** D5. Precedence: settled, needs-review, unassigned, reconciled, ready. */
export function deriveBillState(bill: Bill, result: CalculationResult): BillState {
  if (bill.status === 'settled') return 'settled';
  if (!result.ok) {
    if (result.errors.some((e) => !e.code.startsWith('ITEM_'))) return 'needs-review';
    if (result.errors.some((e) => e.code.startsWith('ITEM_'))) return 'unassigned';
    return 'needs-review';
  }
  return bill.printedTotal !== undefined ? 'reconciled' : 'ready';
}
