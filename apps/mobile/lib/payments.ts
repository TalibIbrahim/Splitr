/**
 * Tiny pure helpers for the Breakdown screen's display hints. These are NOT used for settlement
 * (the engine owns that); they only drive the "remaining" label in the split-payment editor,
 * the "card saved" line, and transfer-status lookups.
 */

export interface SplitPaymentStatus {
  /** Sum of the valid rows (paisa). */
  sum: number;
  /** left: more to assign. over: assigned too much. done: sum equals total. */
  direction: 'left' | 'over' | 'done';
  /** Absolute gap in paisa (0 when done). */
  gap: number;
  /** Some row has text that did not parse. */
  hasInvalid: boolean;
  /** Save is allowed only when every row parsed and the sum equals the total exactly. */
  canSave: boolean;
}

/** `amounts` has one entry per row: paisa, or null when the typed text is invalid. Empty rows count as 0. */
export function splitPaymentStatus(total: number, amounts: readonly (number | null)[]): SplitPaymentStatus {
  let sum = 0;
  let hasInvalid = false;
  for (const a of amounts) {
    if (a === null) hasInvalid = true;
    else sum += a;
  }
  const diff = total - sum;
  const direction = diff > 0 ? 'left' : diff < 0 ? 'over' : 'done';
  const anyPositive = amounts.some((a) => a !== null && a > 0);
  return {
    sum,
    direction,
    gap: diff < 0 ? -diff : diff,
    hasInvalid,
    canSave: !hasInvalid && diff === 0 && anyPositive && amounts.every((a) => a === null || a >= 0),
  };
}

/** Total saved by discounts: the magnitude of the summed discount adjustment amounts (negative in the breakdown). */
export function cardSaving(adjustments: readonly { kind: string; amount: number }[]): number {
  let sum = 0;
  for (const a of adjustments) if (a.kind === 'discount') sum += a.amount;
  return sum < 0 ? -sum : 0;
}

interface TransferKey {
  from: string;
  to: string;
  amount: number;
}
interface StatusLike extends TransferKey {
  status: 'pending' | 'paid';
}

/** A transfer is paid only when a status with identical from, to and amount says so (same rule as D7). */
export function isTransferMarkedPaid(statuses: readonly StatusLike[], t: TransferKey): boolean {
  return statuses.some((s) => s.from === t.from && s.to === t.to && s.amount === t.amount && s.status === 'paid');
}
