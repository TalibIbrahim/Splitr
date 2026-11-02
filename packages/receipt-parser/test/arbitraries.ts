import fc from 'fast-check';
import type { OcrResult } from '@splitr/shared-types';
import { layout, row, type Cell } from './layout';

const nameArb = fc.constantFrom(
  'Zinger Burger', 'Naan', 'Fries', 'Chai', 'A', 'B x2', '2 x Karahi', 'Naan x4', 'Naan ×3', '3 Mint Margarita',
  '5 Chai', '0 x Pen', '1000 x Pen', 'Sub Total', 'GST 16%', 'Discount 10%', 'Card Discount (20%)', 'Service Charge 10%',
  'Tip', 'Grand Total', 'Total', 'Net Payable', 'Cash', 'Change', 'Table 4', 'Date: 02/11/2026', 'Date: 2 Nov 2026',
  'Thank you', '@@##', 'Tel: 042-35761234', 'BURGER SHACK', '',
);
const amtArb = fc.constantFrom(
  '120', '1,300.00', 'Rs.450', 'PKR 90', '350.5', '1,23', '16%', '2x', '0', '999', '(50)', '-20', '1,234,567',
  '03001234567', '21:43', '100000000', '999999999', '99,999,999,999', '1.234', '650/-', '16.5 %',
);

export const arbCells: fc.Arbitrary<Cell[]> = fc
  .tuple(nameArb, fc.array(amtArb, { maxLength: 3 }), fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }))
  .map(([name, amts, conf]) => {
    const cells = row(name, ...amts);
    if (conf !== undefined) cells.forEach((c) => (c.confidence = conf));
    return cells;
  });

/** Realistic-ish receipts built from the layout helper (rows 40px apart, jitter <= 4px). */
export const arbRows: fc.Arbitrary<OcrResult> = fc
  .tuple(fc.array(arbCells, { maxLength: 14 }), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 1, max: 9999 }))
  .map(([rows, jitter, seed]) => layout(rows, { jitter, seed }));

/** Completely arbitrary OcrResults, including degenerate frames and odd strings. */
export const arbAnyOcr: fc.Arbitrary<OcrResult> = fc.record({
  imageWidth: fc.integer({ min: 0, max: 5000 }),
  imageHeight: fc.integer({ min: 0, max: 5000 }),
  lines: fc.array(
    fc.record(
      {
        text: fc.oneof(
          fc.string({ maxLength: 40 }),
          fc.string({ unit: 'binary', maxLength: 40 }),
          fc.array(fc.constantFrom('Rs', 'Rs.', 'PKR', '1,234', '16%', '2', 'x', '×', '/-', '(', ')', '-', ':', '/', '.', ',', 'Total', 'Sub', 'GST', ' ', '12345678901', '0', 'Tip', 'Disc'), { maxLength: 8 }).map((a) => a.join(' ')),
        ),
        frame: fc.record({
          x: fc.double({ min: -1000, max: 5000, noNaN: true }),
          y: fc.double({ min: -1000, max: 5000, noNaN: true }),
          width: fc.double({ min: -10, max: 3000, noNaN: true }),
          height: fc.oneof(fc.constant(0), fc.double({ min: -10, max: 500, noNaN: true })),
        }),
        confidence: fc.double({ min: -1, max: 2, noNaN: true }),
      },
      { requiredKeys: ['text', 'frame'] },
    ),
    { maxLength: 30 },
  ),
});
