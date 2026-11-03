import type { OcrResult } from '@splitr/shared-types';

/** The most recent OCR result, kept in memory only (never persisted) so the user can choose to share it. */
let last: OcrResult | null = null;

export function setLastScan(ocr: OcrResult | null): void {
  last = ocr;
}

export function getLastScan(): OcrResult | null {
  return last;
}
