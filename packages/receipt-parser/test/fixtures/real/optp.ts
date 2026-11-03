/**
 * One Potato Two Potato (OPTP), photo 8.png, two receipts side by side. Prices are shown WITHOUT tax per item and a GST column
 * is printed, but the payable amount equals the sum of the Total column: tax is already included (P19).
 * Placeholders: order numbers, PRA invoice, POS no, NTN. Dates are printed month-first (12/31/2023).
 *
 * LEFT (Take away, Payment Mode MASTER -> card):
 *   JUM GARLIC MAYO NUGGETS  1000 x1 5.00% GST 50  Total 1,050
 *   CHK FILLET SANDWICH HOT   619 x1 5.00% GST 31  Total   650
 *   LARGE MASALA FRIES        429 x1 5.00% GST 21  Total   450
 *   items (Total column) = 1,050 + 650 + 450 = 2,150 = Payable (PKR) 2,150
 *   Total Net Amount 2,048 (= 1000+619+429) is LOWER than the item total -> taxInclusive; Sale tax (VAT) 102.38 informational
 *   Discount 0 dropped.
 *
 * RIGHT (Dine in, Payment Mode Cash -> cash):
 *   POS Service Fee 1 x1 16.00% GST 0 Total 1 | JUM GARLIC MAYO NUGGETS 905 -> 1,050 | CHK FILLET SANDWICH ORG 560 -> 650
 *   LARGE MASALA FRIES 388 -> 450
 *   Total Net Amount 1,854 (= 1+905+560+388) ; Sale tax (VAT) 296.69 ; Payable 2,151 = 1 + 1,050 + 650 + 450.
 *   The "POS Service Fee" row starts with the ignore word "POS" (P3): whether it is an item is a spec gap (see the report).
 */
import { Sec, V, Wrap } from '../../layout';
import { makeFixture } from './types';

const header = Sec(
  ['Description', 95],
  ['Price', 220],
  ['Qty', 282],
  ['Tax%', 303],
  ['GST', 348],
  ['Total', 380],
);

const leftRows = [
  Sec(['optp', 200, { h: 60 }]),
  V(['One Potato Two Potato', 140, { h: 22 }]),
  V(['U-039-FA SAL TOWN,Lahore', 78]),
  V(['Lahore', 190]),
  V(['The Potato Factory International', 138]),
  V(['POS NO:000000, NTN NO 0000000', 122]),
  Sec(['Order:00-00000-000000', 55], ['Date:12/31/2023 21:38', 283]),
  V(['Order Type:TAKE AWAY Cr - -', 55]),
  V(['Payment Mode:MASTER', 55]),
  V(['Print Date Time:12/31/2023 9:38:21 PM', 55]),
  V(['Name Walk in Customer', 58], ['HOST: TERM2', 340]),
  header,
  V(['Jum Nuggets', 70]),
  V(['JUM GARLIC MAYO', 70], ['1000', 222], ['1', 283], ['5.00', 305], ['50', 350], ['1050', 385]),
  Wrap(['NUGGETS', 63]),
  V(['Burgers', 63]),
  V(['CHK FILLET', 70], ['619', 222], ['1', 283], ['5.00', 305], ['31', 350], ['650', 385]),
  Wrap(['SANDWICH HOT', 63]),
  V(['Large Fries', 63]),
  V(['LARGE MASALA', 70], ['429', 222], ['1', 283], ['5.00', 305], ['21', 350], ['450', 385]),
  Wrap(['FRIES', 63]),
  Sec(['Total Net Amount', 250], ['2,048', 380]),
  V(['Discount', 330], ['0', 400]),
  V(['Sale tax (VAT) :', 270], ['102.38', 365]),
  V(['Payable (PKR)', 270], ['2,150', 385]),
  Sec(['PRA Invoice : 000000XXXX00000000', 118]),
  Sec(['111-11-OPTP (6787) OPTP.UZ', 65], ['App Store', 210], ['Google Play', 330]),
];

const rightRows = [
  Sec(['optp', 190, { h: 60 }]),
  V(['One Potato Two Potato', 130, { h: 22 }]),
  V(['U-039-FA SAL TOWN,Lahore', 100]),
  V(['Lahore', 205]),
  V(['The Potato Factory International', 70]),
  V(['POS NO:000000, NTN NO 0000000', 85]),
  Sec(['Order:00-00000-000000', 20], ['Date:12/31/2023 21:40', 260]),
  V(['Order Type:DINE IN - -', 20]),
  V(['Payment Mode:Cash', 20]),
  V(['Print Date Time:12/31/2023 9:40:41 PM', 20]),
  V(['Name Walk in Customer', 20], ['HOST: TERM2', 330]),
  header,
  V(['Extras', 40]),
  V(['POS Service Fee', 40], ['1', 200], ['1', 262], ['16.00', 285], ['0', 335], ['1', 385]),
  V(['Jum Nuggets', 40]),
  V(['JUM GARLIC MAYO', 40], ['905', 200], ['1', 262], ['16.00', 285], ['145', 335], ['1050', 385]),
  Wrap(['NUGGETS', 33]),
  V(['Burgers', 33]),
  V(['CHK FILLET', 40], ['560', 200], ['1', 262], ['16.00', 285], ['90', 340], ['650', 385]),
  Wrap(['SANDWICH ORG', 33]),
  V(['Large Fries', 33]),
  V(['LARGE MASALA', 40], ['388', 200], ['1', 262], ['16.00', 285], ['62', 340], ['450', 385]),
  Wrap(['FRIES', 33]),
  Sec(['Total Net Amount', 230], ['1,854', 380]),
  V(['Discount', 300], ['0', 400]),
  V(['Sale tax (VAT) :', 250], ['296.69', 365]),
  V(['Payable (PKR)', 250], ['2,151', 385]),
  Sec(['PRA Invoice : 000000XXXX00000000', 98]),
  Sec(['111-11-OPTP (6787) OPTP.UZ', 55], ['App Store', 200], ['Google Play', 320]),
];

const opts = { lh: 16, cw: 8, imageWidth: 480 } as const;
const headerFragments = ['Potato', 'U-039', 'POS NO', 'NTN', 'Order', 'Date', 'Print', 'Name Walk', 'HOST', 'PRA', 'App Store'];

export const optpLeft = makeFixture('OPTP left (take away, card)', leftRows, opts, {
  restaurantName: /optp|potato/i,
  rulingDate: '2023-12-31',
  items: [
    { name: 'JUM GARLIC MAYO NUGGETS', quantity: 1, lineTotal: 105000 },
    { name: 'CHK FILLET SANDWICH HOT', quantity: 1, lineTotal: 65000 },
    { name: 'LARGE MASALA FRIES', quantity: 1, lineTotal: 45000 },
  ],
  printedSubtotal: 204800,
  printedTotal: 215000,
  charges: [{ kind: 'tax', amount: 10238, informational: true }],
  paidWith: 'card',
  taxInclusive: true,
  headerFragments,
});

/** Items of the right receipt WITHOUT the "POS Service Fee" row (spec-decided part). */
export const optpRight = makeFixture('OPTP right (dine in, cash)', rightRows, opts, {
  restaurantName: /optp|potato/i,
  rulingDate: '2023-12-31',
  items: [
    { name: 'JUM GARLIC MAYO NUGGETS', quantity: 1, lineTotal: 105000 },
    { name: 'CHK FILLET SANDWICH ORG', quantity: 1, lineTotal: 65000 },
    { name: 'LARGE MASALA FRIES', quantity: 1, lineTotal: 45000 },
  ],
  printedSubtotal: 185400,
  printedTotal: 215100,
  charges: [{ kind: 'tax', amount: 29669, informational: true }],
  paidWith: 'cash',
  taxInclusive: true,
  headerFragments,
});
