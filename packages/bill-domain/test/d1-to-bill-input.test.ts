import { calculateBill } from '@splitr/calculation-engine';
import { describe, expect, it } from 'vitest';
import { toBillInput } from '../src/index';
import { $, deepFreeze, engineInput, fixtureB, makeBill, SEATS } from './helpers';

describe('D1 toBillInput', () => {
  it('D1 maps participants to {id, displayName} only (no personId leaks)', () => {
    const input = toBillInput(fixtureB());
    expect(input.participants).toStrictEqual([
      { id: 'mahhee', displayName: 'Mahhee' },
      { id: 'hamza', displayName: 'Hamza' },
      { id: 'ali', displayName: 'Ali' },
      { id: 'saad', displayName: 'Saad' },
    ]);
  });

  it('D1 copies currency, date, items, adjustments, contributions and rounding unit verbatim', () => {
    const bill = fixtureB({ settlementRoundingUnit: $(50) });
    const input = toBillInput(bill);
    expect(input.currency).toBe('PKR');
    expect(input.date).toBe('2026-11-02');
    expect(input.items).toEqual(bill.items);
    expect(input.adjustments).toEqual(bill.adjustments);
    expect(input.contributions).toEqual([{ participantId: 'hamza', amount: 850000 }]);
    expect(input.settlementRoundingUnit).toBe(50);
  });

  it('D1 carries printedSubtotal and printedTotal when set', () => {
    const input = toBillInput(fixtureB({ printedSubtotal: $(1000000), printedTotal: $(850000) }));
    expect(input.printedSubtotal).toBe(1000000);
    expect(input.printedTotal).toBe(850000);
  });

  it('D1 leaves printed totals undefined when the bill has none', () => {
    const input = toBillInput(fixtureB());
    expect(input.printedSubtotal).toBeUndefined();
    expect(input.printedTotal).toBeUndefined();
  });

  it('D1 uses bill.date as the engine date', () => {
    expect(toBillInput(fixtureB({ date: '2027-01-09' })).date).toBe('2027-01-09');
  });

  it('D1 drops document-only fields (status, snapshot, statuses, restaurant, group)', () => {
    const input = toBillInput(fixtureB({ groupId: 'g1' })) as unknown as Record<string, unknown>;
    const allowed = new Set([
      'currency', 'date', 'participants', 'items', 'adjustments', 'contributions',
      'printedSubtotal', 'printedTotal', 'settlementRoundingUnit',
    ]);
    for (const k of Object.keys(input)) expect(allowed.has(k), `unexpected key ${k}`).toBe(true);
  });

  it('D1 is pure: does not mutate a frozen bill and is deterministic', () => {
    const bill = deepFreeze(fixtureB());
    expect(toBillInput(bill)).toEqual(toBillInput(bill));
  });

  it('D1 keeps array order (participants, items)', () => {
    const bill = fixtureB({ participants: [...SEATS].reverse() });
    expect(toBillInput(bill).participants.map((p) => p.id)).toEqual(['saad', 'ali', 'hamza', 'mahhee']);
    expect(toBillInput(bill).items.map((i) => i.id)).toEqual(bill.items.map((i) => i.id));
  });

  it('D1 output feeds the engine and equals the hand-mapped result (Fixture B total 850000)', () => {
    const bill = fixtureB();
    const viaD1 = calculateBill(toBillInput(bill));
    const viaHand = calculateBill(engineInput(bill));
    expect(viaD1).toEqual(viaHand);
    expect(viaD1.ok && viaD1.breakdown.total).toBe(850000);
  });

  it('D1 empty bill maps to empty arrays', () => {
    const input = toBillInput(makeBill());
    expect(input.participants).toEqual([]);
    expect(input.items).toEqual([]);
    expect(input.adjustments).toEqual([]);
    expect(input.contributions).toEqual([]);
  });
});
