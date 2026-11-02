import { describe, expect, it } from 'vitest';
import { cardSaving, isTransferMarkedPaid, splitPaymentStatus } from './payments';

describe('splitPaymentStatus', () => {
  it('reports what is left', () => {
    const s = splitPaymentStatus(10_000, [4_000]);
    expect(s).toMatchObject({ direction: 'left', gap: 6_000, canSave: false });
  });
  it('reports over-assignment', () => {
    expect(splitPaymentStatus(10_000, [7_000, 4_000])).toMatchObject({ direction: 'over', gap: 1_000, canSave: false });
  });
  it('allows save only when the sum equals the total', () => {
    expect(splitPaymentStatus(10_000, [7_000, 3_000, 0])).toMatchObject({ direction: 'done', gap: 0, canSave: true });
  });
  it('blocks save with an invalid row', () => {
    const s = splitPaymentStatus(10_000, [10_000, null]);
    expect(s.hasInvalid).toBe(true);
    expect(s.canSave).toBe(false);
  });
  it('blocks save when nothing is entered', () => {
    expect(splitPaymentStatus(0, [0, 0]).canSave).toBe(false);
  });
});

describe('cardSaving', () => {
  it('sums discounts only, as a positive amount', () => {
    expect(
      cardSaving([
        { kind: 'discount', amount: -200_000 },
        { kind: 'tax', amount: 50_000 },
        { kind: 'discount', amount: -5_000 },
      ]),
    ).toBe(205_000);
  });
  it('is 0 without discounts', () => {
    expect(cardSaving([{ kind: 'tax', amount: 50_000 }])).toBe(0);
  });
});

describe('isTransferMarkedPaid', () => {
  const statuses = [{ from: 'a', to: 'b', amount: 100, status: 'paid' as const }];
  it('matches on from, to and amount', () => {
    expect(isTransferMarkedPaid(statuses, { from: 'a', to: 'b', amount: 100 })).toBe(true);
    expect(isTransferMarkedPaid(statuses, { from: 'a', to: 'b', amount: 200 })).toBe(false);
    expect(isTransferMarkedPaid(statuses, { from: 'b', to: 'a', amount: 100 })).toBe(false);
  });
});
