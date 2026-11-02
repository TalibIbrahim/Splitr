/**
 * Receipt capture (docs/phase2-spec.md 6.1). 'scan' uses the document scanner (edge detection, crop);
 * 'camera' / 'library' use the image picker. The result is always a local file uri; very large images are
 * downscaled to a 2000 px long edge as JPEG 0.85.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteCacheFile } from './receipt-files';

export type CaptureMode = 'scan' | 'camera' | 'library';
export type CaptureResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'cancelled' | 'permission' | 'unavailable' | 'failed' };

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

const toFileUri = (p: string): string => (p.startsWith('/') ? `file://${p}` : p);

/**
 * Re-encodes to JPEG (this also bakes in EXIF orientation, so OCR coordinates match the pixels) and downscales
 * when the long edge exceeds MAX_EDGE. With `force` false, images within bounds are returned untouched.
 */
async function normalise(uri: string, size: { width: number; height: number } | null, force: boolean): Promise<string> {
  const oversize = size !== null && Math.max(size.width, size.height) > MAX_EDGE;
  if (!force && !oversize) return uri;
  const ctx = ImageManipulator.manipulate(uri);
  if (size !== null && oversize) {
    ctx.resize(size.width >= size.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  if (saved.uri !== uri) deleteCacheFile(uri); // the original temp source is superseded (D33)
  return saved.uri;
}

async function scan(): Promise<CaptureResult> {
  let scanner: typeof import('react-native-document-scanner-plugin');
  try {
    // Lazy: the native module is absent in Expo Go / on web.
    scanner = await import('react-native-document-scanner-plugin');
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const res = await scanner.default.scanDocument({
      maxNumDocuments: 1,
      croppedImageQuality: 100,
      responseType: scanner.ResponseType.ImageFilePath,
    });
    if (res.status === scanner.ScanDocumentResponseStatus.Cancel) return { ok: false, reason: 'cancelled' };
    const first = res.scannedImages?.[0];
    if (!first) return { ok: false, reason: 'failed' };
    return { ok: true, uri: toFileUri(first) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/permission|denied/i.test(msg)) return { ok: false, reason: 'permission' };
    // e.g. no Google Play Services (the ML Kit scanner), or the native module isn't linked
    if (/play services|not available|unavailable|not linked|turbomodule|could not find|cannot find|invariant/i.test(msg)) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: false, reason: 'failed' };
  }
}

async function pick(mode: 'camera' | 'library'): Promise<CaptureResult> {
  try {
    if (mode === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'permission' };
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 };
    const res =
      mode === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (res.canceled) return { ok: false, reason: 'cancelled' };
    const asset = res.assets[0];
    if (!asset) return { ok: false, reason: 'failed' };
    return { ok: true, uri: await normalise(asset.uri, { width: asset.width, height: asset.height }, true) };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function captureReceipt(mode: CaptureMode): Promise<CaptureResult> {
  if (mode === 'scan') {
    const r = await scan();
    if (!r.ok) return r;
    try {
      // Scanner output is already cropped upright JPEG; only a very large one needs downscaling. Size via manipulator.
      const ref = await ImageManipulator.manipulate(r.uri).renderAsync();
      return { ok: true, uri: await normalise(r.uri, { width: ref.width, height: ref.height }, false) };
    } catch {
      return r;
    }
  }
  return pick(mode);
}
