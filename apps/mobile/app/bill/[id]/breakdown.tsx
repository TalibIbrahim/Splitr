import { useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FileQuestion, Info, ReceiptText } from 'lucide-react-native';
import type { BillBreakdown, Paisa } from '@splitr/calculation-engine';
import { explainParticipant, explainSettled } from '@splitr/bill-domain';
import type { Bill } from '@splitr/shared-types';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { announce } from '../../../lib/a11y';
import {
  selectAllOffers,
  selectBill,
  selectBillState,
  selectNotice,
  selectResult,
  useSplitr,
} from '../../../store';
import { formatMoney } from '../../../lib/format-money';
import { offerNameFor } from '../../../lib/offer-text';
import { cardSaving, isTransferMarkedPaid } from '../../../lib/payments';
import { shareBill, shareToWhatsApp } from '../../../lib/share';
import { buildShareCardModel, shareBillImage } from '../../../lib/share-image';
import { ShareCard, type CardView } from '../../../components/share/ShareCard';
import {
  EmptyState,
  HowYouGotThere,
  PersonCard,
  StatePill,
  TransferRow,
  type PersonTag,
} from '../../../components/bill';
import { Button, Money, Pill } from '../../../components/ui';
import { describeIssues, IssueList, type FixTarget } from '../../../components/bill/breakdown/IssueList';
import { NoticeBanner } from '../../../components/bill/breakdown/NoticeBanner';
import { ReadOnlyTransfer } from '../../../components/bill/breakdown/ReadOnlyTransfer';
import { ShareSheet } from '../../../components/bill/breakdown/ShareSheet';
import { SplitPaymentSheet } from '../../../components/bill/breakdown/SplitPaymentSheet';
import { WhoPaid } from '../../../components/bill/breakdown/WhoPaid';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2026-11-02T10:00:00Z" -> "2 Nov" (string parsing only). */
function shortDate(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const [, m, d] = iso.slice(0, 10).split('-');
  const month = MONTHS[Number(m) - 1];
  return month && d ? `${Number(d)} ${month}` : undefined;
}

// D9b: the on-demand recalculation for a settled bill, cached per bill object so re-renders don't re-run the engine.
const settledExplainCache = new WeakMap<Bill, ReturnType<typeof explainSettled>>();
function settledExplain(bill: Bill): ReturnType<typeof explainSettled> {
  let e = settledExplainCache.get(bill);
  if (!e) {
    e = explainSettled(bill);
    settledExplainCache.set(bill, e);
  }
  return e;
}

/** The breakdown whose trace drives the step-by-step: the recalculated one for a settled bill, else the live one. */
function settledSteps(bill: Bill, breakdown: BillBreakdown, settled: boolean): BillBreakdown {
  if (!settled) return breakdown;
  const ex = settledExplain(bill);
  return ex.kind === 'steps' ? ex.breakdown : breakdown;
}

export default function BreakdownScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? (rawId[0] ?? '') : (rawId ?? '');
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const bill = useSplitr(selectBill(id));
  // D9b: a settled bill never runs the engine here; its numbers come from finalSnapshot.
  const result = useSplitr((s) => (selectBill(id)(s)?.status === 'settled' ? undefined : selectResult(id)(s)));
  const billState = useSplitr(selectBillState(id));
  const allOffers = useSplitr(selectAllOffers());
  const notice = useSplitr(selectNotice());
  const dismissNotice = useSplitr((s) => s.dismissNotice);
  const setContributions = useSplitr((s) => s.setContributions);
  const setTransferPaid = useSplitr((s) => s.setTransferPaid);
  const settle = useSplitr((s) => s.settle);
  const reopen = useSplitr((s) => s.reopen);

  const [selected, setSelected] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const cardRef = useRef<CardView>(null);

  const go = (target: 'items' | 'assign' | 'charges'): void => {
    router.push(`/bill/${id}/${target}` as Href);
  };

  if (!bill || (bill.deletedAt ?? null) !== null) {
    return (
      <View className="flex-1 justify-center bg-bg">
        <EmptyState
          icon={FileQuestion}
          title="Bill not found"
          body="It may have been deleted. Head back to your bills."
          action={{ label: 'Go home', onPress: () => router.replace('/' as Href) }}
        />
      </View>
    );
  }

  const settled = bill.status === 'settled';
  const breakdown: BillBreakdown | null = settled ? bill.finalSnapshot : result?.ok ? result.breakdown : null;
  const meId = bill.meParticipantId;
  const nameOf = (pid: string): string => bill.participants.find((p) => p.id === pid)?.displayName ?? pid;

  // --- No usable breakdown: guidance --------------------------------------------------------
  if (!breakdown) {
    const errors = result && !result.ok ? result.errors.filter((e) => e.severity === 'error') : [];
    const issues = describeIssues(errors);
    const mismatch = errors.find((e) => e.code === 'TOTAL_MISMATCH');
    const off = mismatch?.difference ?? 0;
    const onFix = (t: FixTarget): void => {
      if (t === 'contributions') setContributions(id, []);
      else go(t);
    };
    return (
      <ScrollView className="flex-1 bg-bg" contentContainerClassName="gap-4 p-4 pb-10">
        {billState ? (
          <StatePill
            state={billState === 'settled' ? 'needs-review' : billState}
            {...(mismatch ? { detail: `Doesn't match: off by ${formatMoney(off < 0 ? -off : off)}` } : {})}
          />
        ) : null}
        {issues.length > 0 ? (
          <>
            <Text className="font-brico-extrabold text-screen-title text-ink">Fix these to see the split</Text>
            <IssueList issues={issues} onFix={onFix} />
          </>
        ) : (
          <EmptyState
            icon={ReceiptText}
            title="Nothing to split yet"
            body="Add the items from the receipt and say who had what."
            action={{ label: 'Add items', onPress: () => go('items') }}
          />
        )}
      </ScrollView>
    );
  }

  // --- A usable breakdown ------------------------------------------------------------------
  const transfers = breakdown.settlement?.transfers ?? [];
  const contributions = bill.contributions;
  const payerIds = new Set(contributions.filter((c) => c.amount > 0).map((c) => c.participantId));
  const selectedId =
    selected && breakdown.participants.some((p) => p.participantId === selected)
      ? selected
      : (meId ?? breakdown.participants[0]?.participantId ?? '');
  const selectedShare = breakdown.participants.find((p) => p.participantId === selectedId);
  const saving = cardSaving(breakdown.adjustments);
  const savingOffer = offerNameFor(
    breakdown.adjustments.filter((a) => a.kind === 'discount' && a.amount < 0).map((a) => a.label),
    allOffers,
  );
  const isPaid = (t: { from: string; to: string; amount: number }): boolean =>
    isTransferMarkedPaid(bill.transferStatuses, t);

  const myTransfers = meId ? transfers.filter((t) => t.from === meId) : [];
  const myUnpaid = myTransfers.filter((t) => !isPaid(t));
  const everythingPaid = result?.ok === true && breakdown.settlement !== null && transfers.every(isPaid);

  const tagFor = (pid: string): PersonTag => (payerIds.has(pid) ? 'paid' : pid === meId ? 'owe' : 'owes');

  const printedTotalMissing = !settled && bill.printedTotal === undefined;

  const markMyPaymentsPaid = (): void => {
    for (const t of myUnpaid) setTransferPaid(id, t.from, t.to, true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    announce("Marked your payments as paid");
  };

  const markSettled = (): void => {
    const r = settle(id);
    if (r.ok) {
      announce('Bill marked settled');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      announce("Can't settle yet. Every payment needs to be marked paid first.");
      Alert.alert("Can't settle yet", 'Every payment needs to be marked paid first.');
    }
  };

  const confirmReopen = (): void => {
    Alert.alert('Reopen this bill?', 'You can edit it again. Settled status and the frozen split are removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reopen', style: 'destructive', onPress: () => reopen(id) },
    ]);
  };

  const share = (how: 'image' | 'whatsapp' | 'more'): void => {
    setShareOpen(false);
    const job =
      how === 'image'
        ? shareBillImage(cardRef, bill, breakdown)
        : how === 'whatsapp'
          ? shareToWhatsApp(bill, breakdown)
          : shareBill(bill, breakdown);
    void job.catch(() => {});
  };

  // Primary action
  let primary: { label: string; a11y: string; onPress: () => void; disabled?: boolean };
  let hint: string | null = null;
  if (settled) {
    primary = { label: 'Reopen', a11y: 'Reopen this bill', onPress: confirmReopen };
  } else if (everythingPaid) {
    primary = { label: 'Mark settled', a11y: 'Mark this bill settled', onPress: markSettled };
  } else {
    primary = {
      label: "I've paid",
      a11y: myUnpaid.length > 0 ? 'Mark my payment as paid' : "I've paid, unavailable",
      onPress: markMyPaymentsPaid,
      disabled: myUnpaid.length === 0,
    };
    if (breakdown.settlement === null) hint = 'Pick who paid the bill to see who pays whom.';
    else if (!meId) hint = "You're not at this table.";
    else if (myTransfers.length === 0) hint = "You don't owe anything on this bill.";
    else if (myUnpaid.length === 0) hint = "You've paid your part. Waiting on the others.";
  }

  const payers = breakdown.participants.map((p) => ({
    id: p.participantId,
    name: nameOf(p.participantId),
    isMe: p.participantId === meId,
    paid: payerIds.has(p.participantId),
  }));
  const paidAmounts = contributions
    .filter((c) => c.amount > 0)
    .map((c) => ({ id: c.participantId, name: c.participantId === meId ? 'You' : nameOf(c.participantId), amount: c.amount }));

  return (
    <View className="flex-1 bg-bg">
      <ScrollView className="flex-1" contentContainerClassName="gap-5 p-4 pb-8">
        {/* Status */}
        {settled ? (
          <StatePill state="settled" {...(shortDate(bill.settledAt) ? { detail: shortDate(bill.settledAt) as string } : {})} />
        ) : (
          <View className="flex-row flex-wrap items-center gap-2">
            {printedTotalMissing ? <Pill tone="status" icon={Info} label="No receipt total" /> : null}
            {billState === 'reconciled' ? <StatePill state="reconciled" /> : null}
            {printedTotalMissing ? (
              <Button
                label="Add it"
                variant="outline"
                accessibilityLabel="Add the total printed on the receipt"
                onPress={() => go('charges')}
              />
            ) : null}
          </View>
        )}

        {!settled && notice && notice.billId === id ? (
          <NoticeBanner count={notice.count} onDismiss={dismissNotice} />
        ) : null}

        {/* Hero total */}
        <View className="gap-1">
          <Text className="font-brico-semibold text-meta text-muted">Total</Text>
          <Money amount={breakdown.roundedTotal} variant="hero" />
          {saving > 0 ? (
            <View className="flex-row items-center gap-1">
              <Text className="font-brico-medium text-body text-ink">
                {savingOffer ? `The ${savingOffer} card saved the table` : 'The card saved the table'}
              </Text>
              <Money amount={saving as Paisa} variant="item" />
            </View>
          ) : null}
        </View>

        {/* People */}
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {breakdown.participants.map((p) => (
            <View key={p.participantId} style={{ width: '48.5%' }}>
              <PersonCard
                name={nameOf(p.participantId)}
                amount={p.roundedTotal}
                tag={tagFor(p.participantId)}
                isMe={p.participantId === meId}
                selected={p.participantId === selectedId}
                onPress={() => setSelected(p.participantId)}
              />
            </View>
          ))}
        </View>

        {/* How you got there */}
        {selectedShare ? (
          settled && settledExplain(bill).kind === 'snapshot-only' ? (
            <View className="gap-2">
              <Money amount={selectedShare.roundedTotal} variant="item" />
              <Text className="font-brico-medium text-body-small text-muted">
                Settled with an earlier version of Splitr, so the step-by-step isn't available
              </Text>
            </View>
          ) : (
            <HowYouGotThere
              key={selectedId}
              total={selectedShare.roundedTotal}
              lines={explainParticipant(settledSteps(bill, breakdown, settled), bill, selectedId)}
            />
          )
        ) : null}

        {/* Who paid */}
        {settled ? (
          paidAmounts.length > 0 ? (
            <View className="gap-1">
              <Text className="font-brico-extrabold text-item-name text-ink">Paid by</Text>
              {paidAmounts.map((p) => (
                <View key={p.id} className="flex-row items-center justify-between">
                  <Text className="font-brico-medium text-body-small text-ink">{p.name}</Text>
                  <Money amount={p.amount} variant="body" />
                </View>
              ))}
            </View>
          ) : null
        ) : (
          <WhoPaid
            payers={payers}
            paidAmounts={paidAmounts}
            onPick={(pid) => setContributions(id, [{ participantId: pid, amount: breakdown.total }])}
            onSplit={() => setSplitOpen(true)}
          />
        )}

        {/* Transfers */}
        {breakdown.settlement !== null ? (
          <View className="gap-1">
            <Text className="font-brico-extrabold text-item-name text-ink">Payments</Text>
            {transfers.length === 0 ? (
              <Text className="font-brico-medium text-body-small text-muted">Nobody owes anybody.</Text>
            ) : (
              transfers.map((t) =>
                settled ? (
                  <ReadOnlyTransfer
                    key={`${t.from}-${t.to}`}
                    from={nameOf(t.from)}
                    to={nameOf(t.to)}
                    amount={t.amount}
                    paid={isPaid(t)}
                  />
                ) : (
                  <TransferRow
                    key={`${t.from}-${t.to}`}
                    from={nameOf(t.from)}
                    to={nameOf(t.to)}
                    amount={t.amount}
                    paid={isPaid(t)}
                    onTogglePaid={() => setTransferPaid(id, t.from, t.to, !isPaid(t))}
                  />
                ),
              )
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom bar */}
      <View className="gap-2 border-t border-chip bg-bg px-4 pb-3 pt-3" style={{ paddingBottom: insets.bottom }}>
        {hint ? (
          <View className="flex-row items-center gap-2">
            <Info size={sizes.icon.sm} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="flex-1 font-brico-semibold text-meta text-muted">{hint}</Text>
          </View>
        ) : null}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label="Share"
              variant="outline"
              size="lg"
              fullWidth
              accessibilityLabel="Share this split"
              onPress={() => setShareOpen(true)}
            />
          </View>
          <View className="flex-1">
            <Button
              label={primary.label}
              size="lg"
              fullWidth
              accessibilityLabel={primary.a11y}
              onPress={primary.onPress}
              {...(primary.disabled ? { disabled: true } : {})}
            />
          </View>
        </View>
      </View>

      {/* Offscreen card that the Image share captures. Hidden from assistive tech and touches. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: -10000, top: 0 }}
      >
        <ShareCard model={buildShareCardModel(bill, breakdown)} captureRef={cardRef} />
      </View>

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onImage={() => share('image')}
        onWhatsApp={() => share('whatsapp')}
        onMore={() => share('more')}
      />
      {!settled ? (
        <SplitPaymentSheet
          visible={splitOpen}
          onClose={() => setSplitOpen(false)}
          total={breakdown.total}
          people={payers.map((p) => ({ id: p.id, name: p.name, isMe: p.isMe }))}
          initial={bill.contributions}
          onSave={(c) => {
            setContributions(id, c);
            setSplitOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
