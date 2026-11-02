import type { Bill } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import { canSettle, explainParticipant, explainSettled, reopenBill, settleBill } from '../src/index';
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
  it('D9 settleBill sets status settled, settledAt and finalSnapshot = breakdown with empty trace (D9b)', () => {
    const b = allPaid();
    const r = calc(b);
    const s = settleBill(b, r, NOW);
    expect(s.status).toBe('settled');
    expect(s.settledAt).toBe(NOW);
    // Spec change D9b (v1.6): snapshot drops the trace -> { ...breakdown, trace: [] }.
    expect(s.finalSnapshot).toEqual(r.ok ? { ...r.breakdown, trace: [] } : null);
    expect(s.finalSnapshot).toEqual({ ...okBreakdown(b), trace: [] });
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

describe('D9b explainSettled', () => {
  const settled = () => {
    const b = allPaid();
    return settleBill(b, calc(b), NOW);
  };
  const finalOf = (lines: ReturnType<typeof explainParticipant>) => lines.find((l) => l.kind === 'final')?.amount;
  const tamper = (s: Bill, patch: (p: any) => any): Bill => {
    const snap = s.finalSnapshot!;
    const [first, ...rest] = snap.participants;
    return { ...s, finalSnapshot: { ...snap, participants: [patch(first), ...rest] } } as unknown as Bill;
  };

  it('D9b settleBill stores a snapshot with an empty trace', () => {
    expect(settled().finalSnapshot?.trace).toEqual([]);
  });

  it('D9b explainSettled on Fixture B returns kind steps; totals match the snapshot', () => {
    const s = settled();
    const ex = explainSettled(s);
    expect(ex.kind).toBe('steps');
    if (ex.kind !== 'steps') return;
    const snap = s.finalSnapshot!;
    expect(ex.breakdown.participants.map((p) => [p.participantId, p.exactTotal, p.roundedTotal])).toEqual(
      snap.participants.map((p) => [p.participantId, p.exactTotal, p.roundedTotal]),
    );
    expect(ex.breakdown.trace.length).toBeGreaterThan(0);
  });

  it('D9b explainParticipant lines from the recalculated breakdown reconcile to the snapshot roundedTotal', () => {
    const s = settled();
    const ex = explainSettled(s);
    expect(ex.kind).toBe('steps');
    if (ex.kind !== 'steps') return;
    for (const p of s.finalSnapshot!.participants) {
      expect(finalOf(explainParticipant(ex.breakdown, s, p.participantId)), p.participantId).toBe(p.roundedTotal);
    }
  });

  it('D9b explainSettled returns snapshot-only when a snapshot roundedTotal differs (older engine)', () => {
    const t = tamper(settled(), (p) => ({ ...p, roundedTotal: p.roundedTotal + 100 }));
    expect(explainSettled(t).kind).toBe('snapshot-only');
  });

  it('D9b explainSettled returns snapshot-only when a snapshot exactTotal differs', () => {
    const t = tamper(settled(), (p) => ({ ...p, exactTotal: p.exactTotal + 1 }));
    expect(explainSettled(t).kind).toBe('snapshot-only');
  });
});
