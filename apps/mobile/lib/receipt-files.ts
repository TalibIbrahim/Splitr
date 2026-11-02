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
  deleteCacheFile(sourceUri); // the picker/scanner temp copy is no longer needed (D33)
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

/** True when `uri` lives in the app cache directory (never documentDirectory/receipts). */
function isInCache(uri: string): boolean {
  const cache = Paths.cache.uri;
  return uri.startsWith(cache) || uri.startsWith(cache.replace(/^file:\/\//, ''));
}

/** Deletes a temporary file, but only if it is in the cache directory. Best effort (D33). */
export function deleteCacheFile(uri: string): void {
  try {
    if (!isInCache(uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best effort
  }
}

const STALE_MS = 24 * 60 * 60 * 1000;
const STALE_NAME = /^(splitr-backup-.*\.json|ReactNative-snapshot-image.*\.png|[0-9A-Fa-f-]{36}\.png)$/;

/** Removes leftover backup JSONs and view-shot PNGs older than a day from the cache (D33). */
export function sweepStaleCache(now: number = Date.now()): void {
  try {
    const scan = (dir: Directory): void => {
      for (const entry of dir.list()) {
        try {
          if (entry instanceof File) {
            if (!STALE_NAME.test(entry.name)) continue;
            const modified = entry.info().modificationTime;
            if (modified !== undefined && now - modified > STALE_MS) entry.delete();
          }
        } catch {
          // skip this entry
        }
      }
    };
    scan(Paths.cache);
    const snapshots = new Directory(Paths.cache, 'ReactNative'); // iOS view-shot tmp dir
    if (snapshots.exists) scan(snapshots);
  } catch {
    // best effort
  }
}
