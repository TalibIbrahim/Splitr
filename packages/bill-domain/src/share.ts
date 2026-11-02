import type { BillBreakdown, Paisa } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { isTransferPaid } from './transfers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2026-11-02" -> "2 Nov" (string parsing only; no Date, no locale). */
function shortDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  const month = MONTHS[Number(m) - 1];
  if (month === undefined || d === undefined) return isoDate;
  return `${Number(d)} ${month}`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** D10. Plain-text WhatsApp summary. Amounts are the rounded ones; paid markers come from `transferStatuses`. */
export function shareSummary(
  bill: Bill,
  breakdown: BillBreakdown,
  opts: { formatMoney: (p: Paisa) => string },
): string {
  const fm = opts.formatMoney;
  const nameOf = (id: string): string => bill.participants.find((p) => p.id === id)?.displayName ?? id;

  const lines: string[] = [];
  lines.push(`${bill.restaurantName} · ${shortDate(bill.date)}`);

  const parts = breakdown.adjustments
    .filter((a) => a.amount !== 0)
    .map((a) => `${lowerFirst(a.label)} ${a.amount > 0 ? '+' : ''}${fm(a.amount)}`);
  lines.push(`Total ${fm(breakdown.roundedTotal)}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`);
  lines.push('');

  const width = bill.participants.reduce((w, p) => Math.max(w, p.displayName.length), 0) + 3;
  for (const p of bill.participants) {
    const share = breakdown.participants.find((b) => b.participantId === p.id);
    if (!share) continue;
    const paid = bill.contributions.some((c) => c.participantId === p.id && c.amount > 0);
    lines.push(`${p.displayName.padEnd(width)}${fm(share.roundedTotal)}${paid ? '  (paid)' : ''}`);
  }

  const transfers = breakdown.settlement?.transfers ?? [];
  if (transfers.length > 0) {
    const creditors: string[] = [];
    for (const t of transfers) if (!creditors.includes(t.to)) creditors.push(t.to);
    for (const creditor of creditors) {
      lines.push('');
      lines.push(`Pay ${nameOf(creditor)}:`);
      for (const t of transfers.filter((x) => x.to === creditor)) {
        lines.push(`• ${nameOf(t.from)} → ${fm(t.amount)}${isTransferPaid(bill, t) ? ' ✓' : ''}`);
      }
    }
  }

  lines.push('');
  lines.push('Split with splitr.');
  return lines.join('\n');
}
