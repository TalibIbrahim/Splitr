/**
 * Gourmet (Lahore Cantt) "Sale Invoice", photo 2.png. Faint "g" watermark omitted (not text).
 * Placeholders: NTN/PNTN 1234567-8, invoice 000000, FBR no 20 zeros.
 *
 * Hand derivation (rupees -> paisa x100):
 *   164 White Chicken Boti        qty 2  rate 1,075  value 2,150   -> 2 x 1,075 = 2,150
 *   169 Chicken Seikh Kebab ( Plate ) qty 2 rate 1,075 value 2,150
 *   183 Achari Chicken Handi      qty 1  rate 1,275  value 1,275
 *   WB  Woven Bag                 qty 2  rate 19     value 38      -> 2 x 19 = 38
 *   items = 2,150 + 2,150 + 1,275 + 38 = 5,613 = TOTAL VALUE
 *   P.S.T CASH@16% / CARD@5%  898: 16% x 5,613 = 898.08 -> 898 (card 5% would be 280.65) => rate 1600, paidWith cash
 *   DELIVERY CHARGES 0 -> dropped (zero). "CLOTH SHOPPING BAG CHARGES" has no amount -> no charge.
 *   GRAND TOTAL 6,511 = 5,613 + 898.
 */
import { Sec, V } from '../../layout';
import { makeFixture } from './types';

const rows = [
  Sec(['gourmet', 380, { h: 60 }]),
  V(['RESTAURANTS', 465]),
  V(['Eat Better Live Better', 465]),
  Sec(['Sale Invoice', 345, { h: 36 }]),
  V(['12-Z Commercial DHA, Lahore Cantt.', 210]),
  Sec(['NTN :', 285], ['1234567-8', 525]),
  V(['PNTN / PST NO :', 190], ['1234567-8', 525]),
  V(['21-04-2024 02:28:13 PM', 275]),
  Sec(['Table No :', 80], ['T', 260], ['Invoice No :', 515], ['000000', 720]),
  V(['Guest Name :', 65], ['Mobile No :', 515]),
  V(['Guest CNIC :', 65], ['--', 360]),
  V(['FBR INVOICE NO:', 70], ['00000000000000000000', 365]),
  V(['203 5', 85]),
  Sec(['PARTICULARS OF ITEMS SERVED / SOLD', 200]),
  Sec(['C.No', 62], ['Item Name', 250], ['Qty', 625], ['Rate', 695, { dy: -6 }], ['Value', 790, { dy: -6 }]),
  V(['(Rs)', 700], ['(Rs)', 800]),
  V(['164', 70], ['White Chicken Boti', 142], ['2', 640], ['1,075', 700], ['2,150', 800]),
  V(['169', 70], ['Chicken Seikh Kebab ( Plate )', 142], ['2', 640], ['1,075', 700], ['2,150', 800]),
  V(['183', 70], ['Achari Chicken Handi', 142], ['1', 640], ['1,275', 700], ['1,275', 800]),
  V(['WB', 70], ['Woven Bag', 142], ['2', 640], ['19', 730], ['38', 820]),
  Sec(['PAYMENT MODE : Cash', 65]),
  Sec(['TOTAL VALUE', 65], ['5,613 (Rs)', 730]),
  V(['P.S.T CASH@16% / CARD@5%', 60], ['898 (Rs)', 760]),
  V(['DELIVERY CHARGES', 60], ['0 (Rs)', 800]),
  V(['CLOTH SHOPPING BAG CHARGES', 60]),
  Sec(['GRAND TOTAL', 55], ['6,511 (Rs)', 710]),
  Sec(['203 5', 420]),
  Sec(['SIGNATURE', 740]),
  Sec(['Download our delivery app', 55, { h: 44 }]),
  V(['iOS', 210], ['Android', 625]),
];

export const gourmet = makeFixture('Gourmet', rows, { lh: 24, cw: 13, imageWidth: 954 }, {
  restaurantName: /gourmet/i,
  date: '2024-04-21',
  items: [
    { name: 'White Chicken Boti', quantity: 2, unitPrice: 107500, lineTotal: 215000 },
    { name: 'Chicken Seikh Kebab ( Plate )', quantity: 2, unitPrice: 107500, lineTotal: 215000 },
    { name: 'Achari Chicken Handi', quantity: 1, unitPrice: 127500, lineTotal: 127500 },
    { name: 'Woven Bag', quantity: 2, unitPrice: 1900, lineTotal: 3800 },
  ],
  printedSubtotal: 561300,
  printedTotal: 651100,
  charges: [{ kind: 'tax', amount: 89800, rateBp: 1600 }],
  paidWith: 'cash',
  taxInclusive: false,
  checksOk: true,
  headerFragments: ['Sale Invoice', 'Commercial', 'NTN', 'PNTN', 'Table', 'Invoice', 'Guest', 'Mobile', 'CNIC', 'FBR', 'PARTICULARS', '21-04-2024', '203'],
});
