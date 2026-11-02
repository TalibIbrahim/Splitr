import type { Item } from '@splitr/calculation-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cardDiscount, explainParticipant, tax, tip, type ExplainLine } from '../src/index';
import { $, at, bp, deepFreeze, fixtureB, makeBill, mkItem, okBreakdown } from './helpers';

const lines = (pid: string, over: Parameters<typeof fixtureB>[0] = {}): ExplainLine[] => {
  const bill = fixtureB(over);
  return explainParticipant(okBreakdown(bill), bill, pid);
};
const brief = (ls: ExplainLine[]) => ls.map((l) => [l.kind, l.label, l.amount, l.context] as const);

describe('D6 explainParticipant, Fixture B', () => {
  it("D6 Mahhee's full explanation (items with context, subtotal, adjustments, exact, rounding, final)", () => {
    expect(brief(lines('mahhee'))).toEqual([
      ['item', 'Chicken Karahi', 80000, 'split 4 ways'],
      ['item', 'Daal Makhni', 47500, 'split 2 ways'],
      ['item', 'Garlic Naan', 18000, 'split 4 ways'],
      ['item', 'Mint Margarita', 45000, '1 of 3'],
      ['item', 'Doodh Patti', 22000, 'split 4 ways'],
      ['items-subtotal', 'Items', 212500, undefined],
      ['adjustment', 'Card discount', -42500, '20% of 2,125'],
      ['adjustment', 'Tax', 10625, '5% of 2,125'],
      ['exact', 'Exact share', 180625, undefined],
      ['rounding', 'Rounded', -25, undefined],
      ['final', 'Your share', 180600, undefined],
    ]);
  });

  it('D6 omits items the participant has no share of (Mahhee has no Mutton Seekh)', () => {
    expect(lines('mahhee').some((l) => l.label === 'Mutton Seekh')).toBe(false);
  });

  it('D6 Ali: units context "1 of 2", rounding +50, final labelled with the name', () => {
    expect(brief(lines('ali'))).toEqual([
      ['item', 'Chicken Karahi', 80000, 'split 4 ways'],
      ['item', 'Mutton Seekh', 145000, '1 of 2'],
      ['item', 'Garlic Naan', 18000, 'split 4 ways'],
      ['item', 'Doodh Patti', 22000, 'split 4 ways'],
      ['items-subtotal', 'Items', 265000, undefined],
      ['adjustment', 'Card discount', -53000, '20% of 2,650'],
      ['adjustment', 'Tax', 13250, '5% of 2,650'],
      ['exact', 'Exact share', 225250, undefined],
      ['rounding', 'Rounded', 50, undefined],
      ['final', "Ali's share", 225300, undefined],
    ]);
  });

  it('D6 omits the Rounded line when the delta is zero (Hamza)', () => {
    const ls = lines('hamza');
    expect(ls.some((l) => l.kind === 'rounding')).toBe(false);
    expect(at(ls, ls.length - 1)).toMatchObject({ kind: 'final', label: "Hamza's share", amount: 263500 });
    expect(ls.find((l) => l.kind === 'exact')?.amount).toBe(263500);
  });

  it('D6 "Your share" is used only for meParticipantId', () => {
    const meNull = lines('mahhee', { meParticipantId: null });
    expect(at(meNull, meNull.length - 1).label).toBe("Mahhee's share");
    const meHamza = lines('mahhee', { meParticipantId: 'hamza' });
    expect(at(meHamza, meHamza.length - 1).label).toBe("Mahhee's share");
    const hamzaIsMe = lines('hamza', { meParticipantId: 'hamza' });
    expect(at(hamzaIsMe, hamzaIsMe.length - 1).label).toBe('Your share');
  });

  it('D6 amounts come from the breakdown (items-subtotal/exact/final match ParticipantBreakdown)', () => {
    const bill = fixtureB();
    const b = okBreakdown(bill);
    for (const p of b.participants) {
      const ls = explainParticipant(b, bill, p.participantId);
      expect(ls.find((l) => l.kind === 'items-subtotal')?.amount).toBe(p.itemsSubtotal);
      expect(ls.find((l) => l.kind === 'exact')?.amount).toBe(p.exactTotal);
      expect(at(ls, ls.length - 1).amount).toBe(p.roundedTotal);
    }
  });

  it('D6 does not mutate frozen inputs', () => {
    const bill = deepFreeze(fixtureB());
    const b = deepFreeze(okBreakdown(bill));
    expect(() => explainParticipant(b, bill, 'mahhee')).not.toThrow();
  });
});

describe('D6 context wording', () => {
  const twoPeople = (item: Item) => {
    const bill = makeBill({
      participants: [
        { id: 'a', displayName: 'A', personId: 'a' },
        { id: 'b', displayName: 'B', personId: 'b' },
      ],
      meParticipantId: 'a',
      items: [item],
    });
    return explainParticipant(okBreakdown(bill), bill, 'a');
  };

  it('D6 percent split shows "{x}%" (50%)', () => {
    const item = mkItem('p', 'Pizza', 1, 100000, {
      kind: 'percent',
      entries: [{ participantId: 'a', bp: bp(5000) }, { participantId: 'b', bp: bp(5000) }],
    });
    expect(twoPeople(item).find((l) => l.kind === 'item')).toMatchObject({ label: 'Pizza', amount: 50000, context: '50%' });
  });

  it('D6 percent split shows 25% for 2500 bp', () => {
    const item = mkItem('p', 'Pizza', 1, 100000, {
      kind: 'percent',
      entries: [{ participantId: 'a', bp: bp(2500) }, { participantId: 'b', bp: bp(7500) }],
    });
    expect(twoPeople(item).find((l) => l.kind === 'item')).toMatchObject({ amount: 25000, context: '25%' });
  });

  it('D6 units split shows "{u} of {qty}" (2 of 3)', () => {
    const item = mkItem('u', 'Wings', 3, 90000, {
      kind: 'units',
      entries: [{ participantId: 'a', units: 2 }, { participantId: 'b', units: 1 }],
    });
    expect(twoPeople(item).find((l) => l.kind === 'item')).toMatchObject({ amount: 60000, context: '2 of 3' });
  });

  it('D6 equal split among 3 shows "split 3 ways"', () => {
    const bill = makeBill({
      participants: ['a', 'b', 'c'].map((id) => ({ id, displayName: id.toUpperCase(), personId: id })),
      meParticipantId: 'a',
      items: [mkItem('e', 'Fries', 1, 30000, { kind: 'equal', participantIds: ['a', 'b', 'c'] })],
    });
    const ls = explainParticipant(okBreakdown(bill), bill, 'a');
    expect(ls.find((l) => l.kind === 'item')).toMatchObject({ amount: 10000, context: 'split 3 ways' });
  });

  it('D6 rupee figures in adjustment context use thousands grouping and no "Rs"', () => {
    const bill = makeBill({
      participants: [{ id: 'a', displayName: 'A', personId: 'a' }],
      meParticipantId: 'a',
      items: [mkItem('x', 'Feast', 1, 12345600, { kind: 'equal', participantIds: ['a'] })],
      adjustments: [cardDiscount('d', 10, { rateBp: bp(1000) })],
    });
    const ls = explainParticipant(okBreakdown(bill), bill, 'a');
    const adj = ls.find((l) => l.kind === 'adjustment');
    expect(adj?.amount).toBe(-1234560);
    expect(adj?.context).toBe('10% of 123,456');
  });

  it('D6 zero-amount adjustments are omitted', () => {
    const bill = fixtureB({
      adjustments: [cardDiscount('d', 10, { rateBp: bp(2000) }), tax('t', 30, { rateBp: bp(0), base: 'original' })],
      contributions: [{ participantId: 'hamza', amount: $(800000) }],
    });
    const ls = explainParticipant(okBreakdown(bill), bill, 'mahhee');
    expect(ls.filter((l) => l.kind === 'adjustment').map((l) => l.label)).toEqual(['Card discount']);
  });

  it('D6 a bill without adjustments has no adjustment lines and exact equals the subtotal', () => {
    const bill = fixtureB({ adjustments: [], contributions: [{ participantId: 'hamza', amount: $(1000000) }] });
    const ls = explainParticipant(okBreakdown(bill), bill, 'mahhee');
    expect(ls.some((l) => l.kind === 'adjustment')).toBe(false);
    expect(ls.find((l) => l.kind === 'exact')?.amount).toBe(212500);
  });

  it('D6 adjustment lines follow application order, not input order', () => {
    const bill = fixtureB({
      adjustments: [
        tax('t', 30, { rateBp: bp(500), base: 'original' }),
        cardDiscount('d', 10, { rateBp: bp(2000) }),
      ],
    });
    const ls = explainParticipant(okBreakdown(bill), bill, 'mahhee');
    expect(ls.filter((l) => l.kind === 'adjustment').map((l) => l.label)).toEqual(['Card discount', 'Tax']);
  });

  it('D6 non-rate adjustments (equal tip) still appear with their signed share', () => {
    const bill = fixtureB({
      adjustments: [tip('p', 40, { amount: $(40000), split: 'equal' })],
      contributions: [{ participantId: 'hamza', amount: $(1040000) }],
    });
    const ls = explainParticipant(okBreakdown(bill), bill, 'mahhee');
    expect(ls.find((l) => l.kind === 'adjustment')).toMatchObject({ label: 'Tip', amount: 10000 });
  });
});

describe('D6 reconciliation property', () => {
  const ids = ['a', 'b', 'c'];
  const itemArb = fc.record({
    total: fc.integer({ min: 1, max: 500000 }),
    who: fc.subarray(ids, { minLength: 1 }),
  });

  it('D6 signed amounts (items + adjustments + rounding) add up to the final line, for every participant', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 0, max: 50000 }),
        (rawItems, discBp, taxBp, tipAmt) => {
          const bill = makeBill({
            participants: ids.map((id) => ({ id, displayName: id.toUpperCase(), personId: id })),
            meParticipantId: 'a',
            items: rawItems.map((r, i) => mkItem(`i${i}`, `Item ${i}`, 1, r.total, { kind: 'equal', participantIds: r.who })),
            adjustments: [
              cardDiscount('d', 10, { rateBp: bp(discBp) }),
              tax('t', 30, { rateBp: bp(taxBp), base: 'after-discounts' }),
              tip('p', 40, { amount: $(tipAmt), split: 'proportional' }),
            ],
          });
          const b = okBreakdown(bill);
          for (const p of b.participants) {
            const ls = explainParticipant(b, bill, p.participantId);
            const signed = ls.filter((l) => ['item', 'adjustment', 'rounding'].includes(l.kind)).reduce((s, l) => s + l.amount, 0);
            const final = at(ls, ls.length - 1);
            expect(final.kind).toBe('final');
            expect(final.amount).toBe(p.roundedTotal);
            expect(signed).toBe(p.roundedTotal);
            const itemsSum = ls.filter((l) => l.kind === 'item').reduce((s, l) => s + l.amount, 0);
            expect(ls.find((l) => l.kind === 'items-subtotal')?.amount).toBe(itemsSum);
            const withAdj = itemsSum + ls.filter((l) => l.kind === 'adjustment').reduce((s, l) => s + l.amount, 0);
            expect(ls.find((l) => l.kind === 'exact')?.amount).toBe(withAdj);
            expect(ls.some((l) => l.kind === 'rounding')).toBe(p.roundingDelta !== 0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
