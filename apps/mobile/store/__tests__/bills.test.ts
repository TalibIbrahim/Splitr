import { describe, expect, it } from 'vitest';
import { BillSchema } from '@splitr/shared-types';
import { cardDiscount, tax } from '@splitr/bill-domain';
import {
  $,
  at,
  bill,
  bp,
  buildFixtureB,
  expectStatusInvariant,
  expectValidRoot,
  fixtureAdjustments,
  item,
  makeEnv,
  seedPeople,
  sel,
  st,
} from './helpers';

function twoPersonBill(e = makeEnv()) {
  const people = seedPeople(e);
  const id = st(e).createBill({
    groupId: null,
    restaurantName: 'Cafe',
    date: '2026-11-02',
    participantPersonIds: [people.me, people.hamza],
    guests: [],
  });
  return { e, people, id };
}

describe('§4.1 createBill', () => {
  it('§4.1 createBill participants = people (id = personId) + guests (fresh ids, personId null)', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const before = e.ids.length;
    const id = st(e).createBill({
      groupId: null,
      restaurantName: 'Salt & Ember',
      date: '2026-11-02',
      participantPersonIds: [p.me, p.hamza],
      guests: ['Zed', 'Yusuf'],
    });
    expect(e.ids.slice(before)).toContain(id);
    const b = bill(e, id);
    expect(b.participants).toHaveLength(4);
    expect(b.participants.slice(0, 2)).toEqual([
      { id: p.me, displayName: 'Mahhee', personId: p.me },
      { id: p.hamza, displayName: 'Hamza', personId: p.hamza },
    ]);
    const guests = b.participants.slice(2);
    expect(guests.map((g) => g.displayName)).toEqual(['Zed', 'Yusuf']);
    for (const g of guests) {
      expect(g.personId).toBeNull();
      expect(e.ids).toContain(g.id);
      expect([p.me, p.hamza, id]).not.toContain(g.id);
    }
    expect(new Set(b.participants.map((x) => x.id)).size).toBe(4);
    expectValidRoot(e);
  });

  it('§4.1 createBill meParticipantId = me', () => {
    const { e, people, id } = twoPersonBill();
    expect(bill(e, id).meParticipantId).toBe(people.me);
  });

  it('§4.1 createBill defaults: contributions [], unit 100, adjustments [], open, no items', () => {
    const { e, id } = twoPersonBill();
    const b = bill(e, id);
    expect(b.contributions).toEqual([]);
    expect(b.settlementRoundingUnit).toBe(100);
    expect(b.adjustments).toEqual([]);
    expect(b.items).toEqual([]);
    expect(b.transferStatuses).toEqual([]);
    expect(b.status).toBe('open');
    expect(b.settledAt).toBeNull();
    expect(b.finalSnapshot).toBeNull();
    expect(b.currency).toBe('PKR');
    expect(b.restaurantName).toBe('Cafe');
    expect(b.date).toBe('2026-11-02');
    expect(b.groupId).toBeNull();
    expect(b.createdAt).toBe(e.now());
    expect(b.updatedAt).toBe(e.now());
    expect(b.deletedAt ?? null).toBeNull();
    expect(BillSchema.safeParse(b).success).toBe(true);
  });

  it('§4.1 createBill copies adjustments from the last bill of the same group with FRESH ids', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const g = st(e).saveGroup({ name: 'The Boys', memberIds: [p.hamza] });
    const mk = () =>
      st(e).createBill({
        groupId: g,
        restaurantName: 'R',
        date: '2026-11-02',
        participantPersonIds: [p.me, p.hamza],
        guests: [],
      });
    const b1 = mk();
    expect(bill(e, b1).adjustments).toEqual([]); // first bill in the group: nothing to copy
    st(e).setAdjustments(b1, [cardDiscount('old-1', 10, { rateBp: bp(1000) })]);
    e.advance(1000);
    const b2 = mk();
    st(e).setAdjustments(b2, fixtureAdjustments('-b2'));
    e.advance(1000);
    const b3 = mk(); // must copy from b2 (the LAST bill of the group), not b1
    const src = bill(e, b2).adjustments;
    const copy = bill(e, b3).adjustments;
    expect(copy).toHaveLength(src.length);
    const stripId = (a: object) => ({ ...a, id: undefined });
    expect(copy.map(stripId)).toEqual(src.map(stripId));
    const usedIds = [...src.map((a) => a.id), 'old-1'];
    for (const a of copy) {
      expect(usedIds).not.toContain(a.id);
      expect(e.ids).toContain(a.id);
    }
    expect(new Set(copy.map((a) => a.id)).size).toBe(copy.length);
    // editing the copy must not affect the source
    st(e).setAdjustments(b3, []);
    expect(bill(e, b2).adjustments).toEqual(src);
  });

  it('§4.1 createBill does not copy adjustments from a bill of another group', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const g1 = st(e).saveGroup({ name: 'A', memberIds: [p.hamza] });
    const g2 = st(e).saveGroup({ name: 'B', memberIds: [p.hamza] });
    const b1 = st(e).createBill({ groupId: g1, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me], guests: [] });
    st(e).setAdjustments(b1, fixtureAdjustments());
    const b2 = st(e).createBill({ groupId: g2, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me], guests: [] });
    expect(bill(e, b2).adjustments).toEqual([]);
  });
});

describe('§4.1 updateBillMeta', () => {
  it('§4.1 updateBillMeta sets name/date/printedTotal/printedSubtotal and bumps updatedAt', () => {
    const { e, id } = twoPersonBill();
    e.advance(1000);
    st(e).updateBillMeta(id, { restaurantName: 'New', date: '2026-12-25', printedTotal: $(850000), printedSubtotal: $(900000) });
    const b = bill(e, id);
    expect(b.restaurantName).toBe('New');
    expect(b.date).toBe('2026-12-25');
    expect(b.printedTotal).toBe(850000);
    expect(b.printedSubtotal).toBe(900000);
    expect(b.updatedAt).toBe(e.now());
    expectValidRoot(e);
  });

  it('§4.1 updateBillMeta printedTotal null clears it; omitted fields are untouched', () => {
    const { e, id } = twoPersonBill();
    st(e).updateBillMeta(id, { printedTotal: $(1000), printedSubtotal: $(900) });
    st(e).updateBillMeta(id, { printedTotal: null });
    const b = bill(e, id);
    expect(b.printedTotal).toBeUndefined();
    expect(b.printedSubtotal).toBe(900);
    expect(b.restaurantName).toBe('Cafe');
    expectValidRoot(e);
  });
});

describe('§4.1 participants', () => {
  it('§4.1 addParticipant personId → id = personId, name from Person', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).createBill({ groupId: null, restaurantName: 'R', date: '2026-11-02', participantPersonIds: [p.me], guests: [] });
    st(e).addParticipant(id, { personId: p.ali });
    expect(bill(e, id).participants).toContainEqual({ id: p.ali, displayName: 'Ali', personId: p.ali });
  });

  it('§4.1 addParticipant guestName → fresh id, personId null', () => {
    const { e, id } = twoPersonBill();
    st(e).addParticipant(id, { guestName: 'Walk-in' });
    const g = bill(e, id).participants.find((x) => x.displayName === 'Walk-in')!;
    expect(g.personId).toBeNull();
    expect(e.ids).toContain(g.id);
  });

  it('§4.1 removeParticipant empties split → unassigned; strips from multi-person equal splits', () => {
    const { e, people, id } = twoPersonBill();
    const solo = st(e).addItem(id, { name: 'Solo', quantity: 1, lineTotal: $(1000) });
    const pair = st(e).addItem(id, { name: 'Pair', quantity: 1, lineTotal: $(2000) });
    st(e).setItemAssignment(id, solo, { kind: 'equal', participantIds: [people.hamza] });
    st(e).setItemAssignment(id, pair, { kind: 'equal', participantIds: [people.me, people.hamza] });
    st(e).removeParticipant(id, people.hamza);
    const b = bill(e, id);
    expect(b.participants.map((p) => p.id)).not.toContain(people.hamza);
    expect(item(b, solo).assignment).toEqual({ kind: 'unassigned' });
    expect(item(b, pair).assignment).toEqual({ kind: 'equal', participantIds: [people.me] });
  });

  it('§4.1 removeParticipant strips them from units / percent / amounts entries', () => {
    const { e, people, id } = twoPersonBill();
    const u = st(e).addItem(id, { name: 'U', quantity: 2, lineTotal: $(2000) });
    const p = st(e).addItem(id, { name: 'P', quantity: 1, lineTotal: $(2000) });
    const a = st(e).addItem(id, { name: 'A', quantity: 1, lineTotal: $(2000) });
    const ph = people.hamza;
    st(e).setItemAssignment(id, u, {
      kind: 'units',
      entries: [
        { participantId: people.me, units: 1 },
        { participantId: ph, units: 1 },
      ],
    } as never);
    st(e).setItemAssignment(id, p, {
      kind: 'percent',
      entries: [
        { participantId: people.me, bp: 5000 },
        { participantId: ph, bp: 5000 },
      ],
    } as never);
    st(e).setItemAssignment(id, a, {
      kind: 'amounts',
      entries: [{ participantId: ph, amount: 2000 }],
    } as never);
    st(e).removeParticipant(id, ph);
    const b = bill(e, id);
    for (const itemId of [u, p, a]) {
      expect(JSON.stringify(item(b, itemId).assignment)).not.toContain(ph);
    }
    expect(item(b, a).assignment).toEqual({ kind: 'unassigned' });
  });

  it('§4.1 removeParticipant strips them from contributions', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setContributions(f.billId, [
      { participantId: f.people.hamza, amount: $(500000) },
      { participantId: f.people.ali, amount: $(350000) },
    ]);
    st(e).removeParticipant(f.billId, f.people.ali);
    const b = bill(e, f.billId);
    expect(b.contributions.map((c) => c.participantId)).toEqual([f.people.hamza]);
    expect(b.participants.map((p) => p.id)).not.toContain(f.people.ali);
    expect(JSON.stringify(b.items)).not.toContain(f.people.ali);
    expectStatusInvariant(b);
  });
});

describe('§4.1 items', () => {
  it('§4.1 addItem defaults: unassigned, categories [], source user; returns newId value', () => {
    const { e, id } = twoPersonBill();
    const before = e.ids.length;
    const itemId = st(e).addItem(id, { name: 'Naan', quantity: 3, lineTotal: $(36000) });
    expect(e.ids.slice(before)).toContain(itemId);
    const it1 = item(bill(e, id), itemId);
    expect(it1).toMatchObject({
      id: itemId,
      name: 'Naan',
      quantity: 3,
      lineTotal: 36000,
      assignment: { kind: 'unassigned' },
      categories: [],
      source: 'user',
    });
    expectValidRoot(e);
  });

  it('§4.1 updateItem patches fields and bumps bill.updatedAt', () => {
    const { e, id } = twoPersonBill();
    const itemId = st(e).addItem(id, { name: 'Naan', quantity: 1, lineTotal: $(1000) });
    e.advance(1000);
    st(e).updateItem(id, itemId, { name: 'Roti', lineTotal: $(1200), quantity: 2 });
    const b = bill(e, id);
    expect(item(b, itemId)).toMatchObject({ name: 'Roti', lineTotal: 1200, quantity: 2 });
    expect(b.updatedAt).toBe(e.now());
  });

  it('§4.1 removeItem removes the item', () => {
    const { e, id } = twoPersonBill();
    const a = st(e).addItem(id, { name: 'A', quantity: 1, lineTotal: $(1000) });
    const b2 = st(e).addItem(id, { name: 'B', quantity: 1, lineTotal: $(1000) });
    st(e).removeItem(id, a);
    expect(bill(e, id).items.map((i) => i.id)).toEqual([b2]);
  });
});

describe('§4.1 assignment (D4)', () => {
  it('§4.1 toggleAssign: unassigned → equal [pid]; add second; remove; last removal → unassigned', () => {
    const { e, people, id } = twoPersonBill();
    const i = st(e).addItem(id, { name: 'X', quantity: 1, lineTotal: $(1000) });
    const asg = () => item(bill(e, id), i).assignment;
    st(e).toggleAssign(id, i, people.me);
    expect(asg()).toEqual({ kind: 'equal', participantIds: [people.me] });
    st(e).toggleAssign(id, i, people.hamza);
    expect(asg()).toMatchObject({ kind: 'equal' });
    expect([...(asg() as unknown as { participantIds: string[] }).participantIds].sort()).toEqual([people.me, people.hamza].sort());
    st(e).toggleAssign(id, i, people.me);
    expect(asg()).toEqual({ kind: 'equal', participantIds: [people.hamza] });
    st(e).toggleAssign(id, i, people.hamza);
    expect(asg()).toEqual({ kind: 'unassigned' });
  });

  it('§4.1 toggleAssign on a custom split replaces it with equal [pid]', () => {
    const { e, people, id } = twoPersonBill();
    const i = st(e).addItem(id, { name: 'X', quantity: 2, lineTotal: $(1000) });
    st(e).setItemAssignment(id, i, {
      kind: 'units',
      entries: [
        { participantId: people.me, units: 1 },
        { participantId: people.hamza, units: 1 },
      ],
    } as never);
    st(e).toggleAssign(id, i, people.hamza);
    expect(item(bill(e, id), i).assignment).toEqual({ kind: 'equal', participantIds: [people.hamza] });
  });

  it('§4.1 assignRemaining assigns only unassigned items, to every participant', () => {
    const { e, people, id } = twoPersonBill();
    const a = st(e).addItem(id, { name: 'A', quantity: 1, lineTotal: $(1000) });
    const b = st(e).addItem(id, { name: 'B', quantity: 1, lineTotal: $(1000) });
    st(e).toggleAssign(id, a, people.me);
    st(e).assignRemaining(id);
    const bl = bill(e, id);
    expect(item(bl, a).assignment).toEqual({ kind: 'equal', participantIds: [people.me] });
    const asgB = item(bl, b).assignment as { kind: string; participantIds: string[] };
    expect(asgB.kind).toBe('equal');
    expect([...asgB.participantIds].sort()).toEqual([people.me, people.hamza].sort());
  });

  it('§4.1 setItemAssignment stores the given assignment verbatim', () => {
    const { e, people, id } = twoPersonBill();
    const i = st(e).addItem(id, { name: 'A', quantity: 1, lineTotal: $(1000) });
    const asg = {
      kind: 'percent',
      entries: [
        { participantId: people.me, bp: 7000 },
        { participantId: people.hamza, bp: 3000 },
      ],
    };
    st(e).setItemAssignment(id, i, asg as never);
    expect(item(bill(e, id), i).assignment).toEqual(asg);
  });
});

describe('§4.1 setAdjustments / setContributions', () => {
  it('§4.1 setAdjustments replaces the list; setContributions replaces contributions', () => {
    const { e, people, id } = twoPersonBill();
    const adj = [tax('t1', 30, { rateBp: bp(500), base: 'original' })];
    st(e).setAdjustments(id, adj);
    st(e).setContributions(id, [{ participantId: people.me, amount: $(1000) }]);
    expect(bill(e, id).adjustments).toEqual(adj);
    expect(bill(e, id).contributions).toEqual([{ participantId: people.me, amount: 1000 }]);
    st(e).setAdjustments(id, []);
    expect(bill(e, id).adjustments).toEqual([]);
    expectValidRoot(e);
  });
});

describe('§4.1 invariant: transferStatuses (D7)', () => {
  const ali2hamza = (f: ReturnType<typeof buildFixtureB>) => [f.people.ali, f.people.hamza] as const;

  it('§4.1 invariant: after Fixture B contributions, statuses = the 3 pending transfers', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const b = bill(e, f.billId);
    expect(b.transferStatuses).toHaveLength(3);
    expect(b.transferStatuses.every((s) => s.status === 'pending' && s.paidAt === null)).toBe(true);
    expect(b.transferStatuses.map((s) => [s.from, s.to, s.amount]).sort()).toEqual(
      [
        [f.people.ali, f.people.hamza, 225300],
        [f.people.me, f.people.hamza, 180600],
        [f.people.saad, f.people.hamza, 180600],
      ].sort(),
    );
    expectStatusInvariant(b);
  });

  it('§4.1 setTransferPaid marks paid with paidAt = now, and back to pending clears paidAt', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const [from, to] = ali2hamza(f);
    e.advance(2000);
    st(e).setTransferPaid(f.billId, from, to, true);
    const s1 = bill(e, f.billId).transferStatuses.find((s) => s.from === from && s.to === to)!;
    expect(s1.status).toBe('paid');
    expect(s1.paidAt).toBe(e.now());
    st(e).setTransferPaid(f.billId, from, to, false);
    const s2 = bill(e, f.billId).transferStatuses.find((s) => s.from === from && s.to === to)!;
    expect(s2.status).toBe('pending');
    expect(s2.paidAt).toBeNull();
  });

  it('§4.1 paid status is KEPT when an edit does not change the transfer amounts', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const [from, to] = ali2hamza(f);
    st(e).setTransferPaid(f.billId, from, to, true);
    st(e).updateBillMeta(f.billId, { restaurantName: 'Renamed' });
    st(e).setContributions(f.billId, [{ participantId: f.people.hamza, amount: $(850000) }]); // identical
    st(e).updateItem(f.billId, f.itemIds.karahi, { name: 'Karahi (renamed)' });
    const s = bill(e, f.billId).transferStatuses.find((x) => x.from === from && x.to === to)!;
    expect(s.status).toBe('paid');
    expectStatusInvariant(bill(e, f.billId));
  });

  it('§4.1 paid status is RESET (D7) when an edit changes the amounts', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const [from, to] = ali2hamza(f);
    st(e).setTransferPaid(f.billId, from, to, true);
    // Two payers: Ali (350 000) and Hamza (500 000) → different transfers; Ali→Hamza 225 300 no longer exists.
    st(e).setContributions(f.billId, [
      { participantId: f.people.hamza, amount: $(500000) },
      { participantId: f.people.ali, amount: $(350000) },
    ]);
    const b = bill(e, f.billId);
    expect(b.transferStatuses.some((s) => s.status === 'paid')).toBe(false);
    expect(b.transferStatuses.every((s) => s.paidAt === null)).toBe(true);
    expectStatusInvariant(b);
  });

  it('§4.1 paid status is reset when the same pair stays but the amount changes', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const [from, to] = ali2hamza(f);
    st(e).setTransferPaid(f.billId, from, to, true);
    // Karahi to Hamza alone: total unchanged (contributions still match) but Ali's share drops.
    st(e).setItemAssignment(f.billId, f.itemIds.karahi, { kind: 'equal', participantIds: [f.people.hamza] });
    const b = bill(e, f.billId);
    const t = b.transferStatuses.find((x) => x.from === from && x.to === to);
    // Ali's share dropped, so any surviving Ali→Hamza transfer has a new amount and must be pending.
    if (t) {
      expect(t.amount).not.toBe(225300);
      expect(t.status).toBe('pending');
    }
    expect(b.transferStatuses.some((s) => s.status === 'paid')).toBe(false);
    expectStatusInvariant(b);
  });

  it('§4.1 transferStatuses is [] when the result is not ok (contributions mismatch)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    expect(bill(e, f.billId).transferStatuses.length).toBeGreaterThan(0);
    st(e).setContributions(f.billId, [{ participantId: f.people.hamza, amount: $(1) }]);
    expect(bill(e, f.billId).transferStatuses).toEqual([]);
  });

  it('§4.1 transferStatuses is [] when there are no contributions (no settlement)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e, { contributions: false });
    expect(bill(e, f.billId).transferStatuses).toEqual([]);
    st(e).setContributions(f.billId, [{ participantId: f.people.hamza, amount: $(850000) }]);
    expect(bill(e, f.billId).transferStatuses).toHaveLength(3);
    st(e).setContributions(f.billId, []);
    expect(bill(e, f.billId).transferStatuses).toEqual([]);
  });

  it('§4.1 transferStatuses is [] while items are unassigned, and recovers as pending afterwards', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const [from, to] = ali2hamza(f);
    st(e).setTransferPaid(f.billId, from, to, true);
    st(e).setItemAssignment(f.billId, f.itemIds.doodh, { kind: 'unassigned' });
    expect(bill(e, f.billId).transferStatuses).toEqual([]);
    st(e).assignRemaining(f.billId);
    expectStatusInvariant(bill(e, f.billId));
  });

  it('§4.1 invariant holds after every step of a scripted edit sequence', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const id = f.billId;
    const steps: (() => void)[] = [
      () => st(e).setTransferPaid(id, f.people.saad, f.people.hamza, true),
      () => st(e).updateItem(id, f.itemIds.naan, { lineTotal: $(80000) }),
      () => st(e).setContributions(id, [{ participantId: f.people.hamza, amount: $(1) }]),
      () => st(e).addParticipant(id, { guestName: 'Guest' }),
      () => st(e).assignRemaining(id),
      () => st(e).removeItem(id, f.itemIds.daal),
      () => st(e).setAdjustments(id, []),
      () => st(e).removeParticipant(id, f.people.saad),
      () => st(e).toggleAssign(id, f.itemIds.karahi, f.people.me),
    ];
    for (const s of steps) {
      s();
      expectStatusInvariant(bill(e, id));
      expectValidRoot(e);
    }
  });
});

describe('§4.1 settle / reopen (D9) and read-only settled bills', () => {
  function settledFixture() {
    const e = makeEnv();
    const f = buildFixtureB(e);
    for (const s of bill(e, f.billId).transferStatuses) st(e).setTransferPaid(f.billId, s.from, s.to, true);
    e.advance(5000);
    const r = st(e).settle(f.billId);
    return { e, f, r };
  }

  it('§4.1 settle returns ok:false (with a reason) while transfers are unpaid, and changes nothing', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(bill(e, f.billId));
    const r = st(e).settle(f.billId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe('string');
    expect(bill(e, f.billId)).toEqual(before);
  });

  it('§4.1 settle returns ok:false when only some transfers are paid', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setTransferPaid(f.billId, f.people.ali, f.people.hamza, true);
    expect(st(e).settle(f.billId).ok).toBe(false);
    expect(bill(e, f.billId).status).toBe('open');
  });

  it('§4.1 settle returns ok:false when there is no settlement (no contributions)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e, { contributions: false });
    expect(st(e).settle(f.billId).ok).toBe(false);
  });

  it('§4.1 settle with all transfers paid → ok:true, status settled, settledAt = now, finalSnapshot = breakdown', () => {
    const { e, f, r } = settledFixture();
    expect(r).toEqual({ ok: true });
    const b = bill(e, f.billId);
    expect(b.status).toBe('settled');
    expect(b.settledAt).toBe(e.now());
    expect(b.finalSnapshot).not.toBeNull();
    const res = sel.result(e, f.billId);
    expect(b.finalSnapshot!.roundedTotal).toBe(850000);
    expect(b.finalSnapshot!.participants.map((p) => p.roundedTotal)).toEqual(
      res.ok ? res.breakdown.participants.map((p) => p.roundedTotal) : [],
    );
    expectValidRoot(e);
  });

  it('§4.1 settled bills are read-only: every mutation except reopen/deleteBill/restoreBill is a no-op', () => {
    const { e, f } = settledFixture();
    const id = f.billId;
    const before = structuredClone(bill(e, id));
    e.advance(10_000);
    const s = st(e);
    s.updateBillMeta(id, { restaurantName: 'Hacked', printedTotal: $(1) });
    s.addParticipant(id, { guestName: 'Late' });
    s.addParticipant(id, { personId: f.people.me });
    s.removeParticipant(id, f.people.saad);
    s.addItem(id, { name: 'Late', quantity: 1, lineTotal: $(100) });
    s.updateItem(id, f.itemIds.karahi, { name: 'Hacked', lineTotal: $(1) });
    s.removeItem(id, f.itemIds.karahi);
    s.toggleAssign(id, f.itemIds.karahi, f.people.me);
    s.assignRemaining(id);
    s.setItemAssignment(id, f.itemIds.karahi, { kind: 'unassigned' });
    s.setAdjustments(id, []);
    s.setContributions(id, []);
    s.setTransferPaid(id, f.people.ali, f.people.hamza, false);
    s.settle(id);
    expect(bill(e, id)).toEqual(before);
  });

  it('§4.1 reopen returns a settled bill to open with finalSnapshot null; mutations work again', () => {
    const { e, f } = settledFixture();
    st(e).reopen(f.billId);
    const b = bill(e, f.billId);
    expect(b.status).toBe('open');
    expect(b.finalSnapshot).toBeNull();
    st(e).updateBillMeta(f.billId, { restaurantName: 'Edited' });
    expect(bill(e, f.billId).restaurantName).toBe('Edited');
    expectStatusInvariant(bill(e, f.billId));
  });

  it('§4.1 deleteBill / restoreBill still work on a settled bill', () => {
    const { e, f } = settledFixture();
    st(e).deleteBill(f.billId);
    expect(bill(e, f.billId).deletedAt).toBeTruthy();
    expect(bill(e, f.billId).status).toBe('settled');
    st(e).restoreBill(f.billId);
    expect(bill(e, f.billId).deletedAt ?? null).toBeNull();
  });
});

describe('§4.1 deleteBill / restoreBill / selectActiveBills', () => {
  it('§4.1 deleteBill is soft (deletedAt = now, bill kept); restoreBill clears it', () => {
    const { e, id } = twoPersonBill();
    e.advance(1000);
    st(e).deleteBill(id);
    expect(bill(e, id).deletedAt).toBe(e.now());
    expect(bill(e, id).updatedAt).toBe(e.now());
    st(e).restoreBill(id);
    expect(bill(e, id).deletedAt ?? null).toBeNull();
    expectValidRoot(e);
  });

  it('§4.1 selectActiveBills excludes deleted bills and orders newest first', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const ids: string[] = [];
    for (let k = 0; k < 3; k++) {
      e.advance(60_000);
      ids.push(
        st(e).createBill({
          groupId: null,
          restaurantName: `R${k}`,
          date: `2026-11-0${k + 1}`,
          participantPersonIds: [p.me],
          guests: [],
        }),
      );
    }
    expect(sel.active(e).map((b) => b.id)).toEqual([ids[2], ids[1], ids[0]]);
    st(e).deleteBill(at(ids, 1));
    expect(sel.active(e).map((b) => b.id)).toEqual([ids[2], ids[0]]);
    st(e).restoreBill(at(ids, 1));
    expect(sel.active(e).map((b) => b.id)).toEqual([ids[2], ids[1], ids[0]]);
  });

  it('§4.1 selectBill returns the bill, and nothing for an unknown id', () => {
    const { e, id } = twoPersonBill();
    expect(sel.bill(e, id)).toBe(bill(e, id));
    expect(sel.bill(e, 'missing') ?? null).toBeNull();
  });
});
