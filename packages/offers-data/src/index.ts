import type { CardOffer } from '@splitr/shared-types';
import data from './offers.lahore.json';

/** Date the bundled dataset was last checked against the official sources. */
export const DATASET_RETRIEVED_ON = '2026-11-02';

/** Bundled Lahore offers. Shape is validated against `CardOfferSchema` at test time, not at runtime. */
export const lahoreOffers: readonly CardOffer[] = data as unknown as readonly CardOffer[];
