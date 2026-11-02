import { describe, expect, it } from 'vitest';
import {
  $,
  bill,
  buildFixtureB,
  EXPECTED_ROUNDED,
  makeEnv,
  payAll,
  roundedByName,
  sel,
  seedPeople,
  st,
} from './helpers';

describe('§4.1 selectors: result / preview / state', () => {
  it('§4.1 selectResult for Fixture B built through actions → rounded 180600/263500/225300/180600', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r = sel.result(e, f.billId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(roundedByName(bill(e, f.billId), r.breakdown)).toEqual(EXPECTED_ROUNDED);
    expect(r.breakdown.roundedTotal).toBe(850000);
    const t = r.breakdown.settlement!.transfers.map((x) => [x.from, x.to, x.amount]);
    expect(t).toHaveLength(3);
    expect(t).toContainEqual([f.people.ali, f.people.hamza, 225300]);
    expect(t).toContainEqual([f.people.me, f.people.hamza, 180600]);
    expect(t).toContainEqual([f.people.saad, f.people.hamza, 180600]);
  });

  it('§4.1 selectResult is not ok while items are unassigned', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setItemAssignment(f.billId, f.itemIds.karahi, { kind: 'unassigned' });
    expect(sel.result(e, f.billId).ok).toBe(false);
  });

  it('§4.1 selectPreview exposes the "N left" count (needsAttentionCount)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    expect(sel.preview(e, f.billId)!.needsAttentionCount).toBe(0);
    st(e).setItemAssignment(f.billId, f.itemIds.karahi, { kind: 'unassigned' });
    st(e).setItemAssignment(f.billId, f.itemIds.doodh, { kind: 'unassigned' });
    expect(sel.preview(e, f.billId)!.needsAttentionCount).toBe(2);
  });

  it('§4.1 selectBillState: ready → reconciled → unassigned → needs-review → settled (D5)', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    expect(sel.billState(e, f.billId)).toBe('ready');
    st(e).updateBillMeta(f.billId, { printedTotal: $(850000) });
    expect(sel.billState(e, f.billId)).toBe('reconciled');
    st(e).updateBillMeta(f.billId, { printedTotal: $(900000) });
    expect(sel.billState(e, f.billId)).toBe('needs-review'); // TOTAL_MISMATCH is not an ITEM_* error
    st(e).updateBillMeta(f.billId, { printedTotal: null });
    st(e).setItemAssignment(f.billId, f.itemIds.karahi, { kind: 'unassigned' });
    expect(sel.billState(e, f.billId)).toBe('unassigned');
    st(e).assignRemaining(f.billId);
    expect(sel.billState(e, f.billId)).toBe('ready');
    payAll(e, f.billId);
    expect(st(e).settle(f.billId).ok).toBe(true);
    expect(sel.billState(e, f.billId)).toBe('settled');
  });
});

describe('§4.1 selectors: balances (D8)', () => {
  it('§4.1 selectBalances for me after Fixture B (Hamza paid) = youOwe 180600, owedToYou 0', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const bal = sel.balances(e);
    expect(bal.youOwe).toBe(180600);
    expect(bal.owedToYou).toBe(0);
    const cp = bal.counterparties.find((c) => c.displayName === 'Hamza')!;
    expect(cp).toBeDefined();
    expect(cp.key).toBe(f.people.hamza);
    expect(cp.net).toBe(-180600);
  });

  it('§4.1 selectBalances ignores paid transfers, deleted bills and settled bills', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    st(e).setTransferPaid(f.billId, f.people.me, f.people.hamza, true);
    expect(sel.balances(e).youOwe).toBe(0);
    st(e).setTransferPaid(f.billId, f.people.me, f.people.hamza, false);
    expect(sel.balances(e).youOwe).toBe(180600);
    st(e).deleteBill(f.billId);
    expect(sel.balances(e).youOwe).toBe(0);
    st(e).restoreBill(f.billId);
    expect(sel.balances(e).youOwe).toBe(180600);
    payAll(e, f.billId);
    st(e).settle(f.billId);
    expect(sel.balances(e).youOwe).toBe(0);
  });

  it('§4.1 selectBalances sums across bills', () => {
    const e = makeEnv();
    const first = buildFixtureB(e);
    buildFixtureB(e, { people: first.people });
    expect(sel.balances(e).youOwe).toBe(2 * 180600);
  });

  it('§4.1 selectBalances is zero with no bills', () => {
    const e = makeEnv();
    seedPeople(e);
    const b = sel.balances(e);
    expect(b.youOwe).toBe(0);
    expect(b.owedToYou).toBe(0);
    expect(b.counterparties).toEqual([]);
  });
});

describe('§4.1 selectors: memoisation per bill object identity', () => {
  it('§4.1 selectResult returns the same object for the same bill identity', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r1 = sel.result(e, f.billId);
    const r2 = sel.result(e, f.billId);
    expect(r2).toBe(r1);
  });

  it('§4.1 selectResult stays identical when only ANOTHER bill changes', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const other = st(e).createBill({
      groupId: null,
      restaurantName: 'Other',
      date: '2026-11-03',
      participantPersonIds: [f.people.me],
      guests: [],
    });
    const r1 = sel.result(e, f.billId);
    st(e).updateBillMeta(other, { restaurantName: 'Other 2' });
    st(e).addPerson('Someone');
    expect(sel.result(e, f.billId)).toBe(r1);
  });

  it('§4.1 selectResult recomputes (new object) after this bill changes', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const r1 = sel.result(e, f.billId);
    st(e).updateItem(f.billId, f.itemIds.naan, { name: 'Naan!' });
    expect(sel.result(e, f.billId)).not.toBe(r1);
  });

  it('§4.1 selectPreview is memoised the same way', () => {
    const e = makeEnv();
    const f = buildFixtureB(e);
    const p1 = sel.preview(e, f.billId);
    expect(sel.preview(e, f.billId)).toBe(p1);
  });
});
