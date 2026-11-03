import type { Paisa } from '@splitr/calculation-engine';
import type { AmountToken } from './amounts';

/** A numeric column of an item-table header (P13). */
export type ColumnKind = 'qty' | 'rate' | 'tax' | 'amount';

export interface ColumnHeader {
  /** Numeric columns, left to right. */
  readonly columns: readonly ColumnKind[];
  /** The first column is an item code column (`c.no`, `s.no`, `sr`, `code`, `#`), P15. */
  readonly codeColumn: boolean;
}

const HEADER_WORD =
  /(?<![\p{L}\d])(item description|item name|quantity|description|amount|amoun|qty|rate|price|value|total|tax\s*%|gst)(?![\p{L}\d])/giu;
const CODE_COLUMN = /^\s*(?:c\.?\s*no|s\.?\s*no|sr\.?(?:\s*no)?|code|#)(?![\p{L}])/iu;

const COLUMN_OF: Readonly<Record<string, ColumnKind | undefined>> = {
  qty: 'qty',
  quantity: 'qty',
  rate: 'rate',
  price: 'rate',
  gst: 'tax',
  amount: 'amount',
  amoun: 'amount',
  value: 'amount',
  total: 'amount',
};

/** P13. Returns the column header described by `text`, or undefined when the row is not one. Rows with amounts never qualify. */
export function parseColumnHeader(text: string, hasAmounts: boolean): ColumnHeader | undefined {
  if (hasAmounts) return undefined;
  const words = [...text.matchAll(HEADER_WORD)].map((m) => (m[1] ?? '').toLowerCase().replace(/\s+/g, ' '));
  if (words.length < 2) return undefined;
  const columns: ColumnKind[] = [];
  for (const w of words) {
    const kind = w.startsWith('tax') ? 'tax' : COLUMN_OF[w];
    // Two amount-like words in a row are one column ("Total Amount"); tax% and gst are two columns.
    if (kind !== undefined && !(kind === 'amount' && columns[columns.length - 1] === 'amount')) columns.push(kind);
  }
  return { columns, codeColumn: CODE_COLUMN.test(text) };
}

/** P14. An amount-shaped token or a percentage, in a row's text. */
export interface NumericToken {
  readonly start: number;
  readonly end: number;
  /** Set for amount-shaped tokens; undefined for percentages. */
  readonly amount?: AmountToken;
}

/** P14. Amount tokens plus percentages, left to right. */
export function numericTokens(text: string, amounts: readonly AmountToken[]): NumericToken[] {
  const out: NumericToken[] = amounts.map((a) => ({ start: a.start, end: a.end, amount: a }));
  for (const m of text.matchAll(/\d{1,3}(?:\.\d*)?\s*%/g)) {
    const start = m.index ?? 0;
    out.push({ start, end: start + m[0].length });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** P14. A quantity written as an integer or with an all-zero fraction (`1`, `2.0`, `3.00`): the value in whole units. */
export function quantityOf(value: Paisa): number | undefined {
  if (value % 100 !== 0) return undefined;
  const q = value / 100;
  return q >= 1 && q <= 999 ? q : undefined;
}
