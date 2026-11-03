/**
 * Daily Deli Co. (Johar Town), photo 6.png. Header "Item Description | Qty | Rate | Amoun" (truncated "Amount", kept).
 * Each item has a code line above it ("2.230", "2.245", ...) that holds only a code-shaped token (P15).
 * Three items wrap with a "HALF CUT +" row (P16); the first also has "100G" on that row.
 * Placeholders: invoice no, phone, PNTN 1234567-8, staff name. The cropped rate cells (",050", ".000") are shown as clean amounts.
 *
 * Hand derivation (rupees):
 *   CHEESY MUSHROOM (BEEF) 100G HALF CUT +   1.0 x 660   = 660
 *   MOLTEN LAVA (BEEF) 150G HALF CUT +       1.0 x 1,050 = 1,050
 *   THE MESSI (BEEF) HALF CUT +              1.0 x 1,000 = 1,000
 *   MEAL FRIES 1.0 x 145 = 145 ; CURLY MEAL FRIES 1.0 x 225 = 225 ; PEPSI 2.0 x 105 = 210
 *   items = 660+1,050+1,000+145+225+210 = 3,290 = G.Amount
 *   G.S.T 5% = 164.5 -> 165 (half up) ; Net Amount = 3,290 + 165 = 3,455 ; CREDIT CARD -> paidWith card
 */
import { Sec, V, Wrap } from '../../layout';
import { makeFixture } from './types';

const rows = [
  Sec(['DAILY', 140, { h: 20 }]),
  V(['DELI Co.', 148, { h: 20 }]),
  V(['Civic center, Block D-2, Phase 1, Johar Town, Lahore', 103]),
  V(['Delivery # 00-000-000-000', 150]),
  V(['PNTN # 1234567-8', 150]),
  Sec(['DINE IN', 178, { h: 15 }]),
  V(['Inv.#0,000', 107]),
  V(['Date : 10/5/2025', 107], ['B', 205]),
  V(['Time : 21 25', 107]),
  V(['Token : 32', 107]),
  Sec(['Item Description', 108], ['Qty', 243], ['Rate', 266], ['Amoun', 290]),
  V(['2.230', 200]),
  V(['CHEESY MUSHROOM (BEEF)', 110], ['1.0', 248], ['660', 268], ['660', 298]),
  Wrap(['100G', 110], ['HALF CUT +', 207]),
  V(['2.245', 200]),
  V(['MOLTEN LAVA (BEEF) 150G', 110], ['1.0', 248], ['1,050', 265], ['1,050', 293]),
  Wrap(['HALF CUT +', 207]),
  V(['2.251', 200]),
  V(['THE MESSI (BEEF)', 110], ['1.0', 248], ['1,000', 265], ['1,000', 293]),
  Wrap(['HALF CUT +', 207]),
  V(['2.257', 200]),
  V(['MEAL FRIES', 110], ['1.0', 248], ['145', 270], ['145', 298]),
  V(['2.260', 200]),
  V(['CURLY MEAL FRIES', 110], ['1.0', 248], ['225', 270], ['225', 298]),
  V(['2.266', 200]),
  V(['PEPSI', 110], ['2.0', 248], ['105', 270], ['210', 298]),
  Sec(['Items : 9', 107]),
  V(['G.Amount:', 218], ['3,290', 308]),
  V(['G.S.T 5% :', 218], ['165', 310]),
  Sec(['CREDIT CARD', 118, { h: 14 }]),
  V(['Net Amount :', 210], ['3,455', 300, { h: 16 }]),
  V(['Powered by:www.grip.pk', 210]),
  V(['NAME TABLE-000 (00)', 105]),
];

export const dailyDeli = makeFixture('Daily Deli', rows, { lh: 11, cw: 6, imageWidth: 475 }, {
  restaurantName: /daily/i,
  rulingDate: '2025-05-10',
  items: [
    { name: 'CHEESY MUSHROOM (BEEF) 100G HALF CUT +', quantity: 1, unitPrice: 66000, lineTotal: 66000 },
    { name: 'MOLTEN LAVA (BEEF) 150G HALF CUT +', quantity: 1, unitPrice: 105000, lineTotal: 105000 },
    { name: 'THE MESSI (BEEF) HALF CUT +', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
    { name: 'MEAL FRIES', quantity: 1, unitPrice: 14500, lineTotal: 14500 },
    { name: 'CURLY MEAL FRIES', quantity: 1, unitPrice: 22500, lineTotal: 22500 },
    { name: 'PEPSI', quantity: 2, unitPrice: 10500, lineTotal: 21000 },
  ],
  printedSubtotal: 329000,
  printedTotal: 345500,
  charges: [{ kind: 'tax', amount: 16500, rateBp: 500 }],
  paidWith: 'card',
  taxInclusive: false,
  checksOk: true,
  headerFragments: ['Civic', 'Delivery', 'PNTN', 'DINE', 'Inv', 'Date', 'Time', 'Token', '2.230', '2.245', '2.251', '2.257', '2.260', '2.266', 'Items', 'Powered', 'TABLE'],
});
