/** Plain-words copy for card offers (docs/phase5-spec.md section 5). Pure; no UI. */
import type { AdjustmentId, NotAppliedReason } from '@splitr/calculation-engine';
import { offerToAdjustment, type OfferStatus } from '@splitr/bill-domain';
import type { CardOffer } from '@splitr/shared-types';
import { formatBp } from './percent';
import { formatMoney } from './format-money';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** Monday-first display order of the engine's 0 = Sun … 6 = Sat convention. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAY_LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'] as const;

/** "2026-12-31" -> "31 Dec 2026". */
export function formatLongDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** [1,2,3,4] -> "Mon–Thu"; [5] -> "Fri"; [1,3] -> "Mon, Wed"; all seven -> "Every day". */
export function weekdaysText(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size >= 7) return 'Every day';
  const runs: number[][] = [];
  for (const d of WEEK_ORDER) {
    if (!set.has(d)) continue;
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev !== undefined && WEEK_ORDER.indexOf(prev as (typeof WEEK_ORDER)[number]) + 1 === WEEK_ORDER.indexOf(d)) {
      last.push(d);
    } else runs.push([d]);
  }
  return runs
    .map((r) => {
      const a = DAY_SHORT[r[0] ?? 0];
      const b = DAY_SHORT[r[r.length - 1] ?? 0];
      if (r.length === 1) return a;
      return r.length === 2 ? `${a}, ${b}` : `${a}–${b}`;
    })
    .join(', ');
}

/** "25% off · up to Rs 2,500 · Mon–Thu · until 31 Dec 2026". */
export function offerSummary(o: CardOffer): string {
  const parts: string[] = [
    o.discount.type === 'percent' ? `${formatBp(o.discount.bp)}% off` : `${formatMoney(o.discount.amount)} off`,
  ];
  if (o.capPaisa !== undefined) parts.push(`up to ${formatMoney(o.capPaisa)}`);
  if (o.daysOfWeek && o.daysOfWeek.length > 0) parts.push(weekdaysText(o.daysOfWeek));
  if (o.validFrom && o.validTo) parts.push(`${formatLongDate(o.validFrom)} to ${formatLongDate(o.validTo)}`);
  else if (o.validTo) parts.push(`until ${formatLongDate(o.validTo)}`);
  else if (o.validFrom) parts.push(`from ${formatLongDate(o.validFrom)}`);
  return parts.join(' · ');
}

export function statusText(o: CardOffer, status: OfferStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'expired':
      return `Expired on ${o.validTo ? formatLongDate(o.validTo) : 'an unknown date'}`;
    case 'not-yet':
      return `Starts ${o.validFrom ? formatLongDate(o.validFrom) : 'later'}`;
    case 'unknown-validity':
      return 'No end date published';
  }
}

/** The engine's reason, in words. */
export function reasonText(reason: NotAppliedReason | undefined, o: CardOffer): string {
  switch (reason) {
    case 'outside-validity':
      return o.daysOfWeek && o.daysOfWeek.length > 0
        ? `Not valid today (${weekdaysText(o.daysOfWeek)} only)`
        : 'Not valid today';
    case 'below-minimum-spend':
      return o.minSpendPaisa !== undefined
        ? `Needs a bill of at least ${formatMoney(o.minSpendPaisa)}`
        : 'This bill is below the minimum spend';
    case 'no-eligible-items':
    case 'non-positive-base':
      return 'Nothing on this bill qualifies';
    default:
      return 'Would not save anything on this bill';
  }
}

export function sourceLine(o: CardOffer): string {
  return o.source.kind === 'published'
    ? `As published by ${o.bank} � checked ${formatLongDate(o.source.retrievedOn)}`
    : 'Added by you';
}

export const NOT_GUARANTEED = 'Not guaranteed. Confirm with the restaurant before paying.';
export const STALE_TEXT = 'This offer may have changed';

/** The offer label (as `offerToAdjustment` names it) matching an applied discount's label, if any. */
export function offerNameFor(discountLabels: readonly string[], offers: readonly CardOffer[]): string | undefined {
  const names = new Set(offers.map((o) => offerToAdjustment(o, 'label' as AdjustmentId).label));
  return discountLabels.find((l) => names.has(l));
}
