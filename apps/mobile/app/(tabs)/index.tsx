import { useMemo } from 'react';
import { href } from '../../lib/routes';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Receipt, Settings } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import {
  selectActiveBills,
  selectBalances,
  selectLatestGroup,
  selectPeople,
  useSplitr,
} from '../../store';
import { useTheme } from '../../theme';
import { BalanceTile, CrewHeroCard, EmptyState } from '../../components/bill';
import { UpdateBanner } from '../../components/UpdateBanner';
import { ConnectedBillRow } from '../../components/ConnectedBillRow';

const LATELY_COUNT = 5;

export default function Home() {
  const router = useRouter();
  const { colors } = useTheme();
  const group = useSplitr(selectLatestGroup());
  const people = useSplitr(selectPeople());
  const meId = useSplitr((s) => s.root.me?.personId);
  const balances = useSplitr(selectBalances());
  const bills = useSplitr(selectActiveBills());

  const members = useMemo(() => {
    if (!group) return [];
    return group.memberIds.flatMap((id) => {
      const p = people.find((x) => x.id === id);
      return p ? [{ id: p.id, name: p.displayName, isCurrentUser: p.id === meId }] : [];
    });
  }, [group, people, meId]);

  const openBalances = (): void => router.push(href('/balances'));
  const lately = bills.slice(0, LATELY_COUNT);

  const header = (
    <View className="gap-4 pb-4">
      <View className="flex-row items-center justify-between">
        <Text
          accessibilityRole="header"
          accessibilityLabel="splitr"
          className="font-brico-extrabold text-screen-title text-ink"
        >
          splitr<Text className="text-accent">.</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push(href('/settings'))}
          style={{ minHeight: sizes.minTouch, minWidth: sizes.minTouch }}
          className="items-center justify-center active:opacity-pressed"
        >
          <Settings size={sizes.icon.lg} color={colors.ink} strokeWidth={sizes.icon.strokeWidth} />
        </Pressable>
      </View>

      <UpdateBanner />

      {group ? (
        <CrewHeroCard
          crewName={group.name}
          people={members}
          onStartBill={() => router.push(href(`/scan?groupId=${group.id}`))}
        />
      ) : (
        <CrewHeroCard variant="empty" onMakeCrew={() => router.push(href('/crew/new'))} />
      )}

      <View className="flex-row gap-3">
        <BalanceTile kind="you-owe" amount={balances.youOwe} onPress={openBalances} />
        <BalanceTile kind="owes-you" amount={balances.owedToYou} onPress={openBalances} />
      </View>

      <View className="flex-row items-center justify-between">
        <Text
          accessibilityRole="header"
          className="font-brico-extrabold text-item-name text-ink"
        >
          Lately
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all bills in History"
          onPress={() => router.push(href('/history'))}
          style={{ minHeight: sizes.minTouch }}
          className="justify-center pl-3 active:opacity-pressed"
        >
          <Text className="font-brico-bold text-body-small text-muted">See all</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <FlatList
        data={lately}
        keyExtractor={(b) => b.id}
        renderItem={({ item: b }) => <ConnectedBillRow billId={b.id} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon={Receipt}
            title="No bills yet"
            body="Scan a receipt and your recent bills show up here."
            action={{
              label: 'Scan a receipt',
              accessibilityLabel: 'Scan your first receipt',
              onPress: () => router.push(href('/scan')),
            }}
            secondary={{
              label: 'Type it in',
              accessibilityLabel: 'Start a bill and type the items in by hand',
              onPress: () => router.push(href('/bill/new')),
            }}
          />
        }
        contentContainerClassName="px-4 pb-6 pt-2"
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </SafeAreaView>
  );
}
