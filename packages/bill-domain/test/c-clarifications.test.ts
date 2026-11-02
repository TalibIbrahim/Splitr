import type { Adjustment, CalculationResult, Paisa } from '@splitr/calculation-engine';
import type { Bill, TransferStatus } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import {
  balancesForMe,
  canSettle,
  cardDiscount,
  explainParticipant,
  fee,
  parseRupees,
  reconcileTransferStatuses,
  reopenBill,
  serviceCharge,
  settleBill,
  shareSummary,
  tax,
  tip,
} from '../src/index';
import { $, at, bp, calc, fixtureB, makeBill, mkItem, okBreakdown, statusesFor } from './helpers';

const ok = (paisa: number) => ({ ok: true, paisa });
const bad = (reason: string) => ({ ok: false, reason });

describe('C1 parseRupees clarifications', () => {
  it.each(['1,806', '1,234,567', '999,999'])('C1 comma as thousands separator accepted: %j', (t) => {
    expect(parseRupees(t).ok).toBe(true);
  });
  it('C1 1,806 and 1,234,567 values', () => {
    expect(parseRupees('1,806')).toEqual(ok(180600));
    expect(parseRupees('1,234,567')).toEqual(ok(123456700));
  });
  it.each(['1,23', '1,2,3', '12,34,567', '1,2345', ',123', '1,,234', '1,234,'])(
    'C1 non-thousands comma grouping is invalid: %j',
    (t) => expect(parseRupees(t)).toEqual(bad('invalid')),
  );
  it('C1 comma grouping works with decimals', () => {
    expect(parseRupees('1,806.25')).toEqual(ok(180625));
  });
  it.each(['.5', '5.', '.', '-.5', '1,000.'])('C1 leading or trailing dot is invalid: %j', (t) =>
    expect(parseRupees(t)).toEqual(bad('invalid')),
  );
  it.each([
    ['rs 5', 500],
    ['RS5', 500],
    ['Rs5', 500],
    ['rS 1,806', 180600],
    ['RS 12.50', 1250],
  ])('C1 Rs is case-insensitive, with or without space: %j', (t, p) => expect(parseRupees(t)).toEqual(ok(p)));
  it.each([
    ['Rs. 1,806', 180600],
    ['rs.5', 500],
    ['RS. 12.50', 1250],
    ['Rs.1806', 180600],
  ])('C1 amendment: leading "Rs." accepted in any case: %j', (t, p) => expect(parseRupees(t)).toEqual(ok(p)));
  it('C1 guard: "Rs5" -> 500 (prefix must not swallow a digit)', () => {
    expect(parseRupees('Rs5')).toEqual(ok(500));
    expect(parseRupees('Rs1')).toEqual(ok(100));
    expect(parseRupees('Rs9')).toEqual(ok(900));
  });
  it.each(['Rs', 'rs', 'RS', '  Rs  '])('C1 bare Rs is empty: %j', (t) => expect(parseRupees(t)).toEqual(bad('empty')));
  it('C1 whitespace-only is empty', () => {
    expect(parseRupees('   ')).toEqual(bad('empty'));
    expect(parseRupees('\t\n ')).toEqual(bad('empty'));
  });
  it.each(['-0', '-0.00', '-0.0'])('C1 %j -> paisa 0 (never -0)', (t) => {
    const r = parseRupees(t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.is(r.paisa, 0)).toBe(true);
  });
  it('C1 exactly Rs 100 000 000 allowed in either sign', () => {
    expect(parseRupees('100000000')).toEqual(ok(10_000_000_000));
    expect(parseRupees('-100000000')).toEqual(ok(-10_000_000_000));
    expect(parseRupees('100,000,000.00')).toEqual(ok(10_000_000_000));
  });
  it('C1 beyond the limit is too-large in either sign', () => {
    expect(parseRupees('100000000.01')).toEqual(bad('too-large'));
    expect(parseRupees('-100000000.01')).toEqual(bad('too-large'));
    expect(parseRupees('100,000,001')).toEqual(bad('too-large'));
    expect(parseRupees('Rs -100000001')).toSatisfy((r: { ok: boolean }) => !r.ok);
  });
});

describe('C2 builders set base and allocation explicitly', () => {
  const prop = (a: Adjustment) => ({ base: a.base, allocation: a.allocation });
  it('C2 cardDiscount', () => {
    expect(prop(cardDiscount('d', 10, { rateBp: bp(2000) }))).toEqual({ base: { type: 'items' }, allocation: { type: 'proportional' } });
  });
  it('C2 tax original', () => {
    expect(prop(tax('t', 30, { rateBp: bp(500), base: 'original' }))).toEqual({ base: { type: 'items' }, allocation: { type: 'proportional' } });
  });
  it('C2 tax after-discounts', () => {
    expect(prop(tax('t', 30, { rateBp: bp(500), base: 'after-discounts' }))).toEqual({
      base: { type: 'items-after', include: 'all-prior' },
      allocation: { type: 'proportional' },
    });
  });
  it('C2 serviceCharge', () => {
    expect(prop(serviceCharge('s', 20, { rateBp: bp(1000) }))).toEqual({ base: { type: 'items' }, allocation: { type: 'proportional' } });
  });
  it('C2 fee', () => {
    expect(prop(fee('f', 50, { amount: $(100), label: 'x' }))).toEqual({ base: { type: 'items' }, allocation: { type: 'proportional' } });
  });
  it('C2 tip proportional and equal', () => {
    const p = tip('p', 40, { amount: $(100), split: 'proportional' });
    expect(p.allocation).toEqual({ type: 'proportional' });
    expect(p.base).toBeDefined();
    const e = tip('p', 40, { amount: $(100), split: 'equal' });
    expect(e.allocation?.type).toBe('equal');
    expect(e.base).toBeDefined();
  });
});

describe('C3 D6 context strings', () => {
  const solo = (adjustments: Adjustment[], total = 180625, ids = ['a']) =>
    makeBill({
      participants: ids.map((id) => ({ id, displayName: id.toUpperCase(), personId: id })),
      meParticipantId: 'a',
      items: [mkItem('x', 'Dish', 1, total, { kind: 'equal', participantIds: ids })],
      adjustments,
    });
  const adjLine = (bill: Bill, pid = 'a') => explainParticipant(okBreakdown(bill), bill, pid).filter((l) => l.kind === 'adjustment');

  it('C3 after-discount tax shows the post-discount base ("5% of 1,700")', () => {
    const bill = fixtureB({
      adjustments: [cardDiscount('d', 10, { rateBp: bp(2000) }), tax('t', 30, { rateBp: bp(500), base: 'after-discounts' })],
      contributions: [{ participantId: 'hamza', amount: $(1000000 - 200000 + 40000) }],
    });
    const ls = explainParticipant(okBreakdown(bill), bill, 'mahhee').filter((l) => l.kind === 'adjustment');
    expect(ls.map((l) => l.context)).toEqual(['20% of 2,125', '5% of 1,700']);
    expect(ls[1]?.amount).toBe(8500);
  });

  it('C3 rates drop trailing zeros and keep up to 2 decimals (2.5%, 16%, 12.34%)', () => {
    for (const [rate, text] of [[250, '2.5%'], [1600, '16%'], [1234, '12.34%'], [5, '0.05%']] as const) {
      const bill = fixtureB({ adjustments: [tax('t', 30, { rateBp: bp(rate), base: 'original' })], contributions: [] });
      const l = adjLine(bill, 'mahhee')[0];
      expect(l?.context?.startsWith(`${text} of `), `${rate}bp -> ${l?.context}`).toBe(true);
    }
  });

  it('C3 a base with paisa shows two decimals ("5% of 1,806.25")', () => {
    const bill = solo([tax('t', 30, { rateBp: bp(500), base: 'original' })]);
    expect(adjLine(bill)[0]?.context).toBe('5% of 1,806.25');
  });

  it('C3 a whole-rupee base shows no decimals ("5% of 1,806")', () => {
    const bill = solo([tax('t', 30, { rateBp: bp(500), base: 'original' })], 180600);
    expect(adjLine(bill)[0]?.context).toBe('5% of 1,806');
  });

  it('C3 tip and fixed fee adjustments have no context', () => {
    const bill = solo([tip('p', 40, { amount: $(10000), split: 'equal' }), fee('f', 50, { amount: $(5000), label: 'Packing' })]);
    const ls = adjLine(bill);
    expect(ls.map((l) => l.label)).toEqual(['Tip', 'Packing']);
    for (const l of ls) expect(l.context).toBeUndefined();
  });

  it('C3 equal split among one person has no context', () => {
    const bill = solo([]);
    const item = explainParticipant(okBreakdown(bill), bill, 'a').find((l) => l.kind === 'item');
    expect(item?.context).toBeUndefined();
  });

  it('C3 percent splits show up to 2 decimals (33.33%, 33.34%, 12.5%)', () => {
    const bill = makeBill({
      participants: ['a', 'b', 'c'].map((id) => ({ id, displayName: id.toUpperCase(), personId: id })),
      meParticipantId: 'a',
      items: [
        mkItem('p', 'Thirds', 1, 100000, {
          kind: 'percent',
          entries: [
            { participantId: 'a', bp: bp(3333) },
            { participantId: 'b', bp: bp(3333) },
            { participantId: 'c', bp: bp(3334) },
          ],
        }),
        mkItem('q', 'Eighth', 1, 80000, {
          kind: 'percent',
          entries: [
            { participantId: 'a', bp: bp(1250) },
            { participantId: 'b', bp: bp(8750) },
          ],
        }),
      ],
    });
    const b = okBreakdown(bill);
    const a = explainParticipant(b, bill, 'a').filter((l) => l.kind === 'item');
    expect(a.map((l) => l.context)).toEqual(['33.33%', '12.5%']);
    const c = explainParticipant(b, bill, 'c').filter((l) => l.kind === 'item');
    expect(c.map((l) => l.context)).toEqual(['33.34%']);
  });

  it('C3 service charge rate context uses the participant base', () => {
    const bill = solo([serviceCharge('s', 20, { rateBp: bp(1000) })], 200000);
    expect(adjLine(bill)[0]?.context).toBe('10% of 2,000');
  });
});

describe('C4 final line label', () => {
  const finalLabel = (me: string | null, pid: string) => {
    const bill = fixtureB({ meParticipantId: me });
    const ls = explainParticipant(okBreakdown(bill), bill, pid);
    return at(ls, ls.length - 1).label;
  };
  it('C4 "Your share" iff pid === meParticipantId', () => {
    expect(finalLabel('mahhee', 'mahhee')).toBe('Your share');
    expect(finalLabel('mahhee', 'ali')).toBe("Ali's share");
    expect(finalLabel('ali', 'ali')).toBe('Your share');
  });
  it("C4 meParticipantId null -> everyone gets \"{displayName}'s share\"", () => {
    expect(finalLabel(null, 'mahhee')).toBe("Mahhee's share");
    expect(finalLabel(null, 'saad')).toBe("Saad's share");
  });
});

describe('C5 vanished paid transfers count toward droppedPaid', () => {
  const paid = (from: string, to: string, amount: number): TransferStatus =>
    ({ from, to, amount: $(amount), status: 'paid', paidAt: '2026-11-03T09:00:00.000Z' }) as TransferStatus;
  it('C5 a paid transfer that no longer exists is dropped and counted', () => {
    const r = reconcileTransferStatuses([paid('a', 'z', 100), paid('b', 'z', 200)], [{ from: 'a', to: 'z', amount: $(100) }]);
    expect(r.statuses).toEqual([paid('a', 'z', 100)]);
    expect(r.droppedPaid).toBe(1);
  });
  it('C5 all paid vanished -> empty statuses, droppedPaid equals count', () => {
    const r = reconcileTransferStatuses([paid('a', 'z', 100), paid('b', 'z', 200)], []);
    expect(r.statuses).toEqual([]);
    expect(r.droppedPaid).toBe(2);
  });
  it('C5 a vanished pending transfer is not counted', () => {
    const pending = { from: 'a', to: 'z', amount: $(100), status: 'pending', paidAt: null } as TransferStatus;
    expect(reconcileTransferStatuses([pending], []).droppedPaid).toBe(0);
  });
  it('C5 changed-amount and vanished are both counted', () => {
    const r = reconcileTransferStatuses(
      [paid('a', 'z', 100), paid('b', 'z', 200), paid('c', 'z', 300)],
      [{ from: 'a', to: 'z', amount: $(150) }, { from: 'c', to: 'z', amount: $(300) }],
    );
    expect(r.droppedPaid).toBe(2);
    expect(r.statuses.map((s) => s.status)).toEqual(['pending', 'paid']);
  });
});

describe('C6 balancesForMe clarifications', () => {
  const withSt = (bill: Bill, paidIdx: number[] = []): Bill => {
    const r = calc(bill);
    return r.ok ? ({ ...bill, transferStatuses: statusesFor(r.breakdown, paidIdx) } as Bill) : bill;
  };
  const resultsOf = (...bills: Bill[]): ReadonlyMap<string, CalculationResult> => new Map(bills.map((b) => [b.id, calc(b)]));
  /** I (mahhee) paid for me + named others, 90000 each. */
  const iPaid = (id: string, others: [string, string, string | null][]): Bill =>
    withSt(
      makeBill({
        id,
        participants: [
          { id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' },
          ...others.map(([pid, name, personId]) => ({ id: pid, displayName: name, personId })),
        ],
        meParticipantId: 'mahhee',
        items: [
          mkItem('m', 'Mine', 1, 90000, { kind: 'equal', participantIds: ['mahhee'] }),
          ...others.map(([pid]) => mkItem(`i-${pid}`, `For ${pid}`, 1, 90000, { kind: 'equal', participantIds: [pid] })),
        ],
        contributions: [{ participantId: 'mahhee', amount: $(90000 * (others.length + 1)) }],
      }),
    );

  it('C6 a bill missing from the results map is excluded', () => {
    const b = withSt(fixtureB({ id: 'b1' }));
    expect(balancesForMe([b], new Map())).toEqual({ youOwe: 0, owedToYou: 0, counterparties: [] });
  });

  it('C6 a transfer with no status entry counts as pending', () => {
    const b = fixtureB({ id: 'b1', transferStatuses: [] });
    const r = balancesForMe([b], resultsOf(b));
    expect(r.youOwe).toBe(180600);
    expect(r.counterparties).toEqual([{ key: 'hamza', displayName: 'Hamza', net: -180600 }]);
  });

  it('C6 youOwe and owedToYou are gross sums, not netted per person', () => {
    const a = withSt(fixtureB({ id: 'b1' })); // I owe hamza 180600
    const b = iPaid('b2', [['hamza', 'Hamza', 'hamza'], ['g', 'Zed', null]]); // hamza and Zed owe me 90000
    const r = balancesForMe([a, b], resultsOf(a, b));
    expect(r.youOwe).toBe(180600);
    expect(r.owedToYou).toBe(180000);
  });

  it('C6 counterparties are netted per key', () => {
    const a = withSt(fixtureB({ id: 'b1' }));
    const b = iPaid('b2', [['hamza', 'Hamza', 'hamza']]);
    const r = balancesForMe([a, b], resultsOf(a, b));
    expect(r.counterparties).toEqual([{ key: 'hamza', displayName: 'Hamza', net: 90000 - 180600 }]);
  });

  it('C6 counterparties sorted by |net| descending', () => {
    const a = withSt(fixtureB({ id: 'b1' })); // hamza -180600
    const b = iPaid('b2', [['g1', 'Zed', null], ['g2', 'Yan', null]]); // +90000 each
    const c = iPaid('b3', [['g3', 'Big', null]]); // +90000
    const r = balancesForMe([a, b, c], resultsOf(a, b, c));
    expect(r.counterparties.map((x) => x.key)).toEqual(['hamza', 'Big', 'Yan', 'Zed']);
  });

  it('C6 ties in |net| are ordered by key ascending', () => {
    const b = iPaid('b2', [['g1', 'Zed', null], ['g2', 'Amy', null], ['g3', 'Mia', null]]);
    const r = balancesForMe([b], resultsOf(b));
    expect(r.counterparties.map((x) => x.key)).toEqual(['Amy', 'Mia', 'Zed']);
    expect(r.counterparties.every((x) => x.net === 90000)).toBe(true);
  });

  it('C6 bigger magnitude first even when its net is negative', () => {
    const a = withSt(fixtureB({ id: 'b1' })); // hamza -180600
    const b = iPaid('b2', [['g1', 'Amy', null]]); // +90000
    const r = balancesForMe([a, b], resultsOf(a, b));
    expect(r.counterparties.map((x) => x.key)).toEqual(['hamza', 'Amy']);
  });

  it('C6 zero-net counterparties are omitted', () => {
    const a = withSt(fixtureB({ id: 'b1' })); // I owe hamza 180600
    const b = withSt(
      makeBill({
        id: 'b2',
        participants: [
          { id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' },
          { id: 'hamza', displayName: 'Hamza', personId: 'hamza' },
        ],
        meParticipantId: 'mahhee',
        items: [mkItem('i', 'Feast', 1, 180600, { kind: 'equal', participantIds: ['hamza'] })],
        contributions: [{ participantId: 'mahhee', amount: $(180600) }],
      }),
    ); // hamza owes me 180600
    const r = balancesForMe([a, b], resultsOf(a, b));
    expect(r.youOwe).toBe(180600);
    expect(r.owedToYou).toBe(180600);
    expect(r.counterparties).toEqual([]);
  });
});

describe('C7 settle clarifications', () => {
  it('C7 a transfer with no status entry counts as not paid', () => {
    const b = fixtureB({ transferStatuses: [] });
    expect(canSettle(b, calc(b))).toBe(false);
    const partial = fixtureB();
    const st = statusesFor(okBreakdown(partial), [0, 1]); // third transfer has no entry? (it has pending) -> drop it
    const b2 = { ...partial, transferStatuses: st.map((s, i) => (i < 2 ? s : null)).filter(Boolean) } as Bill;
    expect(canSettle(b2, calc(b2))).toBe(false);
  });
  it('C7 zero transfers with a non-null settlement -> canSettle true; settleBill works', () => {
    const b = makeBill({
      participants: [{ id: 'a', displayName: 'A', personId: 'a' }],
      meParticipantId: 'a',
      items: [mkItem('i', 'Tea', 1, 20000, { kind: 'equal', participantIds: ['a'] })],
      contributions: [{ participantId: 'a', amount: $(20000) }],
    });
    const r = calc(b);
    expect(r.ok && r.breakdown.settlement).not.toBeNull();
    expect(canSettle(b, r)).toBe(true);
    expect(settleBill(b, r, '2026-11-04T00:00:00.000Z').status).toBe('settled');
  });
  it('C7 reopenBill sets settledAt to null', () => {
    const base = fixtureB();
    const b = { ...base, transferStatuses: statusesFor(okBreakdown(base), [0, 1, 2]) } as Bill;
    const s = settleBill(b, calc(b), '2026-11-04T00:00:00.000Z');
    expect(s.settledAt).toBe('2026-11-04T00:00:00.000Z');
    const o = reopenBill(s);
    expect(o.settledAt).toBeNull();
    expect(o.status).toBe('open');
    expect(o.finalSnapshot).toBeNull();
  });
});

describe('C8 share summary sign handling', () => {
  const render = (bill: Bill, f: (p: Paisa) => string) => shareSummary(bill, okBreakdown(bill), { formatMoney: f });
  it('C8 "+" only on positive amounts; negatives use formatMoney as-is', () => {
    const f = (p: Paisa) => (p < 0 ? `(${-p})` : `${p}`);
    expect(render(fixtureB(), f).split('\n')[1]).toBe('Total 850000 (card discount (200000), tax +50000)');
  });
  it('C8 a formatter that already prefixes signs gets no extra "+" on negatives and exactly one on positives', () => {
    const f = (p: Paisa) => `${p < 0 ? '−' : ''}${Math.abs(p)}`;
    expect(render(fixtureB(), f).split('\n')[1]).toBe('Total 850000 (card discount −200000, tax +50000)');
  });
});
