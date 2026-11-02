/** docs/phase1-spec.md section 4.2 S10: item undo (removeItem returns RemovedItem, restoreItem). */
import { describe, expect, it } from 'vitest';
import * as selectors from '../selectors';
import {
  $,
  bill,
  buildFixtureB,
  currentTransfers,
  expectStatusInvariant,
  expectValidRoot,
  makeEnv,
  payAll,
  roundedByName,
  sel,
  st,
  statusKeys,
} from './helpers';
import type { Env } from './helpers';

const notice = (e: Env) => selectors.selectNotice()(st(e)) as { kind: string; billId: string; count: number } | null;
const paidCount = (e: Env, id: string) => bill(e, id).transferStatuses.filter((s) => s.status === 'paid').length;

function paidFixture() {
  const e = makeEnv();
  const f = buildFixtureB(e);
  payAll(e, f.billId);
  return { e, f };
}

describe('§4.2 S10 removeItem return value', () => {
  it('§4.2 S10 returns billId, the identical item, its index and transferStatusesBefore', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = bill(e, f.billId);
    const idx = before.items.findIndex((i) => i.id === f.itemIds.daal);
    expect(idx).toBe(2);
    const itemBefore = structuredClone(before.items[idx]);
    const statusesBefore = structuredClone(before.transferStatuses);
    const r = st(e).removeItem(f.billId, f.itemIds.daal);
    expect(r).not.toBeNull();
    expect(r!.billId).toBe(f.billId);
    expect(r!.index).toBe(2);
    expect(r!.item).toEqual(itemBefore);
    expect(r!.transferStatusesBefore).toEqual(statusesBefore);
    expect(bill(e, f.billId).items.some((i) => i.id === f.itemIds.daal)).toBe(false);
    expect(bill(e, f.billId).items).toHaveLength(before.items.length - 1);
  });

  it('§4.2 S10 index is the position before removal (first and last)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    expect(st(e).removeItem(f.billId, f.itemIds.karahi)!.index).toBe(0);
    expect(st(e).removeItem(f.billId, f.itemIds.doodh)!.index).toBe(4);
  });

  it('§4.2 S10 transferStatusesBefore carries the paid ticks present before removal', () => {
    const { e, f } = paidFixture();
    expect(paidCount(e, f.billId)).toBe(3);
    const r = st(e).removeItem(f.billId, f.itemIds.doodh)!;
    expect(r.transferStatusesBefore).toHaveLength(3);
    expect(r.transferStatusesBefore.every((s) => s.status === 'paid')).toBe(true);
  });

  it('§4.2 S10 returns null for an unknown bill', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const snap = JSON.stringify(e.store.getState().root);
    expect(st(e).removeItem('nope', f.itemIds.karahi)).toBeNull();
    expect(JSON.stringify(e.store.getState().root)).toBe(snap);
  });

  it('§4.2 S10 returns null for an unknown item and changes nothing', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const snap = JSON.stringify(e.store.getState().root);
    e.advance(5000);
    expect(st(e).removeItem(f.billId, 'nope')).toBeNull();
    expect(JSON.stringify(e.store.getState().root)).toBe(snap);
  });

  it('§4.2 S10 returns null on a settled bill and leaves it untouched', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    payAll(e, f.billId);
    expect(st(e).settle(f.billId).ok).toBe(true);
    const snap = JSON.stringify(bill(e, f.billId));
    expect(st(e).removeItem(f.billId, f.itemIds.karahi)).toBeNull();
    expect(JSON.stringify(bill(e, f.billId))).toBe(snap);
  });

  it('§4.2 S10 removing the same item twice returns null the second time', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    expect(st(e).removeItem(f.billId, f.itemIds.naan)).not.toBeNull();
    expect(st(e).removeItem(f.billId, f.itemIds.naan)).toBeNull();
  });
});

describe('§4.2 S10 restoreItem basics', () => {
  it('§4.2 S10 reinserts the identical item (id, assignment, fields) at the original index', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(bill(e, f.billId).items);
    const r = st(e).removeItem(f.billId, f.itemIds.seekh)!;
    expect(r.index).toBe(1);
    st(e).restoreItem(r);
    expect(bill(e, f.billId).items).toEqual(before);
    expect(bill(e, f.billId).items[1]!.id).toBe(f.itemIds.seekh);
    expectValidRoot(e);
  });

  it('§4.2 S10 restores at index 0 and at the last position', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(bill(e, f.billId).items);
    const first = st(e).removeItem(f.billId, f.itemIds.karahi)!;
    st(e).restoreItem(first);
    expect(bill(e, f.billId).items).toEqual(before);
    const last = st(e).removeItem(f.billId, f.itemIds.doodh)!;
    st(e).restoreItem(last);
    expect(bill(e, f.billId).items).toEqual(before);
  });

  it('§4.2 S10 restoring several removals in reverse order rebuilds the original list', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const before = structuredClone(bill(e, f.billId).items);
    const r1 = st(e).removeItem(f.billId, f.itemIds.seekh)!;
    const r2 = st(e).removeItem(f.billId, f.itemIds.naan)!;
    const r3 = st(e).removeItem(f.billId, f.itemIds.karahi)!;
    st(e).restoreItem(r3);
    st(e).restoreItem(r2);
    st(e).restoreItem(r1);
    expect(bill(e, f.billId).items).toEqual(before);
  });

  it('§4.2 S10 inserts at the end when index is greater than the item count', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.karahi)!;
    for (const id of [f.itemIds.seekh, f.itemIds.daal, f.itemIds.naan, f.itemIds.margarita]) st(e).removeItem(f.billId, id);
    expect(bill(e, f.billId).items).toHaveLength(1);
    st(e).restoreItem({ ...r, index: 99 });
    const items = bill(e, f.billId).items;
    expect(items).toHaveLength(2);
    expect(items[1]!.id).toBe(f.itemIds.karahi);
    expect(items[0]!.id).toBe(f.itemIds.doodh);
  });

  it('§4.2 S10 inserts at min(index, length) when removing the last item', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.doodh)!;
    expect(bill(e, f.billId).items).toHaveLength(5);
    st(e).restoreItem(r);
    expect(bill(e, f.billId).items.at(-1)!.id).toBe(f.itemIds.doodh);
  });

  it('§4.2 S10 is a no-op when an item with that id already exists', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.daal)!;
    st(e).restoreItem(r);
    const snap = JSON.stringify(e.store.getState().root);
    e.advance(5000);
    st(e).restoreItem(r);
    expect(bill(e, f.billId).items.filter((i) => i.id === f.itemIds.daal)).toHaveLength(1);
    expect(JSON.stringify(e.store.getState().root)).toBe(snap);
  });

  it('§4.2 S10 an existing item with the same id is not overwritten', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.daal)!;
    st(e).restoreItem(r);
    st(e).updateItem(f.billId, f.itemIds.daal, { name: 'Renamed' });
    st(e).restoreItem(r);
    const items = bill(e, f.billId).items.filter((i) => i.id === f.itemIds.daal);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Renamed');
  });

  it('§4.2 S10 is a no-op when the bill is missing', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.daal)!;
    const snap = JSON.stringify(e.store.getState().root);
    expect(() => st(e).restoreItem({ ...r, billId: 'ghost' })).not.toThrow();
    expect(JSON.stringify(e.store.getState().root)).toBe(snap);
  });

  it('§4.2 S10 is a no-op when the bill is settled', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.doodh)!;
    st(e).restoreItem(r);
    payAll(e, f.billId);
    expect(st(e).settle(f.billId).ok).toBe(true);
    const stale = { ...r, item: { ...r.item, id: "stale-item" }, index: 0 };
    const snap = JSON.stringify(bill(e, f.billId));
    st(e).restoreItem(stale);
    expect(JSON.stringify(bill(e, f.billId))).toBe(snap);
    expect(bill(e, f.billId).items.some((i) => i.id === "stale-item")).toBe(false);
  });

  it('§4.2 S10 is a no-op when the bill is deleted', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.daal)!;
    st(e).deleteBill(f.billId);
    const snap = JSON.stringify(bill(e, f.billId));
    st(e).restoreItem(r);
    expect(JSON.stringify(bill(e, f.billId))).toBe(snap);
    expect(bill(e, f.billId).items.some((i) => i.id === f.itemIds.daal)).toBe(false);
  });

  it('§4.2 S10 bumps bill updatedAt on both removeItem and restoreItem', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const t0 = bill(e, f.billId).updatedAt;
    e.advance(60_000);
    const r = st(e).removeItem(f.billId, f.itemIds.daal)!;
    const t1 = bill(e, f.billId).updatedAt;
    expect(t1 > t0).toBe(true);
    e.advance(60_000);
    st(e).restoreItem(r);
    const t2 = bill(e, f.billId).updatedAt;
    expect(t2 > t1).toBe(true);
  });

  it('§4.2 S10 keeps the transferStatuses invariant after remove and after restore', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = st(e).removeItem(f.billId, f.itemIds.margarita)!;
    expectStatusInvariant(bill(e, f.billId));
    st(e).restoreItem(r);
    expectStatusInvariant(bill(e, f.billId));
  });
});

describe('§4.2 S10 undo of paid ticks and notice', () => {
  it('§4.2 S10 Fixture B fully paid: removeItem resets paid statuses and raises a payments-reset notice', () => {
    const { e, f } = paidFixture();
    expect(currentTransfers(bill(e, f.billId))).toHaveLength(3);
    expect(notice(e)).toBeNull();
    st(e).removeItem(f.billId, f.itemIds.doodh);
    expect(paidCount(e, f.billId)).toBeLessThan(3);
    const n = notice(e);
    expect(n).not.toBeNull();
    expect(n!.kind).toBe('payments-reset');
    expect(n!.billId).toBe(f.billId);
    expect(n!.count).toBeGreaterThan(0);
  });

  it('§4.2 S10 restoreItem brings back all 3 paid ticks and clears that notice', () => {
    const { e, f } = paidFixture();
    const keysBefore = statusKeys(bill(e, f.billId));
    const r = st(e).removeItem(f.billId, f.itemIds.doodh)!;
    expect(notice(e)).not.toBeNull();
    st(e).restoreItem(r);
    const b = bill(e, f.billId);
    expect(b.transferStatuses).toHaveLength(3);
    expect(b.transferStatuses.every((s) => s.status === 'paid')).toBe(true);
    expect(statusKeys(b)).toEqual(keysBefore);
    expect(notice(e)).toBeNull();
    expectStatusInvariant(b);
  });

  it('§4.2 S10 restored statuses match the pre-removal statuses exactly', () => {
    const { e, f } = paidFixture();
    const statuses = structuredClone(bill(e, f.billId).transferStatuses);
    const r = st(e).removeItem(f.billId, f.itemIds.seekh)!;
    st(e).restoreItem(r);
    const norm = (xs: typeof statuses) =>
      xs
        .map((s) => ({ from: s.from, to: s.to, amount: s.amount, paid: s.status === 'paid' }))
        .sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
    expect(norm(bill(e, f.billId).transferStatuses)).toEqual(norm(statuses));
  });

  it('§4.2 S10 restore does not clear a notice that belongs to a different bill', () => {
    const { e, f } = paidFixture();
    const r = st(e).removeItem(f.billId, f.itemIds.doodh)!;
    const g = buildFixtureB(e, { people: f.people });
    payAll(e, g.billId);
    st(e).removeItem(g.billId, g.itemIds.doodh);
    expect(notice(e)?.billId).toBe(g.billId);
    st(e).restoreItem(r);
    expect(notice(e)?.billId).toBe(g.billId);
  });

  it('§4.2 S10 restore after another edit changed amounts does NOT bring back paid for differing transfers', () => {
    const { e, f } = paidFixture();
    const before = bill(e, f.billId).transferStatuses.map((s) => `${s.from}>${s.to}:${s.amount}`);
    const r = st(e).removeItem(f.billId, f.itemIds.doodh)!;
    // same 850000 total, but Ali now fronted part of it: every transfer differs
    st(e).setContributions(f.billId, [
      { participantId: f.people.hamza, amount: $(500000) },
      { participantId: f.people.ali, amount: $(350000) },
    ]);
    st(e).restoreItem(r);
    const b = bill(e, f.billId);
    const now = currentTransfers(b).map((t) => `${t.from}>${t.to}:${t.amount}`);
    expect(now.some((k) => !before.includes(k))).toBe(true); // premise: transfers differ
    for (const s of b.transferStatuses) {
      const key = `${s.from}>${s.to}:${s.amount}`;
      if (!before.includes(key)) expect(s.status).not.toBe('paid');
    }
    // a transfer that happens to be identical to a pre-removal one may legitimately come back paid (D7)
    expect(b.transferStatuses.filter((s) => s.status === 'paid').length).toBeLessThan(b.transferStatuses.length);
    expectStatusInvariant(b);
  });
});

describe('§4.2 S10 engine result after undo', () => {
  it('§4.2 S10 restored bill engine result equals the pre-removal result (rounded totals by name)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const preResult = sel.result(e, f.billId);
    expect(preResult.ok).toBe(true);
    if (!preResult.ok) return;
    const pre = roundedByName(bill(e, f.billId), preResult.breakdown);
    expect(pre).toEqual({ Mahhee: 180600, Hamza: 263500, Ali: 225300, Saad: 180600 });
    const r = st(e).removeItem(f.billId, f.itemIds.margarita)!;
    const mid = sel.result(e, f.billId);
    if (mid.ok) expect(roundedByName(bill(e, f.billId), mid.breakdown)).not.toEqual(pre);
    st(e).restoreItem(r);
    const post = sel.result(e, f.billId);
    expect(post.ok).toBe(true);
    if (!post.ok) return;
    expect(roundedByName(bill(e, f.billId), post.breakdown)).toEqual(pre);
  });
});
