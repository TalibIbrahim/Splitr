/**
 * The Splitr store (docs/phase1-spec.md section 4.1). A vanilla zustand store built by `createSplitrStore(deps)`.
 * React-free: nothing in this file or its imports may touch react-native or expo (it is tested in Node).
 * All money logic comes from @splitr/bill-domain and @splitr/calculation-engine; this file only moves documents around.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateStorage } from 'zustand/middleware';
import { calculateBill, type Adjustment, type Assignment, type Contribution, type Item, type Paisa } from '@splitr/calculation-engine';
import {
  assignRemainingEqually,
  canSettle,
  reconcileTransferStatuses,
  reopenBill,
  settleBill,
  toBillInput,
  toggleParticipant,
} from '@splitr/bill-domain';
import type { Bill, BillParticipant, Group, PersistedRoot, Person } from '@splitr/shared-types';
import { createSaver, emptyRoot, loadRoot, type LoadOutcome, type Saver } from './persist';

export interface SplitrDeps {
  storage: StateStorage;
  newId: () => string;
  /** ISO-8601 UTC timestamp. */
  now: () => string;
  /** Debounce for writes. 0 (default) writes synchronously after every change. The app uses 300. */
  saveDelayMs?: number;
  onSaveError?: (e: unknown) => void;
}

export type SplitrNotice = { kind: 'payments-reset'; billId: string; count: number };

export interface SplitrData {
  hydrated: boolean;
  recovery: null | { reason: string };
  /** Ephemeral (never persisted). */
  notice: null | SplitrNotice;
  root: PersistedRoot;
}

export interface NewBillInput {
  groupId: string | null;
  restaurantName: string;
  date: string;
  participantPersonIds: string[];
  guests: string[];
}

export interface BillMetaPatch {
  restaurantName?: string;
  date?: string;
  /** `null` clears. */
  printedTotal?: Paisa | null;
  /** `null` clears. */
  printedSubtotal?: Paisa | null;
}

export interface ItemPatch {
  name?: string;
  quantity?: number;
  lineTotal?: Paisa;
  categories?: string[];
  unitPrice?: Paisa | null;
}

export type SettleResult = { ok: true } | { ok: false; reason: string };

export interface SplitrActions {
  onboard(displayName: string): void;
  addPerson(name: string): string;
  renamePerson(id: string, name: string): void;
  deletePerson(id: string): void;
  saveGroup(g: { id?: string; name: string; memberIds: string[] }): string;
  deleteGroup(id: string): void;
  createBill(input: NewBillInput): string;
  updateBillMeta(id: string, patch: BillMetaPatch): void;
  addParticipant(id: string, p: { personId?: string; guestName?: string }): void;
  removeParticipant(id: string, pid: string): void;
  addItem(id: string, item: { name: string; quantity: number; lineTotal: Paisa }): string;
  updateItem(id: string, itemId: string, patch: ItemPatch): void;
  removeItem(id: string, itemId: string): void;
  toggleAssign(id: string, itemId: string, pid: string): void;
  assignRemaining(id: string): void;
  setItemAssignment(id: string, itemId: string, assignment: Assignment): void;
  setAdjustments(id: string, adjustments: Adjustment[]): void;
  setContributions(id: string, contributions: Contribution[]): void;
  setTransferPaid(id: string, from: string, to: string, paid: boolean): void;
  settle(id: string): SettleResult;
  reopen(id: string): void;
  deleteBill(id: string): void;
  restoreBill(id: string): void;
  /** Accept the empty state after a failed hydration; overwrites the stored value. */
  confirmRecovery(): void;
  dismissNotice(): void;
}

export type SplitrState = SplitrData & SplitrActions;

export type SplitrStore = StoreApi<SplitrState> & {
  /** Re-read storage. Called once automatically on creation. Resolves when hydration finished. */
  hydrate(): Promise<void>;
  /** Write any pending (debounced) save immediately. */
  flush(): void;
};

const isLive = (d: { deletedAt?: string | null }): boolean => (d.deletedAt ?? null) === null;
const isPosInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 1;
const isPaisa = (n: unknown): n is Paisa => typeof n === 'number' && Number.isSafeInteger(n);
const nonEmpty = (s: string): string | null => {
  const t = s.trim();
  return t.length > 0 ? t : null;
};

/** Strips a participant from one assignment; an assignment left with nobody becomes `unassigned`. */
function stripFromAssignment(a: Assignment, pid: string): Assignment {
  switch (a.kind) {
    case 'unassigned':
      return a;
    case 'equal': {
      const ids = a.participantIds.filter((x) => x !== pid);
      return ids.length === 0 ? { kind: 'unassigned' } : { kind: 'equal', participantIds: ids };
    }
    case 'weights': {
      const entries = a.entries.filter((e) => e.participantId !== pid);
      return entries.length === 0 ? { kind: 'unassigned' } : { kind: 'weights', entries };
    }
    case 'percent': {
      const entries = a.entries.filter((e) => e.participantId !== pid);
      return entries.length === 0 ? { kind: 'unassigned' } : { kind: 'percent', entries };
    }
    case 'amounts': {
      const entries = a.entries.filter((e) => e.participantId !== pid);
      return entries.length === 0 ? { kind: 'unassigned' } : { kind: 'amounts', entries };
    }
    case 'units': {
      const entries = a.entries.filter((e) => e.participantId !== pid);
      return entries.length === 0 ? { kind: 'unassigned' } : { kind: 'units', entries };
    }
  }
}

/** Strips a participant from an adjustment's allocation policy so the engine never sees a dangling id. */
function stripFromAdjustment(adj: Adjustment, pid: string): Adjustment {
  const alloc = adj.allocation;
  if (!alloc) return adj;
  if (alloc.type === 'equal' && alloc.participantIds?.includes(pid)) {
    const ids = alloc.participantIds.filter((x) => x !== pid);
    return { ...adj, allocation: ids.length === 0 ? { type: 'equal' } : { type: 'equal', participantIds: ids } };
  }
  if (alloc.type === 'weights' && alloc.entries.some((e) => e.participantId === pid)) {
    const entries = alloc.entries.filter((e) => e.participantId !== pid);
    return { ...adj, allocation: entries.length === 0 ? { type: 'proportional' } : { type: 'weights', entries } };
  }
  return adj;
}

/** Drops receipt-specific fields (printedAmount, override) and item-id eligibility, which don't carry between bills. */
function stripCopy(adj: Adjustment): Adjustment {
  const { printedAmount: _printed, override: _override, eligibility, ...rest } = adj;
  void _printed;
  void _override;
  if (!eligibility) return rest;
  const { itemIds: _i, excludeItemIds: _e, ...elig } = eligibility;
  void _i;
  void _e;
  return Object.keys(elig).length > 0 ? { ...rest, eligibility: elig } : rest;
}

/** Copies adjustments with fresh ids, remapping `items-after` includes that point at copied ids. */
function cloneAdjustments(source: readonly Adjustment[], newId: () => string): Adjustment[] {
  const idMap = new Map(source.map((a) => [a.id, newId()] as const));
  return source.map((a): Adjustment => {
    const id = idMap.get(a.id) ?? newId();
    const base = a.base;
    if (base && base.type === 'items-after' && base.include !== 'all-prior') {
      const include = base.include.map((x) => idMap.get(x) ?? x);
      return stripCopy({ ...a, id, base: { type: 'items-after', include } });
    }
    return stripCopy({ ...a, id });
  });
}

/** Re-establishes the invariant: transferStatuses follow the current settlement transfers. */
function withReconciledTransfers(bill: Bill): { bill: Bill; dropped: number } {
  const result = calculateBill(toBillInput(bill));
  const transfers = result.ok && result.breakdown.settlement ? result.breakdown.settlement.transfers : [];
  const { statuses, droppedPaid } = reconcileTransferStatuses(bill.transferStatuses, transfers);
  return { bill: { ...bill, transferStatuses: statuses }, dropped: droppedPaid };
}

function mapItem(bill: Bill, itemId: string, fn: (item: Item) => Item): Bill {
  return { ...bill, items: bill.items.map((it) => (it.id === itemId ? fn(it) : it)) };
}

export function createSplitrStore(deps: SplitrDeps): SplitrStore {
  const { storage, newId, now } = deps;
  const saver: Saver = createSaver(storage, {
    delayMs: deps.saveDelayMs ?? 0,
    ...(deps.onSaveError ? { onError: deps.onSaveError } : {}),
  });

  const store = createStore<SplitrState>()((set, get) => {
    const setRoot = (fn: (root: PersistedRoot) => PersistedRoot): void => {
      set((s) => ({ root: fn(s.root) }));
    };

    const commit = (id: string, { bill: next, dropped }: { bill: Bill; dropped: number }): void => {
      set((s) => ({
        root: { ...s.root, bills: s.root.bills.map((b) => (b.id === id ? next : b)) },
        ...(dropped > 0 ? { notice: { kind: 'payments-reset' as const, billId: id, count: dropped } } : {}),
      }));
    };

    const findOpenBill = (id: string): Bill | undefined => {
      const bill = get().root.bills.find((b) => b.id === id);
      return bill && bill.status === 'open' && isLive(bill) ? bill : undefined;
    };

    /**
     * Applies `fn` to an open, live bill. Settled or missing bills are left alone (settled bills are read-only).
     * Afterwards bumps `updatedAt` and re-establishes the transfer-status invariant.
     */
    const mutateBill = (id: string, fn: (bill: Bill) => Bill): void => {
      const bill = findOpenBill(id);
      if (!bill) return;
      const changed = fn(bill);
      if (changed === bill) return; // true no-op: leave updatedAt alone
      commit(id, withReconciledTransfers({ ...changed, updatedAt: now() }));
    };

    return {
      hydrated: false,
      recovery: null,
      notice: null,
      root: emptyRoot(),

      onboard(displayName) {
        const name = nonEmpty(displayName);
        if (!name) return;
        const t = now();
        setRoot((r) => {
          if (r.me) {
            const meId = r.me.personId;
            return {
              ...r,
              me: { ...r.me, displayName: name },
              people: r.people.map((p) => (p.id === meId ? { ...p, displayName: name, updatedAt: t } : p)),
            };
          }
          const id = newId();
          const me: Person = { id, displayName: name, isMe: true, createdAt: t, updatedAt: t, deletedAt: null };
          return { ...r, me: { personId: id, displayName: name }, people: [...r.people, me] };
        });
      },

      addPerson(name) {
        const n = nonEmpty(name);
        if (!n) return '';
        const id = newId();
        const t = now();
        const person: Person = { id, displayName: n, isMe: false, createdAt: t, updatedAt: t, deletedAt: null };
        setRoot((r) => ({ ...r, people: [...r.people, person] }));
        return id;
      },

      renamePerson(id, name) {
        const n = nonEmpty(name);
        if (!n) return;
        const t = now();
        setRoot((r) => ({
          ...r,
          me: r.me && r.me.personId === id ? { ...r.me, displayName: n } : r.me,
          people: r.people.map((p) => (p.id === id ? { ...p, displayName: n, updatedAt: t } : p)),
        }));
      },

      deletePerson(id) {
        const t = now();
        setRoot((r) => {
          const target = r.people.find((p) => p.id === id);
          if (!target || target.isMe || !isLive(target)) return r;
          return {
            ...r,
            people: r.people.map((p) => (p.id === id ? { ...p, deletedAt: t, updatedAt: t } : p)),
            groups: r.groups.map((g) =>
              g.memberIds.includes(id) ? { ...g, memberIds: g.memberIds.filter((m) => m !== id), updatedAt: t } : g,
            ),
          };
        });
      },

      saveGroup({ id, name, memberIds }) {
        const t = now();
        const meId = get().root.me?.personId;
        const members = [...new Set(meId && !memberIds.includes(meId) ? [meId, ...memberIds] : memberIds)];
        const n = nonEmpty(name) ?? 'Crew';
        const existing = id ? get().root.groups.find((g) => g.id === id) : undefined;
        if (existing) {
          setRoot((r) => ({
            ...r,
            groups: r.groups.map((g) => (g.id === existing.id ? { ...g, name: n, memberIds: members, deletedAt: null, updatedAt: t } : g)),
          }));
          return existing.id;
        }
        const gid = id ?? newId();
        const group: Group = { id: gid, name: n, memberIds: members, createdAt: t, updatedAt: t, deletedAt: null };
        setRoot((r) => ({ ...r, groups: [...r.groups, group] }));
        return gid;
      },

      deleteGroup(id) {
        const t = now();
        setRoot((r) => ({
          ...r,
          groups: r.groups.map((g) => (g.id === id && isLive(g) ? { ...g, deletedAt: t, updatedAt: t } : g)),
        }));
      },

      createBill({ groupId, restaurantName, date, participantPersonIds, guests }) {
        const { root } = get();
        const t = now();
        const participants: BillParticipant[] = [];
        for (const pid of new Set(participantPersonIds)) {
          const person = root.people.find((p) => p.id === pid);
          if (person) participants.push({ id: person.id, displayName: person.displayName, personId: person.id });
        }
        for (const g of guests) {
          const gn = nonEmpty(g);
          if (gn) participants.push({ id: newId(), displayName: gn, personId: null });
        }
        const meId = root.me?.personId ?? null;
        const previous = groupId === null ? undefined : [...root.bills].reverse().find((b) => b.groupId === groupId && isLive(b));
        const id = newId();
        const bill: Bill = {
          id,
          groupId,
          restaurantName,
          date,
          currency: 'PKR',
          participants,
          meParticipantId: meId !== null && participants.some((p) => p.id === meId) ? meId : null,
          items: [],
          adjustments: previous ? cloneAdjustments(previous.adjustments, newId) : [],
          contributions: [],
          settlementRoundingUnit: 100 as Paisa,
          transferStatuses: [],
          status: 'open',
          settledAt: null,
          finalSnapshot: null,
          createdAt: t,
          updatedAt: t,
          deletedAt: null,
        };
        setRoot((r) => ({ ...r, bills: [...r.bills, bill] }));
        return id;
      },

      updateBillMeta(id, patch) {
        mutateBill(id, (b) => {
          const { printedTotal: oldTotal, printedSubtotal: oldSubtotal, ...rest } = b;
          const total = patch.printedTotal === undefined ? oldTotal : (patch.printedTotal ?? undefined);
          const subtotal = patch.printedSubtotal === undefined ? oldSubtotal : (patch.printedSubtotal ?? undefined);
          return {
            ...rest,
            ...(patch.restaurantName !== undefined ? { restaurantName: patch.restaurantName } : {}),
            ...(patch.date !== undefined ? { date: patch.date } : {}),
            ...(total !== undefined && isPaisa(total) ? { printedTotal: total } : {}),
            ...(subtotal !== undefined && isPaisa(subtotal) ? { printedSubtotal: subtotal } : {}),
          };
        });
      },

      addParticipant(id, { personId, guestName }) {
        const person = personId ? get().root.people.find((p) => p.id === personId) : undefined;
        const guest = guestName !== undefined ? nonEmpty(guestName) : null;
        if (!person && !guest) return;
        mutateBill(id, (b) => {
          if (person) {
            if (b.participants.some((p) => p.id === person.id)) return b;
            return { ...b, participants: [...b.participants, { id: person.id, displayName: person.displayName, personId: person.id }] };
          }
          return { ...b, participants: [...b.participants, { id: newId(), displayName: guest ?? '', personId: null }] };
        });
      },

      removeParticipant(id, pid) {
        mutateBill(id, (b) => {
          if (!b.participants.some((p) => p.id === pid)) return b;
          return {
            ...b,
            participants: b.participants.filter((p) => p.id !== pid),
            meParticipantId: b.meParticipantId === pid ? null : b.meParticipantId,
            items: b.items.map((it) => ({ ...it, assignment: stripFromAssignment(it.assignment, pid) })),
            adjustments: b.adjustments.map((a) => stripFromAdjustment(a, pid)),
            contributions: b.contributions.filter((c) => c.participantId !== pid),
          };
        });
      },

      addItem(id, { name, quantity, lineTotal }) {
        if (!isPosInt(quantity) || !isPaisa(lineTotal) || !findOpenBill(id)) return '';
        const itemId = newId();
        const item: Item = {
          id: itemId,
          name: name.trim(),
          quantity,
          lineTotal,
          categories: [],
          assignment: { kind: 'unassigned' },
          source: 'user',
        };
        mutateBill(id, (b) => ({ ...b, items: [...b.items, item] }));
        return itemId;
      },

      updateItem(id, itemId, patch) {
        mutateBill(id, (b) =>
          mapItem(b, itemId, (it) => {
            const { unitPrice: oldUnitPrice, ...rest } = it;
            const unitPrice = patch.unitPrice === undefined ? oldUnitPrice : (patch.unitPrice ?? undefined);
            return {
              ...rest,
              ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
              ...(patch.quantity !== undefined && isPosInt(patch.quantity) ? { quantity: patch.quantity } : {}),
              ...(patch.lineTotal !== undefined && isPaisa(patch.lineTotal) ? { lineTotal: patch.lineTotal } : {}),
              ...(patch.categories !== undefined ? { categories: patch.categories } : {}),
              ...(unitPrice !== undefined && isPaisa(unitPrice) ? { unitPrice } : {}),
            };
          }),
        );
      },

      removeItem(id, itemId) {
        mutateBill(id, (b) => ({ ...b, items: b.items.filter((it) => it.id !== itemId) }));
      },

      toggleAssign(id, itemId, pid) {
        mutateBill(id, (b) => {
          if (!b.participants.some((p) => p.id === pid)) return b;
          return mapItem(b, itemId, (it) => toggleParticipant(it, pid).item);
        });
      },

      assignRemaining(id) {
        mutateBill(id, (b) => ({
          ...b,
          items: assignRemainingEqually(
            b.items,
            b.participants.map((p) => p.id),
          ),
        }));
      },

      setItemAssignment(id, itemId, assignment) {
        mutateBill(id, (b) => mapItem(b, itemId, (it) => ({ ...it, assignment })));
      },

      setAdjustments(id, adjustments) {
        mutateBill(id, (b) => ({ ...b, adjustments }));
      },

      setContributions(id, contributions) {
        mutateBill(id, (b) => ({ ...b, contributions }));
      },

      setTransferPaid(id, from, to, paid) {
        const t = now();
        mutateBill(id, (b) => ({
          ...b,
          transferStatuses: b.transferStatuses.map((s) =>
            s.from === from && s.to === to
              ? { ...s, status: paid ? 'paid' : 'pending', paidAt: paid ? t : null }
              : s,
          ),
        }));
      },

      settle(id) {
        const bill = get().root.bills.find((b) => b.id === id);
        if (!bill || !isLive(bill)) return { ok: false, reason: 'not-found' };
        if (bill.status === 'settled') return { ok: false, reason: 'already-settled' };
        const result = calculateBill(toBillInput(bill));
        if (!result.ok) return { ok: false, reason: 'invalid-bill' };
        if (result.breakdown.settlement === null) return { ok: false, reason: 'no-contributions' };
        if (!canSettle(bill, result)) return { ok: false, reason: 'transfers-unpaid' };
        const t = now();
        const settled: Bill = { ...settleBill(bill, result, t), updatedAt: t };
        setRoot((r) => ({ ...r, bills: r.bills.map((b) => (b.id === id ? settled : b)) }));
        return { ok: true };
      },

      reopen(id) {
        const bill = get().root.bills.find((b) => b.id === id);
        if (!bill || bill.status !== 'settled' || !isLive(bill)) return;
        commit(id, withReconciledTransfers({ ...reopenBill(bill), updatedAt: now() }));
      },

      deleteBill(id) {
        const t = now();
        setRoot((r) => ({
          ...r,
          bills: r.bills.map((b) => (b.id === id && isLive(b) ? { ...b, deletedAt: t, updatedAt: t } : b)),
        }));
      },

      restoreBill(id) {
        const t = now();
        setRoot((r) => ({
          ...r,
          bills: r.bills.map((b) => (b.id === id && !isLive(b) ? { ...b, deletedAt: null, updatedAt: t } : b)),
        }));
      },

      dismissNotice() {
        set({ notice: null });
      },

      confirmRecovery() {
        if (!get().recovery) return;
        set({ recovery: null });
        saver.writeNow(get().root);
      },
    };
  });

  // Persistence wiring. Saves only after hydration and never while a recovery is pending,
  // so the original key stays untouched until the user confirms.
  store.subscribe((state, prev) => {
    if (state.root === prev.root || !prev.hydrated || !state.hydrated || state.recovery) return;
    saver.schedule(state.root);
  });

  const apply = (outcome: LoadOutcome): void => {
    if (outcome.kind === 'recovery') {
      store.setState({ hydrated: true, recovery: { reason: outcome.reason }, root: outcome.root });
    } else {
      store.setState({ hydrated: true, recovery: null, root: outcome.root });
    }
  };

  const hydrate = (): Promise<void> => {
    const outcome = loadRoot(storage, now());
    if (outcome instanceof Promise) return outcome.then(apply);
    apply(outcome);
    return Promise.resolve();
  };

  const api: SplitrStore = Object.assign(store, { hydrate, flush: () => saver.flush() });
  void hydrate(); // synchronous when the storage is synchronous
  return api;
}
