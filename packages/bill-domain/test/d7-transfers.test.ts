import type { TransferStatus } from '@splitr/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { reconcileTransferStatuses } from '../src/index';
import { $, deepFreeze } from './helpers';

const PAID_AT = '2026-11-03T09:00:00.000Z';
const st = (from: string, to: string, amount: number, status: 'pending' | 'paid', paidAt: string | null = status === 'paid' ? PAID_AT : null): TransferStatus =>
  ({ from, to, amount: $(amount), status, paidAt }) as TransferStatus;
const tr = (from: string, to: string, amount: number) => ({ from, to, amount: $(amount) });

describe('D7 reconcileTransferStatuses', () => {
  it('D7 empty prev -> every transfer pending with paidAt null, droppedPaid 0', () => {
    const r = reconcileTransferStatuses([], [tr('ali', 'hamza', 225300), tr('saad', 'hamza', 180600)]);
    expect(r.statuses).toEqual([st('ali', 'hamza', 225300, 'pending'), st('saad', 'hamza', 180600, 'pending')]);
    expect(r.droppedPaid).toBe(0);
  });

  it('D7 paid status kept (with its paidAt) when from, to and amount are identical', () => {
    const prev = [st('ali', 'hamza', 225300, 'paid')];
    const r = reconcileTransferStatuses(prev, [tr('ali', 'hamza', 225300)]);
    expect(r.statuses).toEqual([st('ali', 'hamza', 225300, 'paid')]);
    expect(r.droppedPaid).toBe(0);
  });

  it('D7 paid is reset to pending (paidAt null) when the amount changed, and counted in droppedPaid', () => {
    const r = reconcileTransferStatuses([st('ali', 'hamza', 225300, 'paid')], [tr('ali', 'hamza', 225400)]);
    expect(r.statuses).toEqual([st('ali', 'hamza', 225400, 'pending')]);
    expect(r.droppedPaid).toBe(1);
  });

  it('D7 paid is reset when from differs', () => {
    const r = reconcileTransferStatuses([st('ali', 'hamza', 100, 'paid')], [tr('saad', 'hamza', 100)]);
    expect(r.statuses).toEqual([st('saad', 'hamza', 100, 'pending')]);
    expect(r.droppedPaid).toBe(1);
  });

  it('D7 paid is reset when to differs', () => {
    const r = reconcileTransferStatuses([st('ali', 'hamza', 100, 'paid')], [tr('ali', 'saad', 100)]);
    expect(r.statuses).toEqual([st('ali', 'saad', 100, 'pending')]);
    expect(r.droppedPaid).toBe(1);
  });

  it('D7 a direction swap is not the same transfer', () => {
    const r = reconcileTransferStatuses([st('ali', 'hamza', 100, 'paid')], [tr('hamza', 'ali', 100)]);
    expect(r.statuses[0]?.status).toBe('pending');
    expect(r.droppedPaid).toBe(1);
  });

  it('D7 pending prev entries stay pending and are not counted as dropped', () => {
    const r = reconcileTransferStatuses([st('ali', 'hamza', 100, 'pending')], [tr('ali', 'hamza', 999)]);
    expect(r.statuses).toEqual([st('ali', 'hamza', 999, 'pending')]);
    expect(r.droppedPaid).toBe(0);
  });

  it('D7 mixed: keeps two identical paid, resets two changed, one new pending -> droppedPaid 2', () => {
    const prev = [
      st('a', 'z', 100, 'paid'),
      st('b', 'z', 200, 'paid'),
      st('c', 'z', 300, 'paid'),
      st('d', 'z', 400, 'paid'),
    ];
    const r = reconcileTransferStatuses(prev, [
      tr('a', 'z', 100),
      tr('b', 'z', 250),
      tr('c', 'z', 300),
      tr('d', 'y', 400),
      tr('e', 'z', 500),
    ]);
    expect(r.statuses.map((s) => s.status)).toEqual(['paid', 'pending', 'paid', 'pending', 'pending']);
    expect(r.statuses.map((s) => s.paidAt)).toEqual([PAID_AT, null, PAID_AT, null, null]);
    expect(r.droppedPaid).toBe(2);
  });

  it('D7 output has exactly one status per transfer, in transfer order', () => {
    const transfers = [tr('c', 'z', 3), tr('a', 'z', 1), tr('b', 'z', 2)];
    const r = reconcileTransferStatuses([st('a', 'z', 1, 'paid')], transfers);
    expect(r.statuses.map((s) => [s.from, s.to, s.amount])).toEqual([['c', 'z', 3], ['a', 'z', 1], ['b', 'z', 2]]);
  });

  it('D7 matching is by identity of the triple, not by position in prev', () => {
    const prev = [st('b', 'z', 2, 'paid'), st('a', 'z', 1, 'paid')];
    const r = reconcileTransferStatuses(prev, [tr('a', 'z', 1), tr('b', 'z', 2)]);
    expect(r.statuses.every((s) => s.status === 'paid')).toBe(true);
    expect(r.droppedPaid).toBe(0);
  });

  it('D7 no transfers -> no statuses', () => {
    expect(reconcileTransferStatuses([st('a', 'z', 1, 'paid')], []).statuses).toEqual([]);
  });

  it('D7 does not mutate frozen inputs', () => {
    const prev = deepFreeze([st('a', 'z', 1, 'paid')]);
    const transfers = deepFreeze([tr('a', 'z', 2)]);
    expect(() => reconcileTransferStatuses(prev, transfers)).not.toThrow();
  });

  it('D7 property: reconciling against the same transfers keeps all paid and drops nothing', () => {
    const t = fc.record({ from: fc.constantFrom('a', 'b', 'c'), to: fc.constantFrom('x', 'y'), amount: fc.integer({ min: 1, max: 1_000_000 }) });
    fc.assert(
      fc.property(fc.uniqueArray(t, { selector: (v) => `${v.from}|${v.to}|${v.amount}`, maxLength: 6 }), (ts) => {
        const prev = ts.map((x) => st(x.from, x.to, x.amount, 'paid'));
        const r = reconcileTransferStatuses(prev, ts.map((x) => tr(x.from, x.to, x.amount)));
        expect(r.droppedPaid).toBe(0);
        expect(r.statuses).toEqual(prev);
      }),
    );
  });

  it('D7 property: a status is paid iff the exact triple was paid before; statuses mirror transfers', () => {
    const t = fc.record({ from: fc.constantFrom('a', 'b'), to: fc.constantFrom('x', 'y'), amount: fc.integer({ min: 1, max: 5 }) });
    fc.assert(
      fc.property(fc.array(t, { maxLength: 5 }), fc.array(t, { maxLength: 5 }), (p, n) => {
        const prev = p.map((x) => st(x.from, x.to, x.amount, 'paid'));
        const r = reconcileTransferStatuses(prev, n.map((x) => tr(x.from, x.to, x.amount)));
        expect(r.statuses).toHaveLength(n.length);
        r.statuses.forEach((s, i) => {
          const was = p.some((x) => x.from === s.from && x.to === s.to && x.amount === s.amount);
          expect(s.status === 'paid').toBe(was);
          expect(s.paidAt === null).toBe(!was);
          expect([s.from, s.to, s.amount]).toEqual([n[i]!.from, n[i]!.to, n[i]!.amount]);
        });
      }),
    );
  });
});
