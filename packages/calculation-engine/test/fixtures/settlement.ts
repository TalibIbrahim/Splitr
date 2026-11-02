import { bill, eq, item, paid, people } from '../helpers';
import type { Fixture } from './types';

/** a ate 10075, b ate 10075 (T = 20150, not a whole rupee). */
const halfRupee = (contributions: ReturnType<typeof paid>) =>
  bill({
    participants: people('a', 'b'),
    items: [item('i1', 10075, eq('a')), item('i2', 10075, eq('b'))],
    contributions,
  });

/**
 * R11.1 R = 100 x floor((2x20150 + 100) / 200) = 100 x floor(40400 / 200) = 100 x 202 = 20200 (halves go UP).
 * R11.2 floors 10000 (r75) + 10000 (r75) = 20000, k = (20200 - 20000)/100 = 2 -> both get +100 -> 10100 / 10100.
 * deltas +25 / +25.
 * R12.2 rho = R - T = 50 -> the largest contributor a (paid 20150) gets rho.
 * net a = 20150 - 10100 + 50 = 10100; b = 0 - 10100 = -10100. Transfer b -> a 10100.
 */
export const settlementResidualToPayer: Fixture = {
  name: 'non-whole-rupee total 201.50: rounded up, residual 50 to the largest contributor',
  rules: ['R11.1', 'R11.2', 'R11.3', 'R12.2', 'R12.3'],
  input: halfRupee(paid({ a: 20150 })),
  expect: {
    ok: true,
    total: 20150,
    roundedTotal: 20200,
    exact: { a: 10075, b: 10075 },
    rounded: { a: 10100, b: 10100 },
    settlement: {
      transfers: [['b', 'a', 10100]],
      residual: { amount: 50, participantId: 'a' },
      net: { a: 10100, b: -10100 },
    },
  },
};

/**
 * Same bill; a and b each paid 10075 -> tie for largest contributor -> lower id a gets rho = +50.
 * net a = 10075 - 10100 + 50 = 25; b = 10075 - 10100 = -25. Transfer b -> a 25.
 * The contributions are listed b first to prove the tie-break is by id.
 */
export const settlementResidualTie: Fixture = {
  name: 'residual tie between equal contributors goes to the lower id',
  rules: ['R12.2', 'R2.2'],
  input: halfRupee(paid({ b: 10075, a: 10075 })),
  expect: {
    ok: true,
    total: 20150,
    roundedTotal: 20200,
    exact: { a: 10075, b: 10075 },
    rounded: { a: 10100, b: 10100 },
    settlement: {
      transfers: [['b', 'a', 25]],
      residual: { amount: 50, participantId: 'a' },
      net: { a: 25, b: -25 },
    },
  },
};

/**
 * Negative residual. a ate 10070, b ate 10070 (T = 20140).
 * R = 100 x floor((40280 + 100)/200) = 100 x floor(201.9) = 20100. rho = -40.
 * floors 10000 (r70) + 10000 (r70) = 20000, k = 1 -> tie -> lower id a: a 10100, b 10000. deltas a +30, b -70.
 * a paid all: net a = 20140 - 10100 + (-40) = 10000; b = -10000. Transfer b -> a 10000.
 */
export const settlementNegativeResidual: Fixture = {
  name: 'total 201.40 rounds down to 201: negative residual -40 to the payer',
  rules: ['R11.1', 'R11.2', 'R12.2'],
  input: bill({
    participants: people('a', 'b'),
    items: [item('i1', 10070, eq('a')), item('i2', 10070, eq('b'))],
    contributions: paid({ a: 20140 }),
  }),
  expect: {
    ok: true,
    total: 20140,
    roundedTotal: 20100,
    exact: { a: 10070, b: 10070 },
    rounded: { a: 10100, b: 10000 },
    settlement: {
      transfers: [['b', 'a', 10000]],
      residual: { amount: -40, participantId: 'a' },
      net: { a: 10000, b: -10000 },
    },
  },
};

/** T = 50 with unit 100: R = 100 x floor((100+100)/200) = 100 (half rounds up). rounded 100, delta +50, rho +50. net a = 50 - 100 + 50 = 0. */
export const settlementHalfUp: Fixture = {
  name: 'T = 50 rounds half-up to 100',
  rules: ['R11.1'],
  input: bill({ participants: people('a'), items: [item('i1', 50, eq('a'))], contributions: paid({ a: 50 }) }),
  expect: {
    ok: true,
    total: 50,
    roundedTotal: 100,
    exact: { a: 50 },
    rounded: { a: 100 },
    settlement: { transfers: [], residual: { amount: 50, participantId: 'a' }, net: { a: 0 } },
  },
};

/** T = 49 with unit 100: R = 100 x floor((98+100)/200) = 0. rounded 0, delta -49, rho -49. net a = 49 - 0 - 49 = 0. */
export const settlementBelowHalf: Fixture = {
  name: 'T = 49 rounds down to 0',
  rules: ['R11.1'],
  input: bill({ participants: people('a'), items: [item('i1', 49, eq('a'))], contributions: paid({ a: 49 }) }),
  expect: {
    ok: true,
    total: 49,
    roundedTotal: 0,
    exact: { a: 49 },
    rounded: { a: 0 },
    settlement: { transfers: [], residual: { amount: -49, participantId: 'a' }, net: { a: 0 } },
  },
};

/**
 * Custom unit 500 (Rs 5). 1000 equal among 3 -> 334 / 333 / 333.
 * R = 500 x floor((2000 + 500)/1000) = 500 x 2 = 1000. floors 0 (r334), 0 (r333), 0 (r333); k = (1000-0)/500 = 2
 * -> two largest remainders: a (334), then b/c tie (333) -> b. a 500, b 500, c 0. deltas +166 / +167 / -333.
 * a paid 1000: net a 500, b -500, c 0. Transfer b -> a 500.
 */
export const settlementCustomUnit: Fixture = {
  name: 'custom settlement unit 500: k=2 units go to the largest remainders',
  rules: ['R3.5', 'R11.2'],
  input: bill({
    participants: people('a', 'b', 'c'),
    items: [item('i1', 1000, eq('a', 'b', 'c'))],
    contributions: paid({ a: 1000 }),
    unit: 500,
  }),
  expect: {
    ok: true,
    total: 1000,
    roundedTotal: 1000,
    exact: { a: 334, b: 333, c: 333 },
    rounded: { a: 500, b: 500, c: 0 },
    settlement: {
      transfers: [['b', 'a', 500]],
      residual: { amount: 0, participantId: 'a' },
      net: { a: 500, b: -500, c: 0 },
    },
  },
};
