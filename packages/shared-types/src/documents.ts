/** Zod schemas for the documents stored on the device (docs/phase1-spec.md section 2). */
import { z } from 'zod';
import { arr } from './util';
import {
  AdjustmentSchema,
  BillBreakdownSchema,
  ContributionSchema,
  IdSchema,
  IsoDateSchema,
  ItemSchema,
  PaisaSchema,
} from './engine';
import { ReceiptDraftSchema } from './receipt';

/** ISO-8601 UTC timestamp. */
const TimestampSchema = z.iso.datetime();

/** Fields shared by every stored document. `deletedAt` is the soft-delete marker (absent or null = live). */
const documentFields = {
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deletedAt: TimestampSchema.nullable().optional(),
};

export const MeSchema = z.object({
  personId: IdSchema,
  displayName: z.string().min(1),
});
export type Me = z.infer<typeof MeSchema>;

export const PersonSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1),
  isMe: z.boolean(),
  ...documentFields,
});
export type Person = z.infer<typeof PersonSchema>;

export const GroupSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  memberIds: arr(IdSchema),
  ...documentFields,
});
export type Group = z.infer<typeof GroupSchema>;

export const TransferStatusSchema = z.object({
  from: IdSchema,
  to: IdSchema,
  amount: PaisaSchema,
  status: z.enum(['pending', 'paid']),
  paidAt: TimestampSchema.nullable(),
});
export type TransferStatus = z.infer<typeof TransferStatusSchema>;

export const BillParticipantSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
  /** Guests have `personId: null`. */
  personId: IdSchema.nullable(),
});
export type BillParticipant = z.infer<typeof BillParticipantSchema>;

export const BillSchema = z.object({
  id: IdSchema,
  groupId: IdSchema.nullable(),
  restaurantName: z.string(),
  date: IsoDateSchema,
  currency: z.literal('PKR'),
  participants: arr(BillParticipantSchema),
  meParticipantId: IdSchema.nullable(),
  items: arr(ItemSchema),
  adjustments: arr(AdjustmentSchema),
  printedSubtotal: PaisaSchema.optional(),
  printedTotal: PaisaSchema.optional(),
  contributions: arr(ContributionSchema),
  settlementRoundingUnit: PaisaSchema,
  transferStatuses: arr(TransferStatusSchema),
  status: z.enum(['open', 'settled']),
  settledAt: TimestampSchema.nullable(),
  finalSnapshot: BillBreakdownSchema.nullable(),
  /** Phase 2: the scanned receipt image (device-local) and its parsed draft. Optional, so no schema bump. */
  receipt: z
    .object({
      imageUri: z.string(),
      /** Extra photos added by "Scan more"; `imageUri` stays the first one. */
      moreImageUris: z.array(z.string()).optional(),
      scannedAt: TimestampSchema,
      draft: ReceiptDraftSchema.nullable(),
    })
    .optional(),
  ...documentFields,
});
export type Bill = z.infer<typeof BillSchema>;

export const PersistedRootSchema = z.object({
  schemaVersion: z.literal(1),
  me: MeSchema.nullable(),
  people: arr(PersonSchema),
  groups: arr(GroupSchema),
  bills: arr(BillSchema),
});
export type PersistedRoot = z.infer<typeof PersistedRootSchema>;
