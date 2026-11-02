import type {
  Adjustment,
  AdjustmentKind,
  AdjustmentValue,
  Assignment,
  BasisPoints,
  BillBreakdown,
  BillInput,
  CalculationResult,
  Contribution,
  Issue,
  Item,
  Paisa,
  Participant,
} from '../src/index';
import { calculateBill } from '../src/index';

/** Cast helpers (tests build typed fixtures without depending on the engine's constructors). */
export const $ = (n: number): Paisa => n as Paisa;
export const bp = (n: number): BasisPoints => n as BasisPoints;

export const people = (...ids: string[]): Participant[] =>
  ids.map((id) => ({ id, displayName: id.toUpperCase() }));

// ── assignments ──
export const NONE: Assignment = { kind: 'unassigned' };
export const eq = (...ids: string[]): Assignment => ({ kind: 'equal', participantIds: ids });
export const wts = (m: Record<string, number>): Assignment => ({
  kind: 'weights',
  entries: Object.entries(m).map(([participantId, weight]) => ({ participantId, weight })),
});
export const pct = (m: Record<string, number>): Assignment => ({
  kind: 'percent',
  entries: Object.entries(m).map(([participantId, v]) => ({ participantId, bp: bp(v) })),
});
export const amt = (m: Record<string, number>): Assignment => ({
  kind: 'amounts',
  entries: Object.entries(m).map(([participantId, v]) => ({ participantId, amount: $(v) })),
});
export const uni = (m: Record<string, number>): Assignment => ({
  kind: 'units',
  entries: Object.entries(m).map(([participantId, units]) => ({ participantId, units })),
});

export function item(
  id: string,
  lineTotal: number,
  assignment: Assignment,
  extra: { categories?: string[]; quantity?: number; unitPrice?: number; name?: string } = {},
): Item {
  return {
    id,
    name: extra.name ?? id,
    quantity: extra.quantity ?? 1,
    ...(extra.unitPrice !== undefined ? { unitPrice: $(extra.unitPrice) } : {}),
    lineTotal: $(lineTotal),
    categories: extra.categories ?? [],
    assignment,
    source: 'receipt',
  };
}

// ── adjustments ──
export const rate = (n: number): AdjustmentValue => ({ type: 'rate', bp: bp(n) });
export const fixed = (n: number): AdjustmentValue => ({ type: 'fixed', amount: $(n) });

type AdjExtra = Partial<Omit<Adjustment, 'id' | 'kind' | 'value' | 'cap' | 'minimumSpend' | 'printedAmount' | 'override'>> & {
  cap?: number;
  minimumSpend?: number;
  printedAmount?: number;
  override?: { amount: number; reason: string };
};

export function adj(id: string, kind: AdjustmentKind, value: AdjustmentValue, extra: AdjExtra = {}): Adjustment {
  const { cap, minimumSpend, printedAmount, override, ...rest } = extra;
  return {
    id,
    label: id,
    kind,
    value,
    order: 1,
    source: 'receipt',
    ...rest,
    ...(cap !== undefined ? { cap: $(cap) } : {}),
    ...(minimumSpend !== undefined ? { minimumSpend: $(minimumSpend) } : {}),
    ...(printedAmount !== undefined ? { printedAmount: $(printedAmount) } : {}),
    ...(override !== undefined ? { override: { amount: $(override.amount), reason: override.reason } } : {}),
  };
}

export const paid = (m: Record<string, number>): Contribution[] =>
  Object.entries(m).map(([participantId, a]) => ({ participantId, amount: $(a) }));

export function bill(
  o: Partial<Omit<BillInput, 'currency' | 'settlementRoundingUnit' | 'printedSubtotal' | 'printedTotal'>> & {
    unit?: number;
    printedSubtotal?: number;
    printedTotal?: number;
  },
): BillInput {
  const { unit, printedSubtotal, printedTotal, ...rest } = o;
  return {
    currency: 'PKR',
    participants: [],
    items: [],
    adjustments: [],
    contributions: [],
    ...rest,
    ...(unit !== undefined ? { settlementRoundingUnit: $(unit) } : {}),
    ...(printedSubtotal !== undefined ? { printedSubtotal: $(printedSubtotal) } : {}),
    ...(printedTotal !== undefined ? { printedTotal: $(printedTotal) } : {}),
  };
}

// ── result access ──
export function mustOk(input: BillInput): { breakdown: BillBreakdown; warnings: readonly Issue[] } {
  const r: CalculationResult = calculateBill(input);
  if (!r.ok) {
    throw new Error(`expected ok result, got errors: ${JSON.stringify(r.errors.map((e) => [e.code, e.rule, e.message]))}`);
  }
  return r;
}

export function mustFail(input: BillInput): { errors: readonly Issue[]; warnings: readonly Issue[] } {
  const r = calculateBill(input);
  if (r.ok) throw new Error('expected failure, got ok');
  return r;
}

export const codes = (issues: readonly Issue[]): string[] => issues.map((i) => i.code).sort();

export function exactTotals(b: BillBreakdown): Record<string, number> {
  return Object.fromEntries(b.participants.map((p) => [p.participantId, p.exactTotal as number]));
}
export function roundedTotals(b: BillBreakdown): Record<string, number> {
  return Object.fromEntries(b.participants.map((p) => [p.participantId, p.roundedTotal as number]));
}
export function adjAmounts(b: BillBreakdown): Record<string, number> {
  return Object.fromEntries(b.adjustments.map((a) => [a.adjustmentId, a.amount as number]));
}
export function allocationsOf(b: BillBreakdown, adjustmentId: string): Record<string, number> {
  const a = b.adjustments.find((x) => x.adjustmentId === adjustmentId);
  if (!a) throw new Error(`no adjustment ${adjustmentId}`);
  return Object.fromEntries(a.allocations.map((x) => [x.participantId, x.amount as number]));
}
/** itemId -> participantId -> amount */
export function itemShares(b: BillBreakdown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const p of b.participants) {
    for (const it of p.items) {
      (out[it.itemId] ??= {})[p.participantId] = it.amount as number;
    }
  }
  return out;
}

/** R11.1, written independently of the engine. */
export function roundedBillTotal(T: number, u: number): number {
  const t = BigInt(T);
  const unit = BigInt(u);
  const two = 2n * unit;
  const num = 2n * t + unit;
  // floor division for possibly negative numerators
  let q = num / two;
  if (num % two !== 0n && num < 0n) q -= 1n;
  return Number(unit * q);
}

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Drops zero entries so that "absent" and "0" compare equal. */
export function nz<T extends Record<string, number>>(o: T): Record<string, number> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));
}
export function nzNested(o: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nz(v)]).filter(([, v]) => Object.keys(v as object).length > 0));
}
