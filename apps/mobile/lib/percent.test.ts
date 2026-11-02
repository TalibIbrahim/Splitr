import { describe, expect, it } from 'vitest';
import { formatBp, parsePercentToBp } from './percent';

describe('parsePercentToBp', () => {
  it.each([
    ['20', 2000],
    ['16.5', 1650],
    ['2.25', 225],
    ['0', 0],
    ['100', 10_000],
    [' 5 % ', 500],
    ['5%', 500],
    ['007', 700],
    ['0.05', 5],
    ['12.0', 1200],
  ])('accepts %s -> %i bp', (text, bp) => {
    expect(parsePercentToBp(text)).toEqual({ ok: true, bp });
  });

  it('rejects empty', () => {
    expect(parsePercentToBp('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(parsePercentToBp('%')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects more than 2 decimals', () => {
    expect(parsePercentToBp('2.255')).toEqual({ ok: false, reason: 'too-many-decimals' });
    expect(parsePercentToBp('1.000')).toEqual({ ok: false, reason: 'too-many-decimals' });
  });

  it.each(['abc', '-5', '1.2.3', '.5', '5.', '1,5', '5 0', '1e2'])('rejects %s as invalid', (text) => {
    expect(parsePercentToBp(text)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects above the max', () => {
    expect(parsePercentToBp('100.01')).toEqual({ ok: false, reason: 'too-large' });
    expect(parsePercentToBp('99999999999')).toEqual({ ok: false, reason: 'too-large' });
    expect(parsePercentToBp('150', 20_000)).toEqual({ ok: true, bp: 15_000 });
  });
});

describe('formatBp', () => {
  it.each([
    [2000, '20'],
    [1650, '16.5'],
    [225, '2.25'],
    [5, '0.05'],
    [0, '0'],
  ])('%i -> %s', (bp, text) => {
    expect(formatBp(bp)).toBe(text);
  });
  it('round-trips', () => {
    for (const bp of [0, 1, 99, 100, 101, 1650, 3333, 10_000]) {
      expect(parsePercentToBp(formatBp(bp))).toEqual({ ok: true, bp });
    }
  });
});
