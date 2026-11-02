import { adj, bill, eq, fixed, item, paid, people, rate } from '../helpers';
import type { Adjustment } from '../../src/index';
import type { Fixture } from './types';

/** Base bill: a ate 10000, tax 1000 bp = 1000 -> T 11000. unit 1 keeps the numbers literal. */
const base = (o: Parameters<typeof bill>[0] = {}) =>
  bill({
    participants: people('a'),
    items: [item('i1', 10000, eq('a'))],
    adjustments: [adj('tax', 'tax', rate(1000))],
    unit: 1,
    ...o,
  });

export const printedMatches: Fixture = {
  name: 'matching printed subtotal and total raise nothing',
  rules: ['R10.4', 'R10.5'],
  input: base({ printedSubtotal: 10000, printedTotal: 11000 }),
  expect: { ok: true, itemsSubtotal: 10000, total: 11000, exact: { a: 11000 }, adjustments: { tax: 1000 } },
};

export const printedTotalMismatch: Fixture = {
  name: 'printed total 11500 vs computed 11000 is TOTAL_MISMATCH (computed - printed = -500)',
  rules: ['R10.5'],
  input: base({ printedTotal: 11500 }),
  expect: { ok: false, errors: [{ code: 'TOTAL_MISMATCH', rule: 'R10.5', difference: -500 }] },
};

export const printedSubtotalMismatch: Fixture = {
  name: 'printed subtotal 9900 vs items 10000 is SUBTOTAL_MISMATCH (computed - printed = +100)',
  rules: ['R10.4'],
  input: base({ printedSubtotal: 9900 }),
  expect: { ok: false, errors: [{ code: 'SUBTOTAL_MISMATCH', rule: 'R10.4', difference: 100 }] },
};

export const printedAmountMismatch: Fixture = {
  name: 'printedAmount 1100 vs computed tax 1000 is ADJUSTMENT_PRINTED_MISMATCH (computed - printed = -100)',
  rules: ['R8.8'],
  input: base({ adjustments: [adj('tax', 'tax', rate(1000), { printedAmount: 1100 })] }),
  expect: {
    ok: false,
    errors: [{ code: 'ADJUSTMENT_PRINTED_MISMATCH', rule: 'R8.8', adjustmentId: 'tax', difference: -100 }],
  },
};

export const printedAmountMatches: Fixture = {
  name: 'printedAmount equal to the computed amount is fine',
  rules: ['R8.8'],
  input: base({ adjustments: [adj('tax', 'tax', rate(1000), { printedAmount: 1000 })] }),
  expect: { ok: true, total: 11000, exact: { a: 11000 }, adjustments: { tax: 1000 } },
};

/** Override 1100 (reason given) makes the final magnitude equal printedAmount 1100 -> no mismatch. T 11100. */
export const overrideFixesPrinted: Fixture = {
  name: 'override with a reason resolves a printedAmount mismatch',
  rules: ['R8.7', 'R8.8'],
  input: base({
    adjustments: [adj('tax', 'tax', rate(1000), { printedAmount: 1100, override: { amount: 1100, reason: 'receipt rounds up' } })],
  }),
  expect: { ok: true, total: 11100, exact: { a: 11100 }, adjustments: { tax: 1100 } },
};

// ── validity (R8.1): bill date 2026-11-02 is a Monday (UTC weekday 1) ──

const discountWith = (validity: NonNullable<Adjustment['validity']>, date = '2026-11-02') =>
  bill({
    participants: people('a'),
    date,
    items: [item('i1', 10000, eq('a'))],
    adjustments: [adj('d', 'discount', rate(1000), { validity })],
    unit: 1,
  });

const applied = (name: string, validity: NonNullable<Adjustment['validity']>): Fixture => ({
  name,
  rules: ['R8.1'],
  input: discountWith(validity),
  expect: { ok: true, total: 9000, exact: { a: 9000 }, adjustments: { d: -1000 } },
});

const skipped = (name: string, validity: NonNullable<Adjustment['validity']>): Fixture => ({
  name,
  rules: ['R8.1'],
  input: discountWith(validity),
  expect: {
    ok: true,
    total: 10000,
    exact: { a: 10000 },
    adjustments: { d: 0 },
    warnings: [{ code: 'ADJUSTMENT_NOT_APPLIED', reason: 'outside-validity', adjustmentId: 'd' }],
  },
});

export const validityFixtures: Fixture[] = [
  applied('validity: date inside from..to', { from: '2026-11-01', to: '2026-11-30' }),
  applied('validity: `from` is inclusive', { from: '2026-11-02' }),
  applied('validity: `to` is inclusive', { to: '2026-11-02' }),
  applied('validity: weekday matches (Monday = 1)', { daysOfWeek: [1] }),
  applied('validity: weekday among several', { daysOfWeek: [0, 1, 5] }),
  applied('validity: date and weekday both satisfied', { from: '2026-10-01', to: '2026-12-31', daysOfWeek: [1, 2] }),
  skipped('validity: before from', { from: '2026-11-03' }),
  skipped('validity: after to', { to: '2026-11-01' }),
  skipped('validity: weekday does not match', { daysOfWeek: [0, 6] }),
  skipped('validity: date ok but weekday not', { from: '2026-11-01', to: '2026-11-30', daysOfWeek: [2] }),
];

// ── contributions (R12.1) ──

export const noContributions: Fixture = {
  name: 'no contributions: settlement null with NO_CONTRIBUTIONS warning',
  rules: ['R12.1'],
  input: base(),
  expect: { ok: true, total: 11000, exact: { a: 11000 }, warnings: [{ code: 'NO_CONTRIBUTIONS' }] },
};

export const contributionsMismatch: Fixture = {
  name: 'contributions 10000 vs total 11000 is CONTRIBUTIONS_MISMATCH (sum - T = -1000)',
  rules: ['R12.1'],
  input: base({ contributions: paid({ a: 10000 }) }),
  expect: { ok: false, errors: [{ code: 'CONTRIBUTIONS_MISMATCH', rule: 'R12.1', difference: -1000 }] },
};

export const contributionUnknownParticipant: Fixture = {
  name: 'contribution from an unknown participant is invalid',
  rules: ['R3.4', 'R12.1'],
  input: base({ contributions: paid({ ghost: 11000 }) }),
  expect: { ok: false, errors: [{ code: 'INVALID_INPUT', rule: 'R3.4' }] },
};

export const contributionNonPositive: Fixture = {
  name: 'contribution amount 0 is invalid',
  rules: ['R12.1'],
  input: base({ contributions: paid({ a: 0 }) }),
  expect: { ok: false, errors: [{ code: 'INVALID_INPUT', rule: 'R12.1' }] },
};

// ── ADJUSTMENT_INVALID_BASE (R7.2) ──

const stackedBad = (adjustments: Adjustment[]) =>
  bill({
    participants: people('a', 'b'),
    items: [item('i1', 10000, eq('a')), item('i2', 10000, eq('b'))],
    adjustments,
    unit: 1,
  });

const invalidBase = (name: string, adjustments: Adjustment[], adjustmentId: string): Fixture => ({
  name,
  rules: ['R7.2'],
  input: stackedBad(adjustments),
  expect: { ok: false, errors: [{ code: 'ADJUSTMENT_INVALID_BASE', rule: 'R7.2', adjustmentId }] },
});

export const invalidBaseFixtures: Fixture[] = [
  invalidBase(
    'items-after includes an adjustment that comes LATER (higher order)',
    [
      adj('x', 'tax', rate(500), { order: 1, base: { type: 'items-after', include: ['y'] } }),
      adj('y', 'discount', rate(500), { order: 2 }),
    ],
    'x',
  ),
  invalidBase(
    'items-after includes an adjustment with the same order but a higher id',
    [
      adj('x', 'tax', rate(500), { order: 1, base: { type: 'items-after', include: ['y'] } }),
      adj('y', 'discount', rate(500), { order: 1 }),
    ],
    'x',
  ),
  invalidBase('items-after includes itself', [adj('x', 'tax', rate(500), { order: 1, base: { type: 'items-after', include: ['x'] } })], 'x'),
  invalidBase(
    'items-after includes an adjustment with a non-proportional allocation',
    [
      adj('x', 'tip', fixed(500), { order: 1, allocation: { type: 'equal' } }),
      adj('y', 'tax', rate(500), { order: 2, base: { type: 'items-after', include: ['x'] } }),
    ],
    'y',
  ),
  invalidBase(
    'all-prior with an earlier non-proportional adjustment',
    [
      adj('x', 'tip', fixed(500), { order: 1, allocation: { type: 'equal' } }),
      adj('y', 'tax', rate(500), { order: 2, base: { type: 'items-after', include: 'all-prior' } }),
    ],
    'y',
  ),
];

/** Same order, lower id IS earlier: 'a' (order 1) before 'b' (order 1) -> valid. disc 10% = -2000, tax 10% of 18000 = 1800. */
export const sameOrderLowerIdIsEarlier: Fixture = {
  name: 'items-after may include a same-order adjustment with a lower id',
  rules: ['R5.3', 'R7.2'],
  input: stackedBad([
    adj('a', 'discount', rate(1000), { order: 1 }),
    adj('b', 'tax', rate(1000), { order: 1, base: { type: 'items-after', include: ['a'] } }),
  ]),
  expect: {
    ok: true,
    total: 19800,
    exact: { a: 9900, b: 9900 },
    adjustments: { a: -2000, b: 1800 },
  },
};
