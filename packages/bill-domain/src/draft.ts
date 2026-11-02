import { calculateBill } from '@splitr/calculation-engine';
import type { Adjustment, BasisPoints, BillInput, Item, Paisa } from '@splitr/calculation-engine';
import type { DraftCharge, ReceiptDraft } from '@splitr/shared-types';
import { cardDiscount, defaultOrders, serviceCharge, tax, tip } from './presets';

export interface BillPatch {
  items: Item[];
  printedSubtotal?: Paisa;
  printedTotal?: Paisa;
  adjustments: Adjustment[];
  notes: string[];
}

/** Order of the explicit tax adjustment that includes service (just after service at 35). */
const EXPLICIT_TAX_ORDER = 36;
const PLACEHOLDER = '__draft-participant__';

/** "Rs 340" / "Rs 1,234.50": integer maths only. */
function rs(paisa: number): string {
  const abs = Math.abs(paisa);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = abs % 100;
  return `Rs ${whole}${frac === 0 ? '' : `.${String(frac).padStart(2, '0')}`}`;
}

/** 1600 -> "16%", 1650 -> "16.5%". */
function pct(bp: number): string {
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return `${String(whole)}%`;
  return `${String(whole)}.${String(frac).padStart(2, '0').replace(/0$/, '')}%`;
}

/** Magnitude the engine computes for `candidate`, given already-resolved adjustments; null if it can't be determined. */
function engineMagnitude(items: readonly Item[], prior: readonly Adjustment[], candidate: Adjustment): Paisa | null {
  const input: BillInput = {
    currency: 'PKR',
    participants: [{ id: PLACEHOLDER, displayName: '' }],
    items: items.map((i) => ({ ...i, assignment: { kind: 'equal', participantIds: [PLACEHOLDER] } })),
    adjustments: [...prior, candidate],
    contributions: [],
  };
  const result = calculateBill(input);
  if (!result.ok) return null;
  const r = result.breakdown.adjustments.find((a) => a.adjustmentId === candidate.id);
  if (r === undefined || !r.applied) return null;
  return Math.abs(r.amount) as Paisa;
}

const KIND_ORDER: Record<DraftCharge['kind'], number> = { discount: 0, service: 1, tax: 2, tip: 3 };

/**
 * Phase 2 section 5. Turns a parsed receipt into bill fields: items, printed totals and adjustments.
 * Rate-based charges use a D3 preset only when the engine reproduces the printed amount exactly;
 * otherwise the printed amount is used as a fixed adjustment and a note says so.
 * `newId` is called once per item (in order), then once per charge (in draft order).
 */
export function draftToBillPatch(draft: ReceiptDraft, newId: () => string): BillPatch {
  const notes: string[] = [];

  const items: Item[] = draft.items.map((d) => {
    const consistent = d.unitPrice !== undefined && d.quantity * d.unitPrice === d.lineTotal;
    return {
      id: newId(),
      name: d.name,
      quantity: d.quantity,
      ...(consistent && d.unitPrice !== undefined ? { unitPrice: d.unitPrice } : {}),
      lineTotal: d.lineTotal,
      categories: [],
      assignment: { kind: 'unassigned' },
      source: 'receipt',
    };
  });

  const ids = draft.charges.map(() => newId());
  const resolved = new Map<number, Adjustment>();
  // Resolve discount, service, tax, tip so each tax/service base search sees the adjustments it may include.
  const sequence = draft.charges
    .map((c, i) => ({ c, i }))
    .sort((a, b) => KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind] || a.i - b.i);

  const fixed = (c: DraftCharge, id: string): Adjustment => ({
    id,
    label: c.label,
    kind: c.kind === 'service' ? 'serviceCharge' : c.kind,
    value: { type: 'fixed', amount: c.amount },
    base: { type: 'items' },
    order: c.kind === 'service' ? defaultOrders.serviceCharge : defaultOrders[c.kind],
    allocation: { type: 'proportional' },
    source: 'receipt',
  });

  for (const { c, i } of sequence) {
    const id = ids[i] ?? newId();
    const prior = [...resolved.values()];
    const rate = c.rateBp as BasisPoints | undefined;
    let adj: Adjustment | undefined;

    if (c.kind === 'tip') {
      adj = { ...tip(id, defaultOrders.tip, { amount: c.amount, split: 'proportional' }) };
    } else if (rate === undefined) {
      adj = fixed(c, id);
    } else {
      const idsOf = (kind: Adjustment['kind']): string[] =>
        [...resolved.values()].filter((r) => r.kind === kind).map((r) => r.id);
      const withBase = (adj: Adjustment, order: number, include: string[]): Adjustment => ({
        ...adj,
        order,
        base: { type: 'items-after', include },
      });
      // Section 5a: the first candidate whose computed magnitude equals the printed amount wins.
      const candidates: Adjustment[] =
        c.kind === 'discount'
          ? [cardDiscount(id, defaultOrders.discount, { rateBp: rate, label: c.label })]
          : c.kind === 'service'
            ? [
                serviceCharge(id, defaultOrders.serviceCharge, { rateBp: rate, label: c.label }),
                withBase(
                  serviceCharge(id, defaultOrders.serviceCharge, { rateBp: rate, label: c.label }),
                  defaultOrders.serviceCharge,
                  idsOf('discount'),
                ),
              ]
            : [
                tax(id, defaultOrders.tax, { rateBp: rate, base: 'original', label: c.label }),
                tax(id, defaultOrders.tax, { rateBp: rate, base: 'after-discounts', label: c.label }),
                withBase(
                  tax(id, defaultOrders.tax, { rateBp: rate, base: 'original', label: c.label }),
                  EXPLICIT_TAX_ORDER,
                  [...idsOf('discount'), ...idsOf('serviceCharge')],
                ),
              ];
      const match = candidates.find((cand) => engineMagnitude(items, prior, cand) === c.amount);
      if (match !== undefined) {
        adj = { ...match, printedAmount: c.amount };
      } else {
        adj = fixed(c, id);
        notes.push(
          `${c.label} printed as ${rs(c.amount)}; ${pct(rate)} didn't reproduce it exactly, so the printed amount is used`,
        );
      }
    }
    resolved.set(i, adj);
  }

  const adjustments = draft.charges.map((_, i) => resolved.get(i)).filter((a): a is Adjustment => a !== undefined);

  return {
    items,
    ...(draft.printedSubtotal !== undefined ? { printedSubtotal: draft.printedSubtotal } : {}),
    ...(draft.printedTotal !== undefined ? { printedTotal: draft.printedTotal } : {}),
    adjustments,
    notes,
  };
}
