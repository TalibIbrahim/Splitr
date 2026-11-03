import { useRouter } from 'expo-router';
import { href } from '../lib/routes';
import { selectBill, selectBillSummary, useSplitr } from '../store';
import { BillListRow } from './bill';
import { formatBillDate } from '../lib/format-date';

/** Where a bill opens: finished states go to the breakdown, everything else back to assigning. */
export function useOpenBill(): (id: string, state: string | undefined) => void {
  const router = useRouter();
  return (id, state) => {
    const done = state === 'ready' || state === 'reconciled' || state === 'settled';
    router.push(href(done ? `/bill/${id}/breakdown` : `/bill/${id}/assign`));
  };
}

/** A BillListRow fed entirely from store selectors. */
export function ConnectedBillRow({ billId, onLongPress, hideChevron }: { billId: string; onLongPress?: () => void; hideChevron?: boolean }) {
  const bill = useSplitr(selectBill(billId));
  const summary = useSplitr(selectBillSummary(billId));
  const open = useOpenBill();
  if (!bill || !summary) return null;

  const { state, roundedTotal: total } = summary;
  const left = state === 'unassigned' && summary.needsAttentionCount > 0 ? `${summary.needsAttentionCount} left` : undefined;

  return (
    <BillListRow
      restaurant={bill.restaurantName || 'Untitled bill'}
      date={formatBillDate(bill.date)}
      {...(total !== null ? { total } : {})}
      state={state}
      stateDetail={left}
      onPress={() => open(billId, state)}
      onLongPress={onLongPress}
      hideChevron={hideChevron}
    />
  );
}
