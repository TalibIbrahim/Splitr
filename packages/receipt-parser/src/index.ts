/**
 * @splitr/receipt-parser: pure OCR-text to ReceiptDraft parsing (docs/phase2-spec.md, rules P1-P11).
 *
 * - `parseReceipt(ocr)`: the entry point. Deterministic, never throws.
 * - `groupRows(lines)`: P1, group OCR lines into visual rows.
 * - `parseAmountToken(token)`: P2, one token to signed paisa (or null).
 * - `findAmountTokens(text)` / `lineAmount(text)` (P2b) / `removeSpans(text, spans)`: P2 helpers used by the parser.
 * - `classifyRow(text)`: P3, row kind from keywords.
 * - `parseDate(text)`: P7, first valid day-first date as ISO `YYYY-MM-DD`.
 */
export { parseReceipt } from './parse';
export { groupRows, type Row } from './rows';
export { parseAmountToken, findAmountTokens, lineAmount, removeSpans, type AmountToken } from './amounts';
export { classifyRow, type RowKind } from './classify';
export { parseDate } from './date';
