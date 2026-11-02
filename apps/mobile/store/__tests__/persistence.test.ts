import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistedRootSchema } from '@splitr/shared-types';
import type { PersistedRoot } from '@splitr/shared-types';
import { MemoryStorage, buildFixtureB, flush, makeEnv, ready, root, st, T0 } from './helpers';
import type { Env } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const EMPTY: PersistedRoot = { schemaVersion: 1, me: null, people: [], groups: [], bills: [] };

/** Discover the (unspecified) storage key by letting a store save once. */
async function probeKey(): Promise<{ key: string; storage: MemoryStorage }> {
  const e = await ready(makeEnv());
  st(e).onboard('Probe');
  await flush();
  const keys = e.storage.mainKeys();
  expect(keys).toHaveLength(1);
  return { key: keys[0]!, storage: e.storage };
}

const nowIso = () => new Date(T0).toISOString();

describe('§4.1 hydration: success', () => {
  it('§4.1 empty storage → hydrated true, recovery null, empty root, no backup written', async () => {
    const e = await ready(makeEnv());
    expect(st(e).hydrated).toBe(true);
    expect(st(e).recovery).toBeNull();
    expect(root(e)).toEqual(EMPTY);
    await flush();
    expect(e.storage.backupKeys()).toEqual([]);
  });

  it('§4.1 valid persisted root (hand-built PersistedRoot JSON) → hydrated and restored', async () => {
    const { key } = await probeKey();
    const t = nowIso();
    const seeded: PersistedRoot = {
      schemaVersion: 1,
      me: { personId: 'p-me', displayName: 'Mahhee' },
      people: [{ id: 'p-me', displayName: 'Mahhee', isMe: true, createdAt: t, updatedAt: t, deletedAt: null }],
      groups: [],
      bills: [],
    };
    expect(PersistedRootSchema.safeParse(seeded).success).toBe(true);
    const storage = new MemoryStorage();
    storage.map.set(key, JSON.stringify(seeded));
    const e = await ready(makeEnv({ storage }));
    expect(st(e).hydrated).toBe(true);
    expect(st(e).recovery).toBeNull();
    expect(root(e)).toEqual(seeded);
    await flush();
    expect(storage.backupKeys()).toEqual([]);
  });
});

describe.each([
  ['sync storage', false],
  ['async storage', true],
])('§4.1 persistence round trip (%s)', (_name, isAsync) => {
  it('§4.1 mutate, then a new store over the same storage restores the identical root', async () => {
    const a = await ready(makeEnv({ async: isAsync }));
    const f = buildFixtureB(a);
    st(a).setTransferPaid(f.billId, f.people.ali, f.people.hamza, true);
    const g = st(a).saveGroup({ name: 'The Boys', memberIds: [f.people.hamza] });
    st(a).deleteBill(st(a).createBill({ groupId: g, restaurantName: 'x', date: '2026-11-03', participantPersonIds: [f.people.me], guests: ['G'] }));
    await flush();
    const b = await ready(makeEnv({ storage: a.storage, idPrefix: 'second' }));
    expect(st(b).hydrated).toBe(true);
    expect(st(b).recovery).toBeNull();
    expect(root(b)).toEqual(root(a));
    expect(PersistedRootSchema.safeParse(root(b)).success).toBe(true);
    expect(a.storage.backupKeys()).toEqual([]);
  });

  it('§4.1 a restored store keeps working (new edits persist on top of restored state)', async () => {
    const a = await ready(makeEnv({ async: isAsync }));
    st(a).onboard('Mahhee');
    await flush();
    const b = await ready(makeEnv({ storage: a.storage, idPrefix: 'second' }));
    const hamza = st(b).addPerson('Hamza');
    await flush();
    const c = await ready(makeEnv({ storage: a.storage, idPrefix: 'third' }));
    expect(root(c).people.map((p) => p.id)).toContain(hamza);
    expect(root(c).me?.displayName).toBe('Mahhee');
  });
});

async function corruptSetup(raw: string): Promise<{ e: Env; key: string; storage: MemoryStorage }> {
  const { key } = await probeKey();
  const storage = new MemoryStorage();
  storage.map.set(key, raw);
  const e = await ready(makeEnv({ storage }));
  return { e, key, storage };
}

const CORRUPT_CASES: [string, string][] = [
  ['corrupt JSON', '{"schemaVersion":1,"me":null,"people":[,'],
  ['not JSON at all', 'garbage!!'],
  ['schema-invalid (people is a string)', JSON.stringify({ schemaVersion: 1, me: null, people: 'oops', groups: [], bills: [] })],
  ['schema-invalid (unknown schemaVersion)', JSON.stringify({ schemaVersion: 2, me: null, people: [], groups: [], bills: [] })],
  ['schema-invalid (a bill missing required fields)', JSON.stringify({ schemaVersion: 1, me: null, people: [], groups: [], bills: [{ id: 'b' }] })],
];

describe.each(CORRUPT_CASES)('§4.1 hydration: failure — %s', (_n, raw) => {
  it('§4.1 sets recovery (with a reason) and starts with an empty root', async () => {
    const { e } = await corruptSetup(raw);
    expect(st(e).recovery).not.toBeNull();
    expect(typeof st(e).recovery!.reason).toBe('string');
    expect(st(e).recovery!.reason.length).toBeGreaterThan(0);
    expect(root(e)).toEqual(EMPTY);
  });

  it('§4.1 writes the raw value to backup key splitr-backup-<now>', async () => {
    const { e, storage } = await corruptSetup(raw);
    await flush();
    expect(storage.map.get(`splitr-backup-${e.now()}`)).toBe(raw);
  });

  it('§4.1 original key is NOT overwritten by mutations until confirmRecovery()', async () => {
    const { e, key, storage } = await corruptSetup(raw);
    st(e).onboard('Mahhee');
    st(e).addPerson('Hamza');
    await flush();
    e.advance(5000);
    st(e).renamePerson(root(e).people[1]!.id, 'H');
    await flush();
    expect(storage.map.get(key)).toBe(raw);
    expect(storage.map.get(`splitr-backup-${new Date(T0).toISOString()}`)).toBe(raw);
    expect(st(e).recovery).not.toBeNull();
  });

  it('§4.1 after confirmRecovery() recovery clears and the new state is saved', async () => {
    const { e, key, storage } = await corruptSetup(raw);
    st(e).onboard('Mahhee');
    await flush();
    expect(storage.map.get(key)).toBe(raw);
    st(e).confirmRecovery();
    await flush();
    expect(st(e).recovery).toBeNull();
    expect(storage.map.get(key)).not.toBe(raw);
    // backup is retained
    expect(storage.map.get(`splitr-backup-${nowIso()}`)).toBe(raw);
    // a new store restores the saved state
    const again = await ready(makeEnv({ storage, idPrefix: 'again' }));
    expect(again.store.getState().recovery).toBeNull();
    expect(root(again).me?.displayName).toBe('Mahhee');
    // and keeps saving normally afterwards
    st(e).addPerson('Hamza');
    await flush();
    const third = await ready(makeEnv({ storage, idPrefix: 'third' }));
    expect(root(third).people).toHaveLength(2);
  });

  it('§4.1 confirmRecovery() right away (no edits) overwrites the original key with the empty root', async () => {
    const { e, key, storage } = await corruptSetup(raw);
    st(e).confirmRecovery();
    await flush();
    expect(st(e).recovery).toBeNull();
    expect(storage.map.get(key)).not.toBe(raw);
    const again = await ready(makeEnv({ storage, idPrefix: 'again' }));
    expect(root(again)).toEqual(EMPTY);
    expect(again.store.getState().recovery).toBeNull();
  });
});

describe('§4.1 confirmRecovery without a pending recovery', () => {
  it('§4.1 is a harmless no-op', async () => {
    const e = await ready(makeEnv());
    st(e).onboard('Mahhee');
    const before = structuredClone(root(e));
    expect(() => st(e).confirmRecovery()).not.toThrow();
    expect(root(e)).toEqual(before);
    expect(st(e).recovery).toBeNull();
  });
});
