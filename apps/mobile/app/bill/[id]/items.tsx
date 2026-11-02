import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type TextInputInstance } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Receipt, Trash2 } from 'lucide-react-native';
import type { Assignment, Item } from '@splitr/calculation-engine';
import { parseRupees } from '@splitr/bill-domain';
import { sizes } from '@splitr/design-tokens';
import { useTheme } from '../../../theme';
import { splitrStore } from '../../../store';
import { toRupeeInputText } from '../../../lib/format-money';
import { parseQty, sumLineTotals } from '../../../lib/sums';
import { Button, Card, Money, StickyAction } from '../../../components/ui';
import { EmptyState } from '../../../components/bill';
import { AmountField, Field } from '../../../components/bill/flow/Field';
import { FlowScreen } from '../../../components/bill/flow/FlowScreen';
import { QtyControl } from '../../../components/bill/flow/QtyControl';
import { SheetModal } from '../../../components/bill/flow/SheetModal';
import { BillNotFound, useBillRoute } from '../../../components/bill/flow/BillGate';
import { billHref } from '../../../components/bill/flow/nav';
import { rupeesErrorText } from '../../../components/bill/flow/messages';

interface Removed {
  name: string;
  quantity: number;
  lineTotal: Item['lineTotal'];
  assignment: Assignment;
}

export default function ItemsScreen() {
  const { id, bill } = useBillRoute();
  if (!bill) return <BillNotFound />;
  return <ItemsBody id={id} items={bill.items} printedTotal={bill.printedTotal} />;
}

function ItemsBody({
  id,
  items,
  printedTotal,
}: {
  id: string;
  items: readonly Item[];
  printedTotal: Item['lineTotal'] | undefined;
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
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [receiptText, setReceiptText] = useState(() =>
    printedTotal === undefined ? '' : toRupeeInputText(printedTotal),
  );

  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 6000);
    return () => clearTimeout(t);
  }, [removed]);

  const parsed = parseRupees(amount);
  const qtyN = parseQty(qty);
  const nameOk = name.trim().length > 0;
  const amountError = tried && !parsed.ok ? rupeesErrorText(parsed.reason) : undefined;
  const nameError = tried && !nameOk ? 'Give the item a name' : undefined;

  const add = () => {
    setTried(true);
    if (!nameOk || !parsed.ok || qtyN === null) {
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

  const remove = (it: Item) => {
    setRemoved({ name: it.name, quantity: it.quantity, lineTotal: it.lineTotal, assignment: it.assignment });
    act().removeItem(id, it.id);
    setEditing(null);
  };
  const undo = () => {
    if (!removed) return;
    const newId = act().addItem(id, {
      name: removed.name,
      quantity: removed.quantity,
      lineTotal: removed.lineTotal,
    });
    if (removed.assignment.kind !== 'unassigned') act().setItemAssignment(id, newId, removed.assignment);
    setRemoved(null);
  };

  const receiptParsed = parseRupees(receiptText);
  const receiptError =
    receiptText.trim() !== '' && !receiptParsed.ok ? rupeesErrorText(receiptParsed.reason) : undefined;
  const onReceiptChange = (t: string) => {
    setReceiptText(t);
    const r = parseRupees(t);
    if (t.trim() === '') act().updateBillMeta(id, { printedTotal: null });
    else if (r.ok) act().updateBillMeta(id, { printedTotal: r.paisa });
  };

  return (
    <FlowScreen
      footer={
        <View>
          {removed ? (
            <View className="mx-4 mt-2 flex-row items-center justify-between rounded-button bg-chip pl-4">
              <Text numberOfLines={1} className="flex-1 font-brico-semibold text-body-small text-ink">
                Removed {removed.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Undo removing ${removed.name}`}
                onPress={undo}
                style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                className="items-center justify-center px-4 active:opacity-80"
              >
                <Text className="font-brico-extrabold text-body text-ink">Undo</Text>
              </Pressable>
            </View>
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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-4 pb-6 pt-3"
        showsVerticalScrollIndicator={false}
      >
        <Card tone="surface2" className="flex-row items-center justify-between">
          <View>
            <Text className="font-brico-semibold text-meta text-muted">Items subtotal</Text>
            <Text className="font-brico-medium text-body-small text-muted">
              {items.length === 1 ? '1 item' : `${items.length} items`}
            </Text>
          </View>
          <Money amount={sumLineTotals(items)} variant="card" />
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
            size="lg"
            fullWidth
            onPress={add}
          />
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No items yet"
            body="Type each dish and its line total, then tap Add. The keyboard stays up."
          />
        ) : (
          <View className="gap-2">
            {items.map((it) => (
              <View key={it.id} className="flex-row items-center rounded-card bg-surface-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${it.name}`}
                  onPress={() => setEditing(it)}
                  style={{ minHeight: sizes.minTouch }}
                  className="flex-1 flex-row items-center gap-3 py-3 pl-4 active:opacity-80"
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
                  onPress={() => remove(it)}
                  style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
                  className="items-center justify-center active:opacity-80"
                >
                  <Trash2 size={sizes.icon.md} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View className="gap-2">
          <Text className="font-brico-extrabold text-item-name text-ink">Total on the receipt (optional)</Text>
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
      </ScrollView>

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

function EditSheet({
  item,
  onClose,
  onDelete,
  onSave,
}: {
  item: Item | null;
  onClose: () => void;
  onDelete: (item: Item) => void;
  onSave: (item: Item, patch: { name: string; quantity: number; lineTotal: Item['lineTotal'] }) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [qty, setQty] = useState(item ? String(item.quantity) : '1');
  const [amount, setAmount] = useState(item ? toRupeeInputText(item.lineTotal) : '');
  const parsed = parseRupees(amount);
  const qtyN = parseQty(qty);
  const valid = name.trim().length > 0 && parsed.ok && qtyN !== null;

  return (
    <SheetModal visible={item !== null} onClose={onClose}>
      {item ? (
        <View className="gap-4">
          <Text className="font-brico-extrabold text-screen-title text-ink">Edit item</Text>
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
    </SheetModal>
  );
}
