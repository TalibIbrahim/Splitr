import * as assignment from './assignment';
import * as charges from './charges';
import * as discounts from './discounts';
import { fixtureA, fixtureB } from './golden';
import * as lines from './lines';
import * as overrides from './overrides';
import * as reconciliation from './reconciliation';
import * as settlement from './settlement';
import * as taxes from './taxes';
import type { Fixture } from './types';

export { fixtureA, fixtureB } from './golden';
export * as assignment from './assignment';
export * as charges from './charges';
export * as discounts from './discounts';
export * as lines from './lines';
export * as overrides from './overrides';
export * as reconciliation from './reconciliation';
export * as settlement from './settlement';
export * as taxes from './taxes';
export type { Fixture } from './types';

const flatten = (mod: Record<string, unknown>): Fixture[] =>
  Object.values(mod).flatMap((v) => (Array.isArray(v) ? (v as Fixture[]) : [v as Fixture]));

export const allFixtures: Fixture[] = [
  fixtureA,
  fixtureB,
  ...flatten(assignment),
  ...flatten(discounts),
  ...flatten(taxes),
  ...flatten(charges),
  ...flatten(lines),
  ...flatten(overrides),
  ...flatten(reconciliation),
  ...flatten(settlement),
];
