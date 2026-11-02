import { toPaisa, type CalculationResult, type Paisa, type ParticipantId } from '@splitr/calculation-engine';
import type { Bill, TransferStatus } from '@splitr/shared-types';

type TransferLike = { from: ParticipantId; to: ParticipantId; amount: Paisa };

function sameTransfer(a: TransferLike, b: TransferLike): boolean {
  return a.from === b.from && a.to === b.to && a.amount === b.amount;
}

/** True when `bill.transferStatuses` marks this exact transfer (from, to and amount) as paid. */
export function isTransferPaid(bill: Bill, t: TransferLike): boolean {
  return bill.transferStatuses.some((s) => s.status === 'paid' && sameTransfer(s, t));
}

/**
 * D7. Keeps a `paid` status only when from, to and amount are all identical; everything else is `pending`.
 * `droppedPaid` counts previously paid statuses that did not survive.
 */
export function reconcileTransferStatuses(
  prev: readonly TransferStatus[],
  transfers: readonly TransferLike[],
): { statuses: TransferStatus[]; droppedPaid: number } {
  const statuses = transfers.map((t): TransferStatus => {
    const match = prev.find((s) => s.status === 'paid' && sameTransfer(s, t));
    return match
      ? { from: t.from, to: t.to, amount: t.amount, status: 'paid', paidAt: match.paidAt }
      : { from: t.from, to: t.to, amount: t.amount, status: 'pending', paidAt: null };
  });
  const droppedPaid = prev.filter((s) => s.status === 'paid' && !transfers.some((t) => sameTransfer(s, t))).length;
  return { statuses, droppedPaid };
}

export interface MyBalances {
  youOwe: Paisa;
  owedToYou: Paisa;
  counterparties: { key: string; displayName: string; net: Paisa /* + they owe me */ }[];
}

/**
 * D8. Aggregates pending transfers from open bills (ok result, settlement present, `meParticipantId` set).
 * Soft-deleted bills are ignored. Counterparties are keyed by personId (guests by display name),
 * sorted by |net| descending then key; counterparties that net to zero are omitted.
 */
export function balancesForMe(
  bills: readonly Bill[],
  results: ReadonlyMap<string, CalculationResult>,
): MyBalances {
  let youOwe = 0;
  let owedToYou = 0;
  const nets = new Map<string, { displayName: string; net: number }>();

  for (const bill of bills) {
    const me = bill.meParticipantId;
    if (bill.status !== 'open' || me === null || (bill.deletedAt ?? null) !== null) continue;
    const result = results.get(bill.id);
    if (!result || !result.ok || result.breakdown.settlement === null) continue;

    for (const t of result.breakdown.settlement.transfers) {
      if (t.from !== me && t.to !== me) continue;
      if (isTransferPaid(bill, t)) continue;
      const otherId = t.from === me ? t.to : t.from;
      const other = bill.participants.find((p) => p.id === otherId);
      const displayName = other?.displayName ?? otherId;
      const key = other?.personId ?? displayName;
      const signed = t.from === me ? -t.amount : t.amount; // + they owe me
      if (t.from === me) youOwe += t.amount;
      else owedToYou += t.amount;
      const entry = nets.get(key);
      if (entry) entry.net += signed;
      else nets.set(key, { displayName, net: signed });
    }
  }

  return {
    youOwe: toPaisa(youOwe),
    owedToYou: toPaisa(owedToYou),
    counterparties: [...nets.entries()]
      .filter(([, v]) => v.net !== 0)
      .map(([key, v]) => ({ key, displayName: v.displayName, net: toPaisa(v.net) }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  };
}
