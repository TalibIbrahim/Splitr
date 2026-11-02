import type { BillInput } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';

/** D1. Pure mapping from a stored Bill to the engine input. */
export function toBillInput(bill: Bill): BillInput {
  return {
    currency: bill.currency,
    date: bill.date,
    participants: bill.participants.map((p) => ({ id: p.id, displayName: p.displayName })),
    items: bill.items,
    adjustments: bill.adjustments,
    contributions: bill.contributions,
    ...(bill.printedSubtotal !== undefined ? { printedSubtotal: bill.printedSubtotal } : {}),
    ...(bill.printedTotal !== undefined ? { printedTotal: bill.printedTotal } : {}),
    settlementRoundingUnit: bill.settlementRoundingUnit,
  };
}
