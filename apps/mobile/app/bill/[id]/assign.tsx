import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type TextInputInstance,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Receipt, UserPlus, Users, Wand2 } from 'lucide-react-native';
import { toPaisa, type Assignment, type Item, type ItemSharesPreview } from '@splitr/calculation-engine';
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

/** One item card with a short scale pulse when tapped (skipped when reduced motion is on). */
function PulseItem({
  item,
  preview,
  people,
  meId,
  onTap,
  onLong,
  onLayout,
}: {
  item: Item;
  preview: ItemSharesPreview;
  people: readonly SplitPerson[];
  meId: string | null;
  onTap: () => void;
  onLong: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const row = preview.items.find((r) => r.itemId === item.id);
  const ids = assigneeIds(item.assignment);
  const status: 'ok' | 'unassigned' | 'mismatch' =
    item.assignment.kind === 'unassigned' || row?.status === 'unassigned'
      ? 'unassigned'
      : row?.status === 'under' || row?.status === 'over'
        ? 'mismatch'
        : 'ok';
  const each = perPersonAmount(item, preview);

  const pulse = () => {
    if (reduced) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.97, duration: motion.duration.fast / 2, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: motion.duration.base - motion.duration.fast / 2, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Animated.View onLayout={onLayout} style={{ transform: [{ scale }] }}>
      <ItemCard
        name={item.name}
        qty={item.quantity}
        lineTotal={item.lineTotal}
        status={status}
        each={each ?? undefined}
        assignees={ids.map((pid) => ({
          id: pid,
          name: people.find((p) => p.id === pid)?.name ?? 'Someone',
          isCurrentUser: pid === meId,
        }))}
        onPress={() => {
          pulse();
          onTap();
        }}
        onLongPress={onLong}
      />
    </Animated.View>
  );
}

function AssignBody({ id, bill, preview }: { id: string; bill: Bill; preview: ItemSharesPreview }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const act = splitrStore.getState;
  const meId = bill.meParticipantId;

  const people: SplitPerson[] = useMemo(
    () => bill.participants.map((p) => ({ id: p.id, name: p.displayName, isCurrentUser: p.id === meId })),
    [bill.participants, meId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(meId ?? bill.participants[0]?.id ?? null);
  const selected = people.find((p) => p.id === selectedId) ?? people[0] ?? null;
  const [splitItem, setSplitItem] = useState<Item | null>(null);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');

  const scrollRef = useRef<ScrollViewInstance>(null);
  const listY = useRef(0);
  const rowY = useRef<Record<string, number>>({});

  const avatarPeople: AssignPerson[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    isCurrentUser: p.isCurrentUser,
    subtotal: preview.participants.find((x) => x.participantId === p.id)?.itemsSubtotal ?? toPaisa(0),
  }));

  const left = preview.needsAttentionCount;
  const firstAttention = bill.items.find((it) => {
    const st = preview.items.find((r) => r.itemId === it.id)?.status;
    return st === 'unassigned' || st === 'under' || st === 'over';
  });
  const hasUnassigned = bill.items.some((it) => it.assignment.kind === 'unassigned');

  const seeSplit = useCallback(() => {
    if (left > 0 && firstAttention) {
      const y = listY.current + (rowY.current[firstAttention.id] ?? 0);
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: !reduced });
      return;
    }
    router.replace(billHref(id, 'charges'));
  }, [left, firstAttention, reduced, router, id]);

  useEffect(() => {
    rowY.current = {};
  }, [bill.items.length]);

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

  const tap = (item: Item) => {
    if (!selected) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    act().toggleAssign(id, item.id, selected.id);
  };

  return (
    <FlowScreen
      footer={
        <StickyAction
          label="See the split"
          accessibilityLabel={left > 0 ? `See the split. ${left} items left to assign` : 'See the split'}
          badge={left > 0 ? `${left} left` : undefined}
          onPress={seeSplit}
        />
      }
    >
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="gap-4 px-4 pb-6 pt-3"
        showsVerticalScrollIndicator={false}
      >
        <AssignAvatarRow people={avatarPeople} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
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

        <View
          onLayout={(e) => {
            listY.current = e.nativeEvent.layout.y;
          }}
          className="gap-3 rounded-card bg-surface p-3"
        >
          {bill.items.map((it) => (
            <PulseItem
              key={it.id}
              item={it}
              preview={preview}
              people={people}
              meId={meId}
              onTap={() => tap(it)}
              onLong={() => setSplitItem(it)}
              onLayout={(e) => {
                rowY.current[it.id] = e.nativeEvent.layout.y;
              }}
            />
          ))}
        </View>
      </ScrollView>

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
    <ModalSheet visible={open} onClose={onClose}>
      <View className="gap-4">
        <Text className="font-brico-extrabold text-screen-title text-ink">Add a guest</Text>
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
