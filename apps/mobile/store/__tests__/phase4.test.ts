/**
 * Phase 4 store tests: E2 markSettledWith, E4 exportData, E5 parseBackup, E6 restoreBackup, meta.lastBackupAt
 * (docs/phase4-spec.md). Written from the spec only.
 *
 * Assumed shapes (single place to change each):
 *  - `selectSettleUpPlan()(state)` -> array of { key, net, sources } (or { counterparties }).
 *  - `markSettledWith(key)` -> { billsTouched }.
 *  - `restoreBackup(root, 'replace' | 'merge')`; `setLastBackupAt(iso)`.
 *  - `exportData(root)` / `parseBackup(text)` exported from `../backup`.
 *  - Storage key for the main root: whatever the probe finds (spec S2: `splitr-root`).
 */
import { PersistedRootSchema } from '@splitr/shared-types';
import type { Bill, PersistedRoot } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import * as backup from '../backup';
import * as selectors from '../selectors';
import {
  $,
  MemoryStorage,
  at,
  bill,
  buildFixtureB,
  currentTransfers,
  expectStatusInvariant,
  expectValidRoot,
  flush,
  makeEnv,
  payAll,
  ready,
  root,
  sel,
  st,
} from './helpers';
import type { Env } from './helpers';

// ───────────── adapters ─────────────

interface Source {
  billId: string;
  from: string;
  to: string;
  amount: number;
}
interface PlanEntry {
  key: string;
  net: number;
  sources: Source[];
}
interface P4Actions {
  markSettledWith(key: string): { billsTouched: number };
  restoreBackup(root: PersistedRoot, mode: 'replace' | 'merge'): unknown;
  setLastBackupAt(iso: string): unknown;
}
const act = (e: Env): P4Actions => st(e) as unknown as P4Actions;

const planOf = (e: Env): PlanEntry[] => {
  const fn = (selectors as unknown as Record<string, (() => (s: unknown) => unknown) | undefined>)['selectSettleUpPlan'];
  if (!fn) throw new Error('selectSettleUpPlan is not exported from selectors');
  const out = fn()(st(e));
  return (Array.isArray(out) ? out : (out as { counterparties: PlanEntry[] }).counterparties) as PlanEntry[];
};
const planRaw = (e: Env): unknown => {
  const fn = (selectors as unknown as Record<string, () => (s: unknown) => unknown>)['selectSettleUpPlan']!;
  return fn()(st(e));
};

const exportData = (r: PersistedRoot): string => (backup as unknown as { exportData(r: PersistedRoot): string }).exportData(r);
type ParseResult = { ok: true; root: PersistedRoot } | { ok: false; reason: string };
const parseBackup = (t: string): ParseResult => (backup as unknown as { parseBackup(t: string): ParseResult }).parseBackup(t);

const clone = <T>(o: T): T => structuredClone(o);
const iso = (ms: number) => new Date(ms).toISOString();
const omit = (o: Record<string, unknown>, k: string): Record<string, unknown> => {
  const c = { ...o };
  delete c[k];
  return c;
};

// ───────────── scenario ─────────────

interface Scenario {
  billA: string; // Fixture B: hamza paid; I owe hamza 180600
  billC: string; // I paid 270000; hamza and guest Zed owe 90000 each
  guestPid: string;
  people: { me: string; hamza: string; ali: string; saad: string };
}

function addPayerBill(e: Env, people: Scenario['people'], restaurant = 'Second Place'): { id: string; guestPid: string } {
  const id = st(e).createBill({
    groupId: null,
    restaurantName: restaurant,
    date: '2026-11-03',
    participantPersonIds: [people.me, people.hamza],
    guests: ['Zed'],
  });
  const guestPid = at(bill(e, id).participants.filter((p) => p.displayName === 'Zed'), 0).id;
  const owners = [people.me, people.hamza, guestPid];
  owners.forEach((owner, i) => {
    const itemId = st(e).addItem(id, { name: `Item ${i}`, quantity: 1, lineTotal: $(90000) });
    st(e).setItemAssignment(id, itemId, { kind: 'equal', participantIds: [owner] } as never);
  });
  st(e).setContributions(id, [{ participantId: people.me, amount: $(270000) }]);
  return { id, guestPid };
}

function scenario(e: Env): Scenario {
  const a = buildFixtureB(e);
  const c = addPayerBill(e, a.people);
  return { billA: a.billId, billC: c.id, guestPid: c.guestPid, people: a.people };
}

const pendingOf = (b: Bill) => b.transferStatuses.filter((s) => s.status === 'pending');
const paidOf = (b: Bill) => b.transferStatuses.filter((s) => s.status === 'paid');

// ───────────── E1 plan through the store (selector) ─────────────

describe('E2 selectSettleUpPlan', () => {
  it('E2 selector reflects open bills: hamza net = -180600 + 90000, Zed +90000', () => {
    const e = makeEnv();
    const s = scenario(e);
    const p = planOf(e);
    const byKey = Object.fromEntries(p.map((x) => [x.key, x]));
    expect(byKey[s.people.hamza]?.net).toBe(-90600);
    expect(byKey['Zed']?.net).toBe(90000);
    expect(p).toHaveLength(2);
  });

  it('E2 selectSettleUpPlan is memoised: same state -> same reference', () => {
    const e = makeEnv();
    scenario(e);
    const a = planRaw(e);
    const b = planRaw(e);
    expect(b).toBe(a);
  });

  it('E2 selectSettleUpPlan recomputes (new reference, new values) after a bill changes', () => {
    const e = makeEnv();
    const s = scenario(e);
    const before = planRaw(e);
    st(e).setTransferPaid(s.billC, s.guestPid, s.people.me, true);
    const after = planRaw(e);
    expect(after).not.toBe(before);
    expect(planOf(e).find((x) => x.key === 'Zed')).toBeUndefined();
  });
});

// ───────────── E2 ─────────────

describe('E2 markSettledWith', () => {
  it('E2 marks only my transfers with that counterparty across bills, leaves other people\'s transfers pending', () => {
    const e = makeEnv();
    const s = scenario(e);
    const hamza = s.people.hamza;
    e.advance(60_000);
    const r = act(e).markSettledWith(hamza);
    expect(r).toEqual({ billsTouched: 2 });

    const A = bill(e, s.billA);
    const mine = A.transferStatuses.find((t) => t.from === s.people.me && t.to === hamza)!;
    expect(mine.status).toBe('paid');
    expect(mine.paidAt).toBe(e.now());
    // ali->hamza and saad->hamza are not mine
    const others = A.transferStatuses.filter((t) => t !== mine);
    expect(others).toHaveLength(2);
    expect(others.every((t) => t.status === 'pending' && t.paidAt === null)).toBe(true);

    const C = bill(e, s.billC);
    const fromHamza = C.transferStatuses.find((t) => t.from === hamza && t.to === s.people.me)!;
    expect(fromHamza.status).toBe('paid');
    expect(fromHamza.paidAt).toBe(e.now());
    const zed = C.transferStatuses.find((t) => t.from === s.guestPid)!;
    expect(zed.status).toBe('pending');
    expect(zed.paidAt).toBeNull();
    expectStatusInvariant(A);
    expectStatusInvariant(C);
    expectValidRoot(e);
  });

  it('E2 guest counterparty is addressed by display name', () => {
    const e = makeEnv();
    const s = scenario(e);
    const r = act(e).markSettledWith('Zed');
    expect(r).toEqual({ billsTouched: 1 });
    expect(pendingOf(bill(e, s.billC)).map((t) => t.from)).toEqual([s.people.hamza]);
    expect(paidOf(bill(e, s.billC)).map((t) => t.from)).toEqual([s.guestPid]);
    // bill A untouched
    expect(paidOf(bill(e, s.billA))).toHaveLength(0);
  });

  it('E2 never settles bills, even when every transfer ends up paid', () => {
    const e = makeEnv();
    const s = scenario(e);
    // make hamza the only counterparty of bill C by paying Zed first
    st(e).setTransferPaid(s.billC, s.guestPid, s.people.me, true);
    // and the only one in bill A: pay ali & saad
    for (const t of currentTransfers(bill(e, s.billA)))
      if (t.from !== s.people.me) st(e).setTransferPaid(s.billA, t.from, t.to, true);
    act(e).markSettledWith(s.people.hamza);
    for (const id of [s.billA, s.billC]) {
      const b = bill(e, id);
      expect(b.transferStatuses.every((t) => t.status === 'paid')).toBe(true);
      expect(b.status).toBe('open');
      expect(b.settledAt).toBeNull();
      expect(b.finalSnapshot).toBeNull();
    }
  });

  it('E2 settled bills are not touched and not counted', () => {
    const e = makeEnv();
    const s = scenario(e);
    const d = addPayerBill(e, s.people, 'Settled Place');
    payAll(e, d.id);
    expect(st(e).settle(d.id).ok).toBe(true);
    const frozen = JSON.stringify(bill(e, d.id));
    e.advance(60_000);
    const r = act(e).markSettledWith(s.people.hamza);
    expect(r.billsTouched).toBe(2);
    expect(JSON.stringify(bill(e, d.id))).toBe(frozen);
    expect(bill(e, d.id).status).toBe('settled');
  });

  it('E2 bills it does not touch keep their updatedAt; touched ones are bumped', () => {
    const e = makeEnv();
    const s = scenario(e);
    const aBefore = bill(e, s.billA).updatedAt;
    const cBefore = bill(e, s.billC).updatedAt;
    e.advance(60_000);
    act(e).markSettledWith('Zed');
    expect(bill(e, s.billA).updatedAt).toBe(aBefore);
    expect(bill(e, s.billC).updatedAt).not.toBe(cBefore);
    expect(bill(e, s.billC).updatedAt).toBe(e.now());
  });

  it('E2 unknown counterparty -> { billsTouched: 0 } and nothing changes', () => {
    const e = makeEnv();
    scenario(e);
    const before = JSON.stringify(root(e));
    expect(act(e).markSettledWith('nobody')).toEqual({ billsTouched: 0 });
    expect(JSON.stringify(root(e))).toBe(before);
  });

  it('E2 second call finds nothing pending -> billsTouched 0', () => {
    const e = makeEnv();
    const s = scenario(e);
    expect(act(e).markSettledWith(s.people.hamza).billsTouched).toBe(2);
    expect(act(e).markSettledWith(s.people.hamza).billsTouched).toBe(0);
  });

  it('E2 balances and the plan drop that counterparty afterwards', () => {
    const e = makeEnv();
    const s = scenario(e);
    act(e).markSettledWith(s.people.hamza);
    expect(planOf(e).map((x) => x.key)).toEqual(['Zed']);
    expect(sel.balances(e).youOwe).toBe(0);
    expect(sel.balances(e).owedToYou).toBe(90000);
  });

  it('E2 does not touch bills where I am not at the table, or soft-deleted bills', () => {
    const e = makeEnv();
    const s = scenario(e);
    const del = addPayerBill(e, s.people, 'Deleted Place');
    st(e).deleteBill(del.id);
    const r = act(e).markSettledWith(s.people.hamza);
    expect(r.billsTouched).toBe(2);
    expect(paidOf(bill(e, del.id))).toHaveLength(0);
  });
});

// ───────────── E4 ─────────────

describe('E4 exportData', () => {
  it('E4 envelope fields: app, kind, schemaVersion 1, exportedAt ISO, root', () => {
    const e = makeEnv();
    scenario(e);
    const before = Date.now();
    const env = JSON.parse(exportData(root(e)));
    const after = Date.now();
    expect(env.app).toBe('splitr');
    expect(env.kind).toBe('backup');
    expect(env.schemaVersion).toBe(1);
    expect(typeof env.exportedAt).toBe('string');
    expect(new Date(env.exportedAt).toISOString()).toBe(env.exportedAt);
    const t = Date.parse(env.exportedAt);
    expect(t).toBeGreaterThanOrEqual(before - 5);
    expect(t).toBeLessThanOrEqual(after + 5);
    expect(env.root).toBeDefined();
    expect(Object.keys(env).sort()).toEqual(['app', 'exportedAt', 'kind', 'root', 'schemaVersion']);
  });

  it('E4 returns a JSON string and does not mutate the root', () => {
    const e = makeEnv();
    const s = scenario(e);
    st(e).attachReceipt(s.billA, { imageUri: 'file:///r/a.jpg', draft: null });
    const snap = JSON.stringify(root(e));
    const out = exportData(root(e));
    expect(typeof out).toBe('string');
    expect(JSON.stringify(root(e))).toBe(snap);
    expect(bill(e, s.billA).receipt?.imageUri).toBe('file:///r/a.jpg');
  });

  it('E4 receipt images are excluded: field dropped, uris appear nowhere in the text', () => {
    const e = makeEnv();
    const s = scenario(e);
    st(e).attachReceipt(s.billA, { imageUri: 'file:///r/secret-a.jpg', draft: null });
    st(e).attachReceipt(s.billA, { imageUri: 'file:///r/secret-b.jpg', draft: null });
    const text = exportData(root(e));
    expect(text).not.toContain('secret-a');
    expect(text).not.toContain('secret-b');
    const env = JSON.parse(text);
    const exported = env.root.bills.find((b: Bill) => b.id === s.billA);
    expect(exported.receipt).toBeUndefined();
    // everything else on the bill is intact
    const rest = JSON.parse(JSON.stringify(bill(e, s.billA))) as Record<string, unknown>;
    delete rest.receipt;
    expect(exported).toEqual(JSON.parse(JSON.stringify(rest)));
  });

  it('E4 round trip: export -> parse -> equals the original (minus receipt images)', () => {
    const e = makeEnv();
    const s = scenario(e);
    st(e).attachReceipt(s.billC, { imageUri: 'file:///r/c.jpg', draft: null });
    const original = root(e);
    const parsed = parseBackup(exportData(original));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const expected = clone(original);
    for (const b of expected.bills) delete (b as { receipt?: unknown }).receipt;
    expect(parsed.root).toEqual(expected);
    expect(PersistedRootSchema.safeParse(parsed.root).success).toBe(true);
  });

  it('E4 export -> parse -> replace on a fresh store equals the original minus receipts', async () => {
    const a = makeEnv();
    const s = scenario(a);
    st(a).attachReceipt(s.billA, { imageUri: 'file:///r/a.jpg', draft: null });
    const parsed = parseBackup(exportData(root(a)));
    if (!parsed.ok) throw new Error('parse failed');
    const b = await ready(makeEnv({ idPrefix: 'other' }));
    act(b).restoreBackup(parsed.root, 'replace');
    const expected = clone(root(a));
    for (const x of expected.bills) delete (x as { receipt?: unknown }).receipt;
    expect(root(b)).toEqual(expected);
  });

  it('E4 an empty root exports and parses', () => {
    const e = makeEnv();
    const parsed = parseBackup(exportData(root(e)));
    expect(parsed).toEqual({ ok: true, root: root(e) });
  });
});

// ───────────── E5 ─────────────

describe('E5 parseBackup', () => {
  const goodEnv = (over: Record<string, unknown> = {}) => {
    const e = makeEnv();
    scenario(e);
    return { app: 'splitr', kind: 'backup', schemaVersion: 1, exportedAt: iso(Date.now()), root: root(e), ...over };
  };

  it('E5 ok for a valid envelope', () => {
    const r = parseBackup(JSON.stringify(goodEnv()));
    expect(r.ok).toBe(true);
  });

  it.each([['empty string', ''], ['garbage', 'not json at all'], ['truncated', '{"app":"splitr",'], ['html', '<html></html>']])(
    'E5 not-json: %s',
    (_n, text) => {
      expect(parseBackup(text)).toEqual({ ok: false, reason: 'not-json' });
    },
  );

  it.each([
    ['null', 'null'],
    ['number', '42'],
    ['string', '"splitr"'],
    ['array', '[]'],
    ['empty object', '{}'],
    ['bare PersistedRoot (no envelope)', JSON.stringify({ schemaVersion: 1, me: null, people: [], groups: [], bills: [] })],
    ['wrong app', JSON.stringify(goodEnv({ app: 'other' }))],
    ['wrong kind', JSON.stringify(goodEnv({ kind: 'export' }))],
    ['missing app', JSON.stringify(omit(goodEnv(), 'app'))],
    ['missing root', JSON.stringify(omit(goodEnv(), 'root'))],
  ])('E5 not-a-backup: %s', (_n, text) => {
    expect(parseBackup(text)).toEqual({ ok: false, reason: 'not-a-backup' });
  });

  it('E5 newer-version: envelope schemaVersion 2 is rejected as such (not as invalid)', () => {
    expect(parseBackup(JSON.stringify(goodEnv({ schemaVersion: 2 })))).toEqual({ ok: false, reason: 'newer-version' });
    expect(parseBackup(JSON.stringify(goodEnv({ schemaVersion: 99 })))).toEqual({ ok: false, reason: 'newer-version' });
  });

  it('E5 newer-version wins even when the newer root would not validate under v1', () => {
    expect(parseBackup(JSON.stringify(goodEnv({ schemaVersion: 2, root: { shiny: 'new' } })))).toEqual({
      ok: false,
      reason: 'newer-version',
    });
  });

  it('E5 invalid: right envelope but root violates PersistedRootSchema', () => {
    expect(parseBackup(JSON.stringify(goodEnv({ root: { schemaVersion: 1, me: null, people: 'x', groups: [], bills: [] } })))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const env = goodEnv();
    const broken = clone(env.root);
    (broken.bills[0] as unknown as { items: unknown }).items = 'nope';
    expect(parseBackup(JSON.stringify({ ...env, root: broken }))).toEqual({ ok: false, reason: 'invalid' });
    const brokenAmount = clone(env.root);
    (brokenAmount.bills[0]!.transferStatuses[0] as unknown as { amount: unknown }).amount = 1.5;
    expect(parseBackup(JSON.stringify({ ...env, root: brokenAmount }))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('E5 invalid: root is null / missing fields', () => {
    expect(parseBackup(JSON.stringify(goodEnv({ root: {} })))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('E5 a failed parse never throws and a good parse returns the validated root', () => {
    const env = goodEnv();
    const r = parseBackup(JSON.stringify(env));
    expect(r.ok && r.root).toEqual(JSON.parse(JSON.stringify(env.root)));
  });
});

// ───────────── E6 ─────────────

describe('E6 restoreBackup: replace', () => {
  it('E6 replace swaps the whole root: result equals the imported root, local data is gone', async () => {
    const local = makeEnv();
    scenario(local);
    const other = makeEnv({ idPrefix: 'imp' });
    const s = scenario(other);
    payAll(other, s.billC);
    expect(st(other).settle(s.billC).ok).toBe(true);
    st(other).setTransferPaid(s.billA, s.people.me, s.people.hamza, true);
    const imported = clone(root(other));

    act(local).restoreBackup(clone(imported), 'replace');
    expect(root(local)).toEqual(imported);
    expectValidRoot(local);
    for (const b of root(local).bills) expectStatusInvariant(b);
  });

  it('E6 replace with an imported root that has a different me takes the imported me', () => {
    const local = makeEnv();
    st(local).onboard('Local Me');
    const other = makeEnv({ idPrefix: 'imp' });
    st(other).onboard('Imported Me');
    act(local).restoreBackup(clone(root(other)), 'replace');
    expect(root(local).me).toEqual(root(other).me);
  });

  it('E6 replace is persisted', async () => {
    const local = await ready(makeEnv());
    scenario(local);
    await flush();
    const other = makeEnv({ idPrefix: 'imp' });
    scenario(other);
    const imported = clone(root(other));
    act(local).restoreBackup(clone(imported), 'replace');
    await flush();
    const keys = local.storage.mainKeys();
    expect(keys).toHaveLength(1);
    expect(JSON.parse(local.storage.map.get(keys[0]!)!)).toEqual(imported);
  });

  it('E6 invariant after replace: stale transferStatuses in the imported root are reconciled', () => {
    const local = makeEnv();
    const other = makeEnv({ idPrefix: 'imp' });
    const s = scenario(other);
    const imported = clone(root(other));
    const a = imported.bills.find((b) => b.id === s.billA)!;
    a.transferStatuses = [
      { from: 'ghost', to: 'ghost2', amount: $(5), status: 'paid', paidAt: iso(Date.now()) },
    ] as Bill['transferStatuses'];
    const c = imported.bills.find((b) => b.id === s.billC)!;
    c.transferStatuses = [];
    act(local).restoreBackup(imported, 'replace');
    for (const b of root(local).bills) {
      expectStatusInvariant(b);
      expect(b.transferStatuses.every((t) => t.status === 'pending')).toBe(true);
      expect(b.transferStatuses.length).toBeGreaterThan(0);
    }
  });
});

describe('E6 restoreBackup: merge', () => {
  const later = iso(Date.UTC(2026, 10, 9, 10, 0, 0));
  const earlier = iso(Date.UTC(2026, 9, 1, 10, 0, 0));

  function localWithGroup() {
    const e = makeEnv();
    const s = scenario(e);
    const g = st(e).saveGroup({ name: 'Crew', memberIds: [s.people.me, s.people.hamza] });
    return { e, s, g };
  }

  it('E6 merge: imported copy with the later updatedAt wins (bill, person, group)', () => {
    const { e, s, g } = localWithGroup();
    const imp = clone(root(e));
    const ib = imp.bills.find((b) => b.id === s.billA)!;
    ib.restaurantName = 'Imported Name';
    ib.updatedAt = later;
    const ip = imp.people.find((p) => p.id === s.people.hamza)!;
    ip.displayName = 'Hamza Imported';
    ip.updatedAt = later;
    const ig = imp.groups.find((x) => x.id === g)!;
    ig.name = 'Crew Imported';
    ig.updatedAt = later;
    act(e).restoreBackup(imp, 'merge');
    expect(bill(e, s.billA).restaurantName).toBe('Imported Name');
    expect(root(e).people.find((p) => p.id === s.people.hamza)!.displayName).toBe('Hamza Imported');
    expect(root(e).groups.find((x) => x.id === g)!.name).toBe('Crew Imported');
  });

  it('E6 merge: local copy with the later updatedAt wins', () => {
    const { e, s, g } = localWithGroup();
    const imp = clone(root(e));
    const ib = imp.bills.find((b) => b.id === s.billA)!;
    ib.restaurantName = 'Imported Name';
    ib.updatedAt = earlier;
    const ip = imp.people.find((p) => p.id === s.people.hamza)!;
    ip.displayName = 'Hamza Imported';
    ip.updatedAt = earlier;
    imp.groups.find((x) => x.id === g)!.name = 'Crew Imported';
    imp.groups.find((x) => x.id === g)!.updatedAt = earlier;
    act(e).restoreBackup(imp, 'merge');
    expect(bill(e, s.billA).restaurantName).toBe('Salt & Ember');
    expect(root(e).people.find((p) => p.id === s.people.hamza)!.displayName).toBe('Hamza');
    expect(root(e).groups.find((x) => x.id === g)!.name).toBe('Crew');
  });

  it('E6 merge: on a tie the local copy wins', () => {
    const { e, s, g } = localWithGroup();
    const imp = clone(root(e));
    const ib = imp.bills.find((b) => b.id === s.billA)!;
    ib.restaurantName = 'Imported Name'; // same updatedAt as local
    imp.people.find((p) => p.id === s.people.hamza)!.displayName = 'Hamza Imported';
    imp.groups.find((x) => x.id === g)!.name = 'Crew Imported';
    expect(ib.updatedAt).toBe(bill(e, s.billA).updatedAt);
    act(e).restoreBackup(imp, 'merge');
    expect(bill(e, s.billA).restaurantName).toBe('Salt & Ember');
    expect(root(e).people.find((p) => p.id === s.people.hamza)!.displayName).toBe('Hamza');
    expect(root(e).groups.find((x) => x.id === g)!.name).toBe('Crew');
  });

  it('E6 merge: documents unique to either side are all kept; nothing is duplicated', () => {
    const { e, s } = localWithGroup();
    const other = makeEnv({ idPrefix: 'imp' });
    // different me id in the other store; make its me a differently-named person so it imports as a normal person
    st(other).onboard('Somebody Else');
    const op = st(other).addPerson('Imported Pal');
    const ob = st(other).createBill({ groupId: null, restaurantName: 'Imported Only', date: '2026-10-01', participantPersonIds: [op], guests: [] });
    const imp = clone(root(other));
    const localIds = root(e).bills.map((b) => b.id).sort();
    act(e).restoreBackup(imp, 'merge');
    const ids = root(e).bills.map((b) => b.id);
    expect(ids.slice().sort()).toEqual([...localIds, ob].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(root(e).people.map((p) => p.id)).size).toBe(root(e).people.length);
    expect(root(e).people.some((p) => p.id === op)).toBe(true);
    expect(bill(e, s.billA).restaurantName).toBe('Salt & Ember');
    expectValidRoot(e);
  });

  it('E6 merge: me stays local', () => {
    const { e } = localWithGroup();
    const meBefore = clone(root(e).me);
    const other = makeEnv({ idPrefix: 'imp' });
    st(other).onboard('Somebody Else');
    act(e).restoreBackup(clone(root(other)), 'merge');
    expect(root(e).me).toEqual(meBefore);
    expect(root(e).people.filter((p) => p.isMe).map((p) => p.id)).toEqual([meBefore!.personId]);
  });

  it('E6 merge: an imported isMe person whose displayName matches local me is mapped onto the local me', () => {
    const { e } = localWithGroup();
    const localMe = root(e).me!;
    const other = makeEnv({ idPrefix: 'imp' });
    scenario(other); // its me is "Mahhee" with a different id
    const impMeId = root(other).me!.personId;
    expect(impMeId).not.toBe(localMe.personId);
    act(e).restoreBackup(clone(root(other)), 'merge');
    expect(root(e).me).toEqual(localMe);
    // exactly one isMe person: the local one; the imported me is not imported as a second "me"
    expect(root(e).people.filter((p) => p.isMe).map((p) => p.id)).toEqual([localMe.personId]);
    expect(root(e).people.some((p) => p.id === impMeId && p.isMe)).toBe(false);
    expectValidRoot(e);
    // imported bills must not reference a person that no longer exists
    const known = new Set(root(e).people.map((p) => p.id));
    for (const b of root(e).bills)
      for (const p of b.participants) if (p.personId !== null) expect(known.has(p.personId)).toBe(true);
  });

  it('E6 merge: an imported isMe person with a different displayName is imported as a normal person', () => {
    const { e } = localWithGroup();
    const localMe = clone(root(e).me)!;
    const other = makeEnv({ idPrefix: 'imp' });
    st(other).onboard('Zainab');
    const impMeId = root(other).me!.personId;
    act(e).restoreBackup(clone(root(other)), 'merge');
    expect(root(e).me).toEqual(localMe);
    const imported = root(e).people.find((p) => p.id === impMeId)!;
    expect(imported).toBeDefined();
    expect(imported.displayName).toBe('Zainab');
    expect(imported.isMe).toBe(false);
    expect(root(e).people.filter((p) => p.isMe)).toHaveLength(1);
  });

  it('E6 invariant after merge: stale statuses of imported and winning bills are reconciled', () => {
    const { e, s } = localWithGroup();
    const imp = clone(root(e));
    const ia = imp.bills.find((b) => b.id === s.billA)!;
    ia.updatedAt = later; // imported wins
    ia.transferStatuses = [];
    const extra = clone(ia);
    extra.id = 'imported-only-bill';
    extra.transferStatuses = [{ from: 'ghost', to: 'ghost2', amount: $(5), status: 'paid', paidAt: later }] as Bill['transferStatuses'];
    imp.bills = [...imp.bills, extra];
    act(e).restoreBackup(imp, 'merge');
    for (const b of root(e).bills) {
      expectStatusInvariant(b);
      expect(b.transferStatuses.every((t) => t.status === 'pending' || t.paidAt !== null)).toBe(true);
    }
    expect(bill(e, 'imported-only-bill').transferStatuses.some((t) => t.from === 'ghost')).toBe(false);
    expect(bill(e, s.billA).transferStatuses.length).toBeGreaterThan(0);
    expectValidRoot(e);
  });

  it('E6 merge keeps paid ticks that are still consistent (local bill wins, paid transfer stays paid)', () => {
    const { e, s } = localWithGroup();
    st(e).setTransferPaid(s.billA, s.people.me, s.people.hamza, true);
    const imp = clone(root(e));
    act(e).restoreBackup(imp, 'merge');
    expect(paidOf(bill(e, s.billA))).toHaveLength(1);
  });

  it('E6 merge of a backup into itself is idempotent', () => {
    const { e } = localWithGroup();
    const before = clone(root(e));
    act(e).restoreBackup(clone(before), 'merge');
    expect(root(e)).toEqual(before);
  });

  it('E6 merge result is persisted', async () => {
    const e = await ready(makeEnv());
    scenario(e);
    const other = makeEnv({ idPrefix: 'imp' });
    st(other).onboard('Zainab');
    act(e).restoreBackup(clone(root(other)), 'merge');
    await flush();
    const keys = e.storage.mainKeys();
    expect(JSON.parse(e.storage.map.get(keys[0]!)!)).toEqual(root(e));
  });
});

// ───────────── meta.lastBackupAt ─────────────

describe('E4/E6 meta.lastBackupAt', () => {
  it('meta.lastBackupAt: setLastBackupAt stores it on the root, validates, and touches nothing else', () => {
    const e = makeEnv();
    const s = scenario(e);
    const beforeBills = JSON.stringify(root(e).bills);
    e.advance(60_000);
    act(e).setLastBackupAt(e.now());
    const meta = (root(e) as unknown as { meta?: { lastBackupAt?: string } }).meta;
    expect(meta?.lastBackupAt).toBe(e.now());
    expect(JSON.stringify(root(e).bills)).toBe(beforeBills);
    expect(bill(e, s.billA).updatedAt).not.toBe(e.now());
    expectValidRoot(e);
  });

  it('meta.lastBackupAt is persisted and survives a reload', async () => {
    const storage = new MemoryStorage();
    const a = await ready(makeEnv({ storage }));
    st(a).onboard('Mahhee');
    a.advance(1000);
    act(a).setLastBackupAt(a.now());
    await flush();
    const b = await ready(makeEnv({ storage }));
    expect((root(b) as unknown as { meta?: { lastBackupAt?: string } }).meta?.lastBackupAt).toBe(a.now());
  });

  it('meta.lastBackupAt: a later call overwrites an earlier one', () => {
    const e = makeEnv();
    act(e).setLastBackupAt(iso(Date.UTC(2026, 10, 3)));
    act(e).setLastBackupAt(iso(Date.UTC(2026, 10, 4)));
    expect((root(e) as unknown as { meta?: { lastBackupAt?: string } }).meta?.lastBackupAt).toBe(iso(Date.UTC(2026, 10, 4)));
  });

  it('meta.lastBackupAt: an old root without meta still validates and hydrates', async () => {
    const t = iso(Date.UTC(2026, 10, 2));
    const old = {
      schemaVersion: 1,
      me: { personId: 'p-me', displayName: 'Mahhee' },
      people: [{ id: 'p-me', displayName: 'Mahhee', isMe: true, createdAt: t, updatedAt: t, deletedAt: null }],
      groups: [],
      bills: [],
    };
    expect(PersistedRootSchema.safeParse(old).success).toBe(true);
    const probe = await ready(makeEnv());
    st(probe).onboard('x');
    await flush();
    const key = probe.storage.mainKeys()[0]!;
    const storage = new MemoryStorage();
    storage.map.set(key, JSON.stringify(old));
    const e = await ready(makeEnv({ storage }));
    expect(st(e).hydrated).toBe(true);
    expect(st(e).recovery).toBeNull();
    expect(storage.backupKeys()).toEqual([]);
  });

  it('meta.lastBackupAt: a root with meta.lastBackupAt validates', () => {
    const r = {
      schemaVersion: 1,
      me: null,
      people: [],
      groups: [],
      bills: [],
      meta: { lastBackupAt: iso(Date.UTC(2026, 10, 2)) },
    };
    expect(PersistedRootSchema.safeParse(r).success).toBe(true);
  });

  it('meta.lastBackupAt survives export -> parse (backup carries it)', () => {
    const e = makeEnv();
    act(e).setLastBackupAt(iso(Date.UTC(2026, 10, 3)));
    const parsed = parseBackup(exportData(root(e)));
    expect(parsed.ok && (parsed.root as unknown as { meta?: { lastBackupAt?: string } }).meta?.lastBackupAt).toBe(
      iso(Date.UTC(2026, 10, 3)),
    );
  });
});
