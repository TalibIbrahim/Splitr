import { calculateBill } from '@splitr/calculation-engine';
import type { Adjustment, BasisPoints, BillInput, Item, Paisa } from '@splitr/calculation-engine';
import type { DraftCharge, ReceiptCheck, ReceiptDraft } from '@splitr/shared-types';
import { cardDiscount, defaultOrders, fee, serviceCharge, tax, tip } from './presets';

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

interface EffectiveCharges {
  charges: { list: readonly DraftCharge[]; variantCharges: readonly DraftCharge[] };
  printedTotal: Paisa | undefined;
  /** The variant that was used, when the draft has variants. */
  side: 'card' | 'cash' | undefined;
}

/** P18: the draft's own charges plus the chosen variant's taxes and discounts. */
function effectiveCharges(draft: ReceiptDraft, paidWith: 'card' | 'cash' | undefined): EffectiveCharges {
  if (draft.variants === undefined) {
    return { charges: { list: draft.charges, variantCharges: [] }, printedTotal: draft.printedTotal, side: undefined };
  }
  const side = paidWith ?? draft.paidWith ?? 'card';
  const variant = draft.variants[side];
  const variantCharges = [...(variant?.taxes ?? []), ...(variant?.discounts ?? [])];
  return {
    charges: { list: [...draft.charges, ...variantCharges], variantCharges },
    printedTotal: variant?.printedTotal ?? draft.printedTotal,
    side,
  };
}

/** "Using the card price: 5% GST". */
function variantNote(side: 'card' | 'cash', variantCharges: readonly DraftCharge[]): string {
  const parts = variantCharges.map((c) => {
    const base = c.label.replace(/\d+(?:\.\d*)?\s*%/, '').replace(/^[\s:;,@=.-]+|[\s:;,@=.-]+$/g, '');
    const name = base === '' ? (c.kind === 'tax' ? 'tax' : 'discount') : base;
    return c.rateBp !== undefined ? `${pct(c.rateBp)} ${name}` : name;
  });
  return `Using the ${side} price${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`;
}

/**
 * Recomputes the P10 checks for the chosen payment variant. Items-vs-subtotal and line-arithmetic are unchanged;
 * summary-vs-total uses that variant's taxes, discounts and printed total. Informational (tax-inclusive) taxes are
 * left out of the sum. Without variants this is `draft.checks`.
 */
export function draftChecks(draft: ReceiptDraft, paidWith?: 'card' | 'cash'): ReceiptCheck[] {
  if (draft.variants === undefined) return [...draft.checks];
  const { charges, printedTotal } = effectiveCharges(draft, paidWith);
  const kept = draft.checks.filter((c) => c.kind !== 'summary-vs-total');
  if (printedTotal === undefined) return kept;
  const by = (k: DraftCharge['kind']): number =>
    charges.list.filter((c) => c.kind === k && c.informational !== true).reduce((a, c) => a + c.amount, 0);
  const itemsSum = draft.items.reduce((a, i) => a + i.lineTotal, 0);
  const base = draft.taxInclusive === true ? itemsSum : (draft.printedSubtotal ?? itemsSum);
  const computed = base - by('discount') + by('tax') + by('service') + by('tip') + by('fee');
  const summary: ReceiptCheck = {
    kind: 'summary-vs-total',
    ok: computed === printedTotal,
    expected: printedTotal,
    actual: computed as Paisa,
    difference: (computed - printedTotal) as Paisa,
  };
  const at = kept.findIndex((c) => c.kind === 'line-arithmetic');
  return at === -1 ? [...kept, summary] : [...kept.slice(0, at), summary, ...kept.slice(at)];
}

const KIND_ORDER: Record<DraftCharge['kind'], number> = { discount: 0, service: 1, tax: 2, tip: 3, fee: 4 };

/**
 * Phase 2 section 5. Turns a parsed receipt into bill fields: items, printed totals and adjustments.
 * Rate-based charges use a D3 preset only when the engine reproduces the printed amount exactly;
 * otherwise the printed amount is used as a fixed adjustment and a note says so.
 * `newId` is called once per item (in order), then once per charge (in draft order).
 */
export function draftToBillPatch(
  draft: ReceiptDraft,
  newId: () => string,
  opts?: { paidWith?: 'card' | 'cash' },
): BillPatch {
  const notes: string[] = [];
  const { charges: allCharges, printedTotal, side } = effectiveCharges(draft, opts?.paidWith);
  if (side !== undefined) notes.push(variantNote(side, allCharges.variantCharges));
  if (allCharges.list.some((c) => c.informational === true)) notes.push('Prices already include tax');
  const charges = allCharges.list.filter((c) => c.informational !== true);

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

  const ids = charges.map(() => newId());
  const resolved = new Map<number, Adjustment>();
  // Resolve discount, service, tax, tip so each tax/service base search sees the adjustments it may include.
  const sequence = charges
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

    if (c.kind === 'fee') {
      adj = { ...fee(id, defaultOrders.fee, { amount: c.amount, label: c.label }), source: 'receipt' };
    } else if (c.kind === 'tip') {
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

  const adjustments = charges.map((_, i) => resolved.get(i)).filter((a): a is Adjustment => a !== undefined);

  // P21: a receipt that rounds to whole rupees gets a visible rounding line for a gap under Rs 1.
  if (printedTotal !== undefined && printedTotal % 100 === 0) {
    const input: BillInput = {
      currency: 'PKR',
      participants: [{ id: PLACEHOLDER, displayName: '' }],
      items: items.map((i) => ({ ...i, assignment: { kind: 'equal', participantIds: [PLACEHOLDER] } })),
      adjustments,
      contributions: [],
    };
    const result = calculateBill(input);
    if (result.ok) {
      const diff = result.breakdown.total - printedTotal;
      if (diff !== 0 && Math.abs(diff) < 100) {
        const amount = Math.abs(diff) as Paisa;
        adjustments.push({
          id: newId(),
          label: 'Receipt rounding',
          kind: 'custom',
          direction: diff > 0 ? 'subtract' : 'add',
          value: { type: 'fixed', amount },
          base: { type: 'items' },
          order: defaultOrders.fee + 10,
          allocation: { type: 'proportional' },
          source: 'reconciliation',
        });
        notes.push(`The receipt rounds to whole rupees, so a rounding line of ${rs(amount)} was added`);
      }
    }
  }

  return {
    items,
    // Tax-inclusive receipts print a subtotal that is lower than the item prices; copying it would block the bill forever.
    ...(draft.printedSubtotal !== undefined && draft.taxInclusive !== true ? { printedSubtotal: draft.printedSubtotal } : {}),
    ...(printedTotal !== undefined ? { printedTotal } : {}),
    adjustments,
    notes,
  };
}
