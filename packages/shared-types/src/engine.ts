/**
 * Zod schemas for the calculation-engine input/output types (D1).
 * Each schema carries a compile-time assertion that its inferred type is assignable to the engine type,
 * so a drift between the two fails `pnpm typecheck`.
 */
import { z } from 'zod';
import { arr } from './util';
import type {
  Adjustment,
  Assignment,
  BasisPoints,
  BillBreakdown,
  BillInput,
  Contribution,
  Item,
  Paisa,
  Participant,
} from '@splitr/calculation-engine';

/** Compile-time assertion helper: `type _X = Assert<IsAssignable<A, B>>`. */
export type IsAssignable<A, B> = [A] extends [B] ? true : false;
export type Assert<T extends true> = T;

// ───────────── Branded primitives ─────────────

/** Integer paisa (JS safe integer). Output type is the branded `Paisa`. */
export const PaisaSchema = z.custom<Paisa>((v) => typeof v === 'number' && Number.isSafeInteger(v), {
  message: 'Expected an integer number of paisa',
});

/** Integer basis points (JS safe integer). Output type is the branded `BasisPoints`. */
export const BasisPointsSchema = z.custom<BasisPoints>(
  (v) => typeof v === 'number' && Number.isSafeInteger(v),
  { message: 'Expected an integer number of basis points' },
);

export const IdSchema = z.string().min(1);
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const PositiveIntSchema = z.number().int().min(1);

// ───────────── Input ─────────────

export const ParticipantSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
});

export const AssignmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unassigned') }),
  z.object({ kind: z.literal('equal'), participantIds: arr(IdSchema) }),
  z.object({
    kind: z.literal('weights'),
    entries: arr(z.object({ participantId: IdSchema, weight: PositiveIntSchema })),
  }),
  z.object({
    kind: z.literal('percent'),
    entries: arr(z.object({ participantId: IdSchema, bp: BasisPointsSchema })),
  }),
  z.object({
    kind: z.literal('amounts'),
    entries: arr(z.object({ participantId: IdSchema, amount: PaisaSchema })),
  }),
  z.object({
    kind: z.literal('units'),
    entries: arr(z.object({ participantId: IdSchema, units: PositiveIntSchema })),
  }),
]);

export const ValueSourceSchema = z.enum(['receipt', 'user', 'reconciliation']);

export const ItemSchema = z.object({
  id: IdSchema,
  name: z.string(),
  quantity: PositiveIntSchema,
  unitPrice: PaisaSchema.optional(),
  lineTotal: PaisaSchema,
  categories: arr(z.string()),
  assignment: AssignmentSchema,
  source: ValueSourceSchema,
});

export const AdjustmentKindSchema = z.enum(['discount', 'tax', 'serviceCharge', 'tip', 'fee', 'custom']);

export const AdjustmentValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rate'), bp: BasisPointsSchema }),
  z.object({ type: z.literal('fixed'), amount: PaisaSchema }),
]);

export const AdjustmentBaseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('items') }),
  z.object({
    type: z.literal('items-after'),
    include: z.union([arr(IdSchema), z.literal('all-prior')]),
  }),
  z.object({ type: z.literal('fixed'), amount: PaisaSchema }),
]);

export const EligibilitySchema = z.object({
  itemIds: arr(IdSchema).optional(),
  categories: arr(z.string()).optional(),
  excludeItemIds: arr(IdSchema).optional(),
  excludeCategories: arr(z.string()).optional(),
});

export const ValiditySchema = z.object({
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  daysOfWeek: arr(z.number().int().min(0).max(6)).optional(),
});

export const AllocationPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('proportional') }),
  z.object({ type: z.literal('equal'), participantIds: arr(IdSchema).optional() }),
  z.object({
    type: z.literal('weights'),
    entries: arr(z.object({ participantId: IdSchema, weight: PositiveIntSchema })),
  }),
]);

export const RoundingModeSchema = z.enum(['half-up', 'half-even', 'down', 'up']);

export const AdjustmentSchema = z.object({
  id: IdSchema,
  label: z.string(),
  kind: AdjustmentKindSchema,
  direction: z.enum(['add', 'subtract']).optional(),
  value: AdjustmentValueSchema,
  base: AdjustmentBaseSchema.optional(),
  eligibility: EligibilitySchema.optional(),
  cap: PaisaSchema.optional(),
  minimumSpend: PaisaSchema.optional(),
  validity: ValiditySchema.optional(),
  order: z.number().int(),
  allocation: AllocationPolicySchema.optional(),
  rounding: RoundingModeSchema.optional(),
  printedAmount: PaisaSchema.optional(),
  override: z.object({ amount: PaisaSchema, reason: z.string() }).optional(),
  source: ValueSourceSchema,
});

export const ContributionSchema = z.object({
  participantId: IdSchema,
  amount: PaisaSchema,
});

export const BillInputSchema = z.object({
  currency: z.literal('PKR'),
  date: IsoDateSchema.optional(),
  participants: arr(ParticipantSchema),
  items: arr(ItemSchema),
  adjustments: arr(AdjustmentSchema),
  contributions: arr(ContributionSchema),
  printedSubtotal: PaisaSchema.optional(),
  printedTotal: PaisaSchema.optional(),
  settlementRoundingUnit: PaisaSchema.optional(),
});

// ───────────── Output (used by Bill.finalSnapshot) ─────────────

export const ExactSchema = z.object({
  numerator: z.string(),
  denominator: z.string(),
  rounded: PaisaSchema,
});

export const AllocationTraceSchema = z.object({
  total: PaisaSchema,
  rows: arr(
    z.object({
      participantId: IdSchema,
      weight: ExactSchema,
      quota: ExactSchema,
      floor: PaisaSchema,
      remainder: ExactSchema,
      bonus: PaisaSchema,
      amount: PaisaSchema,
    }),
  ),
});

const NotAppliedReasonSchema = z.enum([
  'no-eligible-items',
  'outside-validity',
  'below-minimum-spend',
  'non-positive-base',
]);

export const TraceStepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('item-split'),
    itemId: IdSchema,
    assignmentKind: z.enum(['unassigned', 'equal', 'weights', 'percent', 'amounts', 'units']),
    allocation: AllocationTraceSchema,
  }),
  z.object({
    type: z.literal('adjustment'),
    adjustmentId: IdSchema,
    eligibleItemIds: arr(IdSchema),
    base: ExactSchema,
    baseType: z.enum(['items', 'items-after', 'fixed']),
    rateBp: BasisPointsSchema.optional(),
    raw: ExactSchema.optional(),
    rounding: RoundingModeSchema.optional(),
    computed: PaisaSchema,
    capped: z.boolean(),
    clamped: z.boolean(),
    overridden: z.object({ amount: PaisaSchema, reason: z.string() }).optional(),
    notApplied: NotAppliedReasonSchema.optional(),
    amount: PaisaSchema,
  }),
  z.object({
    type: z.literal('adjustment-allocation'),
    adjustmentId: IdSchema,
    policy: z.enum(['proportional', 'equal', 'weights']),
    fallbackEqual: z.boolean(),
    allocation: AllocationTraceSchema,
  }),
  z.object({
    type: z.literal('settlement-rounding'),
    unit: PaisaSchema,
    exactTotal: PaisaSchema,
    roundedTotal: PaisaSchema,
    allocation: AllocationTraceSchema,
  }),
  z.object({
    type: z.literal('rounding-residual'),
    residual: PaisaSchema,
    participantId: IdSchema,
  }),
  z.object({
    type: z.literal('transfer'),
    from: IdSchema,
    to: IdSchema,
    amount: PaisaSchema,
  }),
]);

export const AdjustmentResultSchema = z.object({
  adjustmentId: IdSchema,
  label: z.string(),
  kind: AdjustmentKindSchema,
  amount: PaisaSchema,
  applied: z.boolean(),
  notAppliedReason: NotAppliedReasonSchema.optional(),
  allocations: arr(z.object({ participantId: IdSchema, amount: PaisaSchema })),
});

export const ParticipantBreakdownSchema = z.object({
  participantId: IdSchema,
  items: arr(z.object({ itemId: IdSchema, amount: PaisaSchema })),
  itemsSubtotal: PaisaSchema,
  adjustments: arr(z.object({ adjustmentId: IdSchema, amount: PaisaSchema })),
  exactTotal: PaisaSchema,
  roundedTotal: PaisaSchema,
  roundingDelta: PaisaSchema,
});

export const SettlementResultSchema = z.object({
  balances: arr(
    z.object({
      participantId: IdSchema,
      contributed: PaisaSchema,
      share: PaisaSchema,
      net: PaisaSchema,
    }),
  ),
  residual: z.object({ amount: PaisaSchema, participantId: IdSchema }),
  transfers: arr(z.object({ from: IdSchema, to: IdSchema, amount: PaisaSchema })),
});

export const BillBreakdownSchema = z.object({
  itemsSubtotal: PaisaSchema,
  adjustments: arr(AdjustmentResultSchema),
  total: PaisaSchema,
  settlementRoundingUnit: PaisaSchema,
  roundedTotal: PaisaSchema,
  participants: arr(ParticipantBreakdownSchema),
  settlement: SettlementResultSchema.nullable(),
  trace: arr(TraceStepSchema),
});

// ───────────── Compile-time checks (D1) ─────────────

type _Participant = Assert<IsAssignable<z.infer<typeof ParticipantSchema>, Participant>>;
type _Assignment = Assert<IsAssignable<z.infer<typeof AssignmentSchema>, Assignment>>;
type _Item = Assert<IsAssignable<z.infer<typeof ItemSchema>, Item>>;
type _Adjustment = Assert<IsAssignable<z.infer<typeof AdjustmentSchema>, Adjustment>>;
type _Contribution = Assert<IsAssignable<z.infer<typeof ContributionSchema>, Contribution>>;
type _BillInput = Assert<IsAssignable<z.infer<typeof BillInputSchema>, BillInput>>;
type _BillBreakdown = Assert<IsAssignable<z.infer<typeof BillBreakdownSchema>, BillBreakdown>>;
export type EngineSchemaChecks = [
  _Participant,
  _Assignment,
  _Item,
  _Adjustment,
  _Contribution,
  _BillInput,
  _BillBreakdown,
];
