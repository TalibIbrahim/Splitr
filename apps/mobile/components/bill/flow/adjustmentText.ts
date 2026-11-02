import type { Adjustment } from '@splitr/calculation-engine';
import { describeAdjustment } from '@splitr/bill-domain';
import { formatBp } from '../../../lib/percent';
import { formatMoney } from '../../../lib/format-money';

/** One-line plain-words summary of an existing adjustment (for the read-only list). */
export function adjustmentSummary(adj: Adjustment): { title: string; note: string } {
  const d = describeAdjustment(adj);
  switch (d.kind) {
    case 'cardDiscount':
      return {
        title: d.label,
        note: `${formatBp(d.rateBp)}% off the original bill${d.capPaisa !== undefined ? `, up to ${formatMoney(d.capPaisa)}` : ''}`,
      };
    case 'tax':
      return {
        title: d.label,
        note: `${formatBp(d.rateBp)}% ${d.base === 'original' ? 'on the original bill' : 'after discount'}`,
      };
    case 'serviceCharge':
      return { title: d.label, note: `${formatBp(d.rateBp)}% of the bill` };
    case 'tip':
      return { title: 'Tip', note: `${formatMoney(d.amount)}, split ${d.split === 'equal' ? 'equally' : 'in proportion'}` };
    case 'fee':
      return { title: d.label, note: formatMoney(d.amount) };
    case 'custom':
      return { title: adj.label, note: 'Custom charge. It is applied, but can only be removed here, not edited.' };
  }
}
