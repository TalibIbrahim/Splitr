import type { Item } from '@splitr/calculation-engine';
import { calculateBill, previewItemShares } from '@splitr/calculation-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assignRemainingEqually,
  perPersonAmount,
  setAmounts,
  setPercent,
  setUnits,
  toggleParticipant,
} from '../src/index';
import { $, at, bp, deepFreeze, fixtureBItems, mkItem, SEATS } from './helpers';

const PIDS = SEATS.map((s) => s.id);
const people = SEATS.map((s) => ({ id: s.id, displayName: s.displayName }));
const unassigned = (id = 'i1', total = 100000): Item => mkItem(id, 'Thing', 1, total, { kind: 'unassigned' });
const equalItem = (ids: string[], total = 100000): Item => mkItem('i1', 'Thing', 1, total, { kind: 'equal', participantIds: ids });

function engineErrors(items: Item[]) {
  const r = calculateBill({ currency: 'PKR', date: '2026-11-02', participants: people, items, adjustments: [], contributions: [] });
  return r.ok ? [] : r.errors.map((e) => e.code);
}

describe('D4 toggleParticipant', () => {
  it('D4 toggle on unassigned -> equal [pid], replacedCustomSplit false', () => {
    const r = toggleParticipant(unassigned(), 'ali');
    expect(r.item.assignment).toEqual({ kind: 'equal', participantIds: ['ali'] });
    expect(r.replacedCustomSplit).toBe(false);
  });

  it('D4 toggle on equal adds a new pid (keeps the existing ones)', () => {
    const r = toggleParticipant(equalItem(['ali']), 'saad');
    expect(r.item.assignment.kind).toBe('equal');
    const ids = r.item.assignment.kind === 'equal' ? [...r.item.assignment.participantIds] : [];
    expect([...ids].sort()).toEqual(['ali', 'saad']);
    expect(ids).toHaveLength(2);
    expect(r.replacedCustomSplit).toBe(false);
  });

  it('D4 toggle on equal removes a pid that is present', () => {
    const r = toggleParticipant(equalItem(['ali', 'saad', 'hamza']), 'saad');
    const ids = r.item.assignment.kind === 'equal' ? [...r.item.assignment.participantIds] : [];
    expect(ids.sort()).toEqual(['ali', 'hamza']);
    expect(r.replacedCustomSplit).toBe(false);
  });

  it('D4 removing the last participant from equal -> unassigned', () => {
    const r = toggleParticipant(equalItem(['ali']), 'ali');
    expect(r.item.assignment).toEqual({ kind: 'unassigned' });
    expect(r.replacedCustomSplit).toBe(false);
  });

  it('D4 toggle twice on unassigned returns to unassigned', () => {
    const once = toggleParticipant(unassigned(), 'ali').item;
    expect(toggleParticipant(once, 'ali').item.assignment).toEqual({ kind: 'unassigned' });
  });

  const customs: [string, Item['assignment']][] = [
    ['units', { kind: 'units', entries: [{ participantId: 'hamza', units: 1 }, { participantId: 'ali', units: 1 }] }],
    ['percent', { kind: 'percent', entries: [{ participantId: 'hamza', bp: bp(5000) }, { participantId: 'ali', bp: bp(5000) }] }],
    ['amounts', { kind: 'amounts', entries: [{ participantId: 'hamza', amount: $(40000) }, { participantId: 'ali', amount: $(60000) }] }],
    ['weights', { kind: 'weights', entries: [{ participantId: 'hamza', weight: 1 }, { participantId: 'ali', weight: 2 }] }],
  ];
  it.each(customs)('D4 toggle on %s replaces the split with equal [pid] and flags replacedCustomSplit', (_n, assignment) => {
    const item = mkItem('i1', 'Thing', 2, 100000, assignment);
    const r = toggleParticipant(item, 'saad');
    expect(r.item.assignment).toEqual({ kind: 'equal', participantIds: ['saad'] });
    expect(r.replacedCustomSplit).toBe(true);
  });

  it('D4 toggle on a custom split with an existing assignee still replaces (pid is not "removed")', () => {
    const item = mkItem('i1', 'Thing', 2, 100000, customs[0]![1]);
    const r = toggleParticipant(item, 'hamza');
    expect(r.item.assignment).toEqual({ kind: 'equal', participantIds: ['hamza'] });
    expect(r.replacedCustomSplit).toBe(true);
  });

  it('D4 toggle keeps every non-assignment field of the item', () => {
    const item: Item = { ...unassigned(), quantity: 3, unitPrice: $(33333), categories: ['food'], source: 'receipt' };
    const out = toggleParticipant({ ...item, lineTotal: $(99999) }, 'ali').item;
    expect({ ...out, assignment: null }).toEqual({ ...item, lineTotal: 99999, assignment: null });
  });

  it('D4 toggle is immutable: frozen inputs, returns a new object', () => {
    const item = deepFreeze(equalItem(['ali']));
    const before = JSON.stringify(item);
    const r = toggleParticipant(item, 'saad');
    expect(r.item).not.toBe(item);
    expect(JSON.stringify(item)).toBe(before);
    const un = deepFreeze(unassigned());
    expect(() => toggleParticipant(un, 'ali')).not.toThrow();
    expect(un.assignment).toEqual({ kind: 'unassigned' });
    const cu = deepFreeze(mkItem('i', 'x', 1, 100, customs[1]![1]));
    expect(() => toggleParticipant(cu, 'ali')).not.toThrow();
  });

  it('D4 property: toggling a pid twice on an equal item restores the same set', () => {
    fc.assert(
      fc.property(
        fc.subarray(PIDS, { minLength: 2 }),
        fc.constantFrom(...PIDS),
        (ids, pid) => {
          const item = equalItem(ids);
          const twice = toggleParticipant(toggleParticipant(item, pid).item, pid).item;
          const a = twice.assignment.kind === 'equal' ? [...twice.assignment.participantIds].sort() : null;
          expect(a).toEqual([...ids].sort());
        },
      ),
    );
  });
});

describe('D4 assignRemainingEqually', () => {
  it('D4 assignRemainingEqually turns every unassigned item into equal pids', () => {
    const items = [unassigned('a'), unassigned('b')];
    const out = assignRemainingEqually(items, PIDS);
    expect(out).toHaveLength(2);
    for (const it of out) expect(it.assignment).toEqual({ kind: 'equal', participantIds: PIDS });
    expect(out.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('D4 assignRemainingEqually leaves already-assigned items untouched (all kinds)', () => {
    const items = [...fixtureBItems(), mkItem('p', 'P', 1, 1000, { kind: 'percent', entries: [{ participantId: 'ali', bp: bp(10000) }] })];
    const out = assignRemainingEqually(items, ['saad']);
    expect(out).toEqual(items);
  });

  it('D4 assignRemainingEqually mixes: only unassigned items change, order preserved', () => {
    const assigned = equalItem(['ali']);
    const out = assignRemainingEqually([unassigned('a'), { ...assigned, id: 'b' }, unassigned('c')], ['hamza', 'saad']);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(out[0]!.assignment).toEqual({ kind: 'equal', participantIds: ['hamza', 'saad'] });
    expect(out[1]!.assignment).toEqual({ kind: 'equal', participantIds: ['ali'] });
    expect(out[2]!.assignment).toEqual({ kind: 'equal', participantIds: ['hamza', 'saad'] });
  });

  it('D4 assignRemainingEqually does not mutate frozen inputs and returns a new array', () => {
    const items = deepFreeze([unassigned('a'), equalItem(['ali'])]);
    const pids = deepFreeze([...PIDS]);
    const out = assignRemainingEqually(items, pids);
    expect(out).not.toBe(items);
    expect(items[0]!.assignment).toEqual({ kind: 'unassigned' });
  });

  it('D4 assignRemainingEqually result clears ITEM_UNASSIGNED in the engine', () => {
    const out = assignRemainingEqually([unassigned('a'), unassigned('b', 5000)], PIDS);
    expect(engineErrors(out)).toEqual([]);
    expect(previewItemShares({ participants: people, items: out }).needsAttentionCount).toBe(0);
  });
});

describe('D4 setUnits / setPercent / setAmounts', () => {
  const seekh = (): Item => mkItem('seekh', 'Mutton Seekh', 2, 290000, { kind: 'unassigned' });

  it('D4 setUnits builds a units assignment and keeps other fields', () => {
    const out = setUnits(seekh(), [
      { participantId: 'hamza', units: 1 },
      { participantId: 'ali', units: 1 },
    ]);
    expect(out.assignment).toEqual({
      kind: 'units',
      entries: [{ participantId: 'hamza', units: 1 }, { participantId: 'ali', units: 1 }],
    });
    expect({ ...out, assignment: null }).toEqual({ ...seekh(), assignment: null });
    expect(engineErrors([out])).toEqual([]);
  });

  it('D4 setUnits does not validate: wrong total is left for the engine (ITEM_UNDER_ASSIGNED)', () => {
    const out = setUnits(seekh(), [{ participantId: 'hamza', units: 1 }]);
    expect(out.assignment.kind).toBe('units');
    expect(engineErrors([out])).toContain('ITEM_UNDER_ASSIGNED');
    const over = setUnits(seekh(), [{ participantId: 'hamza', units: 3 }]);
    expect(engineErrors([over])).toContain('ITEM_OVER_ASSIGNED');
  });

  it('D4 setPercent builds a percent assignment', () => {
    const out = setPercent(unassigned(), [
      { participantId: 'ali', bp: bp(2500) },
      { participantId: 'saad', bp: bp(7500) },
    ]);
    expect(out.assignment).toEqual({
      kind: 'percent',
      entries: [{ participantId: 'ali', bp: 2500 }, { participantId: 'saad', bp: 7500 }],
    });
    expect(engineErrors([out])).toEqual([]);
    expect(engineErrors([setPercent(unassigned(), [{ participantId: 'ali', bp: bp(9000) }])])).toContain('ITEM_UNDER_ASSIGNED');
    expect(engineErrors([setPercent(unassigned(), [{ participantId: 'ali', bp: bp(10001) }])])).toContain('ITEM_OVER_ASSIGNED');
  });

  it('D4 setAmounts builds an amounts assignment', () => {
    const out = setAmounts(unassigned('i1', 100000), [
      { participantId: 'ali', amount: $(30000) },
      { participantId: 'saad', amount: $(70000) },
    ]);
    expect(out.assignment).toEqual({
      kind: 'amounts',
      entries: [{ participantId: 'ali', amount: 30000 }, { participantId: 'saad', amount: 70000 }],
    });
    expect(engineErrors([out])).toEqual([]);
    expect(engineErrors([setAmounts(unassigned('i1', 100000), [{ participantId: 'ali', amount: $(1) }])])).toContain('ITEM_UNDER_ASSIGNED');
  });

  it('D4 set* replace any previous assignment and never mutate frozen inputs', () => {
    const base = deepFreeze(equalItem(['ali', 'saad'], 100000));
    const out = setPercent(base, [{ participantId: 'ali', bp: bp(10000) }]);
    expect(out).not.toBe(base);
    expect(base.assignment.kind).toBe('equal');
    const entries = deepFreeze([{ participantId: 'ali', units: 1 }]);
    expect(() => setUnits(deepFreeze(seekh()), entries)).not.toThrow();
    expect(() => setAmounts(deepFreeze(unassigned()), deepFreeze([{ participantId: 'ali', amount: $(100000) }]))).not.toThrow();
  });
});

describe('D4 perPersonAmount', () => {
  const items = fixtureBItems();
  const preview = previewItemShares({ participants: people, items });
  const get = (id: string) => at(items.filter((i) => i.id === id), 0);

  it('D4 perPersonAmount returns 80000 for the Karahi (320000 equal among 4) in Fixture B', () => {
    expect(perPersonAmount(get('karahi'), preview)).toBe(80000);
  });
  it('D4 perPersonAmount returns 47500 for Daal Makhni (equal between 2)', () => {
    expect(perPersonAmount(get('daal'), preview)).toBe(47500);
  });
  it('D4 perPersonAmount returns 18000 / 22000 for Naan and Doodh Patti', () => {
    expect(perPersonAmount(get('naan'), preview)).toBe(18000);
    expect(perPersonAmount(get('doodh'), preview)).toBe(22000);
  });
  it('D4 perPersonAmount is null for an uneven equal split (1000 paisa among 3 -> 334/333/333)', () => {
    const item = mkItem('u', 'Uneven', 1, 1000, { kind: 'equal', participantIds: ['mahhee', 'hamza', 'ali'] });
    const pv = previewItemShares({ participants: people, items: [item] });
    expect(perPersonAmount(item, pv)).toBeNull();
  });
  it('D4 perPersonAmount is null for a single assignee', () => {
    const item = mkItem('s', 'Solo', 1, 50000, { kind: 'equal', participantIds: ['ali'] });
    const pv = previewItemShares({ participants: people, items: [item] });
    expect(perPersonAmount(item, pv)).toBeNull();
  });
  it('D4 perPersonAmount is null for non-equal kinds even when shares happen to be identical (units)', () => {
    const pv = previewItemShares({ participants: people, items });
    expect(perPersonAmount(get('seekh'), pv)).toBeNull();
    expect(perPersonAmount(get('margarita'), pv)).toBeNull();
  });
  it('D4 perPersonAmount is null for percent / amounts splits with identical shares', () => {
    const pct = mkItem('p', 'P', 1, 100000, { kind: 'percent', entries: [{ participantId: 'ali', bp: bp(5000) }, { participantId: 'saad', bp: bp(5000) }] });
    const amt = mkItem('a', 'A', 1, 100000, { kind: 'amounts', entries: [{ participantId: 'ali', amount: $(50000) }, { participantId: 'saad', amount: $(50000) }] });
    const pv = previewItemShares({ participants: people, items: [pct, amt] });
    expect(perPersonAmount(pct, pv)).toBeNull();
    expect(perPersonAmount(amt, pv)).toBeNull();
  });
  it('D4 perPersonAmount is null for an unassigned item', () => {
    const item = unassigned();
    expect(perPersonAmount(item, previewItemShares({ participants: people, items: [item] }))).toBeNull();
  });
  it('D4 perPersonAmount property: equal among k>=2 people is the share iff k divides the total', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 2, max: 4 }), (total, k) => {
        const ids = PIDS.slice(0, k);
        const item = mkItem('x', 'X', 1, total, { kind: 'equal', participantIds: ids });
        const pv = previewItemShares({ participants: people, items: [item] });
        const res = perPersonAmount(item, pv);
        if (total % k === 0) expect(res).toBe(total / k);
        else expect(res).toBeNull();
      }),
    );
  });
});
