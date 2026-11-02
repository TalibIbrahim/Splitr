/** Integer sums for entry validation. Inputs are paisa / units / basis points, all safe integers. */
import { toPaisa, type Item, type Paisa } from '@splitr/calculation-engine';

export function sumLineTotals(items: readonly Pick<Item, 'lineTotal'>[]): Paisa {
  let total = 0;
  for (const it of items) total += it.lineTotal;
  return toPaisa(total);
}

/** Total of `values`, what is still missing (positive) or over (negative) against `target`, and that gap's size. */
export function checkSum(
  values: readonly number[],
  target: number,
): { total: number; remaining: number; gap: number } {
  let total = 0;
  for (const v of values) total += v;
  const remaining = target - total;
  return { total, remaining, gap: remaining < 0 ? -remaining : remaining };
}

/** Digits-only quantity ("6" -> 6). null when empty, not a whole number, zero, or above 999. */
export function parseQty(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = parseInt(s, 10);
  return n >= 1 ? n : null;
}
