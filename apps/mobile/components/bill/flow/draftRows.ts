import { parseRupees } from '@splitr/bill-domain';
import type { DraftFlag, DraftItem, ReceiptDraft } from '@splitr/shared-types';
import { toRupeeInputText } from '../../../lib/format-money';
import { parseQty } from '../../../lib/sums';

/** One editable line of the review screen: raw text the user can type into, plus the draft item it came from. */
export interface DraftRow {
  key: string;
  name: string;
  qty: string;
  amount: string;
  src: DraftItem | null;
  /** The user changed name, quantity or amount, so the "check this" warning no longer applies. */
  touched: boolean;
}

export function rowFromItem(key: string, item: DraftItem): DraftRow {
  return {
    key,
    name: item.name,
    qty: String(item.quantity),
    amount: toRupeeInputText(item.lineTotal),
    src: item,
    touched: false,
  };
}

export function blankRow(key: string, name = ''): DraftRow {
  return { key, name, qty: '1', amount: '', src: null, touched: true };
}

export interface RowIssues {
  name?: string;
  amount?: string;
  qty?: string;
}

export function rowValid(r: DraftRow): boolean {
  return r.name.trim().length > 0 && parseQty(r.qty) !== null && parseRupees(r.amount).ok;
}

const FLAG_TEXT: Record<DraftFlag, string> = {
  arithmetic: 'qty × price ≠ amount',
  quantity: 'quantity looked wrong',
  name: 'name unreadable',
  'ocr-confidence': 'the photo was hard to read here',
};

/** Plain-words reasons to double-check a row; empty when the row is fine or the user already edited it. */
export function rowReasons(r: DraftRow): string[] {
  if (r.touched || !r.src || r.src.confidence === 'high') return [];
  return r.src.flags.map((f) => FLAG_TEXT[f]);
}

export function needsCheck(r: DraftRow): boolean {
  return !r.touched && r.src !== null && r.src.confidence === 'low';
}

/** Draft item for a valid row; null when the text is not yet valid. An edited row loses its unit price and flags. */
export function itemFromRow(r: DraftRow): DraftItem | null {
  const qty = parseQty(r.qty);
  const amount = parseRupees(r.amount);
  const name = r.name.trim();
  if (qty === null || !amount.ok || name.length === 0) return null;
  if (r.src && !r.touched) {
    return { ...r.src, name, quantity: qty, lineTotal: amount.paisa };
  }
  return {
    name,
    quantity: qty,
    lineTotal: amount.paisa,
    confidence: 'high',
    flags: [],
    sourceText: r.src?.sourceText ?? name,
  };
}

/** The draft the user is working on: valid rows only. */
export function workingDraft(base: ReceiptDraft, rows: readonly DraftRow[]): ReceiptDraft {
  const items: DraftItem[] = [];
  for (const r of rows) {
    const it = itemFromRow(r);
    if (it) items.push(it);
  }
  return { ...base, items };
}
