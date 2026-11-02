import { adj, bill, eq, item, paid, people, rate, uni } from '../helpers';
import type { Fixture } from './types';

/**
 * Fixture A (rules doc, plan §4). Amounts in paisa (Rs x 100).
 * Items 400000 / 300000 / 200000 / 100000, one per person. Subtotal 1_000_000.
 * Discount 2000 bp on items: 1_000_000 x 2000 / 10_000 = 200_000  -> -200_000
 * Tax      1000 bp on items: 1_000_000 x 1000 / 10_000 = 100_000  -> +100_000   (tax on the ORIGINAL subtotal)
 * Total = 1_000_000 - 200_000 + 100_000 = 900_000.
 * p1: 400000 - 80000 + 40000 = 360000; p2: 300000 - 60000 + 30000 = 270000;
 * p3: 200000 - 40000 + 20000 = 180000; p4: 100000 - 20000 + 10000 = 90000.  (sum 900000)
 */
export const fixtureA: Fixture = {
  name: 'Fixture A (plan s4): 20% discount + 10% tax on original subtotal',
  rules: ['R5.1', 'R7.1', 'R8.3', 'R9.3', 'R10.2', 'R10.3', 'R11.1', 'R12.1'],
  input: bill({
    participants: people('p1', 'p2', 'p3', 'p4'),
    items: [
      item('i1', 400000, eq('p1')),
      item('i2', 300000, eq('p2')),
      item('i3', 200000, eq('p3')),
      item('i4', 100000, eq('p4')),
    ],
    adjustments: [
      adj('disc', 'discount', rate(2000), { order: 1 }),
      adj('tax', 'tax', rate(1000), { order: 2 }),
    ],
  }),
  expect: {
    ok: true,
    itemsSubtotal: 1_000_000,
    total: 900_000,
    exact: { p1: 360000, p2: 270000, p3: 180000, p4: 90000 },
    rounded: { p1: 360000, p2: 270000, p3: 180000, p4: 90000 },
    adjustments: { disc: -200_000, tax: 100_000 },
    allocations: {
      disc: { p1: -80000, p2: -60000, p3: -40000, p4: -20000 },
      tax: { p1: 40000, p2: 30000, p3: 20000, p4: 10000 },
    },
    // no contributions -> settlement null + NO_CONTRIBUTIONS (added automatically)
  },
};

/**
 * Fixture B "Salt & Ember" (rules doc), paisa. Participants mahhee, hamza, ali, saad.
 * karahi 320000 equal(4)            -> 80000 each
 * seekh x2 290000 units(h1,a1)      -> 145000 hamza, 145000 ali
 * daal 95000 equal(mahhee,saad)     -> 47500 each
 * naan x6 72000 equal(4)            -> 18000 each
 * margarita x3 135000 units(m1,h1,s1) -> 45000 each
 * doodh x4 88000 equal(4)           -> 22000 each
 * subtotals: mahhee 80000+47500+18000+45000+22000 = 212500; hamza 80000+145000+18000+45000+22000 = 310000
 *            ali 80000+145000+18000+22000 = 265000; saad = 212500. Sum 1_000_000.
 * discount 2000 bp of 1_000_000 = -200000 -> allocated by b_p (exact): -42500 / -62000 / -53000 / -42500
 * tax 500 bp of 1_000_000 = +50000 -> +10625 / +15500 / +13250 / +10625
 * exact: mahhee 212500-42500+10625 = 180625; hamza 310000-62000+15500 = 263500;
 *        ali 265000-53000+13250 = 225250; saad 180625.   Sum 850000 = T.
 * R = 850000 (already whole rupees). floors 180600(r25) 263500(r0) 225200(r50) 180600(r25) = 849900,
 * k = (850000-849900)/100 = 1 -> to the largest remainder: ali (50) -> 225300.
 * hamza paid 850000. net: mahhee -180600, hamza +586500, ali -225300, saad -180600.
 * Transfers (largest debtor first): ali->hamza 225300, then mahhee/saad tie (180600) -> lower id mahhee first.
 */
export const fixtureB: Fixture = {
  name: 'Fixture B (Salt & Ember): shared dishes, units, card discount, tax, one payer',
  rules: ['R4.2', 'R4.6', 'R9.3', 'R11.2', 'R11.4', 'R12.3', 'R12.4'],
  input: bill({
    participants: people('mahhee', 'hamza', 'ali', 'saad'),
    items: [
      item('karahi', 320000, eq('mahhee', 'hamza', 'ali', 'saad'), { name: 'Chicken Karahi' }),
      item('seekh', 290000, uni({ hamza: 1, ali: 1 }), { quantity: 2, unitPrice: 145000, name: 'Mutton Seekh' }),
      item('daal', 95000, eq('mahhee', 'saad'), { name: 'Daal Makhni' }),
      item('naan', 72000, eq('mahhee', 'hamza', 'ali', 'saad'), { quantity: 6, unitPrice: 12000, name: 'Garlic Naan' }),
      item('margarita', 135000, uni({ mahhee: 1, hamza: 1, saad: 1 }), { quantity: 3, unitPrice: 45000 }),
      item('doodh', 88000, eq('mahhee', 'hamza', 'ali', 'saad'), { quantity: 4, unitPrice: 22000, name: 'Doodh Patti' }),
    ],
    adjustments: [
      adj('card', 'discount', rate(2000), { order: 1, label: 'Card 20%' }),
      adj('gst', 'tax', rate(500), { order: 2, label: 'GST 5%' }),
    ],
    contributions: paid({ hamza: 850000 }),
  }),
  expect: {
    ok: true,
    itemsSubtotal: 1_000_000,
    total: 850_000,
    roundedTotal: 850_000,
    exact: { mahhee: 180625, hamza: 263500, ali: 225250, saad: 180625 },
    rounded: { mahhee: 180600, hamza: 263500, ali: 225300, saad: 180600 },
    adjustments: { card: -200_000, gst: 50_000 },
    allocations: {
      card: { mahhee: -42500, hamza: -62000, ali: -53000, saad: -42500 },
      gst: { mahhee: 10625, hamza: 15500, ali: 13250, saad: 10625 },
    },
    itemShares: {
      karahi: { mahhee: 80000, hamza: 80000, ali: 80000, saad: 80000 },
      seekh: { hamza: 145000, ali: 145000 },
      daal: { mahhee: 47500, saad: 47500 },
      naan: { mahhee: 18000, hamza: 18000, ali: 18000, saad: 18000 },
      margarita: { mahhee: 45000, hamza: 45000, saad: 45000 },
      doodh: { mahhee: 22000, hamza: 22000, ali: 22000, saad: 22000 },
    },
    settlement: {
      transfers: [
        ['ali', 'hamza', 225300],
        ['mahhee', 'hamza', 180600],
        ['saad', 'hamza', 180600],
      ],
      residual: { amount: 0, participantId: 'hamza' },
      net: { mahhee: -180600, hamza: 586500, ali: -225300, saad: -180600 },
    },
  },
};

