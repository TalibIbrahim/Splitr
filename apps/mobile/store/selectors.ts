/**
 * Memoised selectors (docs/phase1-spec.md section 4.1). Derived data is never stored; it is cached per bill
 * object identity (a bill mutation creates a new object, so the cache entry is simply never hit again).
 * React-free.
 */
import { calculateBill, previewItemShares, type CalculationResult, type ItemSharesPreview } from '@splitr/calculation-engine';
import { balancesForMe, deriveBillState, toBillInput, type BillState, type MyBalances } from '@splitr/bill-domain';
import type { Bill, Group, Person } from '@splitr/shared-types';
import type { SplitrNotice, SplitrState } from './create-store';

const isLive = (d: { deletedAt?: string | null }): boolean => (d.deletedAt ?? null) === null;

const resultCache = new WeakMap<Bill, CalculationResult>();
const previewCache = new WeakMap<Bill, ItemSharesPreview>();
const stateCache = new WeakMap<Bill, BillState>();

function resultFor(bill: Bill): CalculationResult {
  let r = resultCache.get(bill);
  if (!r) {
    r = calculateBill(toBillInput(bill));
    resultCache.set(bill, r);
  }
  return r;
}

function previewFor(bill: Bill): ItemSharesPreview {
  let p = previewCache.get(bill);
  if (!p) {
    const input = toBillInput(bill);
    p = previewItemShares({ participants: input.participants, items: input.items });
    previewCache.set(bill, p);
  }
  return p;
}

export const selectBill =
  (id: string) =>
  (s: SplitrState): Bill | undefined =>
    s.root.bills.find((b) => b.id === id);

export const selectResult =
  (id: string) =>
  (s: SplitrState): CalculationResult | undefined => {
    const bill = selectBill(id)(s);
    return bill ? resultFor(bill) : undefined;
  };

export const selectPreview =
  (id: string) =>
  (s: SplitrState): ItemSharesPreview | undefined => {
    const bill = selectBill(id)(s);
    return bill ? previewFor(bill) : undefined;
  };

export const selectBillState =
  (id: string) =>
  (s: SplitrState): BillState | undefined => {
    const bill = selectBill(id)(s);
    if (!bill) return undefined;
    let st = stateCache.get(bill);
    if (!st) {
      st = deriveBillState(bill, resultFor(bill));
      stateCache.set(bill, st);
    }
    return st;
  };

// Single-entry caches keyed on the identity of the input array: stable references for React selectors.
let activeKey: readonly Bill[] | null = null;
let activeVal: Bill[] = [];

/** Not-deleted bills, newest first (by createdAt, ties by later position in the list). */
export const selectActiveBills =
  () =>
  (s: SplitrState): Bill[] => {
    if (activeKey !== s.root.bills) {
      activeVal = s.root.bills
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => isLive(b))
        .sort((x, y) => (x.b.createdAt < y.b.createdAt ? 1 : x.b.createdAt > y.b.createdAt ? -1 : y.i - x.i))
        .map(({ b }) => b);
      activeKey = s.root.bills;
    }
    return activeVal;
  };

let balancesKey: readonly Bill[] | null = null;
let balancesVal: MyBalances = { youOwe: 0 as MyBalances['youOwe'], owedToYou: 0 as MyBalances['owedToYou'], counterparties: [] };

export const selectBalances =
  () =>
  (s: SplitrState): MyBalances => {
    if (balancesKey !== s.root.bills) {
      const live = s.root.bills.filter(isLive);
      const results = new Map(live.map((b) => [b.id, resultFor(b)] as const));
      balancesVal = balancesForMe(live, results);
      balancesKey = s.root.bills;
    }
    return balancesVal;
  };

/** The group of the most recent active bill that has a live group; otherwise the most recently created live group. */
export const selectLatestGroup =
  () =>
  (s: SplitrState): Group | undefined => {
    const groups = s.root.groups.filter(isLive);
    for (const b of selectActiveBills()(s)) {
      const g = b.groupId === null ? undefined : groups.find((x) => x.id === b.groupId);
      if (g) return g;
    }
    let latest: Group | undefined;
    for (const g of groups) if (!latest || g.createdAt >= latest.createdAt) latest = g;
    return latest;
  };

let groupsKey: readonly Group[] | null = null;
let groupsVal: Group[] = [];

/** Live groups sorted by name. The array is stable while `root.groups` is unchanged. */
export const selectGroups =
  () =>
  (s: SplitrState): Group[] => {
    if (groupsKey !== s.root.groups) {
      groupsVal = s.root.groups.filter(isLive).sort((a, b) => a.name.localeCompare(b.name, 'en'));
      groupsKey = s.root.groups;
    }
    return groupsVal;
  };

let peopleKey: readonly Person[] | null = null;
let peopleVal: Person[] = [];

/** Live people: me first, then by displayName. The array is stable while `root.people` is unchanged. */
export const selectPeople =
  () =>
  (s: SplitrState): Person[] => {
    if (peopleKey !== s.root.people) {
      peopleVal = s.root.people
        .filter(isLive)
        .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.displayName.localeCompare(b.displayName, 'en'));
      peopleKey = s.root.people;
    }
    return peopleVal;
  };

/** A single person by id (deleted people are still found, since past bills refer to them), or undefined. */
export const selectPerson =
  (id: string) =>
  (s: SplitrState): Person | undefined =>
    s.root.people.find((p) => p.id === id);

export const selectNotice =
  () =>
  (s: SplitrState): SplitrNotice | null =>
    s.notice;
