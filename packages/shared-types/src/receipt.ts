/** Zod schemas for receipt scanning (docs/phase2-spec.md sections 2 and 4). */
import { z } from 'zod';
import { arr } from './util';
import { BasisPointsSchema, IsoDateSchema, PaisaSchema } from './engine';

// ───────────── OcrResult (adapter output) ─────────────

const FiniteSchema = z.number().refine(Number.isFinite, { message: 'Expected a finite number' });

/** Pixels, origin top-left, of the processed image. */
export const OcrFrameSchema = z.object({
  x: FiniteSchema,
  y: FiniteSchema,
  width: FiniteSchema,
  height: FiniteSchema,
});
export type OcrFrame = z.infer<typeof OcrFrameSchema>;

export const OcrLineSchema = z.object({
  text: z.string(),
  frame: OcrFrameSchema,
  /** 0..1 when the engine provides it. */
  confidence: z.number().min(0).max(1).optional(),
});
export type OcrLine = z.infer<typeof OcrLineSchema>;

export const OcrResultSchema = z.object({
  imageWidth: FiniteSchema,
  imageHeight: FiniteSchema,
  lines: arr(OcrLineSchema),
});
export type OcrResult = z.infer<typeof OcrResultSchema>;

// ───────────── ReceiptDraft (parser output) ─────────────

export const DraftConfidenceSchema = z.enum(['high', 'low']);
export type DraftConfidence = z.infer<typeof DraftConfidenceSchema>;

export const DraftFlagSchema = z.enum(['arithmetic', 'quantity', 'name', 'ocr-confidence']);
export type DraftFlag = z.infer<typeof DraftFlagSchema>;

export const DraftItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().min(1),
  unitPrice: PaisaSchema.optional(),
  lineTotal: PaisaSchema,
  confidence: DraftConfidenceSchema,
  flags: arr(DraftFlagSchema),
  sourceText: z.string(),
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export const DraftChargeSchema = z.object({
  kind: z.enum(['discount', 'tax', 'service', 'tip', 'fee']),
  label: z.string(),
  amount: PaisaSchema,
  rateBp: BasisPointsSchema.optional(),
  /** Shown for information only (tax already included in the prices, P19); produces no adjustment. */
  informational: z.boolean().optional(),
  confidence: DraftConfidenceSchema,
  sourceText: z.string(),
});
export type DraftCharge = z.infer<typeof DraftChargeSchema>;

/** `difference` = actual − expected. */
export const ReceiptCheckSchema = z.object({
  kind: z.enum(['items-vs-subtotal', 'summary-vs-total', 'line-arithmetic']),
  ok: z.boolean(),
  expected: PaisaSchema,
  actual: PaisaSchema,
  difference: PaisaSchema,
});
export type ReceiptCheck = z.infer<typeof ReceiptCheckSchema>;

/** P18. One payment method's taxes, discounts and printed total. */
export const VariantTotalsSchema = z.object({
  taxes: arr(DraftChargeSchema),
  discounts: arr(DraftChargeSchema),
  printedTotal: PaisaSchema.optional(),
});
export type VariantTotals = z.infer<typeof VariantTotalsSchema>;

export const ReceiptVariantsSchema = z.object({
  card: VariantTotalsSchema.optional(),
  cash: VariantTotalsSchema.optional(),
});
export type ReceiptVariants = z.infer<typeof ReceiptVariantsSchema>;

export const ReceiptDraftSchema = z.object({
  restaurantName: z.string().optional(),
  date: IsoDateSchema.optional(),
  items: arr(DraftItemSchema),
  printedSubtotal: PaisaSchema.optional(),
  charges: arr(DraftChargeSchema),
  printedTotal: PaisaSchema.optional(),
  checks: arr(ReceiptCheckSchema),
  unparsedRows: arr(z.string()),
  /** P18: card and cash prices printed side by side. */
  variants: ReceiptVariantsSchema.optional(),
  /** P18: payment method hinted by the receipt text. */
  paidWith: z.enum(['card', 'cash']).nullable().optional(),
  /** P19: the prices already include tax. */
  taxInclusive: z.boolean().optional(),
});
export type ReceiptDraft = z.infer<typeof ReceiptDraftSchema>;
