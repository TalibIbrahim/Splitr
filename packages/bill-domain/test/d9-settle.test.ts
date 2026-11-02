import type { Bill } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import { canSettle, reopenBill, settleBill } from '../src/index';
import { $, calc, deepFreeze, fixtureB, makeBill, mkItem, okBreakdown, statusesFor } from './helpers';

const NOW = '2026-11-04T12:00:00.000Z';

function billWith(paidIdx: number[], over: Parameters<typeof fixtureB>[0] = {}): Bill {
  const base = fixtureB(over);
  return { ...base, transferStatuses: statusesFor(okBreakdown(base), paidIdx) } as Bill;
}
const allPaid = () => billWith([0, 1, 2]);

describe('D9 canSettle', () => {
  it('D9 canSettle true when ok, settlement present and every transfer is paid', () => {
    const b = allPaid();
    expect(canSettle(b, calc(b))).toBe(true);
  });
  it('D9 canSettle false when any transfer is pending', () => {
    for (const paid of [[], [0], [0, 1], [1, 2]]) {
      const b = billWith(paid);
      expect(canSettle(b, calc(b)), `paid=${paid}`).toBe(false);
    }
  });
  it('D9 canSettle false when the result is not ok', () => {
    const b = { ...allPaid(), printedTotal: $(1) } as Bill;
    const r = calc(b);
    expect(r.ok).toBe(false);
    expect(canSettle(b, r)).toBe(false);
  });
  it('D9 canSettle false when settlement is null (no contributions)', () => {
    const b = fixtureB({ contributions: [] });
    const r = calc(b);
    expect(r.ok && r.breakdown.settlement).toBeNull();
    expect(canSettle(b, r)).toBe(false);
  });
  it('D9 canSettle true when the settlement has no transfers (payer covers only themselves)', () => {
    const b = makeBill({
      participants: [{ id: 'a', displayName: 'A', personId: 'a' }],
      meParticipantId: 'a',
      items: [mkItem('i', 'Tea', 1, 20000, { kind: 'equal', participantIds: ['a'] })],
      contributions: [{ participantId: 'a', amount: $(20000) }],
    });
    const r = calc(b);
    expect(r.ok && r.breakdown.settlement?.transfers).toEqual([]);
    expect(canSettle(b, r)).toBe(true);
  });
  it('D9 canSettle false when a transfer has no matching status entry', () => {
    const b = { ...allPaid(), transferStatuses: [] } as Bill;
    expect(canSettle(b, calc(b))).toBe(false);
  });
});

describe('D9 settleBill', () => {
  it('D9 settleBill sets status settled, settledAt and finalSnapshot = breakdown', () => {
    const b = allPaid();
    const r = calc(b);
    const s = settleBill(b, r, NOW);
    expect(s.status).toBe('settled');
    expect(s.settledAt).toBe(NOW);
    expect(s.finalSnapshot).toEqual(r.ok ? r.breakdown : null);
    expect(s.finalSnapshot).toEqual(okBreakdown(b));
  });
  it('D9 settleBill keeps every other field', () => {
    const b = allPaid();
    const s = settleBill(b, calc(b), NOW);
    expect({ ...s, status: null, settledAt: null, finalSnapshot: null }).toEqual({ ...b, status: null, settledAt: null, finalSnapshot: null });
  });
  it('D9 settleBill does not mutate its (frozen) input', () => {
    const b = deepFreeze(allPaid());
    const r = calc(b);
    const s = settleBill(b, r, NOW);
    expect(s).not.toBe(b);
    expect(b.status).toBe('open');
    expect(b.finalSnapshot).toBeNull();
  });
  it('D9 settleBill throws when transfers are pending', () => {
    const b = billWith([0, 1]);
    expect(() => settleBill(b, calc(b), NOW)).toThrow(Error);
  });
  it('D9 settleBill throws when the result is not ok', () => {
    const b = { ...allPaid(), printedTotal: $(1) } as Bill;
    expect(() => settleBill(b, calc(b), NOW)).toThrow(Error);
  });
  it('D9 settleBill throws when there is no settlement', () => {
    const b = fixtureB({ contributions: [] });
    expect(() => settleBill(b, calc(b), NOW)).toThrow(Error);
  });
});

describe('D9 reopenBill', () => {
  it('D9 reopenBill returns status open with finalSnapshot null', () => {
    const b = allPaid();
    const s = settleBill(b, calc(b), NOW);
    const o = reopenBill(s);
    expect(o.status).toBe('open');
    expect(o.finalSnapshot).toBeNull();
  });
  it('D9 reopenBill clears settledAt (inferred) and keeps items, adjustments and statuses', () => {
    const b = allPaid();
    const o = reopenBill(settleBill(b, calc(b), NOW));
    expect(o.settledAt).toBeNull();
    expect(o).toEqual(b);
  });
  it('D9 reopenBill does not mutate a frozen settled bill', () => {
    const b = allPaid();
    const s = deepFreeze(settleBill(b, calc(b), NOW));
    const o = reopenBill(s);
    expect(o).not.toBe(s);
    expect(s.status).toBe('settled');
    expect(s.finalSnapshot).not.toBeNull();
  });
});
