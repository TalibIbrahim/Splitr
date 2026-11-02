import type { Adjustment } from '../../src/index';
import { adj, bill, eq, fixed, item, people, rate } from '../helpers';
import type { Fixture } from './types';

/** Two people: a ate i1 = 60000, b ate i2 = 40000. Subtotal B = 100000. */
const two = (adjustments: Adjustment[], items = [item('i1', 60000, eq('a')), item('i2', 40000, eq('b'))]) =>
  bill({ participants: people('a', 'b'), items, adjustments });

/** 1000 bp of 100000 = 10000 -> a -6000 (60000/100000), b -4000. a 54000, b 36000, T 90000. */
export const percentDiscount: Fixture = {
  name: 'percentage discount 10%',
  rules: ['R5.1', 'R8.3', 'R9.3'],
  input: two([adj('d', 'discount', rate(1000))]),
  expect: {
    ok: true,
    itemsSubtotal: 100000,
    total: 90000,
    exact: { a: 54000, b: 36000 },
    rounded: { a: 54000, b: 36000 },
    adjustments: { d: -10000 },
    allocations: { d: { a: -6000, b: -4000 } },
  },
};

/** Fixed 5000 over base 100000, proportional: a -3000, b -2000. a 57000, b 38000, T 95000. */
export const fixedDiscount: Fixture = {
  name: 'fixed discount 50.00',
  rules: ['R8.4', 'R9.3'],
  input: two([adj('d', 'discount', fixed(5000))]),
  expect: {
    ok: true,
    total: 95000,
    exact: { a: 57000, b: 38000 },
    adjustments: { d: -5000 },
    allocations: { d: { a: -3000, b: -2000 } },
  },
};

/** 2000 bp of 100000 = 20000, cap 15000 -> 15000. a -9000, b -6000. a 51000, b 34000, T 85000. */
export const cappedDiscount: Fixture = {
  name: 'discount capped (20% would be 20000, cap 15000)',
  rules: ['R8.5'],
  input: two([adj('d', 'discount', rate(2000), { cap: 15000 })]),
  expect: {
    ok: true,
    total: 85000,
    exact: { a: 51000, b: 34000 },
    adjustments: { d: -15000 },
    allocations: { d: { a: -9000, b: -6000 } },
  },
};

/** Cap is not binding: 10% = 10000 < cap 15000 -> 10000. */
export const capNotBinding: Fixture = {
  name: 'cap above computed value changes nothing',
  rules: ['R8.5'],
  input: two([adj('d', 'discount', rate(1000), { cap: 15000 })]),
  expect: { ok: true, total: 90000, exact: { a: 54000, b: 36000 }, adjustments: { d: -10000 } },
};

/** B = 100000 < minimumSpend 150000 -> not applied, warning below-minimum-spend. */
export const minimumSpendNotMet: Fixture = {
  name: 'minimum spend not met: discount not applied',
  rules: ['R8.2'],
  input: two([adj('d', 'discount', rate(1000), { minimumSpend: 150000 })]),
  expect: {
    ok: true,
    total: 100000,
    exact: { a: 60000, b: 40000 },
    adjustments: { d: 0 },
    warnings: [{ code: 'ADJUSTMENT_NOT_APPLIED', reason: 'below-minimum-spend', adjustmentId: 'd' }],
  },
};

/** B = 100000 == minimumSpend 100000 -> applied (B >= minimumSpend). */
export const minimumSpendBoundary: Fixture = {
  name: 'minimum spend exactly met: discount applied',
  rules: ['R8.2'],
  input: two([adj('d', 'discount', rate(1000), { minimumSpend: 100000 })]),
  expect: { ok: true, total: 90000, exact: { a: 54000, b: 36000 }, adjustments: { d: -10000 } },
};

/**
 * Excluded category: b's item is 'alcohol'. Discount 1000 bp excludes it: B = 60000 -> 6000, all to a (b_b = 0).
 * a 54000, b 40000, T 94000.
 */
export const excludedCategory: Fixture = {
  name: 'excluded items (excludeCategories) are not discounted',
  rules: ['R6.1', 'R7.1'],
  input: two(
    [adj('d', 'discount', rate(1000), { eligibility: { excludeCategories: ['alcohol'] } })],
    [item('i1', 60000, eq('a'), { categories: ['food'] }), item('i2', 40000, eq('b'), { categories: ['alcohol'] })],
  ),
  expect: {
    ok: true,
    total: 94000,
    exact: { a: 54000, b: 40000 },
    adjustments: { d: -6000 },
    allocations: { d: { a: -6000 } },
  },
};

/** Exclusion wins: itemIds [i1,i2] but excludeItemIds [i2] -> only i1 eligible. Same numbers as above. */
export const exclusionWins: Fixture = {
  name: 'exclusion wins over inclusion',
  rules: ['R6.1'],
  input: two([adj('d', 'discount', rate(1000), { eligibility: { itemIds: ['i1', 'i2'], excludeItemIds: ['i2'] } })]),
  expect: { ok: true, total: 94000, exact: { a: 54000, b: 40000 }, adjustments: { d: -6000 } },
};

/**
 * Include filter is a union of itemIds and categories. i3 (20000, b, 'bev') joins i1 via category.
 * B = 60000 + 20000 = 80000 -> 8000. b_a = 60000, b_b = 20000 -> a -6000, b -2000.
 * a 54000; b 40000 + 20000 - 2000 = 58000; T 112000.
 */
export const includeUnion: Fixture = {
  name: 'eligibility include = itemIds OR categories',
  rules: ['R6.1'],
  input: two(
    [adj('d', 'discount', rate(1000), { eligibility: { itemIds: ['i1'], categories: ['bev'] } })],
    [item('i1', 60000, eq('a')), item('i2', 40000, eq('b')), item('i3', 20000, eq('b'), { categories: ['bev'] })],
  ),
  expect: {
    ok: true,
    total: 112000,
    exact: { a: 54000, b: 58000 },
    adjustments: { d: -8000 },
    allocations: { d: { a: -6000, b: -2000 } },
  },
};

/** No eligible item -> amount 0, warning no-eligible-items. */
export const noEligible: Fixture = {
  name: 'no eligible items: adjustment not applied',
  rules: ['R6.3'],
  input: two([adj('d', 'discount', rate(1000), { eligibility: { categories: ['nothing'] } })]),
  expect: {
    ok: true,
    total: 100000,
    exact: { a: 60000, b: 40000 },
    adjustments: { d: 0 },
    warnings: [{ code: 'ADJUSTMENT_NOT_APPLIED', reason: 'no-eligible-items', adjustmentId: 'd' }],
  },
};

/**
 * Two discounts in parallel on `items`: d1 10% -> -10000, d2 5% -> -5000 (both of 100000).
 * a: 60000 - 6000 - 3000 = 51000; b: 40000 - 4000 - 2000 = 34000. T 85000.
 */
export const parallelDiscounts: Fixture = {
  name: 'multiple discounts in parallel on original subtotal',
  rules: ['R5.3', 'R7.1'],
  input: two([adj('d1', 'discount', rate(1000), { order: 1 }), adj('d2', 'discount', rate(500), { order: 2 })]),
  expect: {
    ok: true,
    total: 85000,
    exact: { a: 51000, b: 34000 },
    adjustments: { d1: -10000, d2: -5000 },
    allocations: { d1: { a: -6000, b: -4000 }, d2: { a: -3000, b: -2000 } },
  },
};

/**
 * Stacked: d2 5% on items-after [d1]. Cell bases: a 60000-6000 = 54000, b 40000-4000 = 36000, B' = 90000 -> 4500.
 * d2 alloc by b_p: a 4500x54000/90000 = 2700, b 1800. a 60000-6000-2700 = 51300; b 40000-4000-1800 = 34200. T 85500.
 */
export const stackedDiscounts: Fixture = {
  name: 'stacked discounts via items-after [d1]',
  rules: ['R7.2', 'R9.5'],
  input: two([
    adj('d1', 'discount', rate(1000), { order: 1 }),
    adj('d2', 'discount', rate(500), { order: 2, base: { type: 'items-after', include: ['d1'] } }),
  ]),
  expect: {
    ok: true,
    total: 85500,
    exact: { a: 51300, b: 34200 },
    adjustments: { d1: -10000, d2: -4500 },
    allocations: { d1: { a: -6000, b: -4000 }, d2: { a: -2700, b: -1800 } },
  },
};

/** Same as stacked but with include 'all-prior'. */
export const stackedAllPrior: Fixture = {
  name: 'stacked discounts via items-after all-prior',
  rules: ['R7.2'],
  input: two([
    adj('d1', 'discount', rate(1000), { order: 1 }),
    adj('d2', 'discount', rate(500), { order: 2, base: { type: 'items-after', include: 'all-prior' } }),
  ]),
  expect: {
    ok: true,
    total: 85500,
    exact: { a: 51300, b: 34200 },
    adjustments: { d1: -10000, d2: -4500 },
  },
};

/** Discount clamp: only i2 (40000) eligible, fixed 50000 -> clamped to B = 40000 (b pays 0). T 60000. */
export const discountClamp: Fixture = {
  name: 'discount can never exceed its base (clamped to 40000)',
  rules: ['R8.6'],
  input: two([adj('d', 'discount', fixed(50000), { eligibility: { itemIds: ['i2'] } })]),
  expect: {
    ok: true,
    total: 60000,
    exact: { a: 60000, b: 0 },
    adjustments: { d: -40000 },
    allocations: { d: { b: -40000 } },
  },
};

/** Override 8000 (reason given) replaces the computed 10000. a -4800, b -3200. a 55200, b 36800, T 92000. */
export const overrideDiscount: Fixture = {
  name: 'override with reason replaces computed discount',
  rules: ['R8.7', 'R3.6'],
  input: two([adj('d', 'discount', rate(1000), { override: { amount: 8000, reason: 'manager comp' } })]),
  expect: {
    ok: true,
    total: 92000,
    exact: { a: 55200, b: 36800 },
    adjustments: { d: -8000 },
    allocations: { d: { a: -4800, b: -3200 } },
  },
};

/** Override is applied after cap: cap 1000, override 5000 -> 5000. a -3000, b -2000. T 95000. */
export const overrideBeatsCap: Fixture = {
  name: 'override takes precedence over cap',
  rules: ['R8.5', 'R8.7'],
  input: two([adj('d', 'discount', rate(1000), { cap: 1000, override: { amount: 5000, reason: 'receipt says so' } })]),
  expect: {
    ok: true,
    total: 95000,
    exact: { a: 57000, b: 38000 },
    adjustments: { d: -5000 },
  },
};

/**
 * Negative allocation with `equal` policy: discount fixed 1001 split equal over a,b, LR(1001) = 501/500 (tie -> a), negated.
 * Items a 50000, b 50000: a 49499, b 49500, T 98999. unit 1.
 */
export const negativeEqualAllocation: Fixture = {
  name: 'discount 1001 allocated equal between 2 -> -501 / -500',
  rules: ['R9.1', 'R9.3'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 50000, eq('a')), item('i2', 50000, eq('b'))],
    adjustments: [adj('d', 'discount', fixed(1001), { allocation: { type: 'equal' } })],
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 98999,
    exact: { a: 49499, b: 49500 },
    adjustments: { d: -1001 },
    allocations: { d: { a: -501, b: -500 } },
  },
};
