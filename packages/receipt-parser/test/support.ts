import type { DraftItem, ReceiptDraft } from '@splitr/shared-types';
import type { Paisa } from '@splitr/calculation-engine';
import { parseReceipt } from '../src/index';
import { layout, type Cell, type LayoutOpts, type RowSpec } from './layout';

export const P = (n: number): Paisa => n as Paisa;

export function parse(rows: (Cell[] | RowSpec)[], opts?: LayoutOpts): ReceiptDraft {
  return parseReceipt(layout(rows, opts));
}

export function item(d: ReceiptDraft, i: number): DraftItem {
  const it = d.items[i];
  if (!it) throw new Error(`no item at ${i}: ${JSON.stringify(d.items)}`);
  return it;
}

export const names = (d: ReceiptDraft): string[] => d.items.map((i) => i.name);
export const unparsedText = (d: ReceiptDraft): string => d.unparsedRows.join('\n');
