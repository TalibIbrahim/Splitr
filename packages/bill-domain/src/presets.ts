import type { Adjustment, AdjustmentId, BasisPoints, Paisa } from '@splitr/calculation-engine';

/** D3. Default application order per preset kind. */
export const defaultOrders = { discount: 10, serviceCharge: 20, tax: 30, tip: 40, fee: 50 } as const;

export function cardDiscount(
  id: AdjustmentId,
  order: number,
  p: { rateBp: BasisPoints; capPaisa?: Paisa; label?: string },
): Adjustment {
  return {
    id,
    label: p.label ?? 'Card discount',
    kind: 'discount',
    value: { type: 'rate', bp: p.rateBp },
    base: { type: 'items' },
    ...(p.capPaisa !== undefined ? { cap: p.capPaisa } : {}),
    order,
    allocation: { type: 'proportional' },
    source: 'user',
  };
}

export function tax(
  id: AdjustmentId,
  order: number,
  p: { rateBp: BasisPoints; base: 'original' | 'after-discounts'; label?: string },
): Adjustment {
  return {
    id,
    label: p.label ?? 'Tax',
    kind: 'tax',
    value: { type: 'rate', bp: p.rateBp },
    base: p.base === 'original' ? { type: 'items' } : { type: 'items-after', include: 'all-prior' },
    order,
    allocation: { type: 'proportional' },
    source: 'user',
  };
}

export function serviceCharge(
  id: AdjustmentId,
  order: number,
  p: { rateBp: BasisPoints; label?: string },
): Adjustment {
  return {
    id,
    label: p.label ?? 'Service charge',
    kind: 'serviceCharge',
    value: { type: 'rate', bp: p.rateBp },
    base: { type: 'items' },
    order,
    allocation: { type: 'proportional' },
    source: 'user',
  };
}

export function tip(
  id: AdjustmentId,
  order: number,
  p: { amount: Paisa; split: 'equal' | 'proportional' },
): Adjustment {
  return {
    id,
    label: 'Tip',
    kind: 'tip',
    value: { type: 'fixed', amount: p.amount },
    base: { type: 'items' },
    order,
    allocation: { type: p.split },
    source: 'user',
  };
}

export function fee(id: AdjustmentId, order: number, p: { amount: Paisa; label: string }): Adjustment {
  return {
    id,
    label: p.label,
    kind: 'fee',
    value: { type: 'fixed', amount: p.amount },
    base: { type: 'items' },
    order,
    allocation: { type: 'proportional' },
    source: 'user',
  };
}

export type PresetDescription =
  | { kind: 'cardDiscount'; rateBp: BasisPoints; capPaisa?: Paisa; label: string }
  | { kind: 'tax'; rateBp: BasisPoints; base: 'original' | 'after-discounts'; label: string }
  | { kind: 'serviceCharge'; rateBp: BasisPoints; label: string }
  | { kind: 'tip'; amount: Paisa; split: 'equal' | 'proportional' }
  | { kind: 'fee'; amount: Paisa; label: string }
  | { kind: 'custom' };

/** Fills in engine defaults so an adjustment written with or without them compares equal. */
function normalise(adj: Adjustment): unknown {
  return {
    ...adj,
    base: adj.base ?? { type: 'items' },
    allocation: adj.allocation ?? { type: 'proportional' },
    rounding: adj.rounding ?? 'half-up',
  };
}

/** Structural equality for plain JSON-like data; `undefined` properties count as absent. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) {
    if (!deepEqual(ra[k], rb[k])) return false;
  }
  return true;
}

function matches(adj: Adjustment, rebuilt: Adjustment): boolean {
  return deepEqual(normalise(adj), normalise(rebuilt));
}

/**
 * D3. Returns the preset kind and params when `adj` equals what a preset builder would produce
 * (ignoring nothing but defaults), otherwise `{ kind: 'custom' }`. Round-trips with the builders.
 */
export function describeAdjustment(adj: Adjustment): PresetDescription {
  const { id, order } = adj;
  const rateBp = adj.value.type === 'rate' ? adj.value.bp : undefined;
  const fixedAmount = adj.value.type === 'fixed' ? adj.value.amount : undefined;

  switch (adj.kind) {
    case 'discount': {
      if (rateBp === undefined) break;
      const capPaisa = adj.cap;
      const params = { rateBp, label: adj.label, ...(capPaisa !== undefined ? { capPaisa } : {}) };
      if (matches(adj, cardDiscount(id, order, params))) return { kind: 'cardDiscount', ...params };
      break;
    }
    case 'tax': {
      if (rateBp === undefined) break;
      const base = adj.base?.type === 'items-after' ? 'after-discounts' : 'original';
      const params = { rateBp, base, label: adj.label } as const;
      if (matches(adj, tax(id, order, params))) return { kind: 'tax', ...params };
      break;
    }
    case 'serviceCharge': {
      if (rateBp === undefined) break;
      const params = { rateBp, label: adj.label };
      if (matches(adj, serviceCharge(id, order, params))) return { kind: 'serviceCharge', ...params };
      break;
    }
    case 'tip': {
      if (fixedAmount === undefined) break;
      const split = adj.allocation?.type === 'equal' ? 'equal' : 'proportional';
      const params = { amount: fixedAmount, split } as const;
      if (matches(adj, tip(id, order, params))) return { kind: 'tip', ...params };
      break;
    }
    case 'fee': {
      if (fixedAmount === undefined) break;
      const params = { amount: fixedAmount, label: adj.label };
      if (matches(adj, fee(id, order, params))) return { kind: 'fee', ...params };
      break;
    }
    default:
      break;
  }
  return { kind: 'custom' };
}
