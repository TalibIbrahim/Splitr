import type { BasisPoints, Item, ItemSharesPreview, Paisa, ParticipantId } from '@splitr/calculation-engine';

/** D4. Tap-to-toggle a participant on an item. Never mutates. */
export function toggleParticipant(
  item: Item,
  pid: ParticipantId,
): { item: Item; replacedCustomSplit: boolean } {
  const a = item.assignment;
  if (a.kind === 'unassigned') {
    return { item: { ...item, assignment: { kind: 'equal', participantIds: [pid] } }, replacedCustomSplit: false };
  }
  if (a.kind === 'equal') {
    const present = a.participantIds.includes(pid);
    const next = present ? a.participantIds.filter((id) => id !== pid) : [...a.participantIds, pid];
    const assignment: Item['assignment'] =
      next.length === 0 ? { kind: 'unassigned' } : { kind: 'equal', participantIds: next };
    return { item: { ...item, assignment }, replacedCustomSplit: false };
  }
  return { item: { ...item, assignment: { kind: 'equal', participantIds: [pid] } }, replacedCustomSplit: true };
}

/** D4. Every unassigned item becomes an equal split among `pids`. Other items are returned untouched. */
export function assignRemainingEqually(items: readonly Item[], pids: readonly ParticipantId[]): Item[] {
  return items.map((item) =>
    item.assignment.kind === 'unassigned' && pids.length > 0
      ? { ...item, assignment: { kind: 'equal', participantIds: [...pids] } }
      : item,
  );
}

export function setUnits(item: Item, entries: { participantId: ParticipantId; units: number }[]): Item {
  return {
    ...item,
    assignment: { kind: 'units', entries: entries.map((e) => ({ participantId: e.participantId, units: e.units })) },
  };
}

export function setPercent(item: Item, entries: { participantId: ParticipantId; bp: BasisPoints }[]): Item {
  return {
    ...item,
    assignment: { kind: 'percent', entries: entries.map((e) => ({ participantId: e.participantId, bp: e.bp })) },
  };
}

export function setAmounts(item: Item, entries: { participantId: ParticipantId; amount: Paisa }[]): Item {
  return {
    ...item,
    assignment: { kind: 'amounts', entries: entries.map((e) => ({ participantId: e.participantId, amount: e.amount })) },
  };
}

/**
 * D4. The identical per-person share (paisa) for an equal split with no leftover paisa, otherwise null
 * (single-person and non-equal splits included). The UI formats it with <Money>.
 */
export function perPersonAmount(item: Item, preview: ItemSharesPreview): Paisa | null {
  if (item.assignment.kind !== 'equal' || item.assignment.participantIds.length < 2) return null;
  const row = preview.items.find((r) => r.itemId === item.id);
  if (!row || row.status !== 'assigned' || row.unallocated !== 0) return null;
  const first = row.shares[0];
  if (!first) return null;
  if (row.shares.length !== item.assignment.participantIds.length) return null;
  if (!row.shares.every((s) => s.amount === first.amount)) return null;
  return first.amount;
}
