import { describe, expect, it } from 'vitest';
import { CardOfferSchema } from '@splitr/shared-types';
import { DATASET_RETRIEVED_ON, lahoreOffers } from '../src/index';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_HOSTS = ['hbl.com', 'bankalhabib.com'];

const hostOk = (url: string): boolean => {
  const u = new URL(url);
  return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
};

describe('§2 dataset', () => {
  it('§2 dataset is non-empty', () => {
    expect(lahoreOffers.length).toBeGreaterThan(0);
  });

  it('§2 DATASET_RETRIEVED_ON is an ISO date', () => {
    expect(DATASET_RETRIEVED_ON).toMatch(ISO);
  });

  it('§2 every entry passes CardOfferSchema', () => {
    for (const o of lahoreOffers) {
      const r = CardOfferSchema.safeParse(o);
      expect(r.success, `${o.id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it('§2 ids are unique', () => {
    const ids = lahoreOffers.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('§2 ids are non-empty slugs', () => {
    for (const o of lahoreOffers) expect(o.id, o.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('§2 every source is published, https, on hbl.com or bankalhabib.com', () => {
    for (const o of lahoreOffers) {
      expect(o.source.kind, o.id).toBe('published');
      if (o.source.kind !== 'published') continue;
      expect(o.source.url, o.id).toMatch(/^https:\/\//);
      expect(hostOk(o.source.url), `${o.id}: ${o.source.url}`).toBe(true);
      expect(o.source.retrievedOn, o.id).toMatch(ISO);
      expect(o.source.title.length, o.id).toBeGreaterThan(0);
    }
  });

  it('§2 city is Lahore and bank/restaurant/cardProducts are non-empty', () => {
    for (const o of lahoreOffers) {
      expect(o.city, o.id).toBe('Lahore');
      expect(o.bank.length, o.id).toBeGreaterThan(0);
      expect(o.restaurant.length, o.id).toBeGreaterThan(0);
      expect(o.cardProducts.length, o.id).toBeGreaterThan(0);
    }
  });

  it('§2 no entry has a missing discount; values are positive integers (paisa / bp)', () => {
    for (const o of lahoreOffers) {
      expect(o.discount, o.id).toBeDefined();
      if (o.discount.type === 'percent') {
        expect(Number.isInteger(o.discount.bp), o.id).toBe(true);
        expect(o.discount.bp, o.id).toBeGreaterThan(0);
        expect(o.discount.bp, o.id).toBeLessThanOrEqual(10000);
      } else {
        expect(o.discount.type, o.id).toBe('fixed');
        expect(Number.isInteger(o.discount.amount), o.id).toBe(true);
        expect(o.discount.amount, o.id).toBeGreaterThan(0);
      }
    }
  });

  it('§2 capPaisa / minSpendPaisa are positive integers when present', () => {
    for (const o of lahoreOffers) {
      for (const v of [o.capPaisa, o.minSpendPaisa]) {
        if (v === undefined) continue;
        expect(Number.isInteger(v), o.id).toBe(true);
        expect(v, o.id).toBeGreaterThan(0);
      }
    }
  });

  it('§2 daysOfWeek are integers in 0..6', () => {
    for (const o of lahoreOffers) {
      for (const d of o.daysOfWeek ?? []) {
        expect(Number.isInteger(d), o.id).toBe(true);
        expect(d, o.id).toBeGreaterThanOrEqual(0);
        expect(d, o.id).toBeLessThanOrEqual(6);
      }
    }
  });

  it('§2 validFrom <= validTo when both present; dates are ISO', () => {
    for (const o of lahoreOffers) {
      if (o.validFrom !== undefined) expect(o.validFrom, o.id).toMatch(ISO);
      if (o.validTo !== undefined) expect(o.validTo, o.id).toMatch(ISO);
      if (o.validFrom !== undefined && o.validTo !== undefined) {
        expect(o.validFrom <= o.validTo, `${o.id}: ${o.validFrom} > ${o.validTo}`).toBe(true);
      }
    }
  });

  it('§2 the dataset survives a JSON round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(lahoreOffers))).toEqual(lahoreOffers);
  });
});
