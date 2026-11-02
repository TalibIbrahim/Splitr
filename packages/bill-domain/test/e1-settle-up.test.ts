/**
 * E1 settleUpPlan (docs/phase4-spec.md section 1). Written from the spec only.
 * Assumed call shape: settleUpPlan(bills, results) (same as balancesForMe; "me" comes from bill.meParticipantId)
 * returning an array of { key, displayName, net, sources: { billId, from, to, amount }[] }.
 * `plan()` below also accepts `{ counterparties: [...] }` so only one place changes if the container differs.
 */
import type { CalculationResult } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as domain from '../src/index';
import { balancesForMe } from '../src/index';
import { $, calc, fixtureB, makeBill, mkItem, statusesFor } from './helpers';

interface Source {
  billId: string;
  from: string;
  to: string;
  amount: number;
}
interface Entry {
  key: string;
  displayName?: string;
  net: number;
  sources: Source[];
}

const results = (...bills: Bill[]): ReadonlyMap<string, CalculationResult> =>
  new Map(bills.map((b) => [b.id, calc(b)]));

function plan(bills: Bill[]): Entry[] {
  // Spec E1 (phase4-spec.md): settleUpPlan(bills, results) returns Entry[] with a `sources` field.
  return domain.settleUpPlan(bills, results(...bills)) as unknown as Entry[];
}

function pend(bill: Bill, paidIdx: number[] = []): Bill {
  const r = calc(bill);
  if (!r.ok) return bill;
  return { ...bill, transferStatuses: statusesFor(r.breakdown, paidIdx) } as Bill;
}

const sortSources = (s: Source[]) =>
  [...s].sort((a, b) => (a.billId + a.from + a.to).localeCompare(b.billId + b.from + b.to));

const signed = (sources: Source[]) => sources.reduce((n, s) => n + (s.to === 'mahhee' ? s.amount : -s.amount), 0);

/** Fixture B: mahhee owes hamza 180600 (ali, saad owe hamza too, not mine). */
const b1 = (over: Parameters<typeof fixtureB>[0] = {}) => pend(fixtureB({ id: 'b1', ...over }));

/** Mahhee paid 270000 for three; hamza and guest "Zed" owe 90000 each. */
function b2(over: Parameters<typeof makeBill>[0] = {}): Bill {
  return pend(
    makeBill({
      id: 'b2',
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
    }),
  );
}

/** Mahhee paid; hamza owes her exactly 180600 (cancels Fixture B's debt to hamza). */
const b5 = () =>
  pend(
    makeBill({
      id: 'b5',
      participants: [
        { id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' },
        { id: 'hamza', displayName: 'Hamza', personId: 'hamza' },
      ],
      meParticipantId: 'mahhee',
      items: [mkItem('i', 'Dinner', 1, 180600, { kind: 'equal', participantIds: ['hamza'] })],
      contributions: [{ participantId: 'mahhee', amount: $(180600) }],
    }),
  );

/** Two guests owing me 50000 each: a tie broken by key (Amy < Zed). */
const bTie = () =>
  pend(
    makeBill({
      id: 'bt',
      participants: [
        { id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' },
        { id: 'gz', displayName: 'Zed', personId: null },
        { id: 'ga', displayName: 'Amy', personId: null },
      ],
      meParticipantId: 'mahhee',
      items: [
        mkItem('i1', 'A', 1, 50000, { kind: 'equal', participantIds: ['gz'] }),
        mkItem('i2', 'B', 1, 50000, { kind: 'equal', participantIds: ['ga'] }),
      ],
      contributions: [{ participantId: 'mahhee', amount: $(100000) }],
    }),
  );

describe('E1 settleUpPlan', () => {
  it('E1 no bills -> empty plan', () => {
    expect(plan([])).toEqual([]);
  });

  it('E1 single bill, I am debtor: one entry, net negative (I owe), source lists my transfer', () => {
    const p = plan([b1()]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ key: 'hamza', net: -180600 });
    expect(p[0]!.sources).toEqual([{ billId: 'b1', from: 'mahhee', to: 'hamza', amount: 180600 }]);
  });

  it("E1 other people's transfers (ali->hamza, saad->hamza) are never sources", () => {
    const p = plan([b1()]);
    for (const e of p) for (const s of e.sources) expect([s.from, s.to]).toContain('mahhee');
    expect(p.map((e) => e.key)).toEqual(['hamza']);
  });

  it('E1 I am payer, guest counterparty is keyed by display name; positive net = they owe me', () => {
    const p = plan([b2()]);
    const byKey = Object.fromEntries(p.map((e) => [e.key, e]));
    expect(Object.keys(byKey).sort()).toEqual(['Zed', 'hamza']);
    expect(byKey['Zed']).toMatchObject({ net: 90000 });
    expect(byKey['Zed']!.sources).toEqual([{ billId: 'b2', from: 'g1', to: 'mahhee', amount: 90000 }]);
    expect(byKey['hamza']).toMatchObject({ net: 90000 });
  });

  it('E1 nets across bills are sums: hamza -180600 + 90000 = -90600; sources list both bills', () => {
    const p = plan([b1(), b2()]);
    const hamza = p.find((e) => e.key === 'hamza')!;
    expect(hamza.net).toBe(-90600);
    expect(sortSources(hamza.sources)).toEqual(
      sortSources([
        { billId: 'b1', from: 'mahhee', to: 'hamza', amount: 180600 },
        { billId: 'b2', from: 'hamza', to: 'mahhee', amount: 90000 },
      ]),
    );
    expect(signed(hamza.sources)).toBe(hamza.net);
  });

  it('E1 three bills combine; sorted by |net| desc', () => {
    const p = plan([b2(), b1(), bTie()]);
    // hamza: -180600 + 90000 = -90600; Zed: 90000 + 50000 = 140000 (same key across bills); Amy: 50000
    expect(p.map((e) => [e.key, e.net])).toEqual([
      ['Zed', 140000],
      ['hamza', -90600],
      ['Amy', 50000],
    ]);
  });

  it('E1 zero-net counterparty is omitted (I owe hamza 180600 in b1, he owes me 180600 in b5)', () => {
    expect(plan([b1(), b5()])).toEqual([]);
  });

  it('E1 zero-net omitted while other counterparties stay', () => {
    const p = plan([b1(), b5(), bTie()]);
    expect(p.map((e) => e.key)).toEqual(['Amy', 'Zed']);
  });

  it('E1 ties on |net| are ordered by key ascending (Amy before Zed)', () => {
    expect(plan([bTie()]).map((e) => e.key)).toEqual(['Amy', 'Zed']);
  });

  it('E1 tie on |net| between a person id and a guest name falls back to key order (code units: Zed < hamza)', () => {
    expect(plan([b2()]).map((e) => e.key)).toEqual(['Zed', 'hamza']);
  });

  it('E1 settled bills are excluded', () => {
    const p = plan([{ ...b1(), status: 'settled' } as Bill, b2()]);
    expect(p.flatMap((e) => e.sources.map((s) => s.billId))).not.toContain('b1');
    expect(p.find((e) => e.key === 'hamza')!.net).toBe(90000);
  });

  it('E1 bills whose engine result failed are excluded', () => {
    const failing = b2({ id: 'bad', printedTotal: $(1) });
    expect(calc(failing).ok).toBe(false);
    const p = plan([failing, b1()]);
    expect(p.flatMap((e) => e.sources.map((s) => s.billId))).toEqual(['b1']);
  });

  it('E1 bills without a settlement (no contributions) or without me are excluded', () => {
    expect(plan([b1({ contributions: [] })])).toEqual([]);
    expect(plan([b1({ meParticipantId: null })])).toEqual([]);
  });

  it('E1 a paid transfer is excluded (pending only)', () => {
    // b1 transfers: ali->hamza, mahhee->hamza, saad->hamza (index 1 is mine)
    const paid = pend(fixtureB({ id: 'b1' }), [1]);
    expect(plan([paid])).toEqual([]);
    // b2 transfers: g1->mahhee (0) paid, hamza->mahhee still pending
    const half = pend(b2(), [0]);
    const p = plan([half]);
    expect(p.map((e) => e.key)).toEqual(['hamza']);
    expect(p[0]!.net).toBe(90000);
  });

  it('E1 a transfer with no status entry counts as pending', () => {
    const noStatuses = { ...b2(), transferStatuses: [] } as Bill;
    expect(plan([noStatuses]).map((e) => e.net)).toEqual([90000, 90000]);
  });

  it('E1 does not mutate its inputs', () => {
    const bills = [b1(), b2()];
    const snap = JSON.stringify(bills);
    plan(bills);
    expect(JSON.stringify(bills)).toBe(snap);
  });

  it('E1 property: sum of nets = owedToYou - youOwe from balancesForMe (any mix of paid/settled/failing/no-me bills)', () => {
    const pool: (() => Bill)[] = [
      () => fixtureB({ id: 'p1' }),
      () => b2({ id: 'p2' }),
      () => b5(),
      () => bTie(),
      () => fixtureB({ id: 'p5', meParticipantId: null }),
      () => b2({ id: 'p6', printedTotal: $(1) }),
    ];
    fc.assert(
      fc.property(
        fc.subarray([0, 1, 2, 3, 4, 5]),
        fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
        fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
        (idx, settledFlags, paidFlags) => {
          const bills = idx.map((i, n) => {
            const raw = pool[i]!();
            const r = calc(raw);
            const nt = r.ok ? (r.breakdown.settlement?.transfers.length ?? 0) : 0;
            const paidIdx = [...Array(nt).keys()].filter((k) => paidFlags[(k + n) % 6]);
            const withSt = pend({ ...raw, id: `${raw.id}-${n}` } as Bill, paidIdx);
            return settledFlags[n % 6] ? ({ ...withSt, status: 'settled' } as Bill) : withSt;
          });
          const res = results(...bills);
          const sum = plan(bills).reduce((n, e) => n + e.net, 0);
          const bal = balancesForMe(bills, res);
          expect(sum).toBe(bal.owedToYou - bal.youOwe);
          expect(sum).toBe(bal.counterparties.reduce((n, c) => n + c.net, 0));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('E1 property: ordering, no zero nets, every net equals its signed sources', () => {
    const mk: (() => Bill)[] = [() => b1(), () => b2(), () => b5(), () => bTie()];
    fc.assert(
      fc.property(fc.subarray([0, 1, 2, 3]), (idx) => {
        const bills = idx.map((i) => mk[i]!());
        const p = plan(bills);
        for (let i = 0; i < p.length; i++) {
          expect(p[i]!.net).not.toBe(0);
          expect(signed(p[i]!.sources)).toBe(p[i]!.net);
          if (i > 0) {
            const a = Math.abs(p[i - 1]!.net);
            const b = Math.abs(p[i]!.net);
            expect(a > b || (a === b && p[i - 1]!.key < p[i]!.key)).toBe(true);
          }
        }
      }),
    );
  });
});
