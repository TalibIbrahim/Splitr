import type { OcrResult } from '@splitr/shared-types';
import { layoutVisual, type Segmentation, type VisualOpts, type VRow } from '../../layout';

export interface ExpItem {
  name: string;
  quantity: number;
  /** paisa; omit when the receipt layout gives no per-unit rate (then the parser must not set one). */
  unitPrice?: number;
  lineTotal: number;
}
export interface ExpCharge {
  kind: 'tax' | 'service' | 'discount' | 'tip' | 'fee';
  amount: number;
  rateBp?: number;
  informational?: boolean;
}
export interface ExpVariant {
  taxes: ExpCharge[];
  discounts: ExpCharge[];
  printedTotal: number;
}
export interface Expected {
  /** Case-insensitive pattern the restaurant name must match. */
  restaurantName: RegExp;
  /** ISO date that the spec (P7) decides unambiguously, or undefined when the spec does not decide. */
  date?: string;
  /** ISO date under the PROPOSED ruling (see report: day-first with 1-digit parts / 2-digit slash year / month-first fallback). */
  rulingDate?: string;
  items: ExpItem[];
  printedSubtotal: number;
  /** For variant receipts: undefined (top-level printedTotal is not decided by the spec). */
  printedTotal?: number;
  /** Exact top-level charges (document order). Undefined for variant receipts where the spec leaves duplication open. */
  charges?: ExpCharge[];
  variants?: { card: ExpVariant; cash: ExpVariant };
  paidWith: 'card' | 'cash' | null;
  taxInclusive: boolean;
  /** Printed totals that must NOT be the final printedTotal and must be reported as unparsed (P8 / P17). */
  unparsedContains?: string[];
  /** All P10 checks must pass (receipt arithmetic is exact). */
  checksOk?: boolean;
  /** Header-area fragments; no item name may contain any of these (P13). */
  headerFragments: string[];
}
export interface RealFixture {
  name: string;
  merged: OcrResult;
  cells: OcrResult;
  expected: Expected;
}

export function makeFixture(name: string, rows: VRow[], opts: VisualOpts, expected: Expected): RealFixture {
  const build = (seg: Segmentation): OcrResult => layoutVisual(rows, seg, opts);
  return { name, merged: build('merged'), cells: build('cells'), expected };
}
