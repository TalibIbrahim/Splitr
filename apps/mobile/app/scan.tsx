import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { selectGroups, selectLatestGroup, selectPeople, splitrStore } from '../store';
import { href } from '../lib/routes';
import { announce } from '../lib/a11y';
import { todayIso } from '../lib/date';
import { HOME_HREF, billHref } from '../components/bill/flow/nav';
import { ScanStatus } from '../components/bill/flow/ScanStatus';
import { useReceiptScan } from '../components/bill/flow/useReceiptScan';

/**
 * Quick scan (docs/phase2b-spec.md U1): capture first, and only once a photo exists create the bill
 * (latest crew's members, or just me), then OCR, parse and open Review. A cancelled capture creates nothing.
 */
export default function QuickScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const billId = useRef<string | null>(null);
  const handedOff = useRef(false);
  const seenBusy = useRef(false);
  const started = useRef(false);

  const leaving = useRef(false);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (router.canGoBack()) router.back();
    else router.replace(HOME_HREF);
  }, [router]);

  const ensureBill = useCallback(() => {
    if (billId.current) return billId.current;
    const st = splitrStore.getState();
    const people = selectPeople()(st);
    const groups = selectGroups()(st);
    const group =
      typeof params.groupId === 'string'
        ? groups.find((g) => g.id === params.groupId)
        : selectLatestGroup()(st);
    const me = people.find((p) => p.isMe);
    const ids = new Set<string>();
    if (me) ids.add(me.id);
    for (const id of group?.memberIds ?? []) if (people.some((p) => p.id === id)) ids.add(id);
    billId.current = st.createBill({
      groupId: group?.id ?? null,
      restaurantName: 'Untitled bill',
      date: todayIso(),
      participantPersonIds: [...ids],
      guests: [],
    });
    return billId.current;
  }, [params.groupId]);

  const onDone = useCallback(
    (id: string) => {
      handedOff.current = true;
      router.replace(billHref(id, 'review'));
    },
    [router],
  );

  const scan = useReceiptScan({ ensureBill, onDone });

  // Never leave an orphan bill behind.
  useEffect(
    () => () => {
      if (billId.current && !handedOff.current) splitrStore.getState().deleteBill(billId.current);
    },
    [],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void scan.start('scan');
  }, [scan]);

  // Cancelled capture: working -> idle without a hand-off. Nothing was created, so just close.
  useEffect(() => {
    if (scan.state.kind !== 'idle') {
      seenBusy.current = true;
      return;
    }
    if (seenBusy.current && !handedOff.current) leave();
  }, [scan.state.kind, leave]);

  useEffect(() => {
    if (scan.state.kind === 'working') announce('Reading the receipt');
  }, [scan.state.kind]);

  const typeItIn = () => {
    const id = billId.current;
    handedOff.current = true;
    scan.reset();
    if (id) {
      router.replace(billHref(id, 'items'));
    } else {
      router.replace(href('/bill/new'));
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      {scan.state.kind === 'idle' ? (
        <View className="flex-1" />
      ) : (
        <ScanStatus
          state={scan.state}
          onRetry={() => void scan.retry()}
          onStart={(m) => void scan.start(m)}
          onTypeItIn={typeItIn}
          onBack={() => {
            scan.reset();
            leave();
          }}
        />
      )}
    </SafeAreaView>
  );
}
