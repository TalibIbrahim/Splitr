/**
 * Memoised selectors (docs/phase1-spec.md section 4.1). Derived data is never stored; it is cached per bill
 * object identity (a bill mutation creates a new object, so the cache entry is simply never hit again).
 * React-free.
 */
import {
  calculateBill,
  previewItemShares,
  type CalculationResult,
  type ItemSharesPreview,
  type Paisa,
} from '@splitr/calculation-engine';
import {
  balancesForMe,
  deriveBillState,
  settleUpPlan,
  toBillInput,
  type BillState,
  type MyBalances,
  type SettleUpEntry,
} from '@splitr/bill-domain';
import { lahoreOffers } from '@splitr/offers-data';
import type { Bill, CardOffer, Group, Person } from '@splitr/shared-types';
import { compareSemver } from '../lib/update-check';
import type { SplitrNotice, SplitrState } from './create-store';

/** D36. The release to advertise: newer than the running version and not dismissed; null otherwise. */
export function selectUpdateBanner(
  currentVersion: string,
): (s: SplitrState) => { version: string; url: string } | null {
  return (s) => {
    const u = s.root.meta?.updateCheck;
    if (!u?.latestVersion || !u.latestUrl) return null;
    if (u.dismissedVersion === u.latestVersion) return null;
    if (compareSemver(u.latestVersion, currentVersion) <= 0) return null;
    return { version: u.latestVersion, url: u.latestUrl };
  };
}

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

let billMapKey: readonly Bill[] | null = null;
let billMapVal = new Map<string, Bill>();

/** id -> bill Map, rebuilt only when `root.bills` changes identity (D9b). */
export const selectBill =
  (id: string) =>
  (s: SplitrState): Bill | undefined => {
    if (billMapKey !== s.root.bills) {
      billMapVal = new Map(s.root.bills.map((b) => [b.id, b] as const));
      billMapKey = s.root.bills;
    }
    return billMapVal.get(id);
  };

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
      // D9b: settled bills never run the engine.
      st = bill.status === 'settled' ? 'settled' : deriveBillState(bill, resultFor(bill));
      stateCache.set(bill, st);
    }
    return st;
  };

export interface BillSummary {
  state: BillState;
  /** Rounded bill total, or null when there is no usable result. */
  roundedTotal: Paisa | null;
  needsAttentionCount: number;
}

const summaryCache = new WeakMap<Bill, BillSummary>();

/** List-row summary. Settled bills read `finalSnapshot`; open bills use the memoised result and preview. Stable per bill object. */
export const selectBillSummary =
  (id: string) =>
  (s: SplitrState): BillSummary | undefined => {
    const bill = selectBill(id)(s);
    if (!bill) return undefined;
    let sum = summaryCache.get(bill);
    if (!sum) {
      if (bill.status === 'settled') {
        sum = { state: 'settled', roundedTotal: bill.finalSnapshot?.roundedTotal ?? null, needsAttentionCount: 0 };
      } else {
        const result = resultFor(bill);
        const state = deriveBillState(bill, result);
        sum = {
          state,
          roundedTotal: result.ok ? result.breakdown.roundedTotal : null,
          needsAttentionCount: state === 'unassigned' ? previewFor(bill).needsAttentionCount : 0,
        };
      }
      summaryCache.set(bill, sum);
    }
    return sum;
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
      // D9b: settled bills are excluded by the domain functions, so only open bills are calculated.
      const results = new Map(live.filter((b) => b.status === 'open').map((b) => [b.id, resultFor(b)] as const));
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

let planKey: readonly Bill[] | null = null;
let planVal: SettleUpEntry[] = [];

/** E1 plan over live bills. The array is stable while `root.bills` is unchanged. */
export const selectSettleUpPlan =
  () =>
  (s: SplitrState): SettleUpEntry[] => {
    if (planKey !== s.root.bills) {
      const live = s.root.bills.filter(isLive);
      // D9b: settled bills are excluded by the domain functions, so only open bills are calculated.
      const results = new Map(live.filter((b) => b.status === 'open').map((b) => [b.id, resultFor(b)] as const));
      planVal = settleUpPlan(live, results);
      planKey = s.root.bills;
    }
    return planVal;
  };

const NO_CARDS: readonly { id: string; label: string }[] = [];
const NO_OFFERS: readonly CardOffer[] = [];

/** Saved card labels (stable empty reference when none). */
export const selectCardLabels =
  () =>
  (s: SplitrState): readonly { id: string; label: string }[] =>
    s.root.cards ?? NO_CARDS;

let offersCache: { user: readonly CardOffer[]; all: readonly CardOffer[] } | null = null;

/** Bundled Lahore offers plus the user's own; the same array while `userOffers` is unchanged. */
export const selectAllOffers =
  () =>
  (s: SplitrState): readonly CardOffer[] => {
    const user = s.root.userOffers ?? NO_OFFERS;
    if (!offersCache || offersCache.user !== user) offersCache = { user, all: [...lahoreOffers, ...user] };
    return offersCache.all;
  };
