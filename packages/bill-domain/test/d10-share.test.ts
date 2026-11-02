import type { Paisa } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { describe, expect, it } from 'vitest';
import { cardDiscount, serviceCharge, shareSummary, tax } from '../src/index';
import { $, bp, calc, deepFreeze, fixtureB, fm, makeBill, mkItem, okBreakdown, SEATS, statusesFor } from './helpers';

const render = (bill: Bill, formatMoney: (p: Paisa) => string = fm) =>
  shareSummary(bill, okBreakdown(bill), { formatMoney });

const withStatuses = (bill: Bill, paidIdx: number[]): Bill =>
  ({ ...bill, transferStatuses: statusesFor(okBreakdown(bill), paidIdx) }) as Bill;

const FIXTURE_B_TEXT = [
  'Salt & Ember · 2 Nov',
  'Total Rs 8,500 (card discount −Rs 2,000, tax +Rs 500)',
  '',
  'Mahhee   Rs 1,806',
  'Hamza    Rs 2,635  (paid)',
  'Ali      Rs 2,253',
  'Saad     Rs 1,806',
  '',
  'Pay Hamza:',
  '• Ali → Rs 2,253',
  '• Mahhee → Rs 1,806',
  '• Saad → Rs 1,806',
  '',
  'Split with splitr.',
].join('\n');

describe('D10 shareSummary, Fixture B exact text', () => {
  it('D10 Fixture B produces the exact spec message (pending transfers)', () => {
    expect(render(withStatuses(fixtureB(), []))).toBe(FIXTURE_B_TEXT);
  });

  it('D10 uses U+2212 minus, bullet U+2022 and arrow U+2192; uses \\n only; no tabs; no trailing newline', () => {
    const s = render(withStatuses(fixtureB(), []));
    expect(s).toContain('−Rs 2,000');
    expect(s).not.toContain('\r');
    expect(s).not.toContain('\t');
    expect(s.endsWith('\n')).toBe(false);
    expect(s.endsWith('Split with splitr.')).toBe(true);
  });

  it('D10 with no transferStatuses entries at all, transfers are shown unmarked', () => {
    expect(render(fixtureB())).toBe(FIXTURE_B_TEXT);
  });

  it('D10 does not mutate frozen inputs', () => {
    const bill = deepFreeze(withStatuses(fixtureB(), []));
    const b = deepFreeze(okBreakdown(bill));
    expect(shareSummary(bill, b, { formatMoney: fm })).toBe(FIXTURE_B_TEXT);
  });
});

describe('D10 transfers section', () => {
  it('D10 a paid transfer gets " ✓" appended, others do not', () => {
    const s = render(withStatuses(fixtureB(), [0])); // ali -> hamza paid
    const lines = s.split('\n');
    expect(lines).toContain('• Ali → Rs 2,253 ✓');
    expect(lines).toContain('• Mahhee → Rs 1,806');
    expect(lines).toContain('• Saad → Rs 1,806');
    expect(s.replace(' ✓', '')).toBe(FIXTURE_B_TEXT);
  });

  it('D10 all transfers paid -> every bullet ends with the check; "(paid)" stays on the contributor line only', () => {
    const lines = render(withStatuses(fixtureB(), [0, 1, 2])).split('\n');
    expect(lines.filter((l) => l.startsWith('•')).every((l) => l.endsWith(' ✓'))).toBe(true);
    expect(lines).toContain('Hamza    Rs 2,635  (paid)');
  });

  it('D10 the check follows the transfer (from, to, amount), not its position', () => {
    const bill = withStatuses(fixtureB(), [2]); // saad -> hamza paid
    const lines = render(bill).split('\n');
    expect(lines).toContain('• Saad → Rs 1,806 ✓');
    expect(lines).toContain('• Mahhee → Rs 1,806');
  });

  it('D10 no settlement (no contributions) -> no Pay section and no "(paid)" markers', () => {
    const bill = fixtureB({ contributions: [] });
    const expected = [
      'Salt & Ember · 2 Nov',
      'Total Rs 8,500 (card discount −Rs 2,000, tax +Rs 500)',
      '',
      'Mahhee   Rs 1,806',
      'Hamza    Rs 2,635',
      'Ali      Rs 2,253',
      'Saad     Rs 1,806',
      '',
      'Split with splitr.',
    ].join('\n');
    expect(okBreakdown(bill).settlement).toBeNull();
    expect(render(bill)).toBe(expected);
    expect(render(bill)).not.toContain('Pay ');
  });

  it('D10 settlement with zero transfers -> no Pay section', () => {
    const bill = makeBill({
      restaurantName: 'Test Place',
      participants: [{ id: 'a', displayName: 'Solo', personId: 'a' }],
      meParticipantId: 'a',
      items: [mkItem('i', 'Tea', 1, 20000, { kind: 'equal', participantIds: ['a'] })],
      contributions: [{ participantId: 'a', amount: $(20000) }],
    });
    expect(okBreakdown(bill).settlement?.transfers).toEqual([]);
    expect(render(bill)).toBe(['Test Place · 2 Nov', 'Total Rs 200', '', 'Solo   Rs 200  (paid)', '', 'Split with splitr.'].join('\n'));
  });

  it('D10 two creditors -> two "Pay" blocks in order of first appearance, separated by a blank line', () => {
    const bill = fixtureB({
      contributions: [
        { participantId: 'hamza', amount: $(500000) },
        { participantId: 'ali', amount: $(350000) },
      ],
    });
    // sanity of the derived greedy transfers (R12.4): mahhee->hamza 180600, saad->ali 124700 (largest creditor), saad->hamza 55900
    expect(okBreakdown(bill).settlement?.transfers).toEqual([
      { from: 'mahhee', to: 'hamza', amount: 180600 },
      { from: 'saad', to: 'ali', amount: 124700 },
      { from: 'saad', to: 'hamza', amount: 55900 },
    ]);
    const expected = [
      'Salt & Ember · 2 Nov',
      'Total Rs 8,500 (card discount −Rs 2,000, tax +Rs 500)',
      '',
      'Mahhee   Rs 1,806',
      'Hamza    Rs 2,635  (paid)',
      'Ali      Rs 2,253  (paid)',
      'Saad     Rs 1,806',
      '',
      'Pay Hamza:',
      '• Mahhee → Rs 1,806',
      '• Saad → Rs 559',
      '',
      'Pay Ali:',
      '• Saad → Rs 1,247',
      '',
      'Split with splitr.',
    ].join('\n');
    expect(render(withStatuses(bill, []))).toBe(expected);
  });

  it('D10 two creditors: paid marks apply per transfer inside the right block', () => {
    const bill = fixtureB({
      contributions: [
        { participantId: 'hamza', amount: $(500000) },
        { participantId: 'ali', amount: $(350000) },
      ],
    });
    const lines = render(withStatuses(bill, [1])).split('\n');
    expect(lines).toContain('• Saad → Rs 1,247 ✓');
    expect(lines).toContain('• Saad → Rs 559');
  });
});

describe('D10 header and total line', () => {
  it.each([
    ['2026-01-09', '9 Jan'],
    ['2026-02-28', '28 Feb'],
    ['2026-03-01', '1 Mar'],
    ['2026-04-15', '15 Apr'],
    ['2026-05-31', '31 May'],
    ['2026-06-06', '6 Jun'],
    ['2026-07-07', '7 Jul'],
    ['2026-08-10', '10 Aug'],
    ['2026-09-30', '30 Sep'],
    ['2026-10-31', '31 Oct'],
    ['2026-11-02', '2 Nov'],
    ['2026-12-25', '25 Dec'],
  ])('D10 line 1 date %s -> "%s" (English short month, no year, no zero padding)', (date, label) => {
    const first = render(fixtureB({ date })).split('\n')[0];
    expect(first).toBe(`Salt & Ember · ${label}`);
  });

  it('D10 line 1 uses the bill restaurantName verbatim', () => {
    expect(render(fixtureB({ restaurantName: "Cafe d'Or & Sons" })).split('\n')[0]).toBe("Cafe d'Or & Sons · 2 Nov");
  });

  it('D10 total line has no parenthesis when the bill has no adjustments', () => {
    const bill = fixtureB({ adjustments: [], contributions: [{ participantId: 'hamza', amount: $(1000000) }] });
    expect(render(bill).split('\n')[1]).toBe('Total Rs 10,000');
  });

  it('D10 zero-amount adjustments are not listed', () => {
    const bill = fixtureB({
      adjustments: [cardDiscount('d', 10, { rateBp: bp(2000) }), tax('t', 30, { rateBp: bp(0), base: 'original' })],
      contributions: [{ participantId: 'hamza', amount: $(800000) }],
    });
    expect(render(bill).split('\n')[1]).toBe('Total Rs 8,000 (card discount −Rs 2,000)');
  });

  it('D10 parts are in application order, labels lowercase-first, positives get "+"', () => {
    const bill = fixtureB({
      adjustments: [
        tax('t', 30, { rateBp: bp(500), base: 'original' }),
        serviceCharge('s', 20, { rateBp: bp(1000) }),
        cardDiscount('d', 10, { rateBp: bp(2000) }),
      ],
      contributions: [{ participantId: 'hamza', amount: $(950000) }],
    });
    expect(render(bill).split('\n')[1]).toBe(
      'Total Rs 9,500 (card discount −Rs 2,000, service charge +Rs 1,000, tax +Rs 500)',
    );
  });

  it('D10 only the first letter of a label is lowercased (rest unchanged)', () => {
    const bill = fixtureB({
      adjustments: [cardDiscount('d', 10, { rateBp: bp(2000), label: 'HBL Card 20%' })],
      contributions: [{ participantId: 'hamza', amount: $(800000) }],
    });
    expect(render(bill).split('\n')[1]).toBe('Total Rs 8,000 (hBL Card 20% −Rs 2,000)');
  });
});

describe('D10 participant lines', () => {
  it('D10 names are padded to (longest name + 3); amounts line up', () => {
    const bill = fixtureB({
      participants: [
        { id: 'mahhee', displayName: 'Mahhee', personId: 'mahhee' },
        { id: 'hamza', displayName: 'Hamza-Long-Name', personId: 'hamza' },
        { id: 'ali', displayName: 'Ali', personId: 'ali' },
        { id: 'saad', displayName: 'Saad', personId: 'saad' },
      ],
    });
    const lines = render(bill).split('\n');
    expect(lines[3]).toBe('Mahhee' + ' '.repeat(12) + 'Rs 1,806');
    expect(lines[4]).toBe('Hamza-Long-Name   Rs 2,635  (paid)');
    expect(lines[5]).toBe('Ali' + ' '.repeat(15) + 'Rs 2,253');
  });

  it('D10 participant lines follow input order, not alphabetical or id order', () => {
    const bill = fixtureB({ participants: [SEATS[3]!, SEATS[2]!, SEATS[1]!, SEATS[0]!] });
    const lines = render(bill).split('\n');
    expect(lines.slice(3, 7).map((l) => l.split(' ')[0])).toEqual(['Saad', 'Ali', 'Hamza', 'Mahhee']);
  });

  it('D10 every contributor gets "  (paid)", including several payers', () => {
    const bill = fixtureB({
      contributions: [
        { participantId: 'hamza', amount: $(500000) },
        { participantId: 'ali', amount: $(350000) },
      ],
    });
    const lines = render(bill).split('\n');
    expect(lines.filter((l) => l.endsWith('  (paid)')).map((l) => l.split(' ')[0])).toEqual(['Hamza', 'Ali']);
  });

  it('D10 uses rounded amounts (Ali 2,253 not 2,252.50)', () => {
    expect(render(fixtureB())).toContain('Ali      Rs 2,253');
    expect(render(fixtureB())).not.toContain('2,252');
  });
});

describe('D10 formatMoney is injected', () => {
  it('D10 every amount goes through opts.formatMoney (and "+" is prepended to positive adjustments only)', () => {
    const fmt = (p: Paisa) => `<${p}>`;
    const s = render(withStatuses(fixtureB(), [0]), fmt);
    expect(s.split('\n')).toEqual([
      'Salt & Ember · 2 Nov',
      'Total <850000> (card discount <-200000>, tax +<50000>)',
      '',
      'Mahhee   <180600>',
      'Hamza    <263500>  (paid)',
      'Ali      <225300>',
      'Saad     <180600>',
      '',
      'Pay Hamza:',
      '• Ali → <225300> ✓',
      '• Mahhee → <180600>',
      '• Saad → <180600>',
      '',
      'Split with splitr.',
    ]);
  });

  it('D10 calls formatMoney only with paisa values from the breakdown (no floats)', () => {
    const seen: number[] = [];
    render(fixtureB(), (p) => {
      seen.push(p);
      return fm(p);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((n) => Number.isSafeInteger(n))).toBe(true);
  });
});

describe('D10 calc sanity', () => {
  it('D10 Fixture B engine result is ok (guards the fixture itself)', () => {
    expect(calc(fixtureB()).ok).toBe(true);
  });
});
