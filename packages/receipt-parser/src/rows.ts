import type { OcrLine } from '@splitr/shared-types';

/** A visual row of the receipt: one or more OCR lines sharing a baseline (P1). */
export interface Row {
  /** Lines joined by a single space, left to right. */
  readonly text: string;
  /** Max x + width over the row's lines. */
  readonly right: number;
  /** Vertical centre of the row's first (left-most) line. */
  readonly centreY: number;
  /** Tallest line height in the row. */
  readonly height: number;
  /** Lowest confidence among the row's lines, if any line reports one. */
  readonly minConfidence?: number;
  readonly lines: readonly OcrLine[];
}

const centreOf = (l: OcrLine): number => l.frame.y + l.frame.height / 2;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Total order used so that shuffled input groups identically (P11). */
function compareLines(a: OcrLine, b: OcrLine): number {
  return (
    centreOf(a) - centreOf(b) ||
    a.frame.x - b.frame.x ||
    (a.text < b.text ? -1 : a.text > b.text ? 1 : 0) ||
    a.frame.width - b.frame.width ||
    a.frame.height - b.frame.height ||
    (a.confidence ?? -1) - (b.confidence ?? -1)
  );
}

/**
 * P1. Groups lines into rows. Two lines share a row when their vertical centres differ by at most
 * 0.5 x the median line height (measured against the row's first line). Rows run top to bottom, lines left to right.
 * Lines whose text is blank, or whose frame is not finite, are dropped.
 */
export function groupRows(lines: readonly OcrLine[]): Row[] {
  const usable = lines.filter(
    (l) =>
      l.text.trim() !== '' &&
      Number.isFinite(l.frame.x) &&
      Number.isFinite(l.frame.y) &&
      Number.isFinite(l.frame.width) &&
      Number.isFinite(l.frame.height),
  );
  if (usable.length === 0) return [];
  const threshold = 0.5 * median(usable.map((l) => l.frame.height));

  const sorted = [...usable].sort(compareLines);
  const groups: OcrLine[][] = [];
  let anchor = 0;
  for (const line of sorted) {
    const current = groups[groups.length - 1];
    if (current !== undefined && Math.abs(centreOf(line) - anchor) <= threshold) {
      current.push(line);
    } else {
      groups.push([line]);
      anchor = centreOf(line);
    }
  }

  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => a.frame.x - b.frame.x || compareLines(a, b));
    const confidences = ordered.flatMap((l) => (l.confidence === undefined ? [] : [l.confidence]));
    const first = ordered[0];
    return {
      text: ordered.map((l) => l.text.trim()).join(' '),
      right: Math.max(...ordered.map((l) => l.frame.x + l.frame.width)),
      centreY: first === undefined ? 0 : centreOf(first),
      height: Math.max(...ordered.map((l) => l.frame.height)),
      ...(confidences.length > 0 ? { minConfidence: Math.min(...confidences) } : {}),
      lines: ordered,
    };
  });
}
