import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { ChevronDown, ChevronUp, Info, Plus, ScanLine, ZoomIn } from 'lucide-react-native';
import { toPaisa } from '@splitr/calculation-engine';
import { draftChecks, draftToBillPatch } from '@splitr/bill-domain';
import type { Bill, DraftCharge, ReceiptDraft } from '@splitr/shared-types';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { splitrStore } from '../../../store';
import { formatBillDate } from '../../../lib/format-date';
import { formatBp } from '../../../lib/percent';
import { sumLineTotals } from '../../../lib/sums';
import { Button, Card, ModalSheet, Money, StickyAction } from '../../../components/ui';
import { EmptyState } from '../../../components/bill';
import { FlowScreen } from '../../../components/bill/flow/FlowScreen';
import { ToggleRow } from '../../../components/bill/flow/ToggleRow';
import { CheckPill } from '../../../components/bill/flow/CheckPill';
import { PaymentChoice, type PayChoice } from '../../../components/bill/flow/PaymentChoice';
import { TableChips } from '../../../components/bill/flow/TableChips';
import { DraftItemRow } from '../../../components/bill/flow/DraftItemRow';
import { ReceiptViewer } from '../../../components/bill/flow/ReceiptViewer';
import { adjustmentSummary } from '../../../components/bill/flow/adjustmentText';
import { BillNotFound, useBillRoute } from '../../../components/bill/flow/BillGate';
import { billHref } from '../../../components/bill/flow/nav';
import {
  blankRow,
  rowFromItem,
  rowValid,
  workingDraft,
  type DraftRow,
} from '../../../components/bill/flow/draftRows';

export default function ReviewScreen() {
  const { id, bill } = useBillRoute();
  const router = useRouter();
  if (!bill) return <BillNotFound />;
  const draft = bill.receipt?.draft;
  if (!bill.receipt || !draft) {
    return (
      <EmptyState
        icon={ScanLine}
        title="Nothing to review"
        body="There is no scanned receipt waiting on this bill."
        action={{ label: 'Back to items', onPress: () => router.replace(billHref(id, 'items')) }}
      />
    );
  }
  return <ReviewBody id={id} bill={bill} draft={draft} imageUri={bill.receipt.imageUri} moreUris={bill.receipt.moreImageUris ?? []} />;
}

const CHARGE_WORD: Record<DraftCharge['kind'], string> = {
  discount: 'Discount',
  tax: 'Tax',
  service: 'Service charge',
  tip: 'Tip',
  fee: 'Fee',
};

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="font-brico-extrabold text-item-name text-ink">
      {children}
    </Text>
  );
}

function ReviewBody({
  id,
  bill,
  draft,
  imageUri,
  moreUris,
}: {
  id: string;
  bill: Bill;
  draft: ReceiptDraft;
  imageUri: string;
  moreUris: readonly string[];
}) {
  const router = useRouter();
  const { colors } = useTheme();

  const keyCount = useRef(0);
  const nextKey = () => `row-${keyCount.current++}`;
  const [rows, setRows] = useState<DraftRow[]>(() => draft.items.map((it) => rowFromItem(nextKey(), it)));
  const [unparsed, setUnparsed] = useState<string[]>(() => [...draft.unparsedRows]);
  const [unparsedOpen, setUnparsedOpen] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [askMode, setAskMode] = useState(false);

  const billName = bill.restaurantName.trim();
  const nameBlank = billName.length === 0 || billName === 'Untitled bill';
  const suggestName = draft.restaurantName && draft.restaurantName !== billName && !nameBlank ? draft.restaurantName : null;
  const suggestDate = draft.date && draft.date !== bill.date ? draft.date : null;
  const [useName, setUseName] = useState(false);
  const [useDate, setUseDate] = useState(false);

  const update = (key: string, patch: Partial<Pick<DraftRow, 'name' | 'qty' | 'amount'>>) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch, touched: true } : r)));
  const remove = (key: string) => setRows((cur) => cur.filter((r) => r.key !== key));
  const addRow = (name = '') => setRows((cur) => [...cur, blankRow(nextKey(), name)]);
  const addFromUnparsed = (text: string) => {
    addRow(text);
    setUnparsed((cur) => cur.filter((t) => t !== text));
  };

  const working = useMemo(() => workingDraft(draft, rows), [draft, rows]);
  const invalid = rows.filter((r) => !rowValid(r)).length;
  const lowLeft = rows.filter((r) => r.src?.confidence === 'low' && !r.touched).length;

  const [paidWith, setPaidWith] = useState<PayChoice>(draft.paidWith ?? 'card');
  const variants = draft.variants;
  // Follows the user's edits and the Card/Cash choice (phase2b §2.1).
  const checks = useMemo(() => draftChecks(working, paidWith), [working, paidWith]);

  // Preview of how charges will be applied. Ids are throwaway; the real patch is built on Apply.
  const preview = useMemo(() => {
    let n = 0;
    return draftToBillPatch(working, () => `preview-${n++}`, { paidWith });
  }, [working, paidWith]);

  const hasItems = bill.items.length > 0;
  const subtotalCheck = checks.find((c) => c.kind === 'items-vs-subtotal');
  const totalCheck = checks.find((c) => c.kind === 'summary-vs-total');

  const apply = (replaceItems: boolean) => {
    const patch = draftToBillPatch(working, randomUUID, { paidWith });
    const name = nameBlank ? draft.restaurantName : useName ? suggestName : undefined;
    splitrStore.getState().applyDraft(id, patch, {
      replaceItems,
      ...(name ? { restaurantName: name } : {}),
      ...(useDate && suggestDate ? { date: suggestDate } : {}),
    });
    // The draft has been used: clear it so Items does not offer to apply it a second time.
    splitrStore.getState().attachReceipt(id, { imageUri, draft: null });
    setAskMode(false);
    router.replace(billHref(id, 'assign'));
  };

  const onUse = () => {
    if (hasItems) setAskMode(true);
    else apply(true);
  };

  const hint =
    rows.length === 0
      ? 'Add at least one item to continue'
      : invalid > 0
        ? invalid === 1
          ? 'Fix the item marked above to continue'
          : `Fix the ${invalid} items marked above to continue`
        : null;

  return (
    <FlowScreen
      footer={
        <View>
          {hint ? (
            <Text className="px-4 pt-2 text-center font-brico-semibold text-meta text-muted">{hint}</Text>
          ) : null}
          <StickyAction
            label="Use these items"
            accessibilityLabel="Use these items and go to assigning them"
            disabled={rows.length === 0 || invalid > 0}
            onPress={onUse}
          />
        </View>
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 px-4 pb-6 pt-3"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
            Review scan
          </Text>
          <Text className="font-brico-medium text-body text-muted">
            This is what we read. Fix anything that looks wrong. Nothing is added to the bill until you continue.
          </Text>
        </View>

        <TableChips bill={bill} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View the receipt photo full screen"
          onPress={() => setViewer(true)}
          style={{ minHeight: sizes.minTouch }}
          className="overflow-hidden rounded-card bg-surface-2 active:opacity-pressed"
        >
          <Image source={{ uri: imageUri }} resizeMode="cover" accessibilityIgnoresInvertColors className="h-24 w-full" />
          <View className="flex-row items-center gap-2 px-4 py-2">
            <ZoomIn size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="font-brico-bold text-body-small text-ink">{moreUris.length > 0 ? `Tap to view all ${moreUris.length + 1} photos` : 'Tap to view full size'}</Text>
          </View>
        </Pressable>

        {nameBlank && draft.restaurantName ? (
          <Card tone="surface2">
            <Text className="font-brico-semibold text-meta text-muted">Restaurant, from the receipt</Text>
            <Text className="font-brico-bold text-item-name text-ink">{draft.restaurantName}</Text>
          </Card>
        ) : null}
        {!nameBlank && suggestName ? (
          <ToggleRow
            title={`Use the name ${suggestName}`}
            subtitle={`Instead of ${billName}`}
            on={useName}
            onChange={setUseName}
          />
        ) : null}
        {suggestDate ? (
          <ToggleRow
            title={`Use the date ${formatBillDate(suggestDate)}`}
            subtitle={`Instead of ${formatBillDate(bill.date)}`}
            on={useDate}
            onChange={setUseDate}
          />
        ) : null}

        {draft.taxInclusive ? (
          <View className="flex-row items-start gap-2 rounded-button bg-chip p-3">
            <Info size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
            <Text className="flex-1 font-brico-bold text-body-small text-ink">
              Prices already include tax. The tax shown is for information and is not added again.
            </Text>
          </View>
        ) : null}

        <View className="gap-2">
          <SectionTitle>Checks</SectionTitle>
          {subtotalCheck ? (
            <CheckPill
              ok={subtotalCheck.ok}
              okText="Items add up to the subtotal"
              prefix="Items are"
              suffix="the subtotal"
              difference={subtotalCheck.difference}
            />
          ) : null}
          {totalCheck ? (
            <CheckPill
              ok={totalCheck.ok}
              okText="Items and charges add up to the total"
              prefix="Items and charges are"
              suffix="the total"
              difference={totalCheck.difference}
            />
          ) : null}
          {!subtotalCheck && !totalCheck ? (
            <Text className="font-brico-medium text-body-small text-muted">
              No subtotal or total was found on the receipt, so there is nothing to check against.
            </Text>
          ) : null}
        </View>

        {variants ? (
          <PaymentChoice
            value={paidWith}
            onChange={setPaidWith}
            totals={{ card: variants.card?.printedTotal, cash: variants.cash?.printedTotal }}
          />
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-2">
              <SectionTitle>Items</SectionTitle>
              {lowLeft > 0 ? (
                <View
                  accessible
                  accessibilityLabel={lowLeft === 1 ? '1 item to check' : `${lowLeft} items to check`}
                  className="rounded-pill bg-accent px-2 py-0.5"
                >
                  <Text className="font-brico-extrabold text-meta text-on-accent">{`${lowLeft} to check`}</Text>
                </View>
              ) : null}
            </View>
            <Money amount={sumLineTotals(working.items)} variant="item" />
          </View>
          {rows.map((r) => (
            <DraftItemRow key={r.key} row={r} onChange={(p) => update(r.key, p)} onDelete={() => remove(r.key)} />
          ))}
          <Button
            label="Add item"
            accessibilityLabel="Add an item the scan missed"
            icon={Plus}
            variant="outline"
            fullWidth
            onPress={() => addRow()}
          />
        </View>

        {draft.charges.length > 0 ? (
          <View className="gap-2">
            <SectionTitle>Charges</SectionTitle>
            {draft.charges.map((c, i) => (
              <Card key={`${c.sourceText}-${i}`} tone="surface2" className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-brico-bold text-item-name text-ink">{c.label || CHARGE_WORD[c.kind]}</Text>
                  <Text className="font-brico-semibold text-meta text-muted">
                    {CHARGE_WORD[c.kind]}
                    {c.rateBp !== undefined ? `, ${formatBp(c.rateBp)}%` : ''}
                    {c.informational ? ', already in the prices' : ''}
                  </Text>
                </View>
                <Money amount={toPaisa(c.amount)} variant="item" />
              </Card>
            ))}
            <Text className="font-brico-semibold text-meta text-muted">How these will be applied</Text>
            {preview.adjustments.map((a) => {
              const s = adjustmentSummary(a);
              return (
                <Text key={a.id} className="font-brico-medium text-body-small text-ink">
                  {`${s.title}: ${s.note}`}
                </Text>
              );
            })}
            {preview.notes.map((n, i) => (
              <View key={i} className="flex-row items-start gap-2">
                <Info size={sizes.icon.sm} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
                <Text className="flex-1 font-brico-medium text-body-small text-ink">{n}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {unparsed.length > 0 ? (
          <View className="gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Lines we could not place, ${unparsed.length}. ${unparsedOpen ? 'Collapse' : 'Expand'}`}
              accessibilityState={{ expanded: unparsedOpen }}
              onPress={() => setUnparsedOpen((o) => !o)}
              style={{ minHeight: sizes.minTouch }}
              className="flex-row items-center justify-between gap-2 active:opacity-pressed"
            >
              <Text className="flex-1 font-brico-extrabold text-item-name text-ink">
                {`Lines we couldn't place (${unparsed.length})`}
              </Text>
              {unparsedOpen ? (
                <ChevronUp size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              ) : (
                <ChevronDown size={sizes.icon.md} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
              )}
            </Pressable>
            {unparsedOpen
              ? unparsed.map((t, i) => (
                  <Card key={`${t}-${i}`} tone="surface2" className="gap-2">
                    <Text className="font-brico-medium text-body text-ink">{t}</Text>
                    <Button
                      label="Add as item"
                      accessibilityLabel={`Add "${t}" as an item`}
                      icon={Plus}
                      variant="outline"
                      onPress={() => addFromUnparsed(t)}
                    />
                  </Card>
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      <ReceiptViewer uris={[imageUri, ...moreUris]} visible={viewer} onClose={() => setViewer(false)} />

      <ModalSheet
        visible={askMode}
        onClose={() => setAskMode(false)}
        title="This bill already has items"
        closeLabel="Close without applying"
      >
        <View className="gap-3">
          <Text className="font-brico-medium text-body text-muted">
            {bill.items.length === 1
              ? 'There is 1 item on the bill. Replace it with the scan, or add the scan to it?'
              : `There are ${bill.items.length} items on the bill. Replace them with the scan, or add the scan to them?`}
          </Text>
          <Button
            label="Add to existing"
            accessibilityLabel="Add the scanned items to the existing items"
            size="lg"
            fullWidth
            onPress={() => apply(false)}
          />
          <Button
            label="Replace"
            accessibilityLabel="Replace the existing items with the scanned items"
            variant="destructive"
            size="lg"
            fullWidth
            onPress={() => apply(true)}
          />
        </View>
      </ModalSheet>
    </FlowScreen>
  );
}
