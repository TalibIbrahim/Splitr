import { describe, expect, it } from 'vitest';
import type { CardOffer } from '@splitr/shared-types';
import {
  compareOffers,
  normalizeRestaurant,
  offerStatus,
  offersForRestaurant,
  offerToAdjustment,
} from '../src/index';
import { $, at, bp, deepFreeze, fixtureB, mkItem } from './helpers';

const TODAY = '2026-11-02'; // a Monday

function offer(over: Partial<CardOffer> & { id: string }): CardOffer {
  return {
    bank: 'Bank AL Habib',
    cardProducts: ['Platinum Debit'],
    restaurant: "Nando's",
    city: 'Lahore',
    discount: { type: 'percent', bp: bp(2500) },
    terms: 'Not applicable on GST.',
    source: {
      kind: 'published',
      url: 'https://www.bankalhabib.com/offers',
      title: 'Offers',
      retrievedOn: '2026-10-20',
      confidence: 'high',
    },
    ...over,
  } as CardOffer;
}

const pub = (retrievedOn: string): CardOffer['source'] => ({
  kind: 'published',
  url: 'https://www.hbl.com/x',
  title: 't',
  retrievedOn,
  confidence: 'high',
});

describe('O1 normalizeRestaurant', () => {
  it("O1 Nando's, NANDO'S Lahore normalise to the same string", () => {
    expect(normalizeRestaurant("Nando's")).toBe('nando');
    expect(normalizeRestaurant("NANDO'S Lahore")).toBe('nando');
    expect(normalizeRestaurant("Nando's")).toBe(normalizeRestaurant("NANDO'S Lahore"));
  });

  it('O1 Nandos (no apostrophe) keeps its s', () => {
    expect(normalizeRestaurant('Nandos')).toBe('nandos');
  });

  it('O1 "The Monal" and "Monal Restaurant" both become "monal"', () => {
    expect(normalizeRestaurant('The Monal')).toBe('monal');
    expect(normalizeRestaurant('Monal Restaurant')).toBe('monal');
  });

  it('O1 strips cafe, pvt, ltd and punctuation, collapses whitespace', () => {
    expect(normalizeRestaurant('Cafe  Aylanto')).toBe('aylanto');
    expect(normalizeRestaurant('Kolachi Pvt. Ltd.')).toBe('kolachi');
    expect(normalizeRestaurant('  Big   Moes!!  ')).toBe('big moes');
  });

  it('O1 lowercases', () => {
    expect(normalizeRestaurant('BURGER LAB')).toBe('burger lab');
  });

  it('O1 is idempotent on typical names', () => {
    for (const n of ["Nando's", 'The Monal', 'Cafe Aylanto', 'Kolachi Pvt Ltd', 'Salt & Ember']) {
      const once = normalizeRestaurant(n);
      expect(normalizeRestaurant(once)).toBe(once);
    }
  });
});

describe('O2 offersForRestaurant', () => {
  const nando = offer({ id: 'n1', restaurant: "Nando's" });
  const monal = offer({ id: 'm1', restaurant: 'The Monal' });
  const kfc = offer({ id: 'k1', restaurant: 'KFC' });
  const all = [nando, monal, kfc];

  it('O2 matches on normalized equality / containment across spellings', () => {
    for (const q of ["Nando's", "NANDO'S Lahore", 'nandos', 'Nandos Restaurant']) {
      expect(offersForRestaurant(all, q).map((o) => o.id), q).toEqual(['n1']);
    }
  });

  it('O2 matches The Monal vs Monal Restaurant', () => {
    expect(offersForRestaurant(all, 'Monal Restaurant').map((o) => o.id)).toEqual(['m1']);
  });

  it('O2 containment with >= 4 chars matches (either direction)', () => {
    expect(offersForRestaurant([offer({ id: 'c1', restaurant: 'Cosa Nostra' })], 'Cosa')).toHaveLength(1);
    expect(
      offersForRestaurant([offer({ id: 'c2', restaurant: 'Cosa' })], 'Cosa Nostra Gulberg'),
    ).toHaveLength(1);
  });

  it('O2 no containment match when the contained name is shorter than 4 chars', () => {
    expect(offersForRestaurant([offer({ id: 'b', restaurant: 'Bar B Q Tonight' })], 'Bar')).toEqual([]);
    expect(offersForRestaurant([offer({ id: 'k2', restaurant: 'KFC Gulberg' })], 'KFC')).toEqual([]);
    expect(offersForRestaurant([offer({ id: 'k3', restaurant: 'KFC' })], 'KFC Gulberg')).toEqual([]);
  });

  it('O2 short names still match by equality', () => {
    expect(offersForRestaurant(all, 'KFC').map((o) => o.id)).toEqual(['k1']);
  });

  it('O2 unrelated names and empty names do not match', () => {
    expect(offersForRestaurant(all, 'Salt & Ember')).toEqual([]);
    expect(offersForRestaurant(all, '')).toEqual([]);
    expect(offersForRestaurant(all, '   ')).toEqual([]);
  });

  it('O2 orders by bank, then card, regardless of input order', () => {
    const a = offer({ id: 'z1', bank: 'HBL', cardProducts: ['Visa Gold'] });
    const b = offer({ id: 'z2', bank: 'Bank AL Habib', cardProducts: ['Visa Platinum'] });
    const c = offer({ id: 'z3', bank: 'Bank AL Habib', cardProducts: ['Platinum Debit'] });
    const out = offersForRestaurant([a, b, c], "Nando's").map((o) => o.id);
    expect(out).toEqual(['z3', 'z2', 'z1']);
    expect(offersForRestaurant([c, a, b], "Nando's").map((o) => o.id)).toEqual(out);
  });

  it('O2 does not mutate its input', () => {
    const input = deepFreeze([nando, monal]);
    expect(() => offersForRestaurant(input, 'Monal')).not.toThrow();
  });
});

describe('O3 offerStatus', () => {
  it('O3 active when today is within validFrom..validTo (inclusive both ends)', () => {
    expect(offerStatus(offer({ id: 'a', validFrom: '2026-10-01', validTo: '2026-12-31' }), TODAY).status).toBe(
      'active',
    );
    expect(offerStatus(offer({ id: 'a', validFrom: TODAY, validTo: '2026-12-31' }), TODAY).status).toBe('active');
    expect(offerStatus(offer({ id: 'a', validFrom: '2026-10-01', validTo: TODAY }), TODAY).status).toBe('active');
  });

  it('O3 expired when validTo is before today', () => {
    expect(offerStatus(offer({ id: 'a', validTo: '2026-11-01' }), TODAY).status).toBe('expired');
    expect(offerStatus(offer({ id: 'a', validFrom: '2026-01-01', validTo: '2026-10-31' }), TODAY).status).toBe(
      'expired',
    );
  });

  it('O3 not-yet when validFrom is after today', () => {
    expect(offerStatus(offer({ id: 'a', validFrom: '2026-11-03', validTo: '2026-12-31' }), TODAY).status).toBe(
      'not-yet',
    );
    expect(offerStatus(offer({ id: 'a', validFrom: '2026-11-03' }), TODAY).status).toBe('not-yet');
  });

  it('O3 unknown-validity when there are no dates at all', () => {
    expect(offerStatus(offer({ id: 'a' }), TODAY).status).toBe('unknown-validity');
    expect(offerStatus(offer({ id: 'a', daysOfWeek: [1, 2] }), TODAY).status).toBe('unknown-validity');
  });

  it('O3 stale boundary: 60 days old is not stale, 61 days is', () => {
    // 2026-11-02 minus 60 days = 2026-09-03
    expect(offerStatus(offer({ id: 'a', source: pub('2026-09-03') }), TODAY).stale).toBe(false);
    expect(offerStatus(offer({ id: 'a', source: pub('2026-09-02') }), TODAY).stale).toBe(true);
  });

  it('O3 fresh published offers are not stale; same-day is not stale', () => {
    expect(offerStatus(offer({ id: 'a', source: pub(TODAY) }), TODAY).stale).toBe(false);
    expect(offerStatus(offer({ id: 'a', source: pub('2026-10-15') }), TODAY).stale).toBe(false);
  });

  it('O3 very old published offers are stale regardless of status', () => {
    const r = offerStatus(offer({ id: 'a', source: pub('2025-01-01'), validTo: '2026-12-31' }), TODAY);
    expect(r.stale).toBe(true);
    expect(r.status).toBe('active');
  });

  it('O3 user offers are never stale', () => {
    const u = offer({ id: 'u', source: { kind: 'user', addedOn: '2020-01-01' } });
    expect(offerStatus(u, TODAY).stale).toBe(false);
  });

  it('O3 staleness is independent of the validity status', () => {
    const r = offerStatus(offer({ id: 'a', source: pub('2025-01-01'), validTo: '2026-01-01' }), TODAY);
    expect(r).toEqual({ status: 'expired', stale: true });
  });
});

describe('O4 offerToAdjustment', () => {
  it('O4 percent: rate, cap, minimum spend, days and dates map across', () => {
    const o = offer({
      id: 'p',
      discount: { type: 'percent', bp: bp(2500) },
      capPaisa: $(250000),
      minSpendPaisa: $(500000),
      daysOfWeek: [1, 2, 3, 4],
      validFrom: '2026-10-01',
      validTo: '2026-12-31',
    });
    const a = offerToAdjustment(o, 'adj-1');
    expect(a.id).toBe('adj-1');
    expect(a.kind).toBe('discount');
    expect(a.value).toEqual({ type: 'rate', bp: 2500 });
    expect(a.cap).toBe(250000);
    expect(a.minimumSpend).toBe(500000);
    expect(a.validity).toEqual({ from: '2026-10-01', to: '2026-12-31', daysOfWeek: [1, 2, 3, 4] });
    expect(a.base).toEqual({ type: 'items' });
    expect(a.source).toBe('user');
  });

  it('O4 label is "{bank} {cardProducts[0]}"', () => {
    const o = offer({ id: 'p', bank: 'Bank AL Habib', cardProducts: ['Platinum Debit', 'Visa Gold'] });
    expect(offerToAdjustment(o, 'x').label).toBe('Bank AL Habib Platinum Debit');
  });

  it('O4 omitted optionals stay absent (no cap, no minimum spend, no validity restriction)', () => {
    const a = offerToAdjustment(offer({ id: 'p' }), 'x');
    expect(a.cap).toBeUndefined();
    expect(a.minimumSpend).toBeUndefined();
    expect(a.validity?.from).toBeUndefined();
    expect(a.validity?.to).toBeUndefined();
    expect(a.validity?.daysOfWeek).toBeUndefined();
  });

  it('O4 only-dates offer carries dates but no days', () => {
    const a = offerToAdjustment(offer({ id: 'p', validTo: '2026-12-31' }), 'x');
    expect(a.validity?.to).toBe('2026-12-31');
    expect(a.validity?.daysOfWeek).toBeUndefined();
  });

  it('O4 fixed offer becomes a fixed discount', () => {
    const a = offerToAdjustment(offer({ id: 'f', discount: { type: 'fixed', amount: $(50000) } }), 'x');
    expect(a.kind).toBe('discount');
    expect(a.value).toEqual({ type: 'fixed', amount: 50000 });
    expect(a.base).toEqual({ type: 'items' });
    expect(a.source).toBe('user');
  });

  it('O4 does not mutate a frozen offer', () => {
    const o = deepFreeze(offer({ id: 'p', daysOfWeek: [1, 2] }));
    expect(() => offerToAdjustment(o, 'x')).not.toThrow();
  });
});

describe('O5 compareOffers (Fixture B: items total Rs 10,000, date 2026-11-02 Monday)', () => {
  const bill = fixtureB();
  const run = (offers: CardOffer[], opts?: { includeExpired?: boolean }) =>
    compareOffers(bill, offers, TODAY, opts);

  it('O5 25% capped at Rs 2,500: saving is 250000 paisa (25% of Rs 10,000 = the cap)', () => {
    const r = run([offer({ id: 'o', capPaisa: $(250000) })]);
    expect(r).toHaveLength(1);
    expect(at(r, 0).saving).toBe(250000);
    expect(at(r, 0).applied).toBe(true);
    expect(at(r, 0).reason).toBeUndefined();
  });

  it('O5 a cap that binds lower (Rs 1,000) limits saving to 100000', () => {
    expect(at(run([offer({ id: 'o', capPaisa: $(100000) })]), 0).saving).toBe(100000);
  });

  it('O5 no cap: 30% of Rs 10,000 is 300000', () => {
    const r = run([offer({ id: 'o', discount: { type: 'percent', bp: bp(3000) } })]);
    expect(at(r, 0).saving).toBe(300000);
  });

  it('O5 existing 20% discount is replaced, not stacked', () => {
    // fixtureB already has a 20% card discount (200000). A 10% offer must yield 100000, not 300000 or 200000.
    const r = run([offer({ id: 'o', discount: { type: 'percent', bp: bp(1000) } })]);
    expect(at(r, 0).saving).toBe(100000);
  });

  it('O5 a bill with no discount gives the same saving as one with a discount', () => {
    const noDisc = fixtureB({ adjustments: fixtureB().adjustments.filter((a) => a.kind !== 'discount') });
    const o = offer({ id: 'o', capPaisa: $(100000) });
    expect(at(compareOffers(noDisc, [o], TODAY), 0).saving).toBe(100000);
  });

  it('O5 offer valid Fridays only: saving 0, reason outside-validity (bill is a Monday)', () => {
    const r = run([offer({ id: 'o', daysOfWeek: [5], validTo: '2026-12-31' })]);
    expect(at(r, 0).saving).toBe(0);
    expect(at(r, 0).applied).toBe(false);
    expect(at(r, 0).reason).toBe('outside-validity');
  });

  it('O5 offer valid on Mondays applies', () => {
    const r = run([offer({ id: 'o', daysOfWeek: [1], validTo: '2026-12-31' })]);
    expect(at(r, 0).saving).toBe(250000);
    expect(at(r, 0).applied).toBe(true);
  });

  it('O5 minimum spend Rs 15,000 on a Rs 10,000 bill: saving 0, below-minimum-spend', () => {
    const r = run([offer({ id: 'o', minSpendPaisa: $(1500000) })]);
    expect(at(r, 0).saving).toBe(0);
    expect(at(r, 0).applied).toBe(false);
    expect(at(r, 0).reason).toBe('below-minimum-spend');
  });

  it('O5 minimum spend boundary: exactly the base applies, one paisa more does not (R8.2)', () => {
    expect(at(run([offer({ id: 'o', minSpendPaisa: $(1000000) })]), 0).saving).toBe(250000);
    const r = run([offer({ id: 'o', minSpendPaisa: $(1000001) })]);
    expect(at(r, 0).saving).toBe(0);
    expect(at(r, 0).reason).toBe('below-minimum-spend');
  });

  it('O5 fixed Rs 500 offer saves 50000', () => {
    const r = run([offer({ id: 'o', discount: { type: 'fixed', amount: $(50000) } })]);
    expect(at(r, 0).saving).toBe(50000);
    expect(at(r, 0).applied).toBe(true);
  });

  it('O5 a fixed discount larger than the base is clamped to the base (R8.6)', () => {
    const r = run([offer({ id: 'o', discount: { type: 'fixed', amount: $(2000000) } })]);
    expect(at(r, 0).saving).toBe(1000000);
  });

  it('O5 result carries the offer and its O3 status', () => {
    const r = at(run([offer({ id: 'o', validTo: '2026-12-31' })]), 0);
    expect(r.offer.id).toBe('o');
    expect(r.status).toBe('active');
  });

  it('O5 expired offers are excluded by default and included with includeExpired', () => {
    const expired = offer({ id: 'old', validTo: '2026-10-31' });
    const live = offer({ id: 'live', validTo: '2026-12-31' });
    expect(run([expired, live]).map((r) => r.offer.id)).toEqual(['live']);
    const withExpired = run([expired, live], { includeExpired: true });
    expect(withExpired.map((r) => r.offer.id)).toEqual(['live', 'old']);
    const old = withExpired.find((r) => r.offer.id === 'old');
    expect(old?.status).toBe('expired');
    expect(old?.applied).toBe(false);
  });

  it('O5 sort: active first, then saving desc, then id', () => {
    const offers = [
      offer({ id: 'unknown-big', discount: { type: 'percent', bp: bp(5000) } }), // unknown-validity, saving 500000
      offer({ id: 'b-same', validTo: '2026-12-31', discount: { type: 'percent', bp: bp(1000) } }),
      offer({ id: 'a-same', validTo: '2026-12-31', discount: { type: 'percent', bp: bp(1000) } }),
      offer({ id: 'active-bigger', validTo: '2026-12-31', discount: { type: 'percent', bp: bp(2000) } }),
    ];
    const expected = ['active-bigger', 'a-same', 'b-same', 'unknown-big'];
    expect(run(offers).map((r) => r.offer.id)).toEqual(expected);
    expect(run([...offers].reverse()).map((r) => r.offer.id)).toEqual(expected);
  });

  it('O5 unassigned items do not block the comparison and do not change the saving', () => {
    const items = fixtureB().items.map((it, i) =>
      i === 0 ? mkItem(it.id, it.name, it.quantity, it.lineTotal, { kind: 'unassigned' }) : it,
    );
    const partial = fixtureB({ items });
    const r = compareOffers(partial, [offer({ id: 'o', capPaisa: $(100000) })], TODAY);
    expect(r).toHaveLength(1);
    expect(at(r, 0).saving).toBe(100000);
    expect(at(r, 0).applied).toBe(true);
  });

  it('O5 does not mutate the bill or offers', () => {
    const b = deepFreeze(fixtureB());
    const offers = deepFreeze([offer({ id: 'o' })]);
    expect(() => compareOffers(b, offers, TODAY)).not.toThrow();
  });

  it('O5 empty offers gives empty result', () => {
    expect(run([])).toEqual([]);
  });
});
