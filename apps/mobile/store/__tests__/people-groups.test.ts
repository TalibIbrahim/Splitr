import { describe, expect, it } from 'vitest';
import { PersistedRootSchema } from '@splitr/shared-types';
import { at, bill, buildFixtureB, expectValidRoot, makeEnv, root, seedPeople, sel, st } from './helpers';

describe('§4.1 onboard', () => {
  it('§4.1 onboard creates the me Person (isMe) and sets root.me', () => {
    const e = makeEnv();
    st(e).onboard('Mahhee');
    const r = root(e);
    expect(r.me).not.toBeNull();
    expect(r.me!.displayName).toBe('Mahhee');
    expect(r.people).toHaveLength(1);
    const p = at(r.people, 0);
    expect(p.isMe).toBe(true);
    expect(p.displayName).toBe('Mahhee');
    expect(p.id).toBe(r.me!.personId);
    expect(p.createdAt).toBe(e.now());
    expect(p.updatedAt).toBe(e.now());
    expectValidRoot(e);
  });

  it('§4.1 onboard second call only renames (same id, still one person, exactly one isMe)', () => {
    const e = makeEnv();
    st(e).onboard('Mahhee');
    const id = root(e).me!.personId;
    e.advance(5000);
    st(e).onboard('Mahi');
    const r = root(e);
    expect(r.people).toHaveLength(1);
    expect(r.me!.personId).toBe(id);
    expect(r.me!.displayName).toBe('Mahi');
    expect(at(r.people, 0).displayName).toBe('Mahi');
    expect(r.people.filter((p) => p.isMe)).toHaveLength(1);
    expect(at(r.people, 0).updatedAt).toBe(e.now());
    expect(at(r.people, 0).createdAt).not.toBe(e.now());
  });

  it('§4.1 starts empty: schemaVersion 1, me null, no people/groups/bills', () => {
    const e = makeEnv();
    expect(root(e)).toEqual({ schemaVersion: 1, me: null, people: [], groups: [], bills: [] });
  });
});

describe('§4.1 people', () => {
  it('§4.1 addPerson returns the newId value and stores a non-me Person', () => {
    const e = makeEnv();
    st(e).onboard('Mahhee');
    const before = e.ids.length;
    const id = st(e).addPerson('Hamza');
    expect(e.ids.slice(before)).toContain(id);
    const p = root(e).people.find((x) => x.id === id)!;
    expect(p.displayName).toBe('Hamza');
    expect(p.isMe).toBe(false);
    expectValidRoot(e);
  });

  it('§4.1 renamePerson renames and bumps updatedAt only', () => {
    const e = makeEnv();
    const { hamza } = seedPeople(e);
    const created = root(e).people.find((p) => p.id === hamza)!.createdAt;
    e.advance(60_000);
    st(e).renamePerson(hamza, 'Hamza K');
    const p = root(e).people.find((x) => x.id === hamza)!;
    expect(p.displayName).toBe('Hamza K');
    expect(p.updatedAt).toBe(e.now());
    expect(p.createdAt).toBe(created);
  });

  it('§4.1 deletePerson is soft (deletedAt set, record kept)', () => {
    const e = makeEnv();
    const { hamza } = seedPeople(e);
    e.advance(1000);
    st(e).deletePerson(hamza);
    const p = root(e).people.find((x) => x.id === hamza);
    expect(p).toBeDefined();
    expect(p!.deletedAt).toBe(e.now());
    expectValidRoot(e);
  });

  it('§4.1 deletePerson cannot delete the me person', () => {
    const e = makeEnv();
    const { me } = seedPeople(e);
    st(e).deletePerson(me);
    const p = root(e).people.find((x) => x.id === me)!;
    expect(p.deletedAt ?? null).toBeNull();
    expect(root(e).me?.personId).toBe(me);
  });

  it('§4.1 deletePerson removes the person from groups', () => {
    const e = makeEnv();
    const { me, hamza, ali } = seedPeople(e);
    const g = st(e).saveGroup({ name: 'The Boys', memberIds: [me, hamza, ali] });
    st(e).deletePerson(hamza);
    const group = root(e).groups.find((x) => x.id === g)!;
    expect(group.memberIds).not.toContain(hamza);
    expect(group.memberIds).toContain(ali);
    expect(group.memberIds).toContain(me);
  });

  it('§4.1 deletePerson never touches existing bills', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(bill(e, f.billId));
    st(e).deletePerson(f.people.hamza);
    expect(bill(e, f.billId)).toEqual(before);
    expect(bill(e, f.billId).participants.map((p) => p.id)).toContain(f.people.hamza);
  });
});

describe('§4.1 groups', () => {
  it('§4.1 saveGroup creates a group and always includes me', () => {
    const e = makeEnv();
    const { me, hamza } = seedPeople(e);
    const id = st(e).saveGroup({ name: 'The Boys', memberIds: [hamza] });
    const g = root(e).groups.find((x) => x.id === id)!;
    expect(g.name).toBe('The Boys');
    expect(g.memberIds).toContain(me);
    expect(g.memberIds).toContain(hamza);
    expect(new Set(g.memberIds).size).toBe(g.memberIds.length);
    expectValidRoot(e);
  });

  it('§4.1 saveGroup does not duplicate me when already listed', () => {
    const e = makeEnv();
    const { me, hamza } = seedPeople(e);
    const id = st(e).saveGroup({ name: 'G', memberIds: [me, hamza, me] });
    expect(root(e).groups.find((x) => x.id === id)!.memberIds.filter((m) => m === me)).toHaveLength(1);
  });

  it('§4.1 saveGroup with id updates in place and still includes me', () => {
    const e = makeEnv();
    const { me, hamza, ali } = seedPeople(e);
    const id = st(e).saveGroup({ name: 'G', memberIds: [me, hamza] });
    const created = root(e).groups.find((x) => x.id === id)!.createdAt;
    e.advance(1000);
    const id2 = st(e).saveGroup({ id, name: 'G2', memberIds: [ali] });
    expect(id2).toBe(id);
    expect(root(e).groups).toHaveLength(1);
    const g = root(e).groups[0]!;
    expect(g.name).toBe('G2');
    expect(g.memberIds).toContain(me);
    expect(g.memberIds).toContain(ali);
    expect(g.memberIds).not.toContain(hamza);
    expect(g.createdAt).toBe(created);
    expect(g.updatedAt).toBe(e.now());
  });

  it('§4.1 deleteGroup is soft', () => {
    const e = makeEnv();
    const { hamza } = seedPeople(e);
    const id = st(e).saveGroup({ name: 'G', memberIds: [hamza] });
    e.advance(1000);
    st(e).deleteGroup(id);
    const g = root(e).groups.find((x) => x.id === id);
    expect(g).toBeDefined();
    expect(g!.deletedAt).toBe(e.now());
  });

  it('§4.1 selectLatestGroup returns the most recently created live group', () => {
    const e = makeEnv();
    const { hamza } = seedPeople(e);
    expect(sel.latestGroup(e) ?? null).toBeNull();
    const g1 = st(e).saveGroup({ name: 'One', memberIds: [hamza] });
    e.advance(1000);
    const g2 = st(e).saveGroup({ name: 'Two', memberIds: [hamza] });
    expect(sel.latestGroup(e)!.id).toBe(g2);
    st(e).deleteGroup(g2);
    expect(sel.latestGroup(e)!.id).toBe(g1);
  });
});

describe('§4.1 robustness: no action throws on bad user input', () => {
  it('§4.1 actions on unknown ids neither throw nor change the root', () => {
    const e = makeEnv();
    buildFixtureB(e);
    const before = structuredClone(root(e));
    const s = st(e);
    expect(() => {
      s.renamePerson('nope', 'x');
      s.deletePerson('nope');
      s.deleteGroup('nope');
      s.updateBillMeta('nope', { restaurantName: 'x' });
      s.addParticipant('nope', { guestName: 'g' });
      s.removeParticipant('nope', 'p');
      s.addItem('nope', { name: 'x', quantity: 1, lineTotal: 100 as never });
      s.updateItem('nope', 'i', { name: 'x' });
      s.removeItem('nope', 'i');
      s.toggleAssign('nope', 'i', 'p');
      s.assignRemaining('nope');
      s.setItemAssignment('nope', 'i', { kind: 'unassigned' });
      s.setAdjustments('nope', []);
      s.setContributions('nope', []);
      s.setTransferPaid('nope', 'a', 'b', true);
      s.deleteBill('nope');
      s.restoreBill('nope');
      s.reopen('nope');
    }).not.toThrow();
    expect(s.settle('nope').ok).toBe(false);
    expect(root(e)).toEqual(before);
    expect(PersistedRootSchema.safeParse(root(e)).success).toBe(true);
  });

  it('§4.1 toggleAssign / removeItem / updateItem with unknown item or participant do not throw', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(root(e));
    expect(() => {
      st(e).toggleAssign(f.billId, 'no-item', f.people.me);
      st(e).removeItem(f.billId, 'no-item');
      st(e).updateItem(f.billId, 'no-item', { name: 'x' });
      st(e).removeParticipant(f.billId, 'no-such-participant');
    }).not.toThrow();
    // Nothing material changed.
    expect(bill(e, f.billId).items).toEqual(before.bills[0]!.items);
    expect(bill(e, f.billId).participants).toEqual(before.bills[0]!.participants);
  });
});
