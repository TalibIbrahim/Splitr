/**
 * Loose view of a parsed draft so the v2 tests compile before and after the shared-types change
 * (variants / paidWith / taxInclusive / informational / 'fee' are optional additions, docs/phase2b-spec.md section 2).
 */
import type { OcrResult } from '@splitr/shared-types';
import { parseReceipt } from '../src/index';
import { layout, type Cell, type LayoutOpts, type RowSpec } from './layout';

export interface LooseCharge {
  kind: string;
  label: string;
  amount: number;
  rateBp?: number;
  informational?: boolean;
}
export interface LooseVariant {
  taxes: LooseCharge[];
  discounts: LooseCharge[];
  printedTotal?: number;
}
export interface LooseItem {
  name: string;
  quantity: number;
  unitPrice?: number;
  lineTotal: number;
  flags: string[];
}
export interface LooseDraft {
  restaurantName?: string;
  date?: string;
  items: LooseItem[];
  printedSubtotal?: number;
  printedTotal?: number;
  charges: LooseCharge[];
  variants?: { card: LooseVariant; cash: LooseVariant };
  paidWith?: 'card' | 'cash' | null;
  taxInclusive?: boolean;
  checks: { kind: string; ok: boolean; expected: number; actual: number; difference: number }[];
  unparsedRows: string[];
}

export const parseLoose = (ocr: OcrResult): LooseDraft => parseReceipt(ocr) as unknown as LooseDraft;
export const parseRows = (rows: (Cell[] | RowSpec)[], opts?: LayoutOpts): LooseDraft => parseLoose(layout(rows, opts));
export const itemNames = (d: LooseDraft): string[] => d.items.map((i) => i.name);
