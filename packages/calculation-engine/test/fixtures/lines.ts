import { adj, bill, eq, item, people, rate } from '../helpers';
import type { ErrExpect, Fixture } from './types';

/** Void line: x 10000 (a), void -2000 (a) -> a 8000, b 0. T 8000 (R = 8000). */
export const voidItem: Fixture = {
  name: 'void (negative) item reduces the subtotal',
  rules: ['R3.2', 'R10.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('x', 10000, eq('a')), item('void', -2000, eq('a'))],
  }),
  expect: {
    ok: true,
    itemsSubtotal: 8000,
    total: 8000,
    exact: { a: 8000, b: 0 },
    rounded: { a: 8000, b: 0 },
  },
};

/** Refund split equally: ref -5000 -> -2500 each; main 20000 -> 10000 each. 7500 each, T 15000, no warnings. */
export const refundShared: Fixture = {
  name: 'refund line shared equally',
  rules: ['R3.2', 'R4.7'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('main', 20000, eq('a', 'b')), item('ref', -5000, eq('a', 'b'))],
  }),
  expect: {
    ok: true,
    total: 15000,
    exact: { a: 7500, b: 7500 },
    itemShares: { ref: { a: -2500, b: -2500 } },
  },
};

/** Refund assigned to one person makes their total negative: b = -3000. T 7000. Warning NEGATIVE_SHARE (b). */
export const negativeShare: Fixture = {
  name: 'refund assigned to one person gives a negative share warning',
  rules: ['R10.7'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('x', 10000, eq('a')), item('ref', -3000, eq('b'))],
  }),
  expect: {
    ok: true,
    total: 7000,
    exact: { a: 10000, b: -3000 },
    rounded: { a: 10000, b: -3000 },
    warnings: [{ code: 'NEGATIVE_SHARE', participantId: 'b' }],
  },
};

export const negativeTotal: Fixture = {
  name: 'negative bill total is an error',
  rules: ['R10.6'],
  input: bill({ participants: people('a'), items: [item('ref', -1000, eq('a'))] }),
  expect: { ok: false, errors: [{ code: 'NEGATIVE_TOTAL', rule: 'R10.6' }] },
};

/** One paisa among three: leftover goes to the lowest id. a 1, b 0, c 0. */
export const onePaisa: Fixture = {
  name: 'one-paisa item among three goes to the lowest id',
  rules: ['R4.2', 'R9.1'],
  input: bill({ participants: people('a', 'b', 'c'), items: [item('x', 1, eq('a', 'b', 'c'))], unit: 1 }),
  expect: { ok: true, total: 1, exact: { a: 1, b: 0, c: 0 }, itemShares: { x: { a: 1 } } },
};

/** Same, but participants and entries are listed c,b,a — result must not depend on array position. */
export const tieStableReverse: Fixture = {
  name: 'stable tie-breaking when listed in reverse order',
  rules: ['R2.2', 'R2.3'],
  input: bill({ participants: people('c', 'b', 'a'), items: [item('x', 1, eq('c', 'b', 'a'))], unit: 1 }),
  expect: { ok: true, total: 1, exact: { a: 1, b: 0, c: 0 }, itemShares: { x: { a: 1 } } },
};

/** Plain code-unit order: 'B' (0x42) < 'a' (0x61), so 'B' wins the single paisa (a locale compare would pick 'a'). */
export const codeUnitOrderUpper: Fixture = {
  name: "code-unit id order: 'B' beats 'a'",
  rules: ['R2.2'],
  input: bill({ participants: people('a', 'B'), items: [item('x', 1, eq('a', 'B'))], unit: 1 }),
  expect: { ok: true, total: 1, exact: { a: 0, B: 1 }, itemShares: { x: { B: 1 } } },
};

/** Plain code-unit order: 'a10' < 'a2' (no natural-number compare), so 'a10' wins. */
export const codeUnitOrderDigits: Fixture = {
  name: "code-unit id order: 'a10' beats 'a2'",
  rules: ['R2.2'],
  input: bill({ participants: people('a2', 'a10'), items: [item('x', 1, eq('a2', 'a10'))], unit: 1 }),
  expect: { ok: true, total: 1, exact: { a2: 0, a10: 1 }, itemShares: { x: { a10: 1 } } },
};

/** Empty bill: zero items is allowed, total 0. */
export const zeroItems: Fixture = {
  name: 'zero items is allowed (total 0)',
  rules: ['R3.1'],
  input: bill({ participants: people('a'), items: [] }),
  expect: { ok: true, itemsSubtotal: 0, total: 0, exact: { a: 0 }, rounded: { a: 0 } },
};

/** Matching quantity x unitPrice is accepted: 3 x 1500 = 4500. */
export const unitPriceMatches: Fixture = {
  name: 'quantity x unitPrice equals lineTotal is accepted',
  rules: ['R3.3'],
  input: bill({
    participants: people('a'),
    items: [item('x', 4500, eq('a'), { quantity: 3, unitPrice: 1500 })],
  }),
  expect: { ok: true, total: 4500, exact: { a: 4500 } },
};

const e = (name: string, rules: string[], input: ReturnType<typeof bill>, errors: ErrExpect['errors']): Fixture => ({
  name,
  rules,
  input,
  expect: { ok: false, errors },
});

const one = (over: Partial<Parameters<typeof bill>[0]> = {}) =>
  bill({ participants: people('a', 'b'), items: [item('x', 1000, eq('a', 'b'))], ...over });

export const lineErrors: Fixture[] = [
  e('quantity x unitPrice != lineTotal (2 x 500 vs 1100)', ['R3.3'], one({ items: [item('x', 1100, eq('a'), { quantity: 2, unitPrice: 500 })] }), [
    { code: 'LINE_ARITHMETIC_MISMATCH', rule: 'R3.3', itemId: 'x', difference: 100 },
  ]),
  e('quantity 0 is invalid', ['R3.2'], one({ items: [item('x', 1000, eq('a'), { quantity: 0 })] }), [{ code: 'INVALID_INPUT', rule: 'R3.2' }]),
  e('quantity 1.5 is invalid', ['R3.2'], one({ items: [item('x', 1000, eq('a'), { quantity: 1.5 })] }), [{ code: 'INVALID_INPUT', rule: 'R3.2' }]),
  e('non-integer lineTotal 100.5 is invalid', ['R1.1'], one({ items: [item('x', 100.5, eq('a'))] }), [{ code: 'INVALID_INPUT', rule: 'R1.1' }]),
  e('NaN lineTotal is invalid', ['R1.1'], one({ items: [item('x', Number.NaN, eq('a'))] }), [{ code: 'INVALID_INPUT', rule: 'R1.1' }]),
  e('Infinity lineTotal is invalid', ['R1.1'], one({ items: [item('x', Number.POSITIVE_INFINITY, eq('a'))] }), [{ code: 'INVALID_INPUT', rule: 'R1.1' }]),
  e('lineTotal beyond the safe-integer range is invalid', ['R1.1'], one({ items: [item('x', Number.MAX_SAFE_INTEGER + 1, eq('a'))] }), [
    { code: 'INVALID_INPUT', rule: 'R1.1' },
  ]),
  e('fractional adjustment fixed amount is invalid', ['R1.1'], one({ adjustments: [adj('f', 'fee', { type: 'fixed', amount: 10.5 as never })] }), [
    { code: 'INVALID_INPUT', rule: 'R1.1' },
  ]),
  e('fractional basis points are invalid', ['R1.1', 'R1.2'], one({ adjustments: [adj('t', 'tax', rate(1000.5))] }), [{ code: 'INVALID_INPUT', rule: 'R1.1' }]),
  e('discount rate above 10000 bp is invalid', ['R1.2'], one({ adjustments: [adj('d', 'discount', rate(10001))] }), [
    { code: 'INVALID_INPUT', rule: 'R1.2' },
  ]),
  e('negative rate is invalid', ['R1.2'], one({ adjustments: [adj('t', 'tax', rate(-1))] }), [{ code: 'INVALID_INPUT', rule: 'R1.2' }]),
  e('zero participants is invalid', ['R3.1'], bill({ participants: [], items: [] }), [{ code: 'INVALID_INPUT', rule: 'R3.1' }]),
  e('duplicate participant ids', ['R2.4'], one({ participants: people('a', 'b', 'a') }), [{ code: 'INVALID_INPUT', rule: 'R2.4' }]),
  e('empty participant id', ['R2.4'], one({ participants: people('a', 'b', '') }), [{ code: 'INVALID_INPUT', rule: 'R2.4' }]),
  e('duplicate item ids', ['R2.4'], one({ items: [item('x', 1000, eq('a')), item('x', 500, eq('b'))] }), [{ code: 'INVALID_INPUT', rule: 'R2.4' }]),
  e('duplicate adjustment ids', ['R2.4'], one({ adjustments: [adj('t', 'tax', rate(100)), adj('t', 'fee', rate(100))] }), [
    { code: 'INVALID_INPUT', rule: 'R2.4' },
  ]),
  e('assignment references an unknown participant', ['R3.4'], one({ items: [item('x', 1000, eq('a', 'ghost'))] }), [
    { code: 'INVALID_INPUT', rule: 'R3.4' },
  ]),
  e('participant appears twice in one assignment', ['R3.4'], one({ items: [item('x', 1000, eq('a', 'a'))] }), [{ code: 'INVALID_INPUT', rule: 'R3.4' }]),
  e('empty equal assignment set', ['R4.2', 'R3.4'], one({ items: [item('x', 1000, eq())] }), [{ code: 'INVALID_INPUT' }]),
  e('weight 0 is invalid', ['R3.4'], one({ items: [item('x', 1000, { kind: 'weights', entries: [{ participantId: 'a', weight: 0 }, { participantId: 'b', weight: 1 }] })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.4' },
  ]),
  e('fractional weight is invalid', ['R3.4'], one({ items: [item('x', 1000, { kind: 'weights', entries: [{ participantId: 'a', weight: 1.5 }] })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.4' },
  ]),
  e('units entry of 0 is invalid', ['R3.4'], one({ items: [item('x', 1000, { kind: 'units', entries: [{ participantId: 'a', units: 0 }, { participantId: 'b', units: 1 }] })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.4' },
  ]),
  e('eligibility references an unknown item id', ['R3.4'], one({ adjustments: [adj('d', 'discount', rate(100), { eligibility: { itemIds: ['ghost'] } })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.4' },
  ]),
  e('items-after references an unknown adjustment id', ['R3.4'], one({ adjustments: [adj('t', 'tax', rate(100), { base: { type: 'items-after', include: ['ghost'] } })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.4' },
  ]),
  e('allocation policy references an unknown participant', ['R3.4'], one({ adjustments: [adj('t', 'tip', rate(100), { allocation: { type: 'equal', participantIds: ['ghost'] } })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.4' },
  ]),
  e(
    'participant appears twice in an allocation policy',
    ['R3.4'],
    one({
      adjustments: [
        adj('t', 'tip', rate(100), {
          allocation: { type: 'weights', entries: [{ participantId: 'a', weight: 1 }, { participantId: 'a', weight: 2 }] },
        }),
      ],
    }),
    [{ code: 'INVALID_INPUT', rule: 'R3.4' }],
  ),
  e('settlementRoundingUnit 0 is invalid', ['R3.5'], one({ unit: 0 }), [{ code: 'INVALID_INPUT', rule: 'R3.5' }]),
  e('settlementRoundingUnit 1.5 is invalid', ['R3.5'], one({ unit: 1.5 }), [{ code: 'INVALID_INPUT', rule: 'R3.5' }]),
  e('settlementRoundingUnit negative is invalid', ['R3.5'], one({ unit: -100 }), [{ code: 'INVALID_INPUT', rule: 'R3.5' }]),
  e('custom adjustment without a direction', ['R5.1'], one({ adjustments: [adj('c', 'custom', rate(100))] }), [{ code: 'INVALID_INPUT', rule: 'R5.1' }]),
  e('override with an empty reason', ['R3.6', 'R8.7'], one({ adjustments: [adj('t', 'tax', rate(100), { override: { amount: 5, reason: '' } })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.6' },
  ]),
  e('validity without bill.date', ['R3.7'], one({ adjustments: [adj('d', 'discount', rate(100), { validity: { from: '2026-01-01' } })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.7' },
  ]),
  e('validity with a malformed bill.date', ['R3.7'], one({ date: '02-11-2026', adjustments: [adj('d', 'discount', rate(100), { validity: { from: '2026-01-01' } })] }), [
    { code: 'INVALID_INPUT', rule: 'R3.7' },
  ]),
];

/** Multiple independent errors are all reported (R15.1): arithmetic mismatch, unassigned item, invalid base. */
export const collectsAllIssues: Fixture = {
  name: 'collects all issues rather than stopping at the first',
  rules: ['R15.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [
      item('m', 1100, eq('a'), { quantity: 2, unitPrice: 500 }),
      item('u', 700, { kind: 'unassigned' }),
      item('ok', 1000, eq('b')),
    ],
    adjustments: [
      adj('first', 'tax', rate(100), { order: 2 }),
      adj('bad', 'tax', rate(100), { order: 1, base: { type: 'items-after', include: ['first'] } }),
    ],
  }),
  expect: {
    ok: false,
    errors: [
      { code: 'LINE_ARITHMETIC_MISMATCH', itemId: 'm' },
      { code: 'ITEM_UNASSIGNED', itemId: 'u' },
      { code: 'ADJUSTMENT_INVALID_BASE', rule: 'R7.2', adjustmentId: 'bad' },
    ],
  },
};
