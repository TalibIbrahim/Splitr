import { adj, bill, eq, fixed, item, NONE, people, rate } from '../helpers';
import type { Adjustment } from '../../src/index';
import type { Fixture } from './types';

/** a ate i1 = 60000, b ate i2 = 40000, B = 100000. unit 1 keeps rounded == exact. */
const two = (adjustments: Adjustment[]) =>
  bill({
    participants: people('a', 'b'),
    items: [item('i1', 60000, eq('a')), item('i2', 40000, eq('b'))],
    adjustments,
    unit: 1,
  });

/**
 * R16.3(a): B = 100000 < minimumSpend 150000 would skip the discount, but override 300 is unconditional.
 * amount -300 (a -180, b -120), applied true, warning NOT_APPLIED (below-minimum-spend) is still emitted.
 * a 59820, b 39880, T 99700.
 */
export const overrideBeatsMinimumSpend: Fixture = {
  name: 'override beats a minimum-spend skip (amount -300, warning kept)',
  rules: ['R16.3', 'R8.2', 'R8.7'],
  input: two([adj('d', 'discount', rate(1000), { minimumSpend: 150000, override: { amount: 300, reason: 'manager comp' } })]),
  expect: {
    ok: true,
    total: 99700,
    exact: { a: 59820, b: 39880 },
    adjustments: { d: -300 },
    allocations: { d: { a: -180, b: -120 } },
    warnings: [{ code: 'ADJUSTMENT_NOT_APPLIED', reason: 'below-minimum-spend', adjustmentId: 'd' }],
  },
};

/**
 * R16.3(b): no eligible items, override 500 still sets the magnitude: -500.
 * Every b_p is 0 so allocation falls back to equal (R9.3): a -250, b -250, with ALLOCATION_FALLBACK_EQUAL.
 * a 59750, b 39750, T 99500.
 */
export const overrideNoEligible: Fixture = {
  name: 'override on an adjustment with no eligible items',
  rules: ['R16.3', 'R6.3', 'R9.3'],
  input: two([adj('d', 'discount', rate(1000), { eligibility: { categories: ['nothing'] }, override: { amount: 500, reason: 'goodwill' } })]),
  expect: {
    ok: true,
    total: 99500,
    exact: { a: 59750, b: 39750 },
    adjustments: { d: -500 },
    allocations: { d: { a: -250, b: -250 } },
    warnings: [
      { code: 'ADJUSTMENT_NOT_APPLIED', reason: 'no-eligible-items', adjustmentId: 'd' },
      { code: 'ALLOCATION_FALLBACK_EQUAL', adjustmentId: 'd' },
    ],
  },
};

/**
 * R16.3(c): only i2 (B = 40000) eligible; computed 10% = 4000, cap 1000, override 50000 (> cap and > base).
 * Override is not capped or clamped: amount -50000, all to b (only b has a base). a 60000, b -10000, T 50000.
 * b is negative -> NEGATIVE_SHARE.
 */
export const overrideExceedsCapAndBase: Fixture = {
  name: 'override larger than cap and base is neither capped nor clamped',
  rules: ['R16.3', 'R8.5', 'R8.6', 'R8.7'],
  input: two([
    adj('d', 'discount', rate(1000), { eligibility: { itemIds: ['i2'] }, cap: 1000, override: { amount: 50000, reason: 'receipt says so' } }),
  ]),
  expect: {
    ok: true,
    total: 50000,
    exact: { a: 60000, b: -10000 },
    adjustments: { d: -50000 },
    allocations: { d: { b: -50000 } },
    warnings: [{ code: 'NEGATIVE_SHARE', participantId: 'b' }],
  },
};

/** R16.4: fixed discount 500 on a zero base (only a complimentary item eligible) is applied, then clamped to 0. No skip warning. */
export const fixedDiscountZeroBase: Fixture = {
  name: 'fixed discount on a zero base clamps to 0 (not skipped)',
  rules: ['R16.4', 'R8.4', 'R8.6'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('comp', 0, eq('a')), item('x', 10000, eq('b'))],
    adjustments: [adj('d', 'discount', fixed(500), { eligibility: { itemIds: ['comp'] } })],
    unit: 1,
  }),
  expect: { ok: true, total: 10000, exact: { a: 0, b: 10000 }, adjustments: { d: 0 } },
};

/** R16.5: unassigned item + wrong printedTotal -> only ITEM_UNASSIGNED (TOTAL_MISMATCH is not evaluated). */
export const unassignedSuppressesTotalMismatch: Fixture = {
  name: 'unassigned item hides TOTAL_MISMATCH',
  rules: ['R16.5', 'R10.5'],
  input: bill({
    participants: people('a'),
    items: [item('x', 1000, NONE), item('y', 500, eq('a'))],
    printedTotal: 99999,
  }),
  expect: { ok: false, errors: [{ code: 'ITEM_UNASSIGNED', rule: 'R4.1', itemId: 'x' }] },
};

/** R16.5: SUBTOTAL_MISMATCH is still reported (computed 1500 - printed 1400 = +100). */
export const unassignedKeepsSubtotalMismatch: Fixture = {
  name: 'unassigned item still reports SUBTOTAL_MISMATCH',
  rules: ['R16.5', 'R10.4'],
  input: bill({
    participants: people('a'),
    items: [item('x', 1000, NONE), item('y', 500, eq('a'))],
    printedSubtotal: 1400,
  }),
  expect: {
    ok: false,
    errors: [
      { code: 'ITEM_UNASSIGNED', rule: 'R4.1', itemId: 'x' },
      { code: 'SUBTOTAL_MISMATCH', rule: 'R10.4', difference: 100 },
    ],
  },
};
