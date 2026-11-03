/**
 * Butt Karahi, Mall Road (photo 3.png). Column order is Rate | Qty | Amount.
 * Placeholders: phone 0300-0000000, cashier name, chq 000000. Kept quirks: "ashier" (truncated), "HUNDR ED".
 * "DESI MURGHA KARAHI FULL" wraps: the name/rate/qty are on the first row, "FULL" and the amount on the second.
 *
 * Hand derivation:
 *   MUTTON KARAHI FULL 2500 x1 = 2,500 | SP. BIRYANI 700 x2 = 1,400 | PER HEAD ROTI 60 x5 = 300 | RAITA 120 x5 = 600
 *   MINERAL WATER (L) 150 x1 = 150 | DESI MURGHA KARAHI FULL 2500 x1 = 2,500 | 1.5 LTR DRINK 200 x1 = 200
 *   items = 2,500+1,400+300+600+150+2,500+200 = 7,650 = Sub Total
 *   "Grand Total 7,650.00" is printed BEFORE Service Charges -> not the final total (unparsed)
 *   Service Charges 765.00 (10% of 7,650, rate not printed) ; G. Total 8,415.00 = 7,650 + 765.
 */
import { Sec, V, Wrap } from '../../layout';
import { makeFixture } from './types';

const rows = [
  Sec(['BUTT KARAHI', 100, { h: 34 }]),
  V(['Mall Road, Kalam', 170]),
  V(['Cell : 0300-0000000', 190]),
  Sec(['06 Jun 2021', 92], ['09:28:04PM', 208], ['ashier', 290], ['STAFFNAME', 345]),
  V(['Shift : MOR', 90], ['0057', 237], ['NET', 320], ['001', 385]),
  V(['Chq#', 88], ['000000', 152], ['Table#', 255], ['L05', 335]),
  V(['Cover', 88], ['0', 152]),
  Sec(['Description', 122], ['Rate', 237], ['Qty', 297], ['Amount', 343]),
  V(['MUTTON KARAHI FULL', 62], ['2500', 243], ['1', 303], ['2500', 358]),
  V(['SP. BIRYANI', 85], ['700', 248], ['2', 303], ['1400', 358]),
  V(['PER HEAD ROTI', 85], ['60', 252], ['5', 303], ['300', 365]),
  V(['RAITA', 85], ['120', 248], ['5', 303], ['600', 358]),
  V(['MINERAL WATER (L)', 85], ['150', 248], ['1', 303], ['150', 365]),
  V(['DESI MURGHA KARAHI', 85], ['2500', 243], ['1', 303]),
  Wrap(['FULL', 85], ['2500', 358]),
  V(['1.5 LTR DRINK', 85], ['200', 248], ['1', 303], ['200', 365]),
  Sec(['Sub Total', 162], ['7,650.00', 335]),
  V(['Items: 16', 78]),
  V(['Grand Total', 162], ['7,650.00', 335]),
  V(['Service Charges', 162], ['765.00', 343]),
  V(['G. Total', 162], ['8,415.00', 335]),
  Sec(['RUPEES SEVEN THOUSAND SIX HUNDR ED FIFTY ONLY', 80]),
  V(['Software Provided By iPOS 0300-0000000', 95]),
];

export const buttKarahi = makeFixture('Butt Karahi', rows, { lh: 14, cw: 7, imageWidth: 480 }, {
  restaurantName: /butt karahi/i,
  date: '2021-06-06',
  items: [
    { name: 'MUTTON KARAHI FULL', quantity: 1, unitPrice: 250000, lineTotal: 250000 },
    { name: 'SP. BIRYANI', quantity: 2, unitPrice: 70000, lineTotal: 140000 },
    { name: 'PER HEAD ROTI', quantity: 5, unitPrice: 6000, lineTotal: 30000 },
    { name: 'RAITA', quantity: 5, unitPrice: 12000, lineTotal: 60000 },
    { name: 'MINERAL WATER (L)', quantity: 1, unitPrice: 15000, lineTotal: 15000 },
    { name: 'DESI MURGHA KARAHI FULL', quantity: 1, unitPrice: 250000, lineTotal: 250000 },
    { name: '1.5 LTR DRINK', quantity: 1, unitPrice: 20000, lineTotal: 20000 },
  ],
  printedSubtotal: 765000,
  printedTotal: 841500,
  charges: [{ kind: 'service', amount: 76500 }],
  paidWith: null,
  taxInclusive: false,
  unparsedContains: ['Grand Total'],
  checksOk: true,
  headerFragments: ['Mall Road', 'Cell', '06 Jun', 'ashier', 'Shift', 'Chq', 'Cover', 'Table', 'NET'],
});
