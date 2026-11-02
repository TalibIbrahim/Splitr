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
  kind: z.enum(['discount', 'tax', 'service', 'tip']),
  label: z.string(),
  amount: PaisaSchema,
  rateBp: BasisPointsSchema.optional(),
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

export const ReceiptDraftSchema = z.object({
  restaurantName: z.string().optional(),
  date: IsoDateSchema.optional(),
  items: arr(DraftItemSchema),
  printedSubtotal: PaisaSchema.optional(),
  charges: arr(DraftChargeSchema),
  printedTotal: PaisaSchema.optional(),
  checks: arr(ReceiptCheckSchema),
  unparsedRows: arr(z.string()),
});
export type ReceiptDraft = z.infer<typeof ReceiptDraftSchema>;
