import type { Contribution } from '../../src/index';
import { $, adj, amt, bill, eq, item, NONE, paid, pct, people, rate, uni, wts } from '../helpers';
import type { ErrExpect, Fixture } from './types';

/** M1 — one participant. 100000 + 16% tax (1600 bp x 100000 / 10000 = 16000) = 116000. */
export const onePerson: Fixture = {
  name: 'one participant',
  rules: ['R3.1', 'R10.3', 'R12.4'],
  input: bill({
    participants: people('a'),
    items: [item('i1', 100000, eq('a'))],
    adjustments: [adj('tax', 'tax', rate(1600))],
    contributions: paid({ a: 116000 }),
  }),
  expect: {
    ok: true,
    total: 116000,
    exact: { a: 116000 },
    rounded: { a: 116000 },
    adjustments: { tax: 16000 },
    settlement: { transfers: [], residual: { amount: 0, participantId: 'a' }, net: { a: 0 } },
  },
};

/**
 * M2 — many participants. 10000 / 6 = 1666.67 -> floors 1666 x 6 = 9996, leftover 4.
 * All fractional parts equal (.67) -> tie -> the 4 lowest ids a,b,c,d get 1667; e,f get 1666.
 * c paid everything: net c = 10000 - 1667 = 8333; debtors a,b,d 1667, e,f 1666.
 * Largest debtor first, ties to lower id: a, b, d, e, f.
 */
export const manyPeople: Fixture = {
  name: 'many participants (6) equal split with leftover paisa to lowest ids',
  rules: ['R4.2', 'R9.1', 'R12.4'],
  input: bill({
    participants: people('a', 'b', 'c', 'd', 'e', 'f'),
    items: [item('i1', 10000, eq('a', 'b', 'c', 'd', 'e', 'f'))],
    contributions: paid({ c: 10000 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 10000,
    exact: { a: 1667, b: 1667, c: 1667, d: 1667, e: 1666, f: 1666 },
    itemShares: { i1: { a: 1667, b: 1667, c: 1667, d: 1667, e: 1666, f: 1666 } },
    settlement: {
      transfers: [
        ['a', 'c', 1667],
        ['b', 'c', 1667],
        ['d', 'c', 1667],
        ['e', 'c', 1666],
        ['f', 'c', 1666],
      ],
      residual: { amount: 0, participantId: 'c' },
      net: { a: -1667, b: -1667, c: 8333, d: -1667, e: -1666, f: -1666 },
    },
  },
};

const twoEntriesForA: Contribution[] = [
  { participantId: 'a', amount: $(15000) },
  { participantId: 'a', amount: $(10000) },
  { participantId: 'b', amount: $(15000) },
];

/**
 * M4 — multiple payers, several entries for one person add up (R12.1).
 * 40000 / 4 = 10000 each. a paid 15000 + 10000 = 25000, b paid 15000.
 * net a +15000, b +5000, c -10000, d -10000.
 * Greedy: debtors c,d tie (10000) -> c with largest creditor a: c->a 10000 (a left 5000).
 * d (10000) vs creditors a 5000, b 5000 tie -> a: d->a 5000, then d->b 5000.
 * Residual holder = largest contributor = a (25000), residual 0.
 */
export const multiplePayers: Fixture = {
  name: 'multiple payers, split contributions of one person add up',
  rules: ['R12.1', 'R12.2', 'R12.3', 'R12.4'],
  input: bill({
    participants: people('a', 'b', 'c', 'd'),
    items: [item('i1', 40000, eq('a', 'b', 'c', 'd'))],
    contributions: twoEntriesForA,
  }),
  expect: {
    ok: true,
    total: 40000,
    exact: { a: 10000, b: 10000, c: 10000, d: 10000 },
    rounded: { a: 10000, b: 10000, c: 10000, d: 10000 },
    settlement: {
      transfers: [
        ['c', 'a', 10000],
        ['d', 'a', 5000],
        ['d', 'b', 5000],
      ],
      residual: { amount: 0, participantId: 'a' },
      net: { a: 15000, b: 5000, c: -10000, d: -10000 },
    },
  },
};

/**
 * R4.2 — 1000 among 3 -> 334 / 333 / 333, the extra paisa to the lowest id.
 * Participants and entries are listed in REVERSE id order to prove array position is irrelevant.
 * a paid 1000: net a +666, b -333, c -333 -> b->a 333, c->a 333.
 */
export const equalSplit: Fixture = {
  name: 'equal split 1000 among 3 gives leftover paisa to lowest id (reverse-listed)',
  rules: ['R4.2', 'R2.2', 'R2.3', 'R9.1'],
  input: bill({
    participants: people('c', 'b', 'a'),
    items: [item('x', 1000, eq('c', 'b', 'a'))],
    contributions: paid({ a: 1000 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1000,
    exact: { a: 334, b: 333, c: 333 },
    rounded: { a: 334, b: 333, c: 333 },
    itemShares: { x: { a: 334, b: 333, c: 333 } },
    settlement: {
      transfers: [
        ['b', 'a', 333],
        ['c', 'a', 333],
      ],
      residual: { amount: 0, participantId: 'a' },
      net: { a: 666, b: -333, c: -333 },
    },
  },
};

/**
 * R4.4 — 1001 with 3333 / 3333 / 3334 bp. Quotas 1001x3333/10000 = 333.6333 (a), 333.6333 (b), 333.7334 (c).
 * floors 333 each = 999, leftover 2 -> largest fractions: c (.7334), then a/b tie (.6333) -> a.
 * a 334, b 333, c 334.
 * a paid 1001: net a +667, b -333, c -334 -> debtors c (334) then b (333).
 */
export const percentSplit: Fixture = {
  name: 'percent split 3333/3333/3334 bp of 1001',
  rules: ['R4.4', 'R9.1'],
  input: bill({
    participants: people('a', 'b', 'c'),
    items: [item('x', 1001, pct({ a: 3333, b: 3333, c: 3334 }))],
    contributions: paid({ a: 1001 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1001,
    exact: { a: 334, b: 333, c: 334 },
    itemShares: { x: { a: 334, b: 333, c: 334 } },
    settlement: {
      transfers: [
        ['c', 'a', 334],
        ['b', 'a', 333],
      ],
      residual: { amount: 0, participantId: 'a' },
      net: { a: 667, b: -333, c: -334 },
    },
  },
};

/** R4.3 — weights 1:2 of 1000 (fraction 1/3 + 2/3). Quotas 333.33 / 666.67 -> floors 333+666, leftover 1 -> b (.67). */
export const weightsSplit: Fixture = {
  name: 'fraction (weights 1:2) split of 1000 -> 333 / 667',
  rules: ['R4.3', 'R9.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('x', 1000, wts({ a: 1, b: 2 }))],
    contributions: paid({ b: 1000 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1000,
    exact: { a: 333, b: 667 },
    itemShares: { x: { a: 333, b: 667 } },
    settlement: { transfers: [['a', 'b', 333]], residual: { amount: 0, participantId: 'b' }, net: { a: -333, b: 333 } },
  },
};

/** R4.5 — explicit amounts are used as-is. */
export const amountsSplit: Fixture = {
  name: 'amounts split 250 / 750 of 1000 used as-is',
  rules: ['R4.5'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('x', 1000, amt({ a: 250, b: 750 }))],
    contributions: paid({ a: 1000 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1000,
    exact: { a: 250, b: 750 },
    itemShares: { x: { a: 250, b: 750 } },
    settlement: { transfers: [['b', 'a', 750]], residual: { amount: 0, participantId: 'a' }, net: { a: 750, b: -750 } },
  },
};

/**
 * R4.6 — qty 3, lineTotal 1000, units a2 b1. Quotas 1000x2/3 = 666.67, 333.33 -> floors 666+333, leftover 1 -> a (.67).
 * a 667, b 333.
 */
export const unitsSplit: Fixture = {
  name: 'units split 2:1 of 1000 -> 667 / 333',
  rules: ['R4.6', 'R9.1'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('x', 1000, uni({ a: 2, b: 1 }), { quantity: 3 })],
    contributions: paid({ a: 1000 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1000,
    exact: { a: 667, b: 333 },
    itemShares: { x: { a: 667, b: 333 } },
    settlement: { transfers: [['b', 'a', 333]], residual: { amount: 0, participantId: 'a' }, net: { a: 333, b: -333 } },
  },
};

/** R4.6 doc example — Seekh x2 for 2900 (290000 paisa), hamza 1 / ali 1 -> 145000 each. */
export const seekhUnits: Fixture = {
  name: 'units example Seekh x2: 1 and 1 -> 1450 each',
  rules: ['R4.6'],
  input: bill({
    participants: people('hamza', 'ali'),
    items: [item('seekh', 290000, uni({ hamza: 1, ali: 1 }), { quantity: 2, unitPrice: 145000 })],
    contributions: paid({ hamza: 290000 }),
  }),
  expect: {
    ok: true,
    total: 290000,
    exact: { hamza: 145000, ali: 145000 },
    rounded: { hamza: 145000, ali: 145000 },
    itemShares: { seekh: { hamza: 145000, ali: 145000 } },
    settlement: { transfers: [['ali', 'hamza', 145000]], residual: { amount: 0, participantId: 'hamza' }, net: { hamza: 145000, ali: -145000 } },
  },
};

/**
 * R4.7 — a void line of -1001 split equal among 3 splits by magnitude then negates:
 * LR(1001, 1,1,1): 333.67 each -> floors 999, leftover 2 -> a,b get 334, c 333 -> negated -334 / -334 / -333.
 * With another item 3000 equal (1000 each): a 666, b 666, c 667. T = 3000 - 1001 = 1999.
 */
export const negativeSplitSymmetric: Fixture = {
  name: 'negative line -1001 equal among 3 is symmetric (-334/-334/-333)',
  rules: ['R4.7', 'R9.1'],
  input: bill({
    participants: people('a', 'b', 'c'),
    items: [item('x', 3000, eq('a', 'b', 'c')), item('void', -1001, eq('a', 'b', 'c'))],
    contributions: paid({ a: 1999 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1999,
    itemsSubtotal: 1999,
    exact: { a: 666, b: 666, c: 667 },
    itemShares: { x: { a: 1000, b: 1000, c: 1000 }, void: { a: -334, b: -334, c: -333 } },
  },
};

/** R4.8 — whoever covers an item is the assignee: the item covered by a is assigned to a. */
export const coversItem: Fixture = {
  name: 'item covered by another person is assigned to that person',
  rules: ['R4.8'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('x', 5000, eq('a')), item('y', 3000, eq('b'))],
    contributions: paid({ a: 8000 }),
  }),
  expect: {
    ok: true,
    total: 8000,
    exact: { a: 5000, b: 3000 },
    rounded: { a: 5000, b: 3000 },
    itemShares: { x: { a: 5000 }, y: { b: 3000 } },
    settlement: { transfers: [['b', 'a', 3000]], residual: { amount: 0, participantId: 'a' }, net: { a: 3000, b: -3000 } },
  },
};

/** R4.1 — zero-priced unassigned item is only a warning; the other item (1000) is assigned normally. */
export const zeroUnassigned: Fixture = {
  name: 'zero-priced unassigned item is a warning only',
  rules: ['R4.1'],
  input: bill({
    participants: people('a'),
    items: [item('free', 0, NONE), item('x', 1000, eq('a'))],
    contributions: paid({ a: 1000 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 1000,
    exact: { a: 1000 },
    warnings: [{ code: 'ITEM_UNASSIGNED', itemId: 'free' }],
  },
};

/** R3.2 — complimentary (0) assigned item contributes nothing. 10000 split 5000/5000, 10% discount = -1000 -> -500 each. */
export const complimentary: Fixture = {
  name: 'complimentary (0) item changes nothing',
  rules: ['R3.2', 'R4.2'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('comp', 0, eq('a')), item('x', 10000, eq('a', 'b'))],
    adjustments: [adj('d', 'discount', rate(1000))],
    contributions: paid({ a: 9000 }),
    unit: 1,
  }),
  expect: {
    ok: true,
    total: 9000,
    exact: { a: 4500, b: 4500 },
    adjustments: { d: -1000 },
    allocations: { d: { a: -500, b: -500 } },
    itemShares: { x: { a: 5000, b: 5000 } },
  },
};

// ── assignment error fixtures ──

const errBill = (assignment: Parameters<typeof item>[2], lineTotal = 1000, quantity = 1) =>
  bill({
    participants: people('a', 'b'),
    items: [item('x', lineTotal, assignment, { quantity })],
  });

const err = (name: string, rules: string[], input: ReturnType<typeof bill>, e: ErrExpect['errors']): Fixture => ({
  name,
  rules,
  input,
  expect: { ok: false, errors: e },
});

export const assignmentErrors: Fixture[] = [
  err('unassigned non-zero item is an error', ['R4.1'], errBill(NONE), [{ code: 'ITEM_UNASSIGNED', rule: 'R4.1', itemId: 'x' }]),
  err('percent under 10000 bp', ['R4.4'], errBill(pct({ a: 5000 })), [{ code: 'ITEM_UNDER_ASSIGNED', rule: 'R4.4', itemId: 'x' }]),
  err('percent over 10000 bp', ['R4.4'], errBill(pct({ a: 6000, b: 5000 })), [{ code: 'ITEM_OVER_ASSIGNED', rule: 'R4.4', itemId: 'x' }]),
  err('amounts under lineTotal', ['R4.5'], errBill(amt({ a: 400, b: 500 })), [{ code: 'ITEM_UNDER_ASSIGNED', rule: 'R4.5', itemId: 'x', difference: -100 }]),
  err('amounts over lineTotal', ['R4.5'], errBill(amt({ a: 600, b: 500 })), [{ code: 'ITEM_OVER_ASSIGNED', rule: 'R4.5', itemId: 'x', difference: 100 }]),
  err('amounts under on a negative line is judged by magnitude', ['R4.5'], errBill(amt({ a: -600 }), -1000), [
    { code: 'ITEM_UNDER_ASSIGNED', rule: 'R4.5', itemId: 'x', difference: 400 },
  ]),
  err('amounts entry with sign opposite to lineTotal', ['R4.5'], errBill(amt({ a: 1500, b: -500 })), [{ code: 'INVALID_INPUT', rule: 'R4.5' }]),
  err('units under quantity', ['R4.6'], errBill(uni({ a: 1, b: 1 }), 1000, 3), [{ code: 'ITEM_UNDER_ASSIGNED', rule: 'R4.6', itemId: 'x' }]),
  err('units over quantity', ['R4.6'], errBill(uni({ a: 2, b: 2 }), 1000, 3), [{ code: 'ITEM_OVER_ASSIGNED', rule: 'R4.6', itemId: 'x' }]),
];
