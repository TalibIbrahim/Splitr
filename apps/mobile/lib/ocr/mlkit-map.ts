/**
 * Pure mapping from the ML Kit wrapper's result shape to our `OcrResult` (docs/phase2-spec.md 6.1).
 * No native imports: the shape is declared structurally so this file is testable in Node.
 * Blocks are flattened to lines, empty lines are dropped, nothing else is interpreted (the parser does that).
 * @infinitered/react-native-mlkit-text-recognition gives no confidence values, so none are set.
 */
import type { OcrLine, OcrResult } from '@splitr/shared-types';

export interface MlkitRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface MlkitLine {
  text: string;
  frame: MlkitRect;
}
export interface MlkitBlock {
  lines: MlkitLine[];
}
export interface MlkitText {
  blocks: MlkitBlock[];
}

export function mapMlkitText(result: MlkitText, image: { width: number; height: number }): OcrResult {
  const lines: OcrLine[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      const text = line.text.trim();
      if (text.length === 0) continue;
      const { left, top, right, bottom } = line.frame;
      lines.push({ text, frame: { x: left, y: top, width: right - left, height: bottom - top } });
    }
  }
  return { imageWidth: image.width, imageHeight: image.height, lines };
}
