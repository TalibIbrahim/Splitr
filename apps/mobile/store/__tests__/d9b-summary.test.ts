/**
 * D9b (docs/phase1-spec.md): selectBillSummary / selectBill. Written from the spec.
 * Assumed summary fields: state, roundedTotal (null when no ok result), needsAttentionCount.
 */
import { describe, expect, it } from 'vitest';
import { PersistedRootSchema } from '@splitr/shared-types';
import { buildFixtureB, flush, makeEnv, MemoryStorage, payAll, ready, root, st, T0 } from './helpers';
import * as selectors from '../selectors';

type Env = ReturnType<typeof makeEnv>;
// Shape is not fixed by the spec beyond these fields.
const summary = (e: Env, id: string) =>
  selectors.selectBillSummary(id)(st(e)) as unknown as { state: string; roundedTotal: number | null; needsAttentionCount: number };

function settledEnv() {
  const e = makeEnv();
  const f = buildFixtureB(e);
  payAll(e, f.billId);
  expect(st(e).settle(f.billId)).toEqual({ ok: true });
  return { e, f };
}

describe('D9b selectBillSummary', () => {
  it('D9b open ok bill: state and roundedTotal come from the result', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const s = summary(e, f.billId);
    expect(s.state).toBe('ready');
    expect(s.roundedTotal).toBe(850000);
  });

  it('D9b unassigned bill: roundedTotal null and needsAttentionCount', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setItemAssignment(f.billId, f.itemIds.karahi, { kind: 'unassigned' });
    st(e).setItemAssignment(f.billId, f.itemIds.doodh, { kind: 'unassigned' });
    const s = summary(e, f.billId);
    expect(s.state).toBe('unassigned');
    expect(s.roundedTotal).toBeNull();
    expect(s.needsAttentionCount).toBe(2);
  });

  it('D9b settled bill: roundedTotal from the snapshot, state settled', () => {
    const { e, f } = settledEnv();
    const s = summary(e, f.billId);
    expect(s.state).toBe('settled');
    expect(s.roundedTotal).toBe(850000);
  });

  it('D9b settled bill is summarised without running the engine (items corrupted so the engine would fail)', async () => {
    const { e, f } = settledEnv();
    await flush();
    const key = e.storage.mainKeys()[0]!;
    const parsed = JSON.parse(e.storage.map.get(key)!);
    const bills = (parsed.bills ?? parsed.root?.bills) as { id: string; items: { assignment: unknown }[] }[];
    const target = bills.find((b) => b.id === f.billId)!;
    target.items[0]!.assignment = { kind: 'unassigned' };
    target.items[1]!.assignment = { kind: 'unassigned' };
    const storage = new MemoryStorage();
    storage.map.set(key, JSON.stringify(parsed));
    const fresh = await ready(makeEnv({ storage, start: T0 + 1000 }));
    expect(fresh.store.getState().recovery).toBeNull();
    expect(PersistedRootSchema.safeParse(root(fresh)).success).toBe(true);
    const b = root(fresh).bills.find((x) => x.id === f.billId)!;
    expect(b.items[0]!.assignment.kind).toBe('unassigned');
    const s = summary(fresh, f.billId);
    expect(s.state).toBe('settled');
    expect(s.roundedTotal).toBe(850000);
  });

  it('D9b selectBillSummary is curried and memoised (same object for unchanged state, new after an edit)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const a = selectors.selectBillSummary(f.billId)(st(e));
    expect(selectors.selectBillSummary(f.billId)(st(e))).toBe(a);
    st(e).setItemAssignment(f.billId, f.itemIds.karahi, { kind: 'unassigned' });
    const c = selectors.selectBillSummary(f.billId)(st(e));
    expect(c).not.toBe(a);
    expect(summary(e, f.billId).roundedTotal).toBeNull();
  });
});

describe('D9b selectBill', () => {
  it('D9b selectBill returns the right bill among several and null for unknown ids', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const g = buildFixtureB(e, { people: f.people });
    expect(selectors.selectBill(f.billId)(st(e))?.id).toBe(f.billId);
    expect(selectors.selectBill(g.billId)(st(e))?.id).toBe(g.billId);
    expect(selectors.selectBill('nope')(st(e)) ?? null).toBeNull();
  });

  it('D9b selectBill stays consistent after edits, settle and reopen', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const g = buildFixtureB(e, { people: f.people });
    st(e).updateBillMeta(f.billId, { restaurantName: 'Renamed' });
    expect(selectors.selectBill(f.billId)(st(e))?.restaurantName).toBe('Renamed');
    expect(selectors.selectBill(g.billId)(st(e))?.restaurantName).toBe('Salt & Ember');
    st(e).setItemAssignment(g.billId, g.itemIds.karahi, { kind: 'unassigned' });
    expect(selectors.selectBill(g.billId)(st(e))).toBe(root(e).bills.find((b) => b.id === g.billId));
    payAll(e, f.billId);
    st(e).settle(f.billId);
    expect(selectors.selectBill(f.billId)(st(e))?.status).toBe('settled');
    st(e).reopen(f.billId);
    expect(selectors.selectBill(f.billId)(st(e))?.status).toBe('open');
    expect(selectors.selectBill(f.billId)(st(e))?.finalSnapshot).toBeNull();
  });
});
