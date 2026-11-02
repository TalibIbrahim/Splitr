import { adj, bill, eq, fixed, item, people, rate } from '../helpers';
import type { Fixture } from './types';

const two = (adjustments: ReturnType<typeof adj>[]) =>
  bill({
    participants: people('a', 'b'),
    items: [item('i1', 60000, eq('a')), item('i2', 40000, eq('b'))],
    adjustments,
  });

/** Service charge 10% of 100000 = 10000, proportional: a +6000, b +4000. a 66000, b 44000, T 110000. */
export const serviceCharge: Fixture = {
  name: 'service charge 10%',
  rules: ['R5.1', 'R8.3'],
  input: two([adj('svc', 'serviceCharge', rate(1000))]),
  expect: {
    ok: true,
    total: 110000,
    exact: { a: 66000, b: 44000 },
    adjustments: { svc: 10000 },
    allocations: { svc: { a: 6000, b: 4000 } },
  },
};

/** Service charge covered by b via a weights policy ("Hamza covers the service charge"): b +10000. a 60000, b 50000. */
export const serviceChargeCovered: Fixture = {
  name: 'service charge covered by one person (weights policy)',
  rules: ['R9.3'],
  input: two([adj('svc', 'serviceCharge', rate(1000), { allocation: { type: 'weights', entries: [{ participantId: 'b', weight: 1 }] } })]),
  expect: {
    ok: true,
    total: 110000,
    exact: { a: 60000, b: 50000 },
    adjustments: { svc: 10000 },
    allocations: { svc: { b: 10000 } },
  },
};

/**
 * Tax on service-inclusive subtotal (items-after [svc]).
 * svc 10000: a +6000, b +4000. Cell bases: a 66000, b 44000, B' = 110000.
 * tax 1600 bp x 110000 = 17600; attribution a 17600 x 66000/110000 = 10560, b 7040.
 * exact a 60000+6000+10560 = 76560, b 40000+4000+7040 = 51040, T 127600 (= R).
 * Settlement rounding (unit 100): floors 76500 (r60) and 51000 (r40) = 127500, k = 1 -> a (largest r) -> a 76600, b 51000.
 */
export const taxOnServiceCharge: Fixture = {
  name: 'tax on subtotal plus service charge (items-after [svc]) with settlement rounding',
  rules: ['R7.2', 'R11.2'],
  input: two([
    adj('svc', 'serviceCharge', rate(1000), { order: 1 }),
    adj('tax', 'tax', rate(1600), { order: 2, base: { type: 'items-after', include: ['svc'] } }),
  ]),
  expect: {
    ok: true,
    total: 127600,
    roundedTotal: 127600,
    exact: { a: 76560, b: 51040 },
    rounded: { a: 76600, b: 51000 },
    adjustments: { svc: 10000, tax: 17600 },
    allocations: { svc: { a: 6000, b: 4000 }, tax: { a: 10560, b: 7040 } },
  },
};

const three = (adjustments: ReturnType<typeof adj>[]) =>
  bill({
    participants: people('a', 'b', 'c'),
    items: [item('i1', 30000, eq('a')), item('i2', 30000, eq('b')), item('i3', 30000, eq('c'))],
    adjustments,
    unit: 1,
  });

/** Tip fixed 1000 equal among all 3: 333.33 -> 334 / 333 / 333 (lowest id). T 91000. */
export const tipEqual: Fixture = {
  name: 'tip 1000 split equally between 3',
  rules: ['R5.1', 'R8.4', 'R9.3'],
  input: three([adj('tip', 'tip', fixed(1000), { allocation: { type: 'equal' } })]),
  expect: {
    ok: true,
    total: 91000,
    exact: { a: 30334, b: 30333, c: 30333 },
    adjustments: { tip: 1000 },
    allocations: { tip: { a: 334, b: 333, c: 333 } },
  },
};

/** Tip 1001 equal among [c, b] (listed in reverse): 500.5 each, tie -> lower id b: b 501, c 500. a untouched. */
export const tipEqualSubset: Fixture = {
  name: 'tip split equally among a subset, extra paisa to lowest id',
  rules: ['R9.3', 'R2.2'],
  input: three([adj('tip', 'tip', fixed(1001), { allocation: { type: 'equal', participantIds: ['c', 'b'] } })]),
  expect: {
    ok: true,
    total: 91001,
    exact: { a: 30000, b: 30501, c: 30500 },
    allocations: { tip: { b: 501, c: 500 } },
  },
};

/** Tip 1000 with weights a1 b2: quotas 333.33 / 666.67 -> a 333, b 667. */
export const tipWeights: Fixture = {
  name: 'tip allocated by weights 1:2',
  rules: ['R9.3'],
  input: three([
    adj('tip', 'tip', fixed(1000), {
      allocation: {
        type: 'weights',
        entries: [
          { participantId: 'a', weight: 1 },
          { participantId: 'b', weight: 2 },
        ],
      },
    }),
  ]),
  expect: {
    ok: true,
    total: 91000,
    exact: { a: 30333, b: 30667, c: 30000 },
    allocations: { tip: { a: 333, b: 667 } },
  },
};

/** Fixed fee 5000 proportional over 60000 : 40000 -> a +3000, b +2000. */
export const fixedFee: Fixture = {
  name: 'fixed fee 50.00 allocated proportionally',
  rules: ['R5.1', 'R8.4', 'R9.3'],
  input: two([adj('fee', 'fee', fixed(5000))]),
  expect: {
    ok: true,
    total: 105000,
    exact: { a: 63000, b: 42000 },
    adjustments: { fee: 5000 },
    allocations: { fee: { a: 3000, b: 2000 } },
  },
};

/** Custom subtracting adjustment: -3000 over equal bases (10000 each): -1500 each. T 17000. */
export const customSubtract: Fixture = {
  name: 'custom adjustment with direction subtract is negative',
  rules: ['R5.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 10000, eq('a')), item('i2', 10000, eq('b'))],
    adjustments: [adj('c', 'custom', fixed(3000), { direction: 'subtract' })],
  }),
  expect: {
    ok: true,
    total: 17000,
    exact: { a: 8500, b: 8500 },
    adjustments: { c: -3000 },
    allocations: { c: { a: -1500, b: -1500 } },
  },
};

/** Custom adding adjustment by rate: 500 bp x 20000 = 1000 -> +500 each. T 21000. */
export const customAdd: Fixture = {
  name: 'custom adjustment with direction add is positive',
  rules: ['R5.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 10000, eq('a')), item('i2', 10000, eq('b'))],
    adjustments: [adj('c', 'custom', rate(500), { direction: 'add' })],
  }),
  expect: {
    ok: true,
    total: 21000,
    exact: { a: 10500, b: 10500 },
    adjustments: { c: 1000 },
  },
};

/** A subtracting custom adjustment is clamped to its base like a discount (R8.6): 999999 -> 20000. T 0. */
export const customSubtractClamp: Fixture = {
  name: 'custom subtract is clamped to its base',
  rules: ['R8.6', 'R5.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 10000, eq('a')), item('i2', 10000, eq('b'))],
    adjustments: [adj('c', 'custom', fixed(999999), { direction: 'subtract' })],
  }),
  expect: { ok: true, total: 0, exact: { a: 0, b: 0 }, adjustments: { c: -20000 } },
};

/**
 * R9.3 fallback: every item is complimentary so every b_p is 0; fixed fee 1000 proportional has W = 0
 * -> equal among ALL participants (a,b,c): 333.33 -> 334 / 333 / 333, warning ALLOCATION_FALLBACK_EQUAL.
 */
export const fallbackEqual: Fixture = {
  name: 'proportional allocation with zero total weight falls back to equal',
  rules: ['R9.3'],
  input: bill({
    participants: people('a', 'b', 'c'),
    items: [item('comp', 0, eq('a', 'b'))],
    adjustments: [adj('fee', 'fee', fixed(1000))],
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1000,
    exact: { a: 334, b: 333, c: 333 },
    adjustments: { fee: 1000 },
    allocations: { fee: { a: 334, b: 333, c: 333 } },
    warnings: [{ code: 'ALLOCATION_FALLBACK_EQUAL', adjustmentId: 'fee' }],
  },
};

/**
 * R10.3 exact reconciliation with leftover paisa in both an item split and an adjustment split.
 * i1 10000 equal(a,b,c): 3334 / 3333 / 3333. tax 1100 bp x 10000 = 1100, weights b_p = 3334,3333,3333:
 * quotas 366.74 / 366.63 / 366.63 -> floors 366 x 3 = 1098, leftover 2 -> a (.74), then b/c tie (.63) -> b.
 * tax a 367, b 367, c 366. exact a 3701, b 3700, c 3699. T 11100.
 */
export const exactReconciliation: Fixture = {
  name: 'exact reconciliation with leftover paisa in item split and tax split',
  rules: ['R10.2', 'R10.3', 'R9.1'],
  input: bill({
    participants: people('a', 'b', 'c'),
    items: [item('i1', 10000, eq('a', 'b', 'c'))],
    adjustments: [adj('tax', 'tax', rate(1100))],
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 11100,
    exact: { a: 3701, b: 3700, c: 3699 },
    adjustments: { tax: 1100 },
    allocations: { tax: { a: 367, b: 367, c: 366 } },
    itemShares: { i1: { a: 3334, b: 3333, c: 3333 } },
  },
};

/** Remedy for a printed-total gap: explicit `custom` adjustment (source reconciliation) of +125 closes 10000 -> 10125. */
export const reconciliationAdjustment: Fixture = {
  name: 'explicit reconciliation adjustment closes a printed-total gap',
  rules: ['R10.5'],
  input: {
    ...bill({
      participants: people('a'),
      items: [item('i1', 10000, eq('a'))],
      adjustments: [{ ...adj('recon', 'custom', fixed(125), { direction: 'add' }), source: 'reconciliation' }],
      printedTotal: 10125,
      unit: 1,
    }),
  },
  expect: { ok: true, total: 10125, exact: { a: 10125 }, adjustments: { recon: 125 } },
};
