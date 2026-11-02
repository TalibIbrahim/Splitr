import { describe, expect, it } from 'vitest';
import type { Paisa } from '@splitr/calculation-engine';
import { checkSum, parseQty, sumLineTotals } from './sums';

const p = (n: number) => n as Paisa;

describe('sums', () => {
  it('sumLineTotals adds paisa', () => {
    expect(sumLineTotals([{ lineTotal: p(320_000) }, { lineTotal: p(290_000) }, { lineTotal: p(-5) }])).toBe(609_995);
    expect(sumLineTotals([])).toBe(0);
  });
  it('checkSum reports remaining', () => {
    expect(checkSum([100, 200], 1000)).toEqual({ total: 300, remaining: 700, gap: 700 });
    expect(checkSum([600, 600], 1000)).toEqual({ total: 1200, remaining: -200, gap: 200 });
  });
  it('parseQty', () => {
    expect(parseQty('6')).toBe(6);
    expect(parseQty(' 12 ')).toBe(12);
    expect(parseQty('0')).toBeNull();
    expect(parseQty('')).toBeNull();
    expect(parseQty('1.5')).toBeNull();
    expect(parseQty('1000')).toBeNull();
  });
});
