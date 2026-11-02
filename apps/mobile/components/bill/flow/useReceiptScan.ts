import { useCallback, useRef, useState } from 'react';
import { parseReceipt } from '@splitr/receipt-parser';
import { splitrStore } from '../../../store';
import { captureReceipt } from '../../../lib/capture';
import { recognizeReceipt } from '../../../lib/ocr';
import { saveReceiptImage } from '../../../lib/receipt-files';

export type ScanMode = 'scan' | 'camera' | 'library';

export type ScanState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'failed' }
  /** The document scanner is not available on this device. */
  | { kind: 'unavailable' }
  /** Camera permission was denied. */
  | { kind: 'permission' };

interface Options {
  /** Returns the bill to attach the scan to. Called once a photo was captured, so a cancelled capture leaves no bill. */
  ensureBill: () => string;
  /** Called with the bill id when the draft is attached. */
  onDone: (billId: string) => void;
}

/**
 * Capture, save image, OCR, parse, attach. Orchestration only: parsing and money logic live in the packages.
 * Retry after an OCR failure reuses the saved image instead of asking for another photo.
 */
export function useReceiptScan({ ensureBill, onDone }: Options) {
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const lastMode = useRef<ScanMode>('scan');
  const saved = useRef<{ billId: string; uri: string } | null>(null);

  const recognize = useCallback(
    async (billId: string, uri: string) => {
      const r = await recognizeReceipt(uri);
      if (!r.ok) {
        setState({ kind: r.reason === 'unavailable' ? 'unavailable' : 'failed' });
        return;
      }
      const draft = parseReceipt(r.ocr);
      splitrStore.getState().attachReceipt(billId, { imageUri: uri, draft });
      saved.current = null;
      setState({ kind: 'idle' });
      onDone(billId);
    },
    [onDone],
  );

  const start = useCallback(
    async (mode: ScanMode) => {
      lastMode.current = mode;
      saved.current = null;
      setState({ kind: 'working' });
      try {
        const cap = await captureReceipt(mode);
        if (!cap.ok) {
          if (cap.reason === 'cancelled') setState({ kind: 'idle' });
          else if (cap.reason === 'permission') setState({ kind: 'permission' });
          else if (cap.reason === 'unavailable') setState({ kind: 'unavailable' });
          else setState({ kind: 'failed' });
          return;
        }
        const billId = ensureBill();
        const uri = await saveReceiptImage(billId, cap.uri);
        saved.current = { billId, uri };
        await recognize(billId, uri);
      } catch {
        setState({ kind: 'failed' });
      }
    },
    [ensureBill, recognize],
  );

  const retry = useCallback(async () => {
    const s = saved.current;
    if (!s) {
      await start(lastMode.current);
      return;
    }
    setState({ kind: 'working' });
    try {
      await recognize(s.billId, s.uri);
    } catch {
      setState({ kind: 'failed' });
    }
  }, [recognize, start]);

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, start, retry, reset };
}
