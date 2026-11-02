import { describe, expect, it } from 'vitest';
import { formatLongDate, weekdaysText } from './offer-text';

describe('offer text', () => {
  it('formats a long date', () => expect(formatLongDate('2026-12-31')).toBe('31 Dec 2026'));
  it('collapses weekday runs, Monday first', () => {
    expect(weekdaysText([1, 2, 3, 4])).toBe('Mon–Thu');
    expect(weekdaysText([5])).toBe('Fri');
    expect(weekdaysText([0, 6])).toBe('Sat, Sun');
    expect(weekdaysText([1, 3])).toBe('Mon, Wed');
    expect(weekdaysText([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
  });
});
