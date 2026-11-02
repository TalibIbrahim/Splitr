import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  Text,
  View,
  type ListRenderItem,
  type TextInputInstance,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Receipt, UserPlus, Users, Wand2 } from 'lucide-react-native';
import {
  toPaisa,
  type Assignment,
  type Item,
  type ItemSharesPreview,
  type Paisa,
} from '@splitr/calculation-engine';
import { perPersonAmount } from '@splitr/bill-domain';
import type { Bill } from '@splitr/shared-types';
import { motion } from '@splitr/design-tokens';
import { selectPreview, splitrStore, useSplitr } from '../../../store';
import { Button, ModalSheet, StickyAction } from '../../../components/ui';
import { AssignAvatarRow, EmptyState, ItemCard, type AssignPerson } from '../../../components/bill';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { Field } from '../../../components/bill/flow/Field';
import { FlowScreen } from '../../../components/bill/flow/FlowScreen';
import { SplitSheet, type SplitPerson } from '../../../components/bill/flow/SplitSheet';
import { BillNotFound, useBillRoute } from '../../../components/bill/flow/BillGate';
import { billHref } from '../../../components/bill/flow/nav';

function assigneeIds(a: Assignment): string[] {
  switch (a.kind) {
    case 'unassigned':
      return [];
    case 'equal':
      return [...a.participantIds];
    default:
      return a.entries.map((e) => e.participantId);
  }
}

export default function AssignScreen() {
  const { id, bill } = useBillRoute();
  const preview = useSplitr(selectPreview(id));
  if (!bill || !preview) return <BillNotFound />;
  return <AssignBody id={id} bill={bill} preview={preview} />;
}

type RowStatus = 'ok' | 'unassigned' | 'mismatch';

/** One item card with a short scale pulse when tapped (skipped when reduced motion is on). Memoised on primitives + stable callbacks. */
const PulseItem = memo(function PulseItem({
  item,
  status,
  each,
  people,
  meId,
  first,
  last,
  onTap,
  onLong,
}: {
  item: Item;
  status: RowStatus;
  each: Paisa | undefined;
  people: readonly SplitPerson[];
  meId: string | null;
  first: boolean;
  last: boolean;
  onTap: (itemId: string) => void;
  onLong: (itemId: string) => void;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const ids = assigneeIds(item.assignment);

  const pulse = () => {
    if (reduced) return;
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.97,
        duration: motion.duration.fast / 2,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: motion.duration.base - motion.duration.fast / 2,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Rows are visually grouped on one surface card: first/last round the corners, every row pads its bottom as the gap.
  return (
    <View
      className={`bg-surface px-3 pb-3 ${first ? 'rounded-t-card pt-3' : ''} ${last ? 'rounded-b-card' : ''}`}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <ItemCard
          name={item.name}
          qty={item.quantity}
          lineTotal={item.lineTotal}
          status={status}
          each={each}
          assignees={ids.map((pid) => ({
            id: pid,
            name: people.find((p) => p.id === pid)?.name ?? 'Someone',
            isCurrentUser: pid === meId,
          }))}
          onPress={() => {
            pulse();
            onTap(item.id);
          }}
          onLongPress={() => onLong(item.id)}
        />
      </Animated.View>
    </View>
  );
});

function AssignBody({ id, bill, preview }: { id: string; bill: Bill; preview: ItemSharesPreview }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const act = splitrStore.getState;
  const meId = bill.meParticipantId;

  const people: SplitPerson[] = useMemo(
    () =>
      bill.participants.map((p) => ({
        id: p.id,
        name: p.displayName,
        isCurrentUser: p.id === meId,
      })),
    [bill.participants, meId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    meId ?? bill.participants[0]?.id ?? null,
  );
  const selected = people.find((p) => p.id === selectedId) ?? people[0] ?? null;
  const [splitItem, setSplitItem] = useState<Item | null>(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');

  const listRef = useRef<FlatList<Item>>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected?.id ?? null;
  const itemsRef = useRef<readonly Item[]>(bill.items);
  itemsRef.current = bill.items;

  const avatarPeople: AssignPerson[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    isCurrentUser: p.isCurrentUser,
    subtotal:
      preview.participants.find((x) => x.participantId === p.id)?.itemsSubtotal ?? toPaisa(0),
  }));

  const left = preview.needsAttentionCount;
  const firstAttentionIndex = bill.items.findIndex((it) => {
    const st = preview.items.find((r) => r.itemId === it.id)?.status;
    return st === 'unassigned' || st === 'under' || st === 'over';
  });
  const hasUnassigned = bill.items.some((it) => it.assignment.kind === 'unassigned');

  const seeSplit = useCallback(() => {
    if (left > 0 && firstAttentionIndex >= 0) {
      listRef.current?.scrollToIndex({
        index: firstAttentionIndex,
        viewOffset: 8,
        animated: !reduced,
      });
      return;
    }
    router.replace(billHref(id, 'charges'));
  }, [left, firstAttentionIndex, reduced, router, id]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // Target row is outside the rendered window: jump near it, then retry once it has been laid out.
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, viewOffset: 8, animated: !reduced });
      }, 100);
    },
    [reduced],
  );

  const tap = useCallback(
    (itemId: string) => {
      const personId = selectedRef.current;
      if (!personId) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      splitrStore.getState().toggleAssign(id, itemId, personId);
    },
    [id],
  );
  const openSplit = useCallback((itemId: string) => {
    const it = itemsRef.current.find((x) => x.id === itemId);
    if (it) setSplitItem(it);
  }, []);

  const lastIndex = bill.items.length - 1;
  const renderItem: ListRenderItem<Item> = useCallback(
    ({ item, index }) => {
      const row = preview.items.find((r) => r.itemId === item.id);
      const status: RowStatus =
        item.assignment.kind === 'unassigned' || row?.status === 'unassigned'
          ? 'unassigned'
          : row?.status === 'under' || row?.status === 'over'
            ? 'mismatch'
            : 'ok';
      return (
        <PulseItem
          item={item}
          status={status}
          each={perPersonAmount(item, preview) ?? undefined}
          people={people}
          meId={meId}
          first={index === 0}
          last={index === lastIndex}
          onTap={tap}
          onLong={openSplit}
        />
      );
    },
    [preview, people, meId, lastIndex, tap, openSplit],
  );

  if (bill.participants.length === 0) {
    return (
      <>
        <EmptyState
          icon={Users}
          title="Nobody at the table"
          body="Add at least one person before assigning items."
          action={{ label: 'Add a guest', onPress: () => setAddGuestOpen(true) }}
        />
        <GuestSheet
          open={addGuestOpen}
          name={guestName}
          setName={setGuestName}
          onClose={() => setAddGuestOpen(false)}
          onAdd={() => {
            if (guestName.trim()) act().addParticipant(id, { guestName: guestName.trim() });
            setGuestName('');
            setAddGuestOpen(false);
          }}
        />
      </>
    );
  }

  if (bill.items.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No items to assign"
        body="Add the dishes first, then come back to say who ate what."
        action={{ label: 'Add items', onPress: () => router.replace(billHref(id, 'items')) }}
      />
    );
  }

  return (
    <FlowScreen
      footer={
        <StickyAction
          label="See the split"
          accessibilityLabel={
            left > 0 ? `See the split. ${left} items left to assign` : 'See the split'
          }
          badge={left > 0 ? `${left} left` : undefined}
          onPress={seeSplit}
        />
      }
    >
      <FlatList
        ref={listRef}
        data={bill.items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        extraData={renderItem}
        onScrollToIndexFailed={onScrollToIndexFailed}
        ListHeaderComponent={
          <View className="gap-4 pb-4">
            <AssignAvatarRow
              people={avatarPeople}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
            <Text className="font-brico-semibold text-meta text-muted">
              {selected
                ? `Tap items ${selected.isCurrentUser ? 'you' : selected.name} had. Long-press to split unevenly.`
                : 'Pick who is eating.'}
            </Text>

            {hasUnassigned ? (
              <Button
                label="Split the rest between everyone"
                accessibilityLabel="Split all unassigned items equally between everyone"
                variant="outline"
                icon={Wand2}
                fullWidth
                onPress={() => act().assignRemaining(id)}
              />
            ) : null}
          </View>
        }
        contentContainerClassName="px-4 pb-6 pt-3"
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <SplitSheet
        item={splitItem}
        people={people}
        onClose={() => setSplitItem(null)}
        onApply={(item, assignment) => {
          act().setItemAssignment(id, item.id, assignment);
          setSplitItem(null);
        }}
      />
    </FlowScreen>
  );
}

function GuestSheet({
  open,
  name,
  setName,
  onClose,
  onAdd,
}: {
  open: boolean;
  name: string;
  setName: (s: string) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  const ref = useRef<TextInputInstance>(null);
  return (
    <ModalSheet visible={open} onClose={onClose} title="Add a guest">
      <View className="gap-4">
        <Field
          inputRef={ref}
          accessibilityLabel="Guest name"
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
        <Button
          label="Add guest"
          accessibilityLabel="Add guest to this bill"
          icon={UserPlus}
          fullWidth
          disabled={name.trim().length === 0}
          onPress={onAdd}
        />
      </View>
    </ModalSheet>
  );
}
