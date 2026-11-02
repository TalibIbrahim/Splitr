/**
 * Hand-derived fixtures. All expectations are derived from docs/phase2-spec.md, not from the implementation.
 */
import { layout, one, qtyRow, row, type Cell, type LayoutOpts, type RowSpec } from './layout';

export type Rows = (Cell[] | RowSpec)[];

export const lahoreHeader = (): Rows => [
  { cells: one('BURGER SHACK'), height: 40 },
  one('Gulberg III, Main Boulevard, Lahore'),
  one('Tel: 042-35761234'),
  [
    { text: 'Date: 02/11/2026', x: 20 },
    { text: 'Time: 21:43', x: 420 },
  ],
  one('NTN: 1234567-8'),
  one('Table 5'),
];

/**
 * Items (paisa):
 *   "2 x Zinger Burger  650.00  1,300.00"  qty 2 unit 65000 line 130000
 *   "Chicken Karahi  1,850.00"             qty 1 line 185000
 *   "3 | Mint Margarita  300.00  900.00"   qty 3 unit 30000 line 90000 (qty column)
 *   "Fries 350.50"                         qty 1 line 35050
 *   "Naan x4  60.00  240.00"               qty 4 unit 6000 line 24000
 *   Σ = 130000 + 185000 + 90000 + 35050 + 24000 = 464050  (Rs 4,640.50)
 */
export const lahoreItems = (): Rows => [
  row('2 x Zinger Burger', '650.00', '1,300.00'),
  row('Chicken Karahi', '1,850.00'),
  qtyRow('3', 'Mint Margarita', '300.00', '900.00'),
  row('Fries', '350.50'),
  row('Naan x4', '60.00', '240.00'),
];

export const LAHORE = {
  itemsTotal: 464050,
  discount: 92810, // 20% of 464050 = 92810.0 exactly
  gst: 74248, // 16% of 464050 = 74248.0 exactly (on the ORIGINAL subtotal)
  service: 46405, // 10% of 464050 = 46405.0 exactly
  total: 491893, // 464050 - 92810 + 74248 + 46405
} as const;

/** discountCell: how the discount amount is printed. */
export function lahoreReceipt(discountPrinted = '(928.10)', opts: LayoutOpts = {}): ReturnType<typeof layout> {
  const rows: Rows = [
    ...lahoreHeader(),
    ...lahoreItems(),
    one('------------------------'),
    row('Sub Total', '4,640.50'),
    row('Card Discount 20%', discountPrinted),
    row('GST 16%', '742.48'),
    row('Service Charge 10%', '464.05'),
    row('Grand Total', '4,918.93'),
    row('Cash', '5,000.00'),
    row('Change', '81.07'),
    one('Thank you for dining with us!'),
  ];
  return layout(rows, opts);
}
