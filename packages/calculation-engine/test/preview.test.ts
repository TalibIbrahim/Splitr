import { describe, expect, it } from 'vitest';
import { previewItemShares } from '../src/index';
import { fixtureA, fixtureB } from './fixtures';
import { amt, eq, item, mustOk, NONE, pct, people, sum, uni } from './helpers';

const byId = <T extends { itemId: string }>(xs: readonly T[], id: string): T => {
  const x = xs.find((i) => i.itemId === id);
  if (!x) throw new Error(`no preview for ${id}`);
  return x;
};
const shareMap = (p: { shares: readonly { participantId: string; amount: number }[] }) =>
  Object.fromEntries(p.shares.map((s) => [s.participantId, s.amount as number]));

describe('R14 preview (Assign screen)', () => {
  const participants = people('a', 'b');
  const items = [
    item('ok', 1000, eq('a', 'b')),
    item('un', 700, NONE),
    item('under', 1000, pct({ a: 5000 })),
    item('over', 1000, pct({ a: 6000, b: 5000 })),
    item('zero', 0, NONE),
  ];

  it('R14.1 reports a status per item and never fails on assignment problems', () => {
    const p = previewItemShares({ participants, items });
    expect(p.errors).toEqual([]);
    expect(p.items.map((i) => [i.itemId, i.status])).toEqual([
      ['ok', 'assigned'],
      ['un', 'unassigned'],
      ['under', 'under'],
      ['over', 'over'],
      ['zero', 'zero'],
    ]);
  });

  it('R14.1 under-assigned items allocate the assigned part; over-assigned items allocate nothing', () => {
    const p = previewItemShares({ participants, items });
    expect(shareMap(byId(p.items, 'ok'))).toEqual({ a: 500, b: 500 });
    expect(shareMap(byId(p.items, 'under'))).toEqual({ a: 500 }); // 50% of 1000
    expect(byId(p.items, 'under').unallocated as number).toBe(500);
    expect(byId(p.items, 'over').shares).toEqual([]);
    expect(byId(p.items, 'over').unallocated as number).toBe(1000);
    expect(byId(p.items, 'un').shares).toEqual([]);
    expect(byId(p.items, 'un').unallocated as number).toBe(700);
    expect(byId(p.items, 'zero').unallocated as number).toBe(0);
  });

  it('R14.1 running subtotals per participant, unallocated total and needs-attention count', () => {
    const p = previewItemShares({ participants, items });
    expect(p.participants.map((x) => [x.participantId, x.itemsSubtotal as number])).toEqual([
      ['a', 1000],
      ['b', 500],
    ]);
    expect(p.unallocatedTotal as number).toBe(700 + 500 + 1000);
    expect(p.needsAttentionCount).toBe(3); // unassigned, under, over (zero and assigned do not count)
  });

  it('R14.1 amounts under-assigned allocate what is assigned, over-assigned allocate nothing', () => {
    const p = previewItemShares({
      participants,
      items: [item('u', 1000, amt({ a: 600 })), item('o', 1000, amt({ a: 600, b: 600 }))],
    });
    expect(byId(p.items, 'u').status).toBe('under');
    expect(shareMap(byId(p.items, 'u'))).toEqual({ a: 600 });
    expect(byId(p.items, 'u').unallocated as number).toBe(400);
    expect(byId(p.items, 'o').status).toBe('over');
    expect(byId(p.items, 'o').shares).toEqual([]);
  });

  it('R14.1 units over quantity is over', () => {
    const p = previewItemShares({ participants, items: [item('o', 1000, uni({ a: 2, b: 2 }), { quantity: 3 })] });
    expect(byId(p.items, 'o').status).toBe('over');
    expect(p.needsAttentionCount).toBe(1);
  });

  it('R14.1 a fully assigned list has nothing left', () => {
    const p = previewItemShares({ participants, items: [item('x', 1001, eq('a', 'b')), item('y', 500, eq('b'))] });
    expect(p.needsAttentionCount).toBe(0);
    expect(p.unallocatedTotal as number).toBe(0);
    expect(p.participants.map((x) => x.itemsSubtotal as number)).toEqual([501, 1000]);
    expect(p.items.every((i) => i.status === 'assigned')).toBe(true);
  });

  it('R14.1 preview agrees with calculateBill on fully assigned bills (Fixtures A and B)', () => {
    for (const f of [fixtureA, fixtureB]) {
      const preview = previewItemShares({ participants: f.input.participants, items: f.input.items });
      const b = mustOk(f.input).breakdown;
      expect(preview.participants.map((x) => [x.participantId, x.itemsSubtotal as number])).toEqual(
        b.participants.map((x) => [x.participantId, x.itemsSubtotal as number]),
      );
      expect(sum(preview.participants.map((x) => x.itemsSubtotal as number))).toBe(b.itemsSubtotal as number);
    }
  });

  it('R14.2 structural problems are still reported as INVALID_INPUT errors', () => {
    const unknown = previewItemShares({ participants, items: [item('x', 1000, eq('a', 'ghost'))] });
    expect(unknown.errors.map((e) => e.code)).toEqual(['INVALID_INPUT']);
    expect(unknown.errors[0]!.severity).toBe('error');
    const dup = previewItemShares({ participants: people('a', 'a'), items: [] });
    expect(dup.errors.map((e) => e.code)).toContain('INVALID_INPUT');
    const nonInt = previewItemShares({ participants, items: [item('x', 10.5, eq('a'))] });
    expect(nonInt.errors.map((e) => e.code)).toContain('INVALID_INPUT');
  });

  it('R14.2 preview is deterministic and independent of array order', () => {
    const rev = previewItemShares({ participants: [...participants].reverse(), items: [...items].reverse() });
    const fwd = previewItemShares({ participants, items });
    expect(Object.fromEntries(rev.participants.map((x) => [x.participantId, x.itemsSubtotal]))).toEqual(
      Object.fromEntries(fwd.participants.map((x) => [x.participantId, x.itemsSubtotal])),
    );
    expect(rev.unallocatedTotal).toBe(fwd.unallocatedTotal);
    expect(previewItemShares({ participants, items })).toEqual(fwd);
  });

  it('R16.6 units under-assigned: 3 units at 900 with 2 assigned -> assigned part 600, split by R9.1 (300 / 300)', () => {
    const p = previewItemShares({ participants, items: [item('u', 900, uni({ a: 1, b: 1 }), { quantity: 3 })] });
    const u = byId(p.items, 'u');
    expect(u.status).toBe('under');
    expect(shareMap(u)).toEqual({ a: 300, b: 300 });
    expect(u.unallocated as number).toBe(300);
  });

  it('R16.6 units under-assigned: 900, 3 units, a has 2 -> assigned part 600 all to a', () => {
    const p = previewItemShares({ participants, items: [item('u', 900, uni({ a: 2 }), { quantity: 3 })] });
    expect(shareMap(byId(p.items, 'u'))).toEqual({ a: 600 });
  });

  it('R16.6 percent under-assigned rounds half-up: 1000 at 3333 bp -> 333', () => {
    const p = previewItemShares({ participants, items: [item('pc', 1000, pct({ a: 3333 }))] });
    const x = byId(p.items, 'pc');
    expect(x.status).toBe('under');
    expect(shareMap(x)).toEqual({ a: 333 });
    expect(x.unallocated as number).toBe(667);
  });

  it('R16.6 percent under-assigned splits the assigned part by R9.1: 1001 at 2500 + 2500 bp -> round-half-up(500.5) = 501 -> 251 / 250', () => {
    const p = previewItemShares({ participants, items: [item('pc', 1001, pct({ a: 2500, b: 2500 }))] });
    expect(shareMap(byId(p.items, 'pc'))).toEqual({ a: 251, b: 250 });
  });

  it('R16.7 an assigned zero-priced item is "assigned", not "zero"', () => {
    const p = previewItemShares({ participants, items: [item('free', 0, eq('a')), item('freeu', 0, NONE)] });
    expect(byId(p.items, 'free').status).toBe('assigned');
    expect(byId(p.items, 'freeu').status).toBe('zero');
    expect(p.needsAttentionCount).toBe(0);
  });
});
