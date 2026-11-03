import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  type ListRenderItem,
  type TextInputInstance,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus, Receipt, ScanLine, Trash2 } from 'lucide-react-native';
import type { Item } from '@splitr/calculation-engine';
import { parseRupees } from '@splitr/bill-domain';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { splitrStore, type RemovedItem } from '../../../store';
import { announce, useDismissDelay } from '../../../lib/a11y';
import { toRupeeInputText } from '../../../lib/format-money';
import { parseQty, sumLineTotals } from '../../../lib/sums';
import { Button, Card, ModalSheet, Money, StickyAction } from '../../../components/ui';
import { EmptyState } from '../../../components/bill';
import { AmountField, Field } from '../../../components/bill/flow/Field';
import { FlowScreen } from '../../../components/bill/flow/FlowScreen';
import { QtyControl } from '../../../components/bill/flow/QtyControl';
import { BillNotFound, useBillRoute } from '../../../components/bill/flow/BillGate';
import { billHref } from '../../../components/bill/flow/nav';
import { ScanStatus } from '../../../components/bill/flow/ScanStatus';
import { useReceiptScan } from '../../../components/bill/flow/useReceiptScan';
import { rupeesErrorText } from '../../../components/bill/flow/messages';

export default function ItemsScreen() {
  const { id, bill } = useBillRoute();
  if (!bill) return <BillNotFound />;
  return (
    <ItemsBody
      id={id}
      items={bill.items}
      printedTotal={bill.printedTotal}
      hasDraft={!!bill.receipt?.draft}
    />
  );
}

function ItemsBody({
  id,
  items,
  printedTotal,
  hasDraft,
}: {
  id: string;
  items: readonly Item[];
  printedTotal: Item['lineTotal'] | undefined;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const act = splitrStore.getState;

  const nameRef = useRef<TextInputInstance>(null);
  const amountRef = useRef<TextInputInstance>(null);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [amount, setAmount] = useState('');
  const [tried, setTried] = useState(false);

  const [editing, setEditing] = useState<Item | null>(null);
  const [removed, setRemoved] = useState<RemovedItem | null>(null);
  const [receiptText, setReceiptText] = useState(() =>
    printedTotal === undefined ? '' : toRupeeInputText(printedTotal),
  );

  const undoDelay = useDismissDelay(6000);
  useEffect(() => {
    if (!removed) return;
    announce(`Removed ${removed.item.name}. Undo available.`);
    const t = setTimeout(() => setRemoved(null), undoDelay);
    return () => clearTimeout(t);
  }, [removed, undoDelay]);

  const parsed = parseRupees(amount);
  const qtyN = parseQty(qty);
  const nameOk = name.trim().length > 0;
  const amountError = tried && !parsed.ok ? rupeesErrorText(parsed.reason) : undefined;
  const nameError = tried && !nameOk ? 'Give the item a name' : undefined;

  const add = () => {
    setTried(true);
    if (!nameOk || !parsed.ok || qtyN === null) {
      // First failure is announced by the field's own error; repeat failures re-announce here.
      if (tried)
        announce(
          !nameOk
            ? 'Give the item a name'
            : !parsed.ok
              ? rupeesErrorText(parsed.reason)
              : 'Check the quantity',
        );
      if (!nameOk) nameRef.current?.focus();
      else if (!parsed.ok) amountRef.current?.focus();
      return;
    }
    act().addItem(id, { name: name.trim(), quantity: qtyN, lineTotal: parsed.paisa });
    setName('');
    setQty('1');
    setAmount('');
    setTried(false);
    nameRef.current?.focus();
  };

  const remove = useCallback(
    (it: Item) => {
      setRemoved(splitrStore.getState().removeItem(id, it.id));
      setEditing(null);
    },
    [id],
  );
  const edit = useCallback((it: Item) => setEditing(it), []);
  const renderItem: ListRenderItem<Item> = useCallback(
    ({ item }) => (
      <View className="pb-2">
        <ItemRow item={item} onEdit={edit} onDelete={remove} />
      </View>
    ),
    [edit, remove],
  );
  const undo = () => {
    if (!removed) return;
    act().restoreItem(removed);
    setRemoved(null);
  };

  const ensureBill = useCallback(() => id, [id]);
  const onScanned = useCallback(() => router.push(billHref(id, 'review')), [router, id]);
  const scan = useReceiptScan({ ensureBill, onDone: onScanned });

  const receiptParsed = parseRupees(receiptText);
  const receiptError =
    receiptText.trim() !== '' && !receiptParsed.ok
      ? rupeesErrorText(receiptParsed.reason)
      : undefined;
  const onReceiptChange = (t: string) => {
    setReceiptText(t);
    const r = parseRupees(t);
    if (t.trim() === '') act().updateBillMeta(id, { printedTotal: null });
    else if (r.ok) act().updateBillMeta(id, { printedTotal: r.paisa });
  };

  if (scan.state.kind !== 'idle') {
    return (
      <ScanStatus
        state={scan.state}
        onRetry={() => void scan.retry()}
        onStart={(m) => void scan.start(m)}
        onTypeItIn={scan.reset}
        onBack={scan.reset}
      />
    );
  }

  return (
    <FlowScreen
      footer={
        <View>
          {removed ? (
            <View
              accessibilityLiveRegion="polite"
              className="mx-4 mt-2 flex-row items-center justify-between rounded-button bg-chip pl-4"
            >
              <Text
                numberOfLines={1}
                className="flex-1 font-brico-semibold text-body-small text-ink"
              >
                Removed {removed.item.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Undo removing ${removed.item.name}`}
                onPress={undo}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className="items-center justify-center px-4 active:opacity-pressed"
              >
                <Text className="font-brico-extrabold text-body text-ink">Undo</Text>
              </Pressable>
            </View>
          ) : null}
          {items.length === 0 ? (
            <Text className="px-4 pt-3 text-center font-brico-semibold text-meta text-muted">
              Add at least one item to continue
            </Text>
          ) : null}
          <StickyAction
            label="Next: assign"
            accessibilityLabel="Next: assign items to people"
            disabled={items.length === 0}
            onPress={() => router.replace(billHref(id, 'assign'))}
          />
        </View>
      }
    >
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 pb-6 pt-3"
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View className="gap-4 pb-4">
            {hasDraft ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Review scan, check the items read from the receipt"
                onPress={() => router.push(billHref(id, 'review'))}
                style={{ minHeight: sizes.minTouch }}
                className="flex-row items-center gap-3 rounded-card border-2 border-ink bg-bg px-4 py-3 active:opacity-pressed"
              >
                <ScanLine
                  size={sizes.icon.md}
                  color={colors.ink}
                  strokeWidth={sizes.icon.strokeWidth}
                />
                <View className="flex-1">
                  <Text className="font-brico-extrabold text-item-name text-ink">Review scan</Text>
                  <Text className="font-brico-medium text-body-small text-muted">
                    Check what was read from the receipt
                  </Text>
                </View>
                <ChevronRight
                  size={sizes.icon.md}
                  color={colors.ink}
                  strokeWidth={sizes.icon.strokeWidth}
                />
              </Pressable>
            ) : null}

            <Card tone="surface2" className="gap-3">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="font-brico-semibold text-meta text-muted">Items subtotal</Text>
                  <Text className="font-brico-medium text-body-small text-muted">
                    {items.length === 1 ? '1 item' : `${items.length} items`}
                  </Text>
                </View>
                <Money amount={sumLineTotals(items)} variant="card" />
              </View>
              <View className="flex-row">
                <Button
                  label="Scan more"
                  accessibilityLabel="Scan more of the receipt"
                  icon={ScanLine}
                  variant="outline"
                  size="md"
                  onPress={() => void scan.start('scan')}
                />
              </View>
            </Card>

            <View className="gap-3">
              <Field
                inputRef={nameRef}
                accessibilityLabel="Item name"
                placeholder="Item name, e.g. Chicken Karahi"
                value={name}
                onChangeText={setName}
                autoFocus
                autoCapitalize="words"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => amountRef.current?.focus()}
                error={nameError}
              />
              <View className="flex-row items-start gap-2">
                <QtyControl value={qty} onChange={setQty} subject={name.trim() || undefined} />
                <AmountField
                  inputRef={amountRef}
                  accessibilityLabel="Line total for this item in rupees"
                  placeholder="0"
                  value={amount}
                  onChangeText={setAmount}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={add}
                  error={amountError}
                />
              </View>
              <Button
                label="Add"
                accessibilityLabel="Add item"
                icon={Plus}
                variant="outline"
                size="md"
                fullWidth
                onPress={add}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Receipt}
            title="No items yet"
            body="Type each dish and its line total, then tap Add. The keyboard stays up."
          />
        }
        ListFooterComponent={
          <View className="pt-4">
            <View className="gap-2">
              <Text className="font-brico-extrabold text-item-name text-ink">
                Total on the receipt (optional)
              </Text>
              <Text className="font-brico-medium text-body-small text-muted">
                We will tell you if the split does not match it.
              </Text>
              <AmountField
                accessibilityLabel="Total printed on the receipt, in rupees"
                placeholder="Optional"
                value={receiptText}
                onChangeText={onReceiptChange}
                error={receiptError}
              />
            </View>
          </View>
        }
      />

      <EditSheet
        key={editing?.id ?? 'none'}
        item={editing}
        onClose={() => setEditing(null)}
        onDelete={remove}
        onSave={(it, patch) => {
          act().updateItem(id, it.id, patch);
          setEditing(null);
        }}
      />
    </FlowScreen>
  );
}

const ItemRow = memo(function ItemRow({
  item: it,
  onEdit,
  onDelete,
}: {
  item: Item;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center rounded-card bg-surface-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${it.name}`}
        onPress={() => onEdit(it)}
        style={{ minHeight: sizes.minTouch }}
        className="flex-1 flex-row items-center gap-3 py-3 pl-4 active:opacity-pressed"
      >
        <View className="flex-1">
          <Text numberOfLines={1} className="font-brico-bold text-item-name text-ink">
            {it.name}
          </Text>
          {it.quantity > 1 ? (
            <Text className="font-brico-semibold text-meta text-muted">Quantity {it.quantity}</Text>
          ) : null}
        </View>
        <Money amount={it.lineTotal} variant="item" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${it.name}`}
        onPress={() => onDelete(it)}
        style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
        className="items-center justify-center active:opacity-pressed"
      >
        <Trash2 size={sizes.icon.md} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
      </Pressable>
    </View>
  );
});

function EditSheet({
  item,
  onClose,
  onDelete,
  onSave,
}: {
  item: Item | null;
  onClose: () => void;
  onDelete: (item: Item) => void;
  onSave: (
    item: Item,
    patch: { name: string; quantity: number; lineTotal: Item['lineTotal'] },
  ) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [qty, setQty] = useState(item ? String(item.quantity) : '1');
  const [amount, setAmount] = useState(item ? toRupeeInputText(item.lineTotal) : '');
  const parsed = parseRupees(amount);
  const qtyN = parseQty(qty);
  const valid = name.trim().length > 0 && parsed.ok && qtyN !== null;

  return (
    <ModalSheet visible={item !== null} onClose={onClose} title="Edit item">
      {item ? (
        <View className="gap-4">
          <Field
            accessibilityLabel="Item name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            error={name.trim().length === 0 ? 'Give the item a name' : undefined}
          />
          <View className="flex-row items-start gap-2">
            <QtyControl value={qty} onChange={setQty} subject={name.trim() || undefined} />
            <AmountField
              accessibilityLabel="Line total in rupees"
              value={amount}
              onChangeText={setAmount}
              error={!parsed.ok ? rupeesErrorText(parsed.reason) : undefined}
            />
          </View>
          <View className="flex-row gap-3">
            <Button
              label="Delete"
              accessibilityLabel={`Delete ${item.name}`}
              variant="outline"
              icon={Trash2}
              onPress={() => onDelete(item)}
            />
            <View className="flex-1">
              <Button
                label="Save"
                accessibilityLabel="Save changes to this item"
                fullWidth
                disabled={!valid}
                onPress={() => {
                  if (parsed.ok && qtyN !== null) {
                    onSave(item, { name: name.trim(), quantity: qtyN, lineTotal: parsed.paisa });
                  }
                }}
              />
            </View>
          </View>
        </View>
      ) : null}
    </ModalSheet>
  );
}
