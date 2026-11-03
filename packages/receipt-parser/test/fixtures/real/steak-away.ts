/**
 * Steak Away dine-in slip, photo 7.png. Header "Item Description | Qty | Rate | Amount"; card (5%) and cash (16%) prices.
 * Placeholders: NTN 1234567-8, staff name. Kept quirk: "TIll 01-GF". "No Of Items :5" shares a row with "G.Amount: 3,625".
 *
 * Hand derivation (rupees):
 *   ALFREDO PASTA 950 + MINERAL WATER 125 + COKE 150 + SPICY MOROCCAN ALL SIDES 1,750 + BBQ THICK BURGER BEEF SGL 650 = 3,625
 *   card: GST(5 %) = 181.25 -> 181 ; Cc Total = 3,625 + 181 = 3,806
 *   cash: GST(16 %) = 580 ; Net Amount = 3,625 + 580 = 4,205
 *   The lone "0" row under G.Amount is a zero discount (no label): not a charge.
 */
import { Sec, V, Wrap } from '../../layout';
import { makeFixture } from './types';

const rows = [
  Sec(['STEAK AWAY', 310, { h: 20 }]),
  V(['NTN# 1234567-8', 310]),
  V(['DINE IN', 335, { h: 20 }]),
  V(['STAFFNAME', 345]),
  Sec(['Date : 14/9/2024', 105], ['B', 235], ['TIll 01-GF', 305]),
  V(['Table : FF38', 98], ['Time : 20 : 7', 305]),
  Sec(['Item Description', 95], ['Qty', 263], ['Rate', 300], ['Amount', 362]),
  V(['ALFREDO PASTA', 95], ['1', 275], ['950', 302], ['950.0', 372]),
  V(['MINERAL WATER', 95], ['1', 275], ['125', 302], ['125.0', 372]),
  V(['COKE', 95], ['1', 275], ['150', 302], ['150.0', 372]),
  V(['SPICY MOROCCAN', 95], ['1', 275], ['1,750', 298], ['1,750.0', 365]),
  Wrap(['ALL SIDES', 95]),
  V(['BBQ THICK BURGER', 95], ['1', 275], ['650', 302], ['650.0', 372]),
  Wrap(['BEEF SGL', 95]),
  Sec(['No Of Items :5', 95], ['G.Amount:', 262], ['3,625', 390]),
  V(['0', 398]),
  V(['GST(5 %) :', 122], ['181', 215], ['GST(16 %) :', 262], ['580', 395]),
  Sec(['Cc Total :', 130], ['3,806', 215], ['Net Amount :', 262], ['4,205', 370, { h: 20 }]),
  V(['ORDER TAKER SLIP', 100, { h: 16 }], ['www.grip.pk', 320]),
  V(['KOTs :', 120]),
  V(['R.KOT :', 120]),
];

export const steakAway = makeFixture('Steak Away', rows, { lh: 14, cw: 7, imageWidth: 480 }, {
  restaurantName: /steak away/i,
  rulingDate: '2024-09-14',
  items: [
    { name: 'ALFREDO PASTA', quantity: 1, unitPrice: 95000, lineTotal: 95000 },
    { name: 'MINERAL WATER', quantity: 1, unitPrice: 12500, lineTotal: 12500 },
    { name: 'COKE', quantity: 1, unitPrice: 15000, lineTotal: 15000 },
    { name: 'SPICY MOROCCAN ALL SIDES', quantity: 1, unitPrice: 175000, lineTotal: 175000 },
    { name: 'BBQ THICK BURGER BEEF SGL', quantity: 1, unitPrice: 65000, lineTotal: 65000 },
  ],
  printedSubtotal: 362500,
  variants: {
    card: { taxes: [{ kind: 'tax', amount: 18100, rateBp: 500 }], discounts: [], printedTotal: 380600 },
    cash: { taxes: [{ kind: 'tax', amount: 58000, rateBp: 1600 }], discounts: [], printedTotal: 420500 },
  },
  paidWith: null,
  taxInclusive: false,
  headerFragments: ['NTN', 'DINE', 'Date', 'TIll', 'Table', 'Time', 'No Of Items', 'ORDER TAKER', 'KOT', 'grip'],
});
