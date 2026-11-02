/** Phase 5 — bank-card offers (docs/phase5-spec.md §1). Amounts are integer paisa / basis points. */
import { z } from 'zod';
import { BasisPointsSchema, IsoDateSchema, PaisaSchema } from './engine';
import { arr } from './util';

export const CardOfferDiscountSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), bp: BasisPointsSchema }),
  z.object({ type: z.literal('fixed'), amount: PaisaSchema }),
]);

export const CardOfferSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('published'),
    url: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), 'source url must be https'),
    title: z.string(),
    retrievedOn: IsoDateSchema,
    confidence: z.enum(['high', 'medium']),
  }),
  z.object({ kind: z.literal('user'), addedOn: IsoDateSchema, note: z.string().optional() }),
]);

export const CardOfferSchema = z.object({
  id: z.string().min(1),
  bank: z.string(),
  cardProducts: arr(z.string()),
  restaurant: z.string(),
  city: z.literal('Lahore'),
  branches: arr(z.string()).optional(),
  discount: CardOfferDiscountSchema,
  capPaisa: PaisaSchema.optional(),
  minSpendPaisa: PaisaSchema.optional(),
  /** 0 = Sun … 6 = Sat (engine Validity convention). */
  daysOfWeek: arr(z.number().int().min(0).max(6)).optional(),
  validFrom: IsoDateSchema.optional(),
  validTo: IsoDateSchema.optional(),
  terms: z.string(),
  source: CardOfferSourceSchema,
});
export type CardOffer = z.infer<typeof CardOfferSchema>;
