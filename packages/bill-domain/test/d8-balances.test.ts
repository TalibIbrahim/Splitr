import type { CalculationResult } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import { balancesForMe } from '../src/index';
import { $, calc, fixtureB, makeBill, mkItem, statusesFor } from './helpers';

/** Bill 1 = Fixture B: me (mahhee) owes hamza 180600; ali and saad owe hamza too (not my business). */
function bill1(over: Parameters<typeof fixtureB>[0] = {}): Bill {
  const base = fixtureB({ id: 'b1', ...over });
  return base;
}
function withPendingStatuses(bill: Bill, paidIdx: number[] = []): Bill {
  const r = calc(bill);
  if (!r.ok) return bill;
  return { ...bill, transferStatuses: statusesFor(r.breakdown, paidIdx) } as Bill;
}

/** Bill 2: I (mahhee) paid 270000 for three people; hamza and a guest "Zed" each owe me 90000. */
function bill2(over: Parameters<typeof makeBill>[0] = {}): Bill {
  const bill = makeBill({
    id: 'b2',
    restaurantName: 'Second Place',
    participants: [
      { id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' },
      { id: 'hamza', displayName: 'Hamza', personId: 'hamza' },
      { id: 'g1', displayName: 'Zed', personId: null },
    ],
    meParticipantId: 'mahhee',
    items: [
      mkItem('i1', 'One', 1, 90000, { kind: 'equal', participantIds: ['mahhee'] }),
      mkItem('i2', 'Two', 1, 90000, { kind: 'equal', participantIds: ['hamza'] }),
      mkItem('i3', 'Three', 1, 90000, { kind: 'equal', participantIds: ['g1'] }),
    ],
    contributions: [{ participantId: 'mahhee', amount: $(270000) }],
    ...over,
  });
  return withPendingStatuses(bill);
}

const resultsFor = (...bills: Bill[]): ReadonlyMap<string, CalculationResult> =>
  new Map(bills.map((b) => [b.id, calc(b)]));

describe('D8 balancesForMe', () => {
  it('D8 no bills -> zeros and no counterparties', () => {
    expect(balancesForMe([], new Map())).toEqual({ youOwe: 0, owedToYou: 0, counterparties: [] });
  });

  it('D8 me as debtor: youOwe = my pending transfer(s); ali/saad transfers to hamza are ignored', () => {
    const b = withPendingStatuses(bill1());
    const r = balancesForMe([b], resultsFor(b));
    expect(r.youOwe).toBe(180600);
    expect(r.owedToYou).toBe(0);
    expect(r.counterparties).toEqual([{ key: 'hamza', displayName: 'Hamza', net: -180600 }]);
  });

  it('D8 me as creditor: owedToYou sums what others owe me; guests are keyed by display name', () => {
    const b = bill2();
    const r = balancesForMe([b], resultsFor(b));
    expect(r.youOwe).toBe(0);
    expect(r.owedToYou).toBe(180000);
    const byKey = Object.fromEntries(r.counterparties.map((c) => [c.key, c]));
    expect(Object.keys(byKey).sort()).toEqual(['Zed', 'hamza']);
    expect(byKey['hamza']).toMatchObject({ displayName: 'Hamza', net: 90000 });
    expect(byKey['Zed']).toMatchObject({ displayName: 'Zed', net: 90000 });
  });

  it('D8 several bills: totals add up and counterparty nets combine across bills (+ they owe me)', () => {
    const a = withPendingStatuses(bill1());
    const b = bill2();
    const r = balancesForMe([a, b], resultsFor(a, b));
    expect(r.youOwe).toBe(180600);
    expect(r.owedToYou).toBe(180000);
    const byKey = Object.fromEntries(r.counterparties.map((c) => [c.key, c.net]));
    expect(byKey).toEqual({ hamza: 90000 - 180600, Zed: 90000 });
    expect(r.counterparties).toHaveLength(2);
  });

  it('D8 a paid transfer no longer counts', () => {
    const a = withPendingStatuses(bill1(), [1]); // transfers: ali->hamza, mahhee->hamza, saad->hamza
    const r = balancesForMe([a], resultsFor(a));
    expect(r.youOwe).toBe(0);
    expect(r.owedToYou).toBe(0);
    expect(r.counterparties.every((c) => c.net === 0) || r.counterparties.length === 0).toBe(true);
  });

  it('D8 creditor side: a debtors paid transfer stops counting, the other still does', () => {
    const b = withPendingStatuses(bill2(), []);
    const first = b.transferStatuses[0]!; // g1 -> mahhee (lower id first)
    expect(first.from).toBe('g1');
    const paid = { ...b, transferStatuses: b.transferStatuses.map((s, i) => (i === 0 ? { ...s, status: 'paid', paidAt: '2026-11-03T00:00:00.000Z' } : s)) } as Bill;
    const r = balancesForMe([paid], resultsFor(paid));
    expect(r.owedToYou).toBe(90000);
  });

  it('D8 settled bills are excluded', () => {
    const a = { ...withPendingStatuses(bill1()), status: 'settled' } as Bill;
    const r = balancesForMe([a], resultsFor(a));
    expect(r).toEqual({ youOwe: 0, owedToYou: 0, counterparties: [] });
  });

  it('D8 bills whose result failed are excluded', () => {
    const a = withPendingStatuses(bill1({ printedTotal: $(1) }));
    const res = resultsFor(a);
    expect(res.get('b1')?.ok).toBe(false);
    expect(balancesForMe([a], res)).toEqual({ youOwe: 0, owedToYou: 0, counterparties: [] });
  });

  it('D8 bills without a settlement (no contributions) are excluded', () => {
    const a = bill1({ contributions: [] });
    const res = resultsFor(a);
    expect(balancesForMe([a], res)).toEqual({ youOwe: 0, owedToYou: 0, counterparties: [] });
  });

  it('D8 bills with meParticipantId null are excluded', () => {
    const a = withPendingStatuses(bill1({ meParticipantId: null }));
    expect(balancesForMe([a], resultsFor(a))).toEqual({ youOwe: 0, owedToYou: 0, counterparties: [] });
  });

  it('D8 excluded bills do not contaminate included ones', () => {
    const good = withPendingStatuses(bill1());
    const settled = { ...bill2(), status: 'settled' } as Bill;
    const failing = bill2({ id: 'b3', printedTotal: $(1) });
    const noMe = bill2({ id: 'b4', meParticipantId: null });
    const bills = [good, settled, failing, noMe];
    const r = balancesForMe(bills, resultsFor(...bills));
    expect(r.youOwe).toBe(180600);
    expect(r.owedToYou).toBe(0);
    expect(r.counterparties).toEqual([{ key: 'hamza', displayName: 'Hamza', net: -180600 }]);
  });

  it('D8 an unrelated bill (I owe nothing, am owed nothing) contributes zero', () => {
    const bill = withPendingStatuses(
      makeBill({
        id: 'solo',
        participants: [{ id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' }],
        meParticipantId: 'mahhee',
        items: [mkItem('i', 'Tea', 1, 20000, { kind: 'equal', participantIds: ['mahhee'] })],
        contributions: [{ participantId: 'mahhee', amount: $(20000) }],
      }),
    );
    expect(balancesForMe([bill], resultsFor(bill))).toMatchObject({ youOwe: 0, owedToYou: 0 });
  });
});
