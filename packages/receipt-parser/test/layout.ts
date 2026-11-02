/**
 * Test fixture helper: turns a column layout spec into an OcrResult with deterministic frames.
 * Written from docs/phase2-spec.md §2 only.
 */
import type { OcrResult } from '@splitr/shared-types';

export interface Cell {
  text: string;
  /** Left edge in pixels. */
  x: number;
  /** Default: 10 px per character. */
  width?: number;
  /** Extra vertical offset (px) for this one line: baseline jitter. */
  dy?: number;
  /** Overrides the row/global line height for this line. */
  height?: number;
  confidence?: number;
}

export interface RowSpec {
  cells: Cell[];
  /** Line height for every cell of the row (default: opts.lineHeight). */
  height?: number;
}

export interface LayoutOpts {
  lineHeight?: number; // default 20
  pitch?: number; // distance between row tops, default 40
  top?: number; // default 30
  imageWidth?: number; // default 800
  /** Max abs deterministic pseudo-random vertical jitter (px, integer) applied to every line. */
  jitter?: number;
  seed?: number;
  /** Confidence applied to every line that has none of its own. */
  confidence?: number;
}

/** Tiny deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function layout(rows: (Cell[] | RowSpec)[], opts: LayoutOpts = {}): OcrResult {
  const lh = opts.lineHeight ?? 20;
  const pitch = opts.pitch ?? 40;
  const top = opts.top ?? 30;
  const rnd = prng(opts.seed ?? 1);
  const lines: OcrResult['lines'][number][] = [];
  rows.forEach((row, i) => {
    const spec: RowSpec = Array.isArray(row) ? { cells: row } : row;
    for (const c of spec.cells) {
      const h = c.height ?? spec.height ?? lh;
      const jit = opts.jitter ? Math.round((rnd() * 2 - 1) * opts.jitter) : 0;
      // vertical centre of the row is top + i*pitch + lh/2 so that mixed heights share one centre line.
      const centre = top + i * pitch + lh / 2 + jit + (c.dy ?? 0);
      const conf = c.confidence ?? opts.confidence;
      lines.push({
        text: c.text,
        frame: { x: c.x, y: centre - h / 2, width: c.width ?? c.text.length * 10, height: h },
        ...(conf !== undefined ? { confidence: conf } : {}),
      });
    }
  });
  return { imageWidth: opts.imageWidth ?? 800, imageHeight: top + rows.length * pitch + 40, lines };
}

/** Column x positions used by the row shorthands. */
export const COL = { name: 20, qty: 20, nameAfterQty: 70, unit: 470, line: 620 } as const;

/** `row('Karahi', '1,850')` -> name at the left, amounts right-aligned in columns (last one = line column). */
export function row(name: string, ...amounts: string[]): Cell[] {
  const xs = amounts.length === 1 ? [COL.line] : amounts.length === 2 ? [COL.unit, COL.line] : [320, COL.unit, COL.line];
  const cells: Cell[] = [{ text: name, x: COL.name }];
  amounts.forEach((a, i) => cells.push({ text: a, x: xs[i] ?? COL.line }));
  return cells;
}

/** Row with a separate quantity column: qty | name | unit | line. */
export function qtyRow(qty: string, name: string, ...amounts: string[]): Cell[] {
  const cells: Cell[] = [
    { text: qty, x: COL.qty },
    { text: name, x: COL.nameAfterQty },
  ];
  const xs = amounts.length === 1 ? [COL.line] : [COL.unit, COL.line];
  amounts.forEach((a, i) => cells.push({ text: a, x: xs[i] ?? COL.line }));
  return cells;
}

export const one = (text: string, x = 20): Cell[] => [{ text, x }];

/** Deterministic Fisher-Yates shuffle. */
export function shuffled<T>(arr: readonly T[], seed: number): T[] {
  const rnd = prng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}
