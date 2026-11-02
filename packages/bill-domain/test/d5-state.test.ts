import type { CalculationResult, Issue } from '@splitr/calculation-engine';
import { describe, expect, it } from 'vitest';
import { deriveBillState } from '../src/index';
import { $, calc, fixtureB, fixtureBItems, mkItem } from './helpers';

const issue = (code: Issue['code'], severity: Issue['severity'] = 'error'): Issue => ({
  code,
  severity,
  rule: 'R0',
  message: 'synthetic',
});
const failed = (...codes: Issue['code'][]): CalculationResult => ({
  ok: false,
  errors: codes.map((c) => issue(c)),
  warnings: [],
});

describe('D5 deriveBillState (engine-produced results)', () => {
  it('D5 ready: ok result, no printedTotal', () => {
    const bill = fixtureB();
    expect(deriveBillState(bill, calc(bill))).toBe('ready');
  });

  it('D5 reconciled: ok result and printedTotal matches', () => {
    const bill = fixtureB({ printedTotal: $(850000) });
    expect(deriveBillState(bill, calc(bill))).toBe('reconciled');
  });

  it('D5 needs-review: printedTotal mismatch (TOTAL_MISMATCH)', () => {
    const bill = fixtureB({ printedTotal: $(860000) });
    const r = calc(bill);
    expect(r.ok).toBe(false);
    expect(deriveBillState(bill, r)).toBe('needs-review');
  });

  it('D5 needs-review: printedSubtotal mismatch', () => {
    const bill = fixtureB({ printedSubtotal: $(999999) });
    expect(deriveBillState(bill, calc(bill))).toBe('needs-review');
  });

  it('D5 unassigned: an item has no assignee', () => {
    const items = fixtureBItems();
    items[0] = mkItem('karahi', 'Chicken Karahi', 1, 320000, { kind: 'unassigned' });
    const bill = fixtureB({ items });
    const r = calc(bill);
    expect(r.ok).toBe(false);
    expect(deriveBillState(bill, r)).toBe('unassigned');
  });

  it('D5 unassigned: under-assigned units item', () => {
    const items = fixtureBItems();
    items[1] = mkItem('seekh', 'Mutton Seekh', 2, 290000, { kind: 'units', entries: [{ participantId: 'hamza', units: 1 }] });
    const bill = fixtureB({ items });
    expect(deriveBillState(bill, calc(bill))).toBe('unassigned');
  });

  it('D5 needs-review beats unassigned: SUBTOTAL_MISMATCH alongside an unassigned item', () => {
    const items = fixtureBItems();
    items[0] = mkItem('karahi', 'Chicken Karahi', 1, 320000, { kind: 'unassigned' });
    const bill = fixtureB({ items, printedSubtotal: $(1) });
    const r = calc(bill);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === 'ITEM_UNASSIGNED')).toBe(true);
      expect(r.errors.some((e) => e.code === 'SUBTOTAL_MISMATCH')).toBe(true);
    }
    expect(deriveBillState(bill, r)).toBe('needs-review');
  });

  it('D5 ready with only warnings (no contributions -> NO_CONTRIBUTIONS)', () => {
    const bill = fixtureB({ contributions: [] });
    const r = calc(bill);
    expect(r.ok && r.warnings.some((w) => w.code === 'NO_CONTRIBUTIONS')).toBe(true);
    expect(deriveBillState(bill, r)).toBe('ready');
  });

  it('D5 a zero-priced unassigned item is only a warning, so state is ready', () => {
    const items = [...fixtureBItems(), mkItem('free', 'Complimentary mints', 1, 0, { kind: 'unassigned' })];
    const bill = fixtureB({ items });
    const r = calc(bill);
    expect(r.ok).toBe(true);
    expect(deriveBillState(bill, r)).toBe('ready');
  });

  it('D5 settled: status settled with an ok result', () => {
    const bill = fixtureB({ status: 'settled', printedTotal: $(850000) });
    expect(deriveBillState(bill, calc(bill))).toBe('settled');
  });

  it('D5 settled beats everything: settled bill with a failing result', () => {
    const bill = fixtureB({ status: 'settled', printedTotal: $(1) });
    const r = calc(bill);
    expect(r.ok).toBe(false);
    expect(deriveBillState(bill, r)).toBe('settled');
  });
});

describe('D5 deriveBillState (precedence table with synthetic results)', () => {
  const open = fixtureB();
  const okResult = (open2 = open): CalculationResult => calc(open2);

  it.each([
    [['ITEM_UNASSIGNED'], 'unassigned'],
    [['ITEM_UNDER_ASSIGNED'], 'unassigned'],
    [['ITEM_OVER_ASSIGNED'], 'unassigned'],
    [['ITEM_UNASSIGNED', 'ITEM_OVER_ASSIGNED'], 'unassigned'],
    [['TOTAL_MISMATCH'], 'needs-review'],
    [['INVALID_INPUT'], 'needs-review'],
    [['ADJUSTMENT_INVALID_BASE'], 'needs-review'],
    [['CONTRIBUTIONS_MISMATCH'], 'needs-review'],
    [['NEGATIVE_TOTAL'], 'needs-review'],
    [['LINE_ARITHMETIC_MISMATCH', 'ITEM_UNASSIGNED'], 'needs-review'],
    [['ITEM_UNDER_ASSIGNED', 'INVALID_INPUT'], 'needs-review'],
  ] as [Issue['code'][], string][])('D5 errors %j -> %s', (codes, expected) => {
    expect(deriveBillState(open, failed(...codes))).toBe(expected);
  });

  it('D5 settled wins over any error set', () => {
    const settled = fixtureB({ status: 'settled' });
    expect(deriveBillState(settled, failed('INVALID_INPUT', 'ITEM_UNASSIGNED'))).toBe('settled');
  });

  it('D5 warnings alone never change the state', () => {
    const r: CalculationResult = {
      ok: true,
      breakdown: (okResult() as Extract<CalculationResult, { ok: true }>).breakdown,
      warnings: [issue('ITEM_UNASSIGNED', 'warning'), issue('NEGATIVE_SHARE', 'warning')],
    };
    expect(deriveBillState(open, r)).toBe('ready');
  });

  it('D5 reconciled requires printedTotal to be set, even if ok', () => {
    const r = okResult();
    expect(deriveBillState(open, r)).toBe('ready');
    const withPrinted = fixtureB({ printedTotal: $(850000) });
    expect(deriveBillState(withPrinted, r)).toBe('reconciled');
  });
});
