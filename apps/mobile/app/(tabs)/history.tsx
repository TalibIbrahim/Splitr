import { useCallback, useMemo, useState } from 'react';
import { href } from '../../lib/routes';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Clock, Trash2 } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import type { ListRenderItem } from 'react-native';
import { selectActiveBills, splitrStore, useSplitr } from '../../store';
import { FilterChip, Snackbar } from '../../components/ui';
import { EmptyState } from '../../components/bill';
import { ConnectedBillRow } from '../../components/ConnectedBillRow';
import { useTheme } from '../../theme';

type Filter = 'all' | 'open' | 'settled';
const FILTERS: readonly { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'settled', label: 'Settled' },
];

export default function History() {
  const router = useRouter();
  const { colors } = useTheme();
  const bills = useSplitr(selectActiveBills());
  const [filter, setFilter] = useState<Filter>('all');
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);

  const shown = useMemo(
    () => (filter === 'all' ? bills : bills.filter((b) => b.status === filter)),
    [bills, filter],
  );
  const dismiss = useCallback(() => setUndo(null), []);

  const remove = useCallback((id: string, name: string) => {
    splitrStore.getState().deleteBill(id);
    setUndo({ id, name: name || 'Untitled bill' });
  }, []);

  const renderItem: ListRenderItem<(typeof bills)[number]> = useCallback(
    ({ item: b }) => (
      <View className="flex-row items-center">
        <View className="flex-1">
          <ConnectedBillRow billId={b.id} onLongPress={() => remove(b.id, b.restaurantName)} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${b.restaurantName || 'untitled bill'}`}
          onPress={() => remove(b.id, b.restaurantName)}
          style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
          className="items-center justify-center active:opacity-pressed"
        >
          <Trash2 size={sizes.icon.md} color={colors.muted} strokeWidth={sizes.icon.strokeWidth} />
        </Pressable>
      </View>
    ),
    [remove, colors.muted],
  );

  const header = (
    <View className="gap-4 pb-4">
      <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
        History
      </Text>
      <View accessibilityRole="radiogroup" className="flex-row gap-2">
        {FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>
    </View>
  );

  const empty = (
    <EmptyState
      icon={Clock}
      title={bills.length === 0 ? 'No bills yet' : `No ${filter} bills`}
      body={
        bills.length === 0
          ? 'Every bill you split will be listed here.'
          : 'Try another filter to see the rest of your bills.'
      }
      action={
        bills.length === 0
          ? {
              label: 'Start a bill',
              accessibilityLabel: 'Start your first bill',
              onPress: () => router.push(href('/bill/new')),
            }
          : {
              label: 'Show all',
              accessibilityLabel: 'Show all bills',
              onPress: () => setFilter('all'),
            }
      }
    />
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <FlatList
        data={shown}
        keyExtractor={(b) => b.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerClassName="px-4 pb-24 pt-2"
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      {undo ? (
        <Snackbar
          message={`Deleted ${undo.name}`}
          actionLabel="Undo"
          onAction={() => {
            splitrStore.getState().restoreBill(undo.id);
            setUndo(null);
          }}
          onDismiss={dismiss}
        />
      ) : null}
    </SafeAreaView>
  );
}
