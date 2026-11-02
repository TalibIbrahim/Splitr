/**
 * Sharing a bill as plain text (D10). The only "network" use is the whatsapp:// deep link.
 */
import { Linking, Platform, Share } from 'react-native';
import type { BillBreakdown, Paisa } from '@splitr/calculation-engine';
import { shareSummary } from '@splitr/bill-domain';
import type { Bill } from '@splitr/shared-types';
import { formatMoney } from './format-money';

export function buildShareText(bill: Bill, breakdown: BillBreakdown): string {
  return shareSummary(bill, breakdown, { formatMoney: (p: Paisa) => formatMoney(p) });
}

/** Opens the system share sheet with the bill text. */
export async function shareBill(bill: Bill, breakdown: BillBreakdown): Promise<void> {
  await Share.share({ message: buildShareText(bill, breakdown) });
}

/**
 * Opens WhatsApp with the text prefilled; falls back to the system share sheet when WhatsApp is not installed.
 * iOS: canOpenURL (needs LSApplicationQueriesSchemes). Android 11+: canOpenURL is unreliable without a manifest
 * <queries> entry (not expressible in plain app.json), so we just try openURL and fall back on failure.
 */
export async function shareToWhatsApp(bill: Bill, breakdown: BillBreakdown): Promise<void> {
  const text = buildShareText(bill, breakdown);
  const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
  try {
    if (Platform.OS === 'ios' && !(await Linking.canOpenURL('whatsapp://send'))) {
      await Share.share({ message: text });
      return;
    }
    await Linking.openURL(url);
  } catch {
    await Share.share({ message: text });
  }
}
