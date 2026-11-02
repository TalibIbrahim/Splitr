/** docs/phase1-spec.md section 4.2 (S1-S8). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersistedRootSchema } from '@splitr/shared-types';
import type { Adjustment } from '@splitr/calculation-engine';
import { cardDiscount, tax } from '@splitr/bill-domain';
import * as selectors from '../selectors';
import {
  $,
  MemoryStorage,
  at,
  bill,
  bp,
  buildFixtureB,
  flush,
  fixtureAdjustments,
  item,
  makeEnv,
  ready,
  root,
  sel,
  seedPeople,
  st,
} from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

describe('§4.2 S2 storage key and failed load', () => {
  it('§4.2 S2 state is saved under key splitr-root as the bare PersistedRoot JSON', async () => {
    vi.useFakeTimers();
    const e = await ready(makeEnv());
    buildFixtureB(e);
    await flush();
    expect(e.storage.mainKeys()).toEqual(['splitr-root']);
    const parsed = JSON.parse(e.storage.map.get('splitr-root')!);
    expect(PersistedRootSchema.safeParse(parsed).success).toBe(true);
    expect(parsed).toEqual(JSON.parse(JSON.stringify(root(e))));
  });

  it('§4.2 S2 failed load → hydrated true together with recovery set; raw kept in backup', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    storage.map.set('splitr-root', 'not json {');
    const e = await ready(makeEnv({ storage }));
    expect(e.store.getState().hydrated).toBe(true);
    expect(e.store.getState().recovery).not.toBeNull();
    await flush();
    expect(storage.map.get(`splitr-backup-${e.now()}`)).toBe('not json {');
    expect(storage.map.get('splitr-root')).toBe('not json {');
  });

  it('§4.2 S2 schema-invalid root under splitr-root → hydrated true + recovery', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ schemaVersion: 1, me: null, people: 7, groups: [], bills: [] });
    storage.map.set('splitr-root', raw);
    const e = await ready(makeEnv({ storage }));
    expect(e.store.getState().hydrated).toBe(true);
    expect(e.store.getState().recovery).not.toBeNull();
  });
});

describe('§4.2 S1 curried selectors', () => {
  it('§4.2 S1 selectX(args)(state) is a function returning data', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    expect(typeof selectors.selectBill(f.billId)).toBe('function');
    expect(typeof selectors.selectActiveBills()).toBe('function');
    expect(selectors.selectBill(f.billId)(st(e))?.id).toBe(f.billId);
  });
});

describe('§4.2 S3 ordering and latest group', () => {
  function mkBill(e: ReturnType<typeof makeEnv>, groupId: string | null, me: string, name: string, date = '2026-11-02') {
    return st(e).createBill({ groupId, restaurantName: name, date, participantPersonIds: [me], guests: [] });
  }

  it('§4.2 S3 selectActiveBills sorts by createdAt descending (not by date)', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    e.advance(1000);
    const a = mkBill(e, null, p.me, 'A', '2026-12-31'); // latest DATE, earliest created
    e.advance(1000);
    const b = mkBill(e, null, p.me, 'B', '2026-01-01');
    e.advance(1000);
    const c = mkBill(e, null, p.me, 'C', '2026-06-01');
    expect(sel.active(e).map((x) => x.id)).toEqual([c, b, a]);
  });

  it('§4.2 S3 selectLatestGroup = group of the newest ACTIVE bill that has a group', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const g1 = st(e).saveGroup({ name: 'One', memberIds: [p.hamza] });
    e.advance(1000);
    const g2 = st(e).saveGroup({ name: 'Two', memberIds: [p.hamza] }); // newer group, but older bill below
    e.advance(1000);
    const b1 = mkBill(e, g1, p.me, 'on g1');
    expect(sel.latestGroup(e)!.id).toBe(g1);
    e.advance(1000);
    const b2 = mkBill(e, g2, p.me, 'on g2');
    expect(sel.latestGroup(e)!.id).toBe(g2);
    e.advance(1000);
    mkBill(e, null, p.me, 'no group'); // newest bill has no group → skipped
    expect(sel.latestGroup(e)!.id).toBe(g2);
    st(e).deleteBill(b2); // deleted bill is not active
    expect(sel.latestGroup(e)!.id).toBe(g1);
    expect(b1).toBeTruthy();
  });

  it('§4.2 S3 selectLatestGroup falls back to the most recently created live group when no bill has a group', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    expect(sel.latestGroup(e) ?? null).toBeNull();
    st(e).saveGroup({ name: 'One', memberIds: [p.hamza] });
    e.advance(1000);
    const g2 = st(e).saveGroup({ name: 'Two', memberIds: [p.hamza] });
    e.advance(1000);
    const g3 = st(e).saveGroup({ name: 'Three', memberIds: [p.hamza] });
    mkBill(e, null, p.me, 'ungrouped');
    expect(sel.latestGroup(e)!.id).toBe(g3);
    st(e).deleteGroup(g3);
    expect(sel.latestGroup(e)!.id).toBe(g2);
  });
});

describe('§4.2 S4 inherited adjustments', () => {
  it('§4.2 S4 groupId null inherits no adjustments, even after an earlier ungrouped bill with adjustments', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const b1 = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me], guests: [] });
    st(e).setAdjustments(b1, fixtureAdjustments());
    const b2 = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me], guests: [] });
    expect(bill(e, b2).adjustments).toEqual([]);
  });

  it('§4.2 S4 copies drop printedAmount and override, reset itemIds/excludeItemIds, keep categories', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const g = st(e).saveGroup({ name: 'G', memberIds: [p.hamza] });
    const b1 = st(e).createBill({ groupId: g, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me], guests: [] });
    const base = cardDiscount('orig', 10, { rateBp: bp(2000), capPaisa: $(50000) });
    const rich = {
      ...base,
      printedAmount: $(12345),
      override: { amount: $(999), reason: 'manual' },
      eligibility: {
        itemIds: ['some-item'],
        excludeItemIds: ['other-item'],
        categories: ['food'],
        excludeCategories: ['alcohol'],
      },
    } as Adjustment;
    st(e).setAdjustments(b1, [rich]);
    e.advance(1000);
    const b2 = st(e).createBill({ groupId: g, restaurantName: 'R', date: '2026-11-03', participantPersonIds: [p.me], guests: [] });
    const c = at(bill(e, b2).adjustments, 0);
    expect(c.id).not.toBe('orig');
    expect(c).not.toHaveProperty('printedAmount');
    expect(c).not.toHaveProperty('override');
    expect(c.eligibility?.itemIds ?? []).toEqual([]);
    expect(c.eligibility?.excludeItemIds ?? []).toEqual([]);
    expect(c.eligibility?.categories).toEqual(['food']);
    expect(c.eligibility?.excludeCategories).toEqual(['alcohol']);
    // everything else carried over
    expect(c.label).toBe(base.label);
    expect(c.kind).toBe(base.kind);
    expect(c.value).toEqual(base.value);
    expect(c.cap).toBe(50000);
    expect(c.order).toBe(10);
    // source adjustment untouched
    expect(at(bill(e, b1).adjustments, 0)).toHaveProperty('printedAmount', 12345);
  });
});

describe('§4.2 S5 removeParticipant details', () => {
  function setup() {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).createBill({
      groupId: null,
      restaurantName: 'R',
      date: '2026-11-02',
      participantPersonIds: [p.me, p.hamza],
      guests: [],
    });
    return { e, p, id };
  }

  it('§4.2 S5 no rebalancing: percent entries stay as they were and the engine flags under-assignment', () => {
    const { e, p, id } = setup();
    const i = st(e).addItem(id, { name: 'X', quantity: 1, lineTotal: $(10000) });
    st(e).setItemAssignment(id, i, {
      kind: 'percent',
      entries: [
        { participantId: p.me, bp: 5000 },
        { participantId: p.hamza, bp: 5000 },
      ],
    } as never);
    st(e).removeParticipant(id, p.hamza);
    expect(item(bill(e, id), i).assignment).toEqual({
      kind: 'percent',
      entries: [{ participantId: p.me, bp: 5000 }],
    });
    expect(sel.result(e, id).ok).toBe(false);
  });

  it('§4.2 S5 no rebalancing: units and amounts entries keep their values', () => {
    const { e, p, id } = setup();
    const u = st(e).addItem(id, { name: 'U', quantity: 2, lineTotal: $(2000) });
    const a = st(e).addItem(id, { name: 'A', quantity: 1, lineTotal: $(3000) });
    st(e).setItemAssignment(id, u, {
      kind: 'units',
      entries: [
        { participantId: p.me, units: 1 },
        { participantId: p.hamza, units: 1 },
      ],
    } as never);
    st(e).setItemAssignment(id, a, {
      kind: 'amounts',
      entries: [
        { participantId: p.me, amount: 1000 },
        { participantId: p.hamza, amount: 2000 },
      ],
    } as never);
    st(e).removeParticipant(id, p.hamza);
    expect(item(bill(e, id), u).assignment).toEqual({ kind: 'units', entries: [{ participantId: p.me, units: 1 }] });
    expect(item(bill(e, id), a).assignment).toEqual({ kind: 'amounts', entries: [{ participantId: p.me, amount: 1000 }] });
  });

  it('§4.2 S5 allocation policies: equal participantIds and weights entries lose the person', () => {
    const { e, p, id } = setup();
    const eq = { ...tax('eq', 30, { rateBp: bp(500), base: 'original' }), allocation: { type: 'equal', participantIds: [p.me, p.hamza] } } as Adjustment;
    const wt = {
      ...tax('wt', 31, { rateBp: bp(500), base: 'original' }),
      allocation: {
        type: 'weights',
        entries: [
          { participantId: p.me, weight: 1 },
          { participantId: p.hamza, weight: 3 },
        ],
      },
    } as Adjustment;
    const prop = tax('pr', 32, { rateBp: bp(500), base: 'original' });
    st(e).setAdjustments(id, [eq, wt, prop]);
    st(e).removeParticipant(id, p.hamza);
    const adj = bill(e, id).adjustments;
    expect(adj.find((a) => a.id === 'eq')!.allocation).toEqual({ type: 'equal', participantIds: [p.me] });
    expect(adj.find((a) => a.id === 'wt')!.allocation).toEqual({
      type: 'weights',
      entries: [{ participantId: p.me, weight: 1 }],
    });
    expect(adj.find((a) => a.id === 'pr')!.allocation).toEqual(prop.allocation);
    expect(JSON.stringify(adj)).not.toContain(p.hamza);
  });

  it('§4.2 S5 removing me clears meParticipantId', () => {
    const { e, p, id } = setup();
    expect(bill(e, id).meParticipantId).toBe(p.me);
    st(e).removeParticipant(id, p.me);
    expect(bill(e, id).meParticipantId).toBeNull();
    expect(bill(e, id).participants.map((x) => x.id)).toEqual([p.hamza]);
  });

  it('§4.2 S5 removing someone else keeps meParticipantId', () => {
    const { e, p, id } = setup();
    st(e).removeParticipant(id, p.hamza);
    expect(bill(e, id).meParticipantId).toBe(p.me);
  });
});

describe('§4.2 S6 duplicates and renames', () => {
  it('§4.2 S6 addParticipant with a personId already at the table is a no-op', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me, p.hamza], guests: [] });
    const before = structuredClone(bill(e, id));
    e.advance(1000);
    st(e).addParticipant(id, { personId: p.hamza });
    st(e).addParticipant(id, { personId: p.me });
    expect(bill(e, id).participants).toEqual(before.participants);
    expect(bill(e, id)).toEqual(before);
  });

  it('§4.2 S6 two guests with the same name are both added (guests are not deduplicated)', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me], guests: [] });
    st(e).addParticipant(id, { guestName: 'Sam' });
    st(e).addParticipant(id, { guestName: 'Sam' });
    expect(bill(e, id).participants.filter((x) => x.displayName === 'Sam')).toHaveLength(2);
  });

  it('§4.2 S6 renaming me via onboard leaves existing bills unchanged (historical)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(bill(e, f.billId));
    e.advance(1000);
    st(e).onboard('Mahi');
    expect(bill(e, f.billId)).toEqual(before);
    expect(bill(e, f.billId).participants.find((x) => x.id === f.people.me)!.displayName).toBe('Mahhee');
    expect(root(e).me!.displayName).toBe('Mahi');
  });

  it('§4.2 S6 renamePerson leaves existing bills unchanged', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(bill(e, f.billId));
    st(e).renamePerson(f.people.hamza, 'Hamza K');
    expect(bill(e, f.billId)).toEqual(before);
  });
});

describe('§4.2 S7 payments-reset notice', () => {
  const notice = (e: ReturnType<typeof makeEnv>) => selectors.selectNotice()(st(e));

  it('§4.2 S7 starts as null', () => {
    const e = makeEnv();
    expect(notice(e) ?? null).toBeNull();
    expect(st(e).notice ?? null).toBeNull();
  });

  it('§4.2 S7 resetting one paid transfer sets { kind: payments-reset, billId, count: 1 }', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setTransferPaid(f.billId, f.people.ali, f.people.hamza, true);
    expect(notice(e) ?? null).toBeNull(); // marking paid is not a reset
    st(e).setContributions(f.billId, [
      { participantId: f.people.hamza, amount: $(500000) },
      { participantId: f.people.ali, amount: $(350000) },
    ]);
    expect(notice(e)).toEqual({ kind: 'payments-reset', billId: f.billId, count: 1 });
  });

  it('§4.2 S7 count is the number of paid transfers dropped', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setTransferPaid(f.billId, f.people.ali, f.people.hamza, true);
    st(e).setTransferPaid(f.billId, f.people.me, f.people.hamza, true);
    st(e).setTransferPaid(f.billId, f.people.saad, f.people.hamza, true);
    // Make the result invalid → all three paid statuses are dropped.
    st(e).setContributions(f.billId, [{ participantId: f.people.hamza, amount: $(1) }]);
    expect(notice(e)).toEqual({ kind: 'payments-reset', billId: f.billId, count: 3 });
  });

  it('§4.2 S7 no notice when an edit keeps paid transfers or nothing was paid', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).updateBillMeta(f.billId, { restaurantName: 'x' });
    st(e).setContributions(f.billId, [{ participantId: f.people.hamza, amount: $(500000) }, { participantId: f.people.ali, amount: $(350000) }]);
    expect(notice(e) ?? null).toBeNull(); // nothing was paid
    st(e).setTransferPaid(f.billId, f.people.me, f.people.hamza, true);
    const paidOnes = bill(e, f.billId).transferStatuses.filter((s) => s.status === 'paid');
    expect(paidOnes.length).toBeGreaterThan(0);
    st(e).updateBillMeta(f.billId, { restaurantName: 'y' });
    expect(notice(e) ?? null).toBeNull();
  });

  it('§4.2 S7 dismissNotice clears it', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setTransferPaid(f.billId, f.people.ali, f.people.hamza, true);
    st(e).setContributions(f.billId, [{ participantId: f.people.hamza, amount: $(1) }]);
    expect(notice(e)).not.toBeNull();
    st(e).dismissNotice();
    expect(notice(e) ?? null).toBeNull();
    expect(() => st(e).dismissNotice()).not.toThrow();
  });

  it('§4.2 S7 notice is not persisted', async () => {
    vi.useFakeTimers();
    const e = await ready(makeEnv());
    const f = buildFixtureB(e);
    st(e).setTransferPaid(f.billId, f.people.ali, f.people.hamza, true);
    st(e).setContributions(f.billId, [{ participantId: f.people.hamza, amount: $(1) }]);
    expect(notice(e)).not.toBeNull();
    await flush();
    expect(e.storage.map.get('splitr-root')).not.toContain('payments-reset');
    expect(e.storage.map.get('splitr-root')).not.toContain('notice');
    const again = await ready(makeEnv({ storage: e.storage, idPrefix: 'again' }));
    expect(selectors.selectNotice()(again.store.getState()) ?? null).toBeNull();
    expect(JSON.parse(JSON.stringify(root(again)))).toEqual(JSON.parse(JSON.stringify(root(e))));
  });
});

describe('§4.2 S8 me not at the table', () => {
  it('§4.2 S8 createBill without me among the participants → meParticipantId null', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.hamza, p.ali], guests: ['G'] });
    expect(bill(e, id).meParticipantId).toBeNull();
    expect(bill(e, id).participants.map((x) => x.id)).not.toContain(p.me);
  });

  it('§4.2 S8 adding me later via addParticipant does not break the bill (stays valid)', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.hamza], guests: [] });
    st(e).addParticipant(id, { personId: p.me });
    expect(bill(e, id).participants.map((x) => x.id)).toContain(p.me);
    expect(PersistedRootSchema.safeParse(root(e)).success).toBe(true);
  });

  it('§4.2 S8 balances ignore a bill where me is not at the table', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.hamza, p.ali], guests: [] });
    const i = st(e).addItem(id, { name: 'X', quantity: 1, lineTotal: $(10000) });
    st(e).setItemAssignment(id, i, { kind: 'equal', participantIds: [p.hamza, p.ali] });
    st(e).setContributions(id, [{ participantId: p.hamza, amount: $(10000) }]);
    const b = sel.balances(e);
    expect(b.youOwe).toBe(0);
    expect(b.owedToYou).toBe(0);
  });
});
