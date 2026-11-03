/**
 * Arcadian Cafe (Signature, Emporium Mall) small bill, photo 4.png. Card 5% / cash 16% printed side by side.
 * Placeholders: phone 03000000000, PNTN 1234567-8, bill no DU00, staff names. Kept quirk: "Custome" truncation, trailing "P".
 *
 * Hand derivation (rupees):
 *   Arcadian Special Sandwich 870 + CRISPY FRIED FISH BURGER 925 + PEPSI 180 + PURE WATER SMALL 100 = 2,075 = Bill Amt W/O Tax
 *   Header has Qty | Value only: quantity 1 each, no unit price.
 *   left (card, 5%):  GST 5%  = 2,075 x 5%  = 103.75 -> 104 ;  Amt With Tax = 2,075 + 104 = 2,179
 *   right (cash, 16%): GST 16% = 2,075 x 16% = 332    ;        Amt With Tax = 2,075 + 332 = 2,407
 *   Lower tax rate = card (rate rule); left matched with left.
 */
import { Sec, V } from '../../layout';
import { makeFixture } from './types';

const rows = [
  Sec(['ARCADIAN CAFE', 108, { h: 34 }]),
  V(['Signature', 140, { h: 30 }]),
  V(['G19, Emporium Mall, Johar Town', 118]),
  V(['TEL:03000000000', 175]),
  V(['PNTN # 1234567-8', 175]),
  V(['Sales Receipt', 160]),
  Sec(['Bill', 95], ['DU00', 135], ['Guest :', 245], ['2', 290]),
  V(['Table #', 95], ['B10', 135]),
  V(['Bill Date & Time', 95], ['01/11/22 08:33:37 P', 245]),
  Sec(['Item Name', 92], ['Qty', 268], ['Value', 312]),
  V(['Arcadian Special Sandwich', 92], ['1', 272], ['870', 305]),
  V(['CRISPY FRIED FISH BURGER', 92], ['1', 272], ['925', 305]),
  V(['PEPSI', 92], ['1', 272], ['180', 305]),
  V(['PURE WATER SMALL', 92], ['1', 272], ['100', 305]),
  Sec(['Counter Manager:', 83]),
  V(['STAFFNAME', 83], ['Bill Amt W/O Tax:', 177], ['2075', 295]),
  V(['Order Taker:', 83]),
  V(['STAFFNAME', 83]),
  Sec(['5% Tax For Credit Customers', 70], ['16% Tax For Cash Custome', 208]),
  Sec(['Bill Amt', 65], ['2075', 125], ['Bill Amt', 212], ['2075', 290]),
  V(['W/O Tax:', 65], ['W/O Tax:', 212]),
  V(['GST 5% :', 80], ['104', 125], ['GST 16% :', 208], ['332', 290]),
  Sec(['Amt With Tax:', 60], ['2179', 125], ['Amt With Tax:', 208], ['2407', 290]),
  Sec(['** THANK YOU FOR COMING,SEE YOU SOON **', 70]),
  V(['Powered By Bizmatic Tech. Call @ 03000000000', 70]),
];

export const arcadianSmall = makeFixture('Arcadian small', rows, { lh: 14, cw: 7, imageWidth: 392 }, {
  restaurantName: /arcadian/i,
  rulingDate: '2022-11-01',
  items: [
    { name: 'Arcadian Special Sandwich', quantity: 1, lineTotal: 87000 },
    { name: 'CRISPY FRIED FISH BURGER', quantity: 1, lineTotal: 92500 },
    { name: 'PEPSI', quantity: 1, lineTotal: 18000 },
    { name: 'PURE WATER SMALL', quantity: 1, lineTotal: 10000 },
  ],
  printedSubtotal: 207500,
  variants: {
    card: { taxes: [{ kind: 'tax', amount: 10400, rateBp: 500 }], discounts: [], printedTotal: 217900 },
    cash: { taxes: [{ kind: 'tax', amount: 33200, rateBp: 1600 }], discounts: [], printedTotal: 240700 },
  },
  paidWith: null,
  taxInclusive: false,
  headerFragments: ['Sales Receipt', 'Emporium', 'TEL', 'PNTN', 'Bill', 'Guest', 'Table', 'Date', 'Counter', 'Order', 'Powered', 'THANK'],
});
