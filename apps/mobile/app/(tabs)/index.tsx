import { useMemo } from 'react';
import { href } from '../../lib/routes';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Receipt } from 'lucide-react-native';
import { sizes } from '@splitr/design-tokens';
import { selectActiveBills, selectBalances, selectLatestGroup, selectPeople, useSplitr } from '../../store';
import { Button } from '../../components/ui';
import { BalanceTile, CrewHeroCard, EmptyState } from '../../components/bill';
import { ConnectedBillRow } from '../../components/ConnectedBillRow';

const LATELY_COUNT = 5;

export default function Home() {
  const router = useRouter();
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

  const lately = bills.slice(0, LATELY_COUNT);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-2">
        <Pressable
          accessibilityRole="header"
          accessibilityLabel="splitr"
          onLongPress={__DEV__ ? () => router.push('/dev/components') : undefined}
          style={{ minHeight: sizes.minTouch }}
          className="flex-row items-center self-start"
        >
          <Text className="font-brico-extrabold text-screen-title text-ink">splitr</Text>
          <Text className="font-brico-extrabold text-screen-title text-accent">.</Text>
        </Pressable>

        {group ? (
          <CrewHeroCard
            crewName={group.name}
            people={members}
            onStartBill={() => router.push(href(`/bill/new?groupId=${group.id}`))}
          />
        ) : (
          <CrewHeroCard variant="empty" onMakeCrew={() => router.push(href('/crew/new'))} />
        )}

        <View className="flex-row gap-3">
          <BalanceTile kind="you-owe" amount={balances.youOwe} />
          <BalanceTile kind="owes-you" amount={balances.owedToYou} />
        </View>

        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="font-brico-extrabold text-screen-title text-ink">
            Lately
          </Text>
          <Button
            variant="outline"
            label="New bill"
            accessibilityLabel="Start a new bill"
            icon={Plus}
            onPress={() => router.push(href('/bill/new'))}
          />
        </View>

        {lately.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No bills yet"
            body="Your recent bills show up here."
            action={{
              label: 'Start a bill',
              accessibilityLabel: 'Start your first bill',
              onPress: () => router.push(href('/bill/new')),
            }}
          />
        ) : (
          <View>
            {lately.map((b) => (
              <ConnectedBillRow key={b.id} billId={b.id} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
