import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileQuestion } from 'lucide-react-native';
import type { Bill } from '@splitr/shared-types';
import { selectBill, useSplitr } from '../../../store';
import { EmptyState } from '../EmptyState';
import { HOME_HREF } from './nav';

/** Route param + live (not deleted) bill. */
export function useBillRoute(): { id: string; bill: Bill | undefined } {
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = typeof id === 'string' ? id : '';
  const bill = useSplitr(selectBill(billId));
  return { id: billId, bill: bill && !bill.deletedAt ? bill : undefined };
}

export function BillNotFound() {
  const router = useRouter();
  return (
    <EmptyState
      icon={FileQuestion}
      title="Bill not found"
      body="This bill was deleted or never existed."
      action={{ label: 'Back to Home', accessibilityLabel: 'Back to Home', onPress: () => router.replace(HOME_HREF) }}
    />
  );
}
