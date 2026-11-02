import { describe, expect, it } from 'vitest';
import { isIsoDate, shiftDay, todayIso } from './date';

describe('date helpers', () => {
  it('todayIso formats local date', () => {
    expect(todayIso(new Date(2026, 10, 2, 23, 30))).toBe('2026-11-02');
  });
  it('isIsoDate', () => {
    expect(isIsoDate('2026-11-02')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('26-11-02')).toBe(false);
  });
  it('shiftDay crosses month/year boundaries', () => {
    expect(shiftDay('2026-11-02', -1)).toBe('2026-11-01');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDay('nope', 1)).toBe('nope');
  });
});
