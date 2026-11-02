import type { RoundingMode } from '../../src/index';
import { $, adj, bill, eq, fixed, item, people, rate } from '../helpers';
import type { Fixture } from './types';

/**
 * Tax on the DISCOUNTED subtotal (items-after [disc]) over Fixture A's items.
 * disc 2000 bp of 1_000_000 = -200000 (p1 -80000, p2 -60000, p3 -40000, p4 -20000)
 * cell bases after discount: 320000 / 240000 / 160000 / 80000, B' = 800000.
 * tax 1000 bp x 800000 = 80000 -> p1 32000, p2 24000, p3 16000, p4 8000.
 * exact: 400000-80000+32000 = 352000; 300000-60000+24000 = 264000; 200000-40000+16000 = 176000; 100000-20000+8000 = 88000.
 * T = 1_000_000 - 200000 + 80000 = 880000 (sum 352+264+176+88 = 880 thousand).
 */
const fourPeopleA = {
  participants: people('p1', 'p2', 'p3', 'p4'),
  items: [
    item('i1', 400000, eq('p1')),
    item('i2', 300000, eq('p2')),
    item('i3', 200000, eq('p3')),
    item('i4', 100000, eq('p4')),
  ],
};

export const taxAfterDiscount: Fixture = {
  name: 'tax on discounted subtotal (items-after [disc])',
  rules: ['R7.2', 'R9.5'],
  input: bill({
    ...fourPeopleA,
    adjustments: [
      adj('disc', 'discount', rate(2000), { order: 1 }),
      adj('tax', 'tax', rate(1000), { order: 2, base: { type: 'items-after', include: ['disc'] } }),
    ],
  }),
  expect: {
    ok: true,
    total: 880000,
    exact: { p1: 352000, p2: 264000, p3: 176000, p4: 88000 },
    rounded: { p1: 352000, p2: 264000, p3: 176000, p4: 88000 },
    adjustments: { disc: -200000, tax: 80000 },
    allocations: {
      disc: { p1: -80000, p2: -60000, p3: -40000, p4: -20000 },
      tax: { p1: 32000, p2: 24000, p3: 16000, p4: 8000 },
    },
  },
};

export const taxAllPrior: Fixture = {
  name: 'tax on discounted subtotal via all-prior',
  rules: ['R7.2'],
  input: bill({
    ...fourPeopleA,
    adjustments: [
      adj('disc', 'discount', rate(2000), { order: 1 }),
      adj('tax', 'tax', rate(1000), { order: 2, base: { type: 'items-after', include: 'all-prior' } }),
    ],
  }),
  expect: {
    ok: true,
    total: 880000,
    exact: { p1: 352000, p2: 264000, p3: 176000, p4: 88000 },
    adjustments: { disc: -200000, tax: 80000 },
  },
};

/**
 * Application order is (order, id), NOT array order: tax is listed first but has order 2.
 * Same numbers as taxAfterDiscount.
 */
export const orderNotArrayPosition: Fixture = {
  name: 'application order is (order, id), not array position',
  rules: ['R5.3', 'R7.2'],
  input: bill({
    ...fourPeopleA,
    adjustments: [
      adj('tax', 'tax', rate(1000), { order: 2, base: { type: 'items-after', include: ['disc'] } }),
      adj('disc', 'discount', rate(2000), { order: 1 }),
    ],
  }),
  expect: {
    ok: true,
    total: 880000,
    exact: { p1: 352000, p2: 264000, p3: 176000, p4: 88000 },
    adjustments: { disc: -200000, tax: 80000 },
  },
};

/** Tax on selected items: only f1 (60000, a) taxed at 16% = 9600, all to a. a 69600, b 40000, T 109600. */
export const taxSelectedItems: Fixture = {
  name: 'tax on selected items only',
  rules: ['R6.1', 'R7.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('f1', 60000, eq('a')), item('f2', 40000, eq('b'))],
    adjustments: [adj('tax', 'tax', rate(1600), { eligibility: { itemIds: ['f1'] } })],
  }),
  expect: {
    ok: true,
    total: 109600,
    exact: { a: 69600, b: 40000 },
    adjustments: { tax: 9600 },
    allocations: { tax: { a: 9600 } },
  },
};

/**
 * Mixed rates by category (R6.2): 16% on food, 5% on card, non-taxable untouched.
 * i1 food 100000 (a), i2 card 50000 (b), i3 non-taxable 30000 (a).
 * tax16: 1600 bp x 100000 = 16000 -> a. tax5: 500 bp x 50000 = 2500 -> b.
 * a 100000 + 30000 + 16000 = 146000; b 50000 + 2500 = 52500; T 198500.
 * R = 198500 (unit 100): floors 146000 (r0), 52500 (r0) -> k = 0.
 */
export const mixedTaxRates: Fixture = {
  name: 'mixed tax rates by category, non-taxable item untouched',
  rules: ['R6.2', 'R6.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [
      item('i1', 100000, eq('a'), { categories: ['food'] }),
      item('i2', 50000, eq('b'), { categories: ['card'] }),
      item('i3', 30000, eq('a'), { categories: ['non-taxable'] }),
    ],
    adjustments: [
      adj('tax16', 'tax', rate(1600), { order: 1, eligibility: { categories: ['food'] } }),
      adj('tax5', 'tax', rate(500), { order: 2, eligibility: { categories: ['card'] } }),
    ],
  }),
  expect: {
    ok: true,
    total: 198500,
    exact: { a: 146000, b: 52500 },
    rounded: { a: 146000, b: 52500 },
    adjustments: { tax16: 16000, tax5: 2500 },
    allocations: { tax16: { a: 16000 }, tax5: { b: 2500 } },
  },
};

/** Non-taxable via exclusion: 10% of food 80000 = 8000 (all a); the non-taxable 20000 (b) is excluded. a 88000, b 20000. */
export const nonTaxableExcluded: Fixture = {
  name: 'non-taxable items excluded from tax',
  rules: ['R6.1', 'R6.2'],
  input: bill({
    participants: people('a', 'b'),
    items: [
      item('i1', 80000, eq('a'), { categories: ['food'] }),
      item('i2', 20000, eq('b'), { categories: ['non-taxable'] }),
    ],
    adjustments: [adj('tax', 'tax', rate(1000), { eligibility: { excludeCategories: ['non-taxable'] } })],
  }),
  expect: {
    ok: true,
    total: 108000,
    exact: { a: 88000, b: 20000 },
    adjustments: { tax: 8000 },
    allocations: { tax: { a: 8000 } },
  },
};

/**
 * R7.3 fixed base: printed taxable amount 80000 while eligible items are 60000 + 60000.
 * tax 1000 bp x 80000 = 8000; allocation weights = item shares (60000 : 60000) -> 4000 each.
 * exact 64000 / 64000, T 128000.
 */
export const taxFixedBase: Fixture = {
  name: 'tax on a printed taxable amount (fixed base)',
  rules: ['R7.3'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 60000, eq('a'), { categories: ['food'] }), item('i2', 60000, eq('b'), { categories: ['food'] })],
    adjustments: [adj('tax', 'tax', rate(1000), { base: { type: 'fixed', amount: $(80000) } })],
  }),
  expect: {
    ok: true,
    total: 128000,
    exact: { a: 64000, b: 64000 },
    adjustments: { tax: 8000 },
    allocations: { tax: { a: 4000, b: 4000 } },
  },
};

/** Minimum spend is compared with B = the fixed amount (80000 < 90000 -> not applied). */
export const taxFixedBaseMinimumSpend: Fixture = {
  name: 'minimum spend compares against the fixed base amount',
  rules: ['R7.3', 'R8.2'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 60000, eq('a')), item('i2', 60000, eq('b'))],
    adjustments: [adj('tax', 'tax', rate(1000), { base: { type: 'fixed', amount: $(80000) }, minimumSpend: 90000 })],
  }),
  expect: {
    ok: true,
    total: 120000,
    exact: { a: 60000, b: 60000 },
    adjustments: { tax: 0 },
    warnings: [{ code: 'ADJUSTMENT_NOT_APPLIED', reason: 'below-minimum-spend', adjustmentId: 'tax' }],
  },
};

/**
 * Non-positive base (negative): eligible items are only the refund (-2000), B = -2000 -> not applied.
 * x 5000 (a), r -2000 (b) -> T 3000, b is negative (warning NEGATIVE_SHARE).
 */
export const nonPositiveBaseNegative: Fixture = {
  name: 'rate adjustment on a negative base is not applied',
  rules: ['R8.3', 'R10.7'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('x', 5000, eq('a'), { categories: ['food'] }), item('r', -2000, eq('b'), { categories: ['refund'] })],
    adjustments: [adj('tax', 'tax', rate(1000), { eligibility: { categories: ['refund'] } })],
  }),
  expect: {
    ok: true,
    total: 3000,
    exact: { a: 5000, b: -2000 },
    rounded: { a: 5000, b: -2000 },
    adjustments: { tax: 0 },
    warnings: [
      { code: 'ADJUSTMENT_NOT_APPLIED', reason: 'non-positive-base', adjustmentId: 'tax' },
      { code: 'NEGATIVE_SHARE', participantId: 'b' },
    ],
  },
};

/** Non-positive base (zero): the only eligible item is complimentary (0). */
export const nonPositiveBaseZero: Fixture = {
  name: 'rate adjustment on a zero base is not applied',
  rules: ['R8.3'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('comp', 0, eq('a'), { categories: ['food'] }), item('x', 10000, eq('b'), { categories: ['bev'] })],
    adjustments: [adj('tax', 'tax', rate(1000), { eligibility: { categories: ['food'] } })],
  }),
  expect: {
    ok: true,
    total: 10000,
    exact: { a: 0, b: 10000 },
    adjustments: { tax: 0 },
    warnings: [{ code: 'ADJUSTMENT_NOT_APPLIED', reason: 'non-positive-base', adjustmentId: 'tax' }],
  },
};

/**
 * R9.5 attribution is exact (never rounded). a 3333, b 6667 (B = 10000). unit 1.
 * disc fixed 1000 proportional: LR(-1000; 3333, 6667): LR(1000): quotas 333.3 / 666.7 -> floors 333 + 666, leftover 1 -> b. a -333, b -667.
 * Exact attributions (not the rounded allocations): a -333.3, b -666.7.
 * tax 1000 bp items-after [disc]: B' = 10000 - 1000 = 9000 -> 900.
 * weights b_p: a 3333 - 333.3 = 2999.7, b 6667 - 666.7 = 6000.3 (W = 9000).
 * quotas: a 900 x 2999.7 / 9000 = 299.97, b 600.03 -> floors 299 + 600 = 899, leftover 1 -> a (.97). a 300, b 600.
 * exact a 3333 - 333 + 300 = 3300; b 6667 - 667 + 600 = 6600; T 9900.
 */
export const exactAttribution: Fixture = {
  name: 'attribution stays exact: tax on items-after fixed discount',
  rules: ['R9.5', 'R1.3', 'R9.4'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 3333, eq('a')), item('i2', 6667, eq('b'))],
    adjustments: [
      adj('disc', 'discount', fixed(1000), { order: 1 }),
      adj('tax', 'tax', rate(1000), { order: 2, base: { type: 'items-after', include: ['disc'] } }),
    ],
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 9900,
    exact: { a: 3300, b: 6600 },
    adjustments: { disc: -1000, tax: 900 },
    allocations: { disc: { a: -333, b: -667 }, tax: { a: 300, b: 600 } },
  },
};

/**
 * Rounding modes (R8.3) on a single 1005 / 1015 item with a 1000 bp tax: raw 100.5 / 101.5.
 * half-up: 101 / 102; half-even: 100 / 102; down: 100 / 101; up: 101 / 102.
 */
const roundingCases: [RoundingMode, number, number][] = [
  ['half-up', 1005, 101],
  ['half-even', 1005, 100],
  ['down', 1005, 100],
  ['up', 1005, 101],
  ['half-up', 1015, 102],
  ['half-even', 1015, 102],
  ['down', 1015, 101],
  ['up', 1015, 102],
];

export const roundingModes: Fixture[] = roundingCases.map(([mode, base, expected]) => ({
  name: `rounding mode ${mode}: 10% of ${base} = ${base / 10} -> ${expected}`,
  rules: ['R8.3', 'R9.4'],
  input: bill({
    participants: people('a'),
    items: [item('i1', base, eq('a'))],
    adjustments: [adj('tax', 'tax', rate(1000), { rounding: mode })],
    unit: 1,
  }),
  expect: {
    ok: true,
    total: base + expected,
    exact: { a: base + expected },
    adjustments: { tax: expected },
  },
}));

/** Discount magnitude uses the same rounding: 10% of 1005 = 100.5 half-up -> 101 -> a pays 904. */
export const discountRounding: Fixture = {
  name: 'discount magnitude rounds half-up by default (100.5 -> 101)',
  rules: ['R8.3'],
  input: bill({
    participants: people('a'),
    items: [item('i1', 1005, eq('a'))],
    adjustments: [adj('d', 'discount', rate(1000))],
    unit: 1,
  }),
  expect: { ok: true, total: 904, exact: { a: 904 }, adjustments: { d: -101 } },
};

/**
 * R1.3: exactness for large values. B = 4_000_000_000_000_001, 3333 bp:
 * B x 3333 = 13_332_000_000_000_003_333 (beyond 2^53), / 10000 = 1_333_200_000_000_000.3333 -> 1_333_200_000_000_000.
 * T = 4_000_000_000_000_001 + 1_333_200_000_000_000 = 5_333_200_000_000_001 (< 2^53).
 */
export const largeValuesExact: Fixture = {
  name: 'large values are computed exactly (no float)',
  rules: ['R1.3'],
  input: bill({
    participants: people('a'),
    items: [item('i1', 4000000000000001, eq('a'))],
    adjustments: [adj('tax', 'tax', rate(3333))],
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 5333200000000001,
    exact: { a: 5333200000000001 },
    adjustments: { tax: 1333200000000000 },
  },
};
