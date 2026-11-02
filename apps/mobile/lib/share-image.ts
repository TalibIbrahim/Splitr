/**
 * Share the bill as a Table Talk card image (docs/phase4-spec.md section 2).
 * The card view is mounted offscreen by the screen; this captures it as a PNG and opens the share sheet.
 * On any failure it falls back to the plain-text share (D10).
 */
import type { RefObject } from 'react';
import type { CardView } from '../components/share/ShareCard';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { BillBreakdown, Paisa } from '@splitr/calculation-engine';
import type { Bill } from '@splitr/shared-types';
import { formatBillDate } from './format-date';
import { isTransferMarkedPaid } from './payments';
import { shareBill } from './share';

/** Output image size in pixels (4:5). */
export const SHARE_IMAGE = { width: 1080, height: 1350 } as const;

export interface ShareCardModel {
  restaurant: string;
  dateLabel: string;
  total: Paisa;
  rows: { id: string; name: string; amount: Paisa; isMe: boolean; paid: boolean }[];
  /** Transfers grouped by the person being paid. */
  payBlocks: { to: string; lines: { from: string; amount: Paisa; paid: boolean }[] }[];
}

/** Pure mapping from a bill and its breakdown to what the card shows. */
export function buildShareCardModel(bill: Bill, breakdown: BillBreakdown): ShareCardModel {
  const nameOf = (id: string): string => bill.participants.find((p) => p.id === id)?.displayName ?? id;
  const payerIds = new Set(bill.contributions.filter((c) => c.amount > 0).map((c) => c.participantId));
  const rows = breakdown.participants.map((p) => ({
    id: p.participantId,
    name: nameOf(p.participantId),
    amount: p.roundedTotal,
    isMe: p.participantId === bill.meParticipantId,
    paid: payerIds.has(p.participantId),
  }));

  const blocks: ShareCardModel['payBlocks'] = [];
  for (const t of breakdown.settlement?.transfers ?? []) {
    let block = blocks.find((b) => b.to === nameOf(t.to));
    if (!block) {
      block = { to: nameOf(t.to), lines: [] };
      blocks.push(block);
    }
    block.lines.push({ from: nameOf(t.from), amount: t.amount, paid: isTransferMarkedPaid(bill.transferStatuses, t) });
  }

  return {
    restaurant: bill.restaurantName,
    dateLabel: formatBillDate(bill.date),
    total: breakdown.roundedTotal,
    rows,
    payBlocks: blocks,
  };
}

/** Captures the mounted card and shares it as an image. Falls back to the text share on any failure. */
export async function shareBillImage(
  cardRef: RefObject<CardView | null>,
  bill: Bill,
  breakdown: BillBreakdown,
): Promise<void> {
  try {
    if (!cardRef.current || !(await Sharing.isAvailableAsync())) throw new Error('image sharing unavailable');
    const uri = await captureRef(cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: SHARE_IMAGE.width,
      height: SHARE_IMAGE.height,
    });
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: `${bill.restaurantName} split`,
    });
  } catch {
    await shareBill(bill, breakdown);
  }
}
