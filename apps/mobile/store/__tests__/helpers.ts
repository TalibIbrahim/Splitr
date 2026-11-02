/**
 * Test harness for the store contract (docs/phase1-spec.md section 4.1).
 * Written from the spec only. Selector call shape is assumed to be curried: `selectX(args)(state)`
 * (spec writes `selectBill(id)`, `selectActiveBills()`); every selector access goes through `sel` below
 * so a different shape needs a one-place change.
 */
import { vi } from 'vitest';
import { calculateBill } from '@splitr/calculation-engine';
import type { Adjustment, BasisPoints, BillBreakdown, CalculationResult, Item, Paisa } from '@splitr/calculation-engine';
import { PersistedRootSchema } from '@splitr/shared-types';
import type { Bill, PersistedRoot } from '@splitr/shared-types';
import { cardDiscount, tax, toBillInput } from '@splitr/bill-domain';
import { createSplitrStore } from '../create-store';
import * as selectors from '../selectors';

export const $ = (n: number): Paisa => n as Paisa;
export const bp = (n: number): BasisPoints => n as BasisPoints;

export function at<T>(arr: readonly T[] | undefined, i: number): T {
  const v = arr?.[i];
  if (v === undefined) throw new Error(`no element at index ${i}`);
  return v;
}

export class MemoryStorage {
  readonly map = new Map<string, string>();
  constructor(private readonly isAsync = false) {}
  getItem(name: string): string | null | Promise<string | null> {
    const v = this.map.get(name) ?? null;
    return this.isAsync ? Promise.resolve(v) : v;
  }
  setItem(name: string, value: string): void | Promise<void> {
    this.map.set(name, value);
    if (this.isAsync) return Promise.resolve();
  }
  removeItem(name: string): void | Promise<void> {
    this.map.delete(name);
    if (this.isAsync) return Promise.resolve();
  }
  /** Keys that are not backups. */
  mainKeys(): string[] {
    return [...this.map.keys()].filter((k) => !k.startsWith('splitr-backup-'));
  }
  backupKeys(): string[] {
    return [...this.map.keys()].filter((k) => k.startsWith('splitr-backup-'));
  }
}

export type Store = ReturnType<typeof createSplitrStore>;
export type State = ReturnType<Store['getState']>;

export interface Env {
  storage: MemoryStorage;
  store: Store;
  /** Advance the injected clock. */
  advance(ms: number): void;
  now(): string;
  ids: string[];
}

export const T0 = Date.UTC(2026, 10, 2, 10, 0, 0);

export function makeEnv(opts: { storage?: MemoryStorage; async?: boolean; start?: number; idPrefix?: string } = {}): Env {
  const storage = opts.storage ?? new MemoryStorage(opts.async ?? false);
  let t = opts.start ?? T0;
  let n = 0;
  const ids: string[] = [];
  const now = () => new Date(t).toISOString();
  const newId = () => {
    const id = `${opts.idPrefix ?? 'id'}-${++n}`;
    ids.push(id);
    return id;
  };
  const store = createSplitrStore({ storage, newId, now });
  return {
    storage,
    store,
    advance: (ms) => {
      t += ms;
    },
    now,
    ids,
  };
}

/** Let async storage / debounce timers settle. Works under real and fake timers. */
export async function flush(): Promise<void> {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(1000);
  } else {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  }
}

/** Waits until hydration finished (successfully or into recovery). */
export async function ready(env: Env): Promise<Env> {
  for (let i = 0; i < 50; i++) {
    const s = env.store.getState();
    if (s.hydrated || s.recovery) return env;
    await flush();
  }
  throw new Error('store never hydrated');
}

export const st = (e: Env): State => e.store.getState();
export const root = (e: Env): PersistedRoot => e.store.getState().root;

/** Selector adapter (curried shape). */
export const sel = {
  bill: (e: Env, id: string) => selectors.selectBill(id)(st(e)) as Bill | null | undefined,
  active: (e: Env) => selectors.selectActiveBills()(st(e)) as Bill[],
  result: (e: Env, id: string) => selectors.selectResult(id)(st(e)) as CalculationResult,
  preview: (e: Env, id: string) => selectors.selectPreview(id)(st(e)),
  billState: (e: Env, id: string) => selectors.selectBillState(id)(st(e)),
  balances: (e: Env) => selectors.selectBalances()(st(e)),
  latestGroup: (e: Env) => selectors.selectLatestGroup()(st(e)),
};

export function bill(e: Env, id: string): Bill {
  const b = root(e).bills.find((x) => x.id === id);
  if (!b) throw new Error('no bill ' + id);
  return b;
}

export function item(b: Bill, itemId: string): Item {
  const i = b.items.find((x) => x.id === itemId);
  if (!i) throw new Error('no item ' + itemId);
  return i;
}

export function expectValidRoot(e: Env): void {
  const r = PersistedRootSchema.safeParse(root(e));
  if (!r.success) throw new Error('root violates PersistedRootSchema: ' + JSON.stringify(r.error.issues.slice(0, 3)));
}

/** Transfers the engine currently derives for a bill ([] when not ok or no settlement). */
export function currentTransfers(b: Bill): { from: string; to: string; amount: number }[] {
  const r = calculateBill(toBillInput(b));
  if (!r.ok || !r.breakdown.settlement) return [];
  return r.breakdown.settlement.transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amount }));
}
export function statusKeys(b: Bill): string[] {
  return b.transferStatuses.map((s) => `${s.from}>${s.to}:${s.amount}`).sort();
}
export function transferKeys(b: Bill): string[] {
  return currentTransfers(b)
    .map((t) => `${t.from}>${t.to}:${t.amount}`)
    .sort();
}
/** Invariant (section 4.1): statuses mirror current transfers. Skipped for settled bills. */
export function expectStatusInvariant(b: Bill): void {
  if (b.status === 'settled') return;
  if (JSON.stringify(statusKeys(b)) !== JSON.stringify(transferKeys(b)))
    throw new Error(`transferStatuses ${statusKeys(b)} != transfers ${transferKeys(b)}`);
}

// ───────────── Fixture B through the store API ─────────────

export interface People {
  me: string;
  hamza: string;
  ali: string;
  saad: string;
}

export function seedPeople(e: Env): People {
  st(e).onboard('Mahhee');
  const me = root(e).me!.personId;
  const hamza = st(e).addPerson('Hamza');
  const ali = st(e).addPerson('Ali');
  const saad = st(e).addPerson('Saad');
  return { me, hamza, ali, saad };
}

export interface FixtureB {
  people: People;
  billId: string;
  itemIds: Record<'karahi' | 'seekh' | 'daal' | 'naan' | 'margarita' | 'doodh', string>;
}

export const EXPECTED_ROUNDED = { Mahhee: 180600, Hamza: 263500, Ali: 225300, Saad: 180600 } as const;

export const fixtureAdjustments = (suffix = ''): Adjustment[] => [
  cardDiscount('adj-disc' + suffix, 10, { rateBp: bp(2000) }),
  tax('adj-tax' + suffix, 30, { rateBp: bp(500), base: 'original' }),
];

/** Enters Fixture B (docs/calculation-rules.md R11.4) entirely through store actions. */
export function buildFixtureB(
  e: Env,
  opts: { groupId?: string | null; contributions?: boolean; people?: People } = {},
): FixtureB {
  const people = opts.people ?? seedPeople(e);
  const s = () => st(e);
  const billId = s().createBill({
    groupId: opts.groupId ?? null,
    restaurantName: 'Salt & Ember',
    date: '2026-11-02',
    participantPersonIds: [people.me, people.hamza, people.ali, people.saad],
    guests: [],
  });
  const add = (name: string, quantity: number, total: number) =>
    s().addItem(billId, { name, quantity, lineTotal: $(total) });
  const karahi = add('Chicken Karahi', 1, 320000);
  const seekh = add('Mutton Seekh', 2, 290000);
  const daal = add('Daal Makhni', 1, 95000);
  const naan = add('Garlic Naan', 6, 72000);
  const margarita = add('Mint Margarita', 3, 135000);
  const doodh = add('Doodh Patti', 4, 88000);
  const all = [people.me, people.hamza, people.ali, people.saad];
  const A = (id: string, a: unknown) => s().setItemAssignment(billId, id, a as never);
  A(karahi, { kind: 'equal', participantIds: all });
  A(seekh, {
    kind: 'units',
    entries: [
      { participantId: people.hamza, units: 1 },
      { participantId: people.ali, units: 1 },
    ],
  });
  A(daal, { kind: 'equal', participantIds: [people.me, people.saad] });
  A(naan, { kind: 'equal', participantIds: all });
  A(margarita, {
    kind: 'units',
    entries: [
      { participantId: people.me, units: 1 },
      { participantId: people.hamza, units: 1 },
      { participantId: people.saad, units: 1 },
    ],
  });
  A(doodh, { kind: 'equal', participantIds: all });
  s().setAdjustments(billId, fixtureAdjustments());
  if (opts.contributions !== false) s().setContributions(billId, [{ participantId: people.hamza, amount: $(850000) }]);
  return { people, billId, itemIds: { karahi, seekh, daal, naan, margarita, doodh } };
}

export function roundedByName(b: Bill, bd: BillBreakdown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of bd.participants) {
    const name = b.participants.find((x) => x.id === p.participantId)?.displayName ?? p.participantId;
    out[name] = p.roundedTotal;
  }
  return out;
}

export function payAll(e: Env, billId: string): void {
  for (const t of currentTransfers(bill(e, billId))) st(e).setTransferPaid(billId, t.from, t.to, true);
}
