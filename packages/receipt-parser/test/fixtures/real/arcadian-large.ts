/**
 * Arcadian Cafe (Signature, Emporium Mall) large bill with a card discount, photo 5.png.
 * Placeholders: phone, PNTN, bill no DU000, staff names. Kept quirks: quantities "1.00"/"2.00", "Custo ne", "29.%", trailing "P".
 *
 * Hand derivation (rupees):
 *   605 + 605 + 3,970 (qty 2.00) + 1,240 + 600 + 990 + 210 + 120 = 8,340 = Bill Amt W/O Tax
 *   card side (left):  Disc 2,500 -> base 5,840 ; GST 5% = 292 ; Amt With Tax = 5,840 + 292 = 6,132
 *   cash side (right): Disc 2,499.9 -> base 5,840.10 (printed 5,840) ; GST 16% = 934 (16% x 5,840 = 934.40) ; Amt With Tax = 6,774
 *   Header Qty | Value only: no unit price. Quantity "2.00" is quantity 2.
 */
import { Sec, V } from '../../layout';
import { makeFixture } from './types';

const rows = [
  Sec(['ARCADIAN CAFE', 120, { h: 64 }]),
  V(['Signature', 255, { h: 60 }]),
  V(['G19, Emporium Mall, Johar Town', 255]),
  V(['TEL:03000000000', 365]),
  V(['PNTN # 1234567-8', 355]),
  V(['Sales Receipt', 325]),
  Sec(['Bill', 98], ['DU000', 222], ['Guest :', 575], ['1', 715]),
  V(['Table #', 95], ['C25', 222]),
  V(['Bill Date & Time', 92], ['27/10/24 10:14:1 P', 585]),
  Sec(['Item Name', 58], ['Qty', 630], ['Value', 732]),
  V(['CREAM OF MUSHROOM SOUP', 28], ['1.00', 628], ['605', 732]),
  V(['SZECHUAN SOUP', 32], ['1.00', 628], ['605', 732]),
  V(['BORDEAUX OVEN ROASTED', 36], ['2.00', 628], ['3970', 730]),
  V(['MOZZARELLA STICKS', 42], ['1.00', 628], ['1240', 730]),
  V(['MARGARITA MINT', 48], ['1.00', 628], ['600', 725]),
  V(['LINDT CHOCOLATE', 50], ['1.00', 628], ['990', 728]),
  V(['PURE WATER LARGE', 50], ['1.00', 628], ['210', 728]),
  V(['PURE WATER SMALL', 50], ['1.00', 628], ['120', 728]),
  Sec(['Counter Manager:', 112]),
  V(['STAFFNAME', 112], ['Bill Amt W/O Tax:', 410], ['8340', 730]),
  V(['Order Taker:', 112]),
  V(['STAFFNAME', 112]),
  Sec(['5% Tax For Credit Customers', 98], ['16% Tax For Cash Custo ne', 512]),
  Sec(['Disc 29.% :', 85], ['2500', 278], ['Disc 29.% :', 528], ['2499.9', 755]),
  V(['Bill Amt', 85], ['5840', 278], ['Bill Amt', 530], ['5840', 735]),
  V(['W/O Tax:', 85], ['W/O Tax:', 530]),
  V(['GST 5% :', 68], ['292', 258], ['GST 16% :', 530], ['934', 735]),
  Sec(['Amt With Tax:', 90], ['6132', 275], ['Amt With Tax:', 498], ['6774', 738]),
];

export const arcadianLarge = makeFixture('Arcadian large', rows, { lh: 28, cw: 14, imageWidth: 885 }, {
  restaurantName: /arcadian/i,
  rulingDate: '2024-10-27',
  items: [
    { name: 'CREAM OF MUSHROOM SOUP', quantity: 1, lineTotal: 60500 },
    { name: 'SZECHUAN SOUP', quantity: 1, lineTotal: 60500 },
    { name: 'BORDEAUX OVEN ROASTED', quantity: 2, lineTotal: 397000 },
    { name: 'MOZZARELLA STICKS', quantity: 1, lineTotal: 124000 },
    { name: 'MARGARITA MINT', quantity: 1, lineTotal: 60000 },
    { name: 'LINDT CHOCOLATE', quantity: 1, lineTotal: 99000 },
    { name: 'PURE WATER LARGE', quantity: 1, lineTotal: 21000 },
    { name: 'PURE WATER SMALL', quantity: 1, lineTotal: 12000 },
  ],
  printedSubtotal: 834000,
  variants: {
    card: {
      discounts: [{ kind: 'discount', amount: 250000 }],
      taxes: [{ kind: 'tax', amount: 29200, rateBp: 500 }],
      printedTotal: 613200,
    },
    cash: {
      discounts: [{ kind: 'discount', amount: 249990 }],
      taxes: [{ kind: 'tax', amount: 93400, rateBp: 1600 }],
      printedTotal: 677400,
    },
  },
  paidWith: null,
  taxInclusive: false,
  headerFragments: ['Sales Receipt', 'Emporium', 'TEL', 'PNTN', 'Bill', 'Guest', 'Table', 'Date', 'Counter', 'Order'],
});
