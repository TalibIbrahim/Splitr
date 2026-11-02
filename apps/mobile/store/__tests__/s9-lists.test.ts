/** docs/phase1-spec.md section 4.2 S9: selectGroups / selectPeople / selectPerson. */
import { describe, expect, it } from 'vitest';
import * as selectors from '../selectors';
import { $, buildFixtureB, makeEnv, seedPeople, st } from './helpers';
import type { Env } from './helpers';

const groups = (e: Env) => selectors.selectGroups()(st(e));
const people = (e: Env) => selectors.selectPeople()(st(e));
const person = (e: Env, id: string) => selectors.selectPerson(id)(st(e));

describe('§4.2 S9 selectPeople', () => {
  it('§4.2 S9 selectPeople returns me first, then others by displayName (en localeCompare)', () => {
    const e = makeEnv();
    st(e).onboard('Zara');
    st(e).addPerson('saad');
    st(e).addPerson('Ali');
    st(e).addPerson('hamza');
    st(e).addPerson('Bilal');
    expect(people(e).map((p) => p.displayName)).toEqual(['Zara', 'Ali', 'Bilal', 'hamza', 'saad']);
    expect(people(e)[0]!.isMe).toBe(true);
  });

  it('§4.2 S9 selectPeople excludes deleted people', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    st(e).deletePerson(p.ali);
    const ids = people(e).map((x) => x.id);
    expect(ids).not.toContain(p.ali);
    expect(ids).toEqual([p.me, p.hamza, p.saad]);
  });

  it('§4.2 S9 selectPeople is empty before onboarding', () => {
    expect(people(makeEnv())).toEqual([]);
  });

  it('§4.2 S9 selectPeople keeps me first after renames', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    st(e).renamePerson(p.me, 'Zzz');
    expect(people(e)[0]!.id).toBe(p.me);
    st(e).renamePerson(p.saad, 'Aaa');
    expect(people(e).map((x) => x.displayName)).toEqual(['Zzz', 'Aaa', 'Ali', 'Hamza']);
  });
});

describe('§4.2 S9 selectPerson', () => {
  it('§4.2 S9 selectPerson returns the person, or undefined for an unknown id', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    expect(person(e, p.hamza)?.displayName).toBe('Hamza');
    expect(person(e, p.me)?.isMe).toBe(true);
    expect(person(e, 'missing')).toBeUndefined();
  });
});

describe('§4.2 S9 selectGroups', () => {
  it('§4.2 S9 selectGroups returns live groups sorted by name (en localeCompare)', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    for (const n of ['work', 'Family', 'The Boys', 'angels']) st(e).saveGroup({ name: n, memberIds: [p.hamza] });
    expect(groups(e).map((g) => g.name)).toEqual(['angels', 'Family', 'The Boys', 'work']);
  });

  it('§4.2 S9 selectGroups excludes deleted groups', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const a = st(e).saveGroup({ name: 'A', memberIds: [p.hamza] });
    const b = st(e).saveGroup({ name: 'B', memberIds: [p.hamza] });
    st(e).deleteGroup(a);
    expect(groups(e).map((g) => g.id)).toEqual([b]);
  });

  it('§4.2 S9 selectGroups re-sorts after a group is renamed', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const a = st(e).saveGroup({ name: 'A', memberIds: [p.hamza] });
    st(e).saveGroup({ name: 'B', memberIds: [p.hamza] });
    st(e).saveGroup({ id: a, name: 'Z', memberIds: [p.hamza] });
    expect(groups(e).map((g) => g.name)).toEqual(['B', 'Z']);
  });
});

describe('§4.2 S9 memoisation', () => {
  it('§4.2 S9 selectGroups/selectPeople return the same array reference while unchanged', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    st(e).saveGroup({ name: 'G', memberIds: [p.hamza] });
    expect(groups(e)).toBe(groups(e));
    expect(people(e)).toBe(people(e));
  });

  it('§4.2 S9 editing a bill does not change the groups/people references', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).saveGroup({ name: 'G', memberIds: [f.people.hamza] });
    const g1 = groups(e);
    const p1 = people(e);
    st(e).updateBillMeta(f.billId, { restaurantName: 'Other' });
    st(e).addItem(f.billId, { name: 'Extra', quantity: 1, lineTotal: $(100) });
    st(e).setTransferPaid(f.billId, f.people.ali, f.people.hamza, true);
    st(e).createBill({ groupId: null, restaurantName: 'x', date: '2026-11-03', participantPersonIds: [f.people.me], guests: [] });
    expect(groups(e)).toBe(g1);
    expect(people(e)).toBe(p1);
  });

  it('§4.2 S9 selectPeople returns a new array after people change; groups unchanged', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    st(e).saveGroup({ name: 'G', memberIds: [p.hamza] });
    const g1 = groups(e);
    const p1 = people(e);
    st(e).addPerson('New');
    expect(people(e)).not.toBe(p1);
    expect(people(e)).toHaveLength(p1.length + 1);
    expect(groups(e)).toBe(g1);
  });

  it('§4.2 S9 selectGroups returns a new array after groups change', () => {
    const e = makeEnv();
    const p = seedPeople(e);
    const id = st(e).saveGroup({ name: 'G', memberIds: [p.hamza] });
    const g1 = groups(e);
    const p1 = people(e);
    st(e).saveGroup({ name: 'H', memberIds: [p.hamza] });
    expect(groups(e)).not.toBe(g1);
    st(e).deleteGroup(id);
    expect(groups(e).map((g) => g.name)).toEqual(['H']);
    expect(people(e)).toBe(p1);
  });
});
