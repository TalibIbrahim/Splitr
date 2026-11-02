import type {
  Adjustment,
  BasisPoints,
  BillBreakdown,
  BillInput,
  CalculationResult,
  Contribution,
  Item,
  Paisa,
} from '@splitr/calculation-engine';
import { calculateBill } from '@splitr/calculation-engine';
import type { Bill, TransferStatus } from '@splitr/shared-types';
import { cardDiscount, tax } from '../src/index';

export const $ = (n: number): Paisa => n as Paisa;
export const bp = (n: number): BasisPoints => n as BasisPoints;

export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no element at index ${i}`);
  return v;
}

export function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

export interface Seat {
  id: string;
  displayName: string;
  personId: string | null;
}

export interface BillSeed {
  id?: string;
  groupId?: string | null;
  restaurantName?: string;
  date?: string;
  participants?: Seat[];
  meParticipantId?: string | null;
  items?: Item[];
  adjustments?: Adjustment[];
  printedSubtotal?: Paisa;
  printedTotal?: Paisa;
  contributions?: Contribution[];
  settlementRoundingUnit?: Paisa;
  transferStatuses?: TransferStatus[];
  status?: 'open' | 'settled';
  settledAt?: string | null;
  finalSnapshot?: BillBreakdown | null;
}

/** Builds a stored Bill document. Housekeeping fields (timestamps) are filled with constants. */
export function makeBill(seed: BillSeed = {}): Bill {
  const b = {
    id: 'bill-1',
    groupId: null,
    restaurantName: 'Test Place',
    date: '2026-11-02',
    currency: 'PKR',
    participants: [],
    meParticipantId: null,
    items: [],
    adjustments: [],
    contributions: [],
    settlementRoundingUnit: $(100),
    transferStatuses: [],
    status: 'open',
    settledAt: null,
    finalSnapshot: null,
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    deletedAt: null,
    ...seed,
  };
  return b as unknown as Bill;
}

/** Independent, hand-written bill -> engine input mapping (so engine-driven tests do not depend on D1). */
export function engineInput(bill: Bill): BillInput {
  const b = bill as unknown as BillSeed & { currency: 'PKR'; date: string };
  return {
    currency: 'PKR',
    date: b.date,
    participants: (b.participants ?? []).map((p) => ({ id: p.id, displayName: p.displayName })),
    items: b.items ?? [],
    adjustments: b.adjustments ?? [],
    contributions: b.contributions ?? [],
    ...(b.printedSubtotal !== undefined ? { printedSubtotal: b.printedSubtotal } : {}),
    ...(b.printedTotal !== undefined ? { printedTotal: b.printedTotal } : {}),
    settlementRoundingUnit: b.settlementRoundingUnit ?? $(100),
  };
}

export function calc(bill: Bill): CalculationResult {
  return calculateBill(engineInput(bill));
}

export function okBreakdown(bill: Bill): BillBreakdown {
  const r = calc(bill);
  if (!r.ok) throw new Error('expected ok result: ' + JSON.stringify(r.errors));
  return r.breakdown;
}

/** Statuses for every settlement transfer (by index in settlement.transfers): paid for paidIdx, else pending. */
export function statusesFor(breakdown: BillBreakdown, paidIdx: number[] = []): TransferStatus[] {
  return (breakdown.settlement?.transfers ?? []).map((t, i) => ({
    from: t.from,
    to: t.to,
    amount: t.amount,
    status: paidIdx.includes(i) ? 'paid' : 'pending',
    paidAt: paidIdx.includes(i) ? '2026-11-03T09:00:00.000Z' : null,
  })) as TransferStatus[];
}

// ───────────── Fixture B ("Salt & Ember") as a Bill ─────────────

export const SEATS: Seat[] = [
  { id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' },
  { id: 'hamza', displayName: 'Hamza', personId: 'hamza' },
  { id: 'ali', displayName: 'Ali', personId: 'ali' },
  { id: 'saad', displayName: 'Saad', personId: 'saad' },
];

const ALL = ['mahhee', 'hamza', 'ali', 'saad'];

export function mkItem(
  id: string,
  name: string,
  quantity: number,
  lineTotal: number,
  assignment: Item['assignment'],
): Item {
  return { id, name, quantity, lineTotal: $(lineTotal), categories: [], assignment, source: 'user' };
}

export function fixtureBItems(): Item[] {
  return [
    mkItem('karahi', 'Chicken Karahi', 1, 320000, { kind: 'equal', participantIds: ALL }),
    mkItem('seekh', 'Mutton Seekh', 2, 290000, {
      kind: 'units',
      entries: [
        { participantId: 'hamza', units: 1 },
        { participantId: 'ali', units: 1 },
      ],
    }),
    mkItem('daal', 'Daal Makhni', 1, 95000, { kind: 'equal', participantIds: ['mahhee', 'saad'] }),
    mkItem('naan', 'Garlic Naan', 6, 72000, { kind: 'equal', participantIds: ALL }),
    mkItem('margarita', 'Mint Margarita', 3, 135000, {
      kind: 'units',
      entries: [
        { participantId: 'mahhee', units: 1 },
        { participantId: 'hamza', units: 1 },
        { participantId: 'saad', units: 1 },
      ],
    }),
    mkItem('doodh', 'Doodh Patti', 4, 88000, { kind: 'equal', participantIds: ALL }),
  ];
}

export function fixtureB(over: BillSeed = {}): Bill {
  return makeBill({
    id: 'fixture-b',
    restaurantName: 'Salt & Ember',
    date: '2026-11-02',
    participants: SEATS.map((s) => ({ ...s })),
    meParticipantId: 'mahhee',
    items: fixtureBItems(),
    adjustments: [
      cardDiscount('disc', 10, { rateBp: bp(2000) }),
      tax('tax', 30, { rateBp: bp(500), base: 'original' }),
    ],
    contributions: [{ participantId: 'hamza', amount: $(850000) }],
    ...over,
  });
}

/** Test money formatter: "Rs 1,806", "Rs 1,806.50", "−Rs 2,000" (U+2212). */
export const fm = (p: Paisa): string => {
  const n = Math.abs(p);
  const rupees = Math.trunc(n / 100);
  const paisa = n % 100;
  const grouped = String(rupees).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = 'Rs ' + grouped + (paisa ? '.' + String(paisa).padStart(2, '0') : '');
  return p < 0 ? '−' + body : body;
};
