/**
 * Receipt image storage (docs/phase2-spec.md 6.1) on the current expo-file-system File/Directory API.
 * Images are copied into documentDirectory/receipts/ and never leave the device.
 */
import { Directory, File, Paths } from 'expo-file-system';

const receiptsDir = (): Directory => new Directory(Paths.document, 'receipts');

/** Copies `sourceUri` to `receipts/{billId}-{n}.jpg` (first free n, starting at 1) and returns the new uri. */
export async function saveReceiptImage(billId: string, sourceUri: string): Promise<string> {
  const dir = receiptsDir();
  dir.create({ intermediates: true, idempotent: true });
  let n = 1;
  let target = new File(dir, `${billId}-${String(n)}.jpg`);
  while (target.exists) {
    n += 1;
    target = new File(dir, `${billId}-${String(n)}.jpg`);
  }
  new File(sourceUri).copy(target);
  return target.uri;
}

/** Deletes a stored receipt image. A missing file is not an error. */
export function deleteReceiptImage(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best effort: a leftover file is harmless
  }
}
