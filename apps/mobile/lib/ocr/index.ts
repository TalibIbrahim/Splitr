/**
 * OCR adapter (docs/phase2-spec.md 6.1): the only module that knows the native text-recognition library.
 * Never throws; every failure becomes `{ ok: false }`.
 */
import { Image } from 'react-native';
import { OcrResultSchema, type OcrResult } from '@splitr/shared-types';
import { mapMlkitText, type MlkitText } from './mlkit-map';

export type RecognizeResult = { ok: true; ocr: OcrResult } | { ok: false; reason: 'unavailable' | 'failed' };

const imageSize = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });

export async function recognizeReceipt(imageUri: string): Promise<RecognizeResult> {
  try {
    let recognizeText: (path: string) => Promise<MlkitText>;
    try {
      // Loaded lazily: the native module is missing in Expo Go / on web, which must not crash the app.
      ({ recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition'));
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    const [text, size] = await Promise.all([recognizeText(imageUri), imageSize(imageUri)]);
    const parsed = OcrResultSchema.safeParse(mapMlkitText(text, size));
    return parsed.success ? { ok: true, ocr: parsed.data } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
