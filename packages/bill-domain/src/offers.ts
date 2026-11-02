/** Phase 5 — card-offer logic (docs/phase5-spec.md §3, O1–O5). Pure; savings come from the engine only. */
import {
  calculateBill,
  type Adjustment,
  type AdjustmentId,
  type NotAppliedReason,
  type Paisa,
} from '@splitr/calculation-engine';
import type { Bill, CardOffer } from '@splitr/shared-types';
import { cardDiscount, defaultOrders } from './presets';
import { toBillInput } from './bill-input';

const NOISE_WORDS = new Set(['restaurant', 'cafe', 'the', 'lahore', 'pvt', 'ltd']);

/** O1. Lowercase; strip `'s`, punctuation and noise words; collapse whitespace. */
export function normalizeRestaurant(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w !== '' && !NOISE_WORDS.has(w))
    .join(' ');
}

function nameMatches(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.includes(short);
}

/** O2. Offers whose restaurant matches `restaurantName`, ordered by bank then first card (then id). */
export function offersForRestaurant(offers: readonly CardOffer[], restaurantName: string): CardOffer[] {
  const target = normalizeRestaurant(restaurantName);
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return offers
    .filter((o) => nameMatches(normalizeRestaurant(o.restaurant), target))
    .sort(
      (a, b) =>
        cmp(a.bank, b.bank) || cmp(a.cardProducts[0] ?? '', b.cardProducts[0] ?? '') || cmp(a.id, b.id),
    );
}

export type OfferStatus = 'active' | 'expired' | 'not-yet' | 'unknown-validity';
export const STALE_AFTER_DAYS = 60;

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** O3. Validity status as of `todayIso` (YYYY-MM-DD), plus whether a published check is older than 60 days. */
export function offerStatus(offer: CardOffer, todayIso: string): { status: OfferStatus; stale: boolean } {
  let status: OfferStatus;
  if (offer.validTo !== undefined && offer.validTo < todayIso) status = 'expired';
  else if (offer.validFrom !== undefined && offer.validFrom > todayIso) status = 'not-yet';
  else if (offer.validFrom === undefined && offer.validTo === undefined) status = 'unknown-validity';
  else status = 'active';
  const stale =
    offer.source.kind === 'published' &&
    dayNumber(todayIso) - dayNumber(offer.source.retrievedOn) > STALE_AFTER_DAYS;
  return { status, stale };
}

/** O4. The offer as a `cardDiscount`-preset adjustment (base `items`; tax rules are left untouched). */
export function offerToAdjustment(offer: CardOffer, id: AdjustmentId): Adjustment {
  const card = offer.cardProducts[0];
  const label =
    card === undefined ? offer.bank : card.toLowerCase().startsWith(offer.bank.toLowerCase()) ? card : `${offer.bank} ${card}`;
  const order = defaultOrders.discount;
  const rules = {
    ...(offer.minSpendPaisa !== undefined ? { minimumSpend: offer.minSpendPaisa } : {}),
    ...(offer.validFrom !== undefined || offer.validTo !== undefined || offer.daysOfWeek !== undefined
      ? {
          validity: {
            ...(offer.validFrom !== undefined ? { from: offer.validFrom } : {}),
            ...(offer.validTo !== undefined ? { to: offer.validTo } : {}),
            ...(offer.daysOfWeek !== undefined ? { daysOfWeek: offer.daysOfWeek } : {}),
          },
        }
      : {}),
  };
  if (offer.discount.type === 'percent') {
    return {
      ...cardDiscount(id, order, {
        rateBp: offer.discount.bp,
        label,
        ...(offer.capPaisa !== undefined ? { capPaisa: offer.capPaisa } : {}),
      }),
      ...rules,
    };
  }
  return {
    id,
    label,
    kind: 'discount',
    value: { type: 'fixed', amount: offer.discount.amount },
    base: { type: 'items' },
    order,
    allocation: { type: 'proportional' },
    source: 'user',
    ...rules,
  };
}

export interface OfferComparison {
  offer: CardOffer;
  status: OfferStatus;
  stale: boolean;
  saving: Paisa;
  applied: boolean;
  reason?: NotAppliedReason;
}

const PLACEHOLDER_ID = '__offer-compare__';
const COMPARE_ADJUSTMENT_ID = '__offer-compare-adjustment__';

/**
 * O5 / O5a. What each offer would save on the bill, read from the engine's AdjustmentResult (no maths here).
 * Computed on a comparison copy: no contributions, printed totals or printed amounts, no transfer statuses;
 * existing discounts are replaced by the offer; every item goes to one placeholder participant (the discount
 * base and its proportional split do not depend on who ate what, so the saving is unchanged). The bill is not mutated.
 */
export function compareOffers(
  bill: Bill,
  offers: readonly CardOffer[],
  todayIso: string,
  options: { includeExpired?: boolean } = {},
): OfferComparison[] {
  const base = toBillInput(bill);
  const { printedSubtotal: _ps, printedTotal: _pt, ...rest } = base;
  void _ps;
  void _pt;
  const prepared = {
    ...rest,
    participants: [{ id: PLACEHOLDER_ID, displayName: 'Everyone' }],
    contributions: [],
    items: base.items.map((i) => ({
      ...i,
      assignment: { kind: 'equal' as const, participantIds: [PLACEHOLDER_ID] },
    })),
    adjustments: base.adjustments.map(({ printedAmount: _pa, ...a }) => {
      void _pa;
      return a;
    }),
  };
  const kept = prepared.adjustments.filter((a) => a.kind !== 'discount');

  const rows: OfferComparison[] = [];
  for (const offer of offers) {
    const { status, stale } = offerStatus(offer, todayIso);
    if (status === 'expired' && !options.includeExpired) continue;
    const adj = offerToAdjustment(offer, COMPARE_ADJUSTMENT_ID);
    const result = calculateBill({ ...prepared, adjustments: [...kept, adj] });
    const r = !result.ok ? undefined : result.breakdown.adjustments.find((a) => a.adjustmentId === COMPARE_ADJUSTMENT_ID);
    const applied = r?.applied ?? false;
    const saving = (applied && r ? -r.amount : 0) as Paisa;
    rows.push({
      offer,
      status,
      stale,
      saving,
      applied,
      ...(!applied && r?.notAppliedReason !== undefined ? { reason: r.notAppliedReason } : {}),
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.status === 'active') - Number(a.status === 'active') ||
      b.saving - a.saving ||
      (a.offer.id < b.offer.id ? -1 : a.offer.id > b.offer.id ? 1 : 0),
  );
}
