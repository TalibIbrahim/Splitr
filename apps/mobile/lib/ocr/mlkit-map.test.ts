import { describe, expect, it } from 'vitest';
import { OcrResultSchema } from '@splitr/shared-types';
import { mapMlkitText, type MlkitText } from './mlkit-map';

// Hand-written sample in the library's result shape (recognizeText from @infinitered/react-native-mlkit-text-recognition).
const sample: MlkitText = {
  blocks: [
    {
      lines: [
        { text: 'CHICKEN KARAHI  2  1,800', frame: { left: 40, top: 100, right: 540, bottom: 130 } },
        { text: '   ', frame: { left: 0, top: 0, right: 10, bottom: 10 } },
      ],
    },
    { lines: [] },
    {
      lines: [{ text: ' TOTAL 2,088 ', frame: { left: 40, top: 300.5, right: 300, bottom: 330.5 } }],
    },
  ],
};

describe('mapMlkitText', () => {
  it('flattens blocks to lines, converts frames and drops empty lines', () => {
    const out = mapMlkitText(sample, { width: 600, height: 900 });
    expect(out).toEqual({
      imageWidth: 600,
      imageHeight: 900,
      lines: [
        { text: 'CHICKEN KARAHI  2  1,800', frame: { x: 40, y: 100, width: 500, height: 30 } },
        { text: 'TOTAL 2,088', frame: { x: 40, y: 300.5, width: 260, height: 30 } },
      ],
    });
  });

  it('produces a schema-valid OcrResult and handles an empty result', () => {
    expect(OcrResultSchema.safeParse(mapMlkitText(sample, { width: 600, height: 900 })).success).toBe(true);
    const empty = mapMlkitText({ blocks: [] }, { width: 10, height: 10 });
    expect(empty.lines).toEqual([]);
    expect(OcrResultSchema.safeParse(empty).success).toBe(true);
  });
});
