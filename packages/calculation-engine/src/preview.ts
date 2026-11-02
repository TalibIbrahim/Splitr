import { splitItem } from './items';
import { paisaOf } from './rational';
import type { Issue, ItemAssignmentStatus, ItemSharesPreview, PreviewItemShares } from './types';
import { validateItems, validateParticipants } from './validate';

/** R14: Assign-screen preview. Reports only INVALID_INPUT as errors. */
export const previewItemShares: PreviewItemShares = (input) => {
  const issues: Issue[] = [];
  const pids = validateParticipants(input.participants, issues);
  const invalid = validateItems(input.items, pids, issues);
  const errors = issues.filter((i) => i.code === 'INVALID_INPUT');

  const subtotals = new Map<string, bigint>();
  let unallocatedTotal = 0n;
  let needsAttentionCount = 0;
  const items: ItemSharesPreview['items'] = input.items.map((item, i) => {
    const lineTotal = typeof item?.lineTotal === 'number' && Number.isSafeInteger(item.lineTotal) ? BigInt(item.lineTotal) : 0n;
    let status: ItemAssignmentStatus = 'unassigned';
    let shares: { participantId: string; amount: bigint }[] = [];
    if (!invalid.has(i)) {
      const s = splitItem(item, i);
      status = s.status;
      shares = [...s.shares];
    }
    const sum = shares.reduce((acc, s) => acc + s.amount, 0n);
    const unallocated = lineTotal - sum;
    for (const s of shares) subtotals.set(s.participantId, (subtotals.get(s.participantId) ?? 0n) + s.amount);
    unallocatedTotal += unallocated;
    if (status === 'unassigned' || status === 'under' || status === 'over') needsAttentionCount += 1;
    return {
      itemId: item.id,
      status,
      shares: shares.map((s) => ({ participantId: s.participantId, amount: paisaOf(s.amount) })),
      unallocated: paisaOf(unallocated),
    };
  });

  return {
    items,
    participants: input.participants.map((p) => ({
      participantId: p.id,
      itemsSubtotal: paisaOf(subtotals.get(p.id) ?? 0n),
    })),
    unallocatedTotal: paisaOf(unallocatedTotal),
    needsAttentionCount,
    errors,
  };
};
