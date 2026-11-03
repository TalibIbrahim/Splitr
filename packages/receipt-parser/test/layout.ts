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

// ───────────────────────── visual-row layout (real-receipt fixtures, P20) ─────────────────────────
// A receipt is described once, as visual rows of cells. It can then be rendered in two OCR segmentations:
//   'merged' - one OcrLine per visual row (cells joined by a single space)
//   'cells'  - one OcrLine per column cell
export type Segmentation = 'merged' | 'cells';
export type VCell =
  | readonly [text: string, x: number]
  | readonly [text: string, x: number, o: { h?: number; dy?: number; conf?: number }];
/** gap = vertical distance from the previous row's centre: normal 1.5 x line height, wrap 1.3 x, section 2.2 x. */
export interface VRow {
  cells: readonly VCell[];
  gap: 'normal' | 'wrap' | 'section';
}
export const V = (...cells: VCell[]): VRow => ({ cells, gap: 'normal' });
/** Tight row: a wrapped name continuation directly below the previous row. */
export const Wrap = (...cells: VCell[]): VRow => ({ cells, gap: 'wrap' });
/** Row after a visible gap (new section of the receipt). */
export const Sec = (...cells: VCell[]): VRow => ({ cells, gap: 'section' });

export interface VisualOpts {
  /** Normal line height in px (default 20). */
  lh?: number;
  /** Px per character for line widths (default 10). */
  cw?: number;
  imageWidth?: number;
}

export function layoutVisual(rows: readonly VRow[], seg: Segmentation, opts: VisualOpts = {}): OcrResult {
  const lh = opts.lh ?? 20;
  const cw = opts.cw ?? 10;
  const mult = { normal: 1.5, wrap: 1.3, section: 2.2 } as const;
  const lines: OcrResult['lines'][number][] = [];
  let y = 2 * lh;
  rows.forEach((r, i) => {
    if (i > 0) y += mult[r.gap] * lh;
    const parsed = r.cells.map((c) => ({
      text: c[0],
      x: c[1],
      h: c.length === 3 ? (c[2].h ?? lh) : lh,
      dy: c.length === 3 ? (c[2].dy ?? 0) : 0,
      conf: c.length === 3 ? c[2].conf : undefined,
    }));
    if (seg === 'cells') {
      for (const c of parsed) {
        lines.push({
          text: c.text,
          frame: { x: c.x, y: y + c.dy - c.h / 2, width: c.text.length * cw, height: c.h },
          ...(c.conf !== undefined ? { confidence: c.conf } : {}),
        });
      }
    } else {
      const first = parsed[0];
      const last = parsed[parsed.length - 1];
      if (!first || !last) return;
      const h = Math.max(...parsed.map((c) => c.h));
      const conf = parsed.map((c) => c.conf).filter((c): c is number => c !== undefined);
      lines.push({
        text: parsed.map((c) => c.text).join(' '),
        frame: { x: first.x, y: y - h / 2, width: Math.max(cw, last.x + last.text.length * cw - first.x), height: h },
        ...(conf.length ? { confidence: Math.min(...conf) } : {}),
      });
    }
  });
  return { imageWidth: opts.imageWidth ?? 900, imageHeight: Math.round(y + 3 * lh), lines };
}
